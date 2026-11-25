// Floating Karma Assistant: a corner button that expands into a chat panel.
// Answers stream in; every change the assistant wants to make appears as a
// confirmation card and runs only after the user approves it (money, stock and
// delete actions need the user to type CONFIRM — the server checks that too).
//
// Mounted ONCE at the app root (not per page), so navigating keeps the panel and
// any answer still streaming. The conversation itself is stored by the assistant
// service per user (and per company), so it also survives reloads, closed tabs
// and new sign-ins until the user clears it.
//
// Voice mode (mic button): speak a question, hear the answer — read out sentence
// by sentence while it streams — then it listens again, until you end it. The
// written conversation is kept in the chat as usual. Uses the browser's speech
// recognition and voices (lib/voice.ts).
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  AlertTriangle, Check, Hand, Loader2, Maximize2, Mic, MicOff, Minimize2, RotateCcw, Send, Sparkles, Volume2, X,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Listener, Speaker, voiceSupported, type VoiceLang } from "@/lib/voice";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ASSISTANT_URL,
  AssistantError,
  answerConfirmation,
  clearConversation,
  getConversation,
  sendMessage,
  type Allowance,
  type AssistantEvent,
  type ChartSpec,
  type StoredItem,
} from "@/lib/assistant";
import { AssistantChart } from "./AssistantChart";
import { Markdown } from "./Markdown";

type ConfirmEvent = Extract<AssistantEvent, { type: "confirm" }>;
type Meta = { seconds: number; tool_calls: number };

type Item =
  | { id: number; kind: "user"; text: string; voice?: boolean }
  | { id: number; kind: "assistant"; text: string; status?: string; streaming: boolean; meta?: Meta | null; charts?: ChartSpec[] }
  | { id: number; kind: "confirm"; event: ConfirmEvent; state: "pending" | "sending" | "approved" | "cancelled"; error?: string }
  | { id: number; kind: "error"; text: string };

const SUGGESTIONS = [
  "Who owes us the most in USD?",
  "Chart our monthly collections in SYP this year",
  "ما هي أكثر المواد مبيعاً هذا الشهر؟",
];

function prettyStatus(s: string): string {
  if (s === "searching tools") return "Looking for the right data…";
  if (s === "running analysis code") return "Running analysis…";
  const m = /^calling (.+)$/.exec(s);
  if (m) {
    const name = m[1];
    if (name === "query_data") return "Analysing records…";
    const [resource, action = ""] = name.split("__");
    return `${action.replace(/_/g, " ") || "checking"} · ${resource.replace(/_/g, " ")}`;
  }
  return s;
}

let nextId = 1;

type VoicePhase = "listening" | "thinking" | "speaking" | "waiting" | "paused";

const VOICE_TEXT: Record<VoiceLang, Record<string, string>> = {
  en: {
    listening: "Listening…", thinking: "Thinking…", speaking: "Speaking — tap to interrupt",
    waiting: "Approve or cancel on screen", paused: "Tap the mic to talk",
    approve: "Please check it and approve on the screen.", error: "Sorry, something went wrong.",
  },
  ar: {
    listening: "أستمع…", thinking: "أفكر…", speaking: "أتحدث — اضغط للمقاطعة",
    waiting: "وافق أو ألغِ على الشاشة", paused: "اضغط على الميكروفون للتحدث",
    approve: "يرجى المراجعة والموافقة على الشاشة.", error: "عذراً، حدث خطأ.",
  },
};

const FILLERS: Record<VoiceLang, string[]> = {
  en: ["One moment.", "Let me check.", "Sure, one second.", "Checking that now."],
  ar: ["لحظة من فضلك.", "دعني أتحقق.", "حسناً، لحظة.", "أتحقق من ذلك الآن."],
};

function micErrorText(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed")
    return "Microphone access is blocked. Allow it for this site in the browser, then try again.";
  if (code === "unsupported") return "Voice isn't supported in this browser. Try Chrome, Edge or Safari.";
  if (code === "network") return "Speech recognition needs an internet connection.";
  if (code === "audio-capture") return "No microphone was found.";
  return `Voice stopped (${code}).`;
}

const OPEN_KEY = "assistant_open";
const readOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
};

function fromStored(items: StoredItem[]): Item[] {
  return items.map((it): Item => {
    const id = nextId++;
    if (it.kind === "assistant") return { id, kind: "assistant", text: it.text, charts: it.charts, meta: it.meta, streaming: false };
    if (it.kind === "confirm") return { id, kind: "confirm", state: it.state, event: { type: "confirm", ...it.event } };
    return { id, ...it };
  });
}

export function AssistantWidget() {
  const [open, setOpenState] = useState(readOpen);
  const [model, setModel] = useState<string | null>(null);
  // why the user can't ask right now (switched off, allowance used up, rate limit), if so
  const [blocked, setBlocked] = useState<string | null>(null);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  // the company hasn't been switched on: no button at all
  const [off, setOff] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [wide, setWide] = useState(false);
  const [clearing, setClearing] = useState<"no" | "ask" | "working">("no");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ---- voice mode
  const { lang: appLang } = useLanguage();
  const [voiceOn, setVoiceOn] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("paused");
  const [interim, setInterim] = useState("");
  const [voiceLang, setVoiceLang] = useState<VoiceLang>(appLang === "ar" ? "ar" : "en");
  const listener = useRef(new Listener()).current;
  const speaker = useRef(new Speaker()).current;
  const voiceOnRef = useRef(false);
  const busyRef = useRef(false);
  const waitingRef = useRef(false);
  const voiceLangRef = useRef(voiceLang);
  voiceLangRef.current = voiceLang;
  const sendRef = useRef<(raw?: string, opts?: { voice?: boolean }) => void>(() => {});

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      listener.stop();
      speaker.cancel();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const startListening = () => {
    if (!voiceOnRef.current) return;
    setInterim("");
    setPhase("listening");
    listener.start(voiceLangRef.current, {
      onInterim: setInterim,
      onFinal: (t) => {
        setInterim("");
        setPhase("thinking");
        sendRef.current(t, { voice: true });
      },
      // silence: stop and wait for a tap rather than listening forever
      onSilence: () => voiceOnRef.current && setPhase("paused"),
      onError: (code) => {
        stopVoice();
        setItems((it) => [...it, { id: nextId++, kind: "error", text: micErrorText(code) }]);
      },
    });
  };

  // after an answer has been spoken, listen for the next question
  speaker.onStart = () => voiceOnRef.current && setPhase("speaking");
  speaker.onIdle = () => {
    if (voiceOnRef.current && !busyRef.current && !waitingRef.current) startListening();
  };

  const startVoice = () => {
    if (!voiceSupported()) {
      setItems((it) => [...it, { id: nextId++, kind: "error", text: micErrorText("unsupported") }]);
      return;
    }
    speaker.cancel();
    voiceOnRef.current = true;
    setVoiceOn(true);
    if (busyRef.current) setPhase("thinking");
    else startListening();
  };

  function stopVoice() {
    voiceOnRef.current = false;
    setVoiceOn(false);
    listener.stop();
    speaker.cancel();
    setInterim("");
    setPhase("paused");
  }

  // the big mic button: interrupt speech, start/stop listening
  const tapOrb = () => {
    if (phase === "speaking") {
      speaker.cancel();
      startListening();
    } else if (phase === "listening") {
      listener.stop();
      setPhase("paused");
    } else if (phase === "paused") {
      startListening();
    }
  };

  // load the saved conversation; if a turn is still running (e.g. the page was
  // reloaded mid-answer) poll until it finishes, then show how it ended
  const load = async () => {
    try {
      const c = await getConversation();
      setModel(c.model.label);
      setBlocked(c.access && !c.access.allowed ? c.access.reason : null);
      setOff(c.access?.code === "off");
      setAllowance(c.access?.allowance ?? null);
      setItems(fromStored(c.items));
      setLoaded(true);
      if (c.busy) {
        setBusy(true);
        setTimeout(load, 2000);
      } else {
        setBusy(false);
      }
    } catch (err) {
      setLoaded(true);
      setItems([{ id: nextId++, kind: "error", text: err instanceof Error ? err.message : "Could not load the conversation." }]);
    }
  };

  useEffect(() => {
    if (ASSISTANT_URL) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ASSISTANT_URL) return null;

  const setOpen = (v: boolean) => {
    if (!v) stopVoice();
    setOpenState(v);
    try {
      localStorage.setItem(OPEN_KEY, v ? "1" : "0");
    } catch {
      /* private mode: the panel just won't remember */
    }
  };

  const update = (fn: (items: Item[]) => Item[]) => setItems((prev) => fn(prev));

  // asked inside the panel (not window.confirm, which some browsers suppress)
  const clearHistory = async () => {
    if (busy) return;
    setClearing("working");
    try {
      await clearConversation();
      setItems([]);
      setClearing("no");
    } catch (err) {
      setClearing("no");
      update((it) => [...it, { id: nextId++, kind: "error", text: err instanceof Error ? err.message : "Could not clear." }]);
    }
  };

  const send = async (raw?: string, opts?: { voice?: boolean }) => {
    const text = (raw ?? input).trim();
    if (!text || busyRef.current) return;
    const voice = !!opts?.voice;
    setInput("");
    setBusy(true);
    busyRef.current = true;
    update((it) => [...it, { id: nextId++, kind: "user", text, ...(voice ? { voice: true } : {}) }]);
    // Voice: the model usually looks things up before it says anything, which is
    // seconds of silence. If nothing has been said after a moment, acknowledge.
    let saidSomething = false;
    const filler =
      voice && voiceOnRef.current
        ? setTimeout(() => {
            if (!saidSomething && voiceOnRef.current && !speaker.busy) {
              const options = FILLERS[voiceLangRef.current];
              speaker.say(options[Math.floor(Math.random() * options.length)]);
            }
          }, 1200)
        : null;

    // the assistant bubble that text deltas currently go into (a confirm card starts a new one)
    let current: number | null = null;
    let needsBreak = false;
    const ensureBubble = (): number => {
      if (current === null) {
        const id = nextId++;
        current = id;
        update((it) => [...it, { id, kind: "assistant", text: "", streaming: true }]);
      }
      return current;
    };
    const patchBubble = (fn: (b: Extract<Item, { kind: "assistant" }>) => Partial<Extract<Item, { kind: "assistant" }>>) => {
      const id = ensureBubble();
      update((it) => it.map((x) => (x.id === id && x.kind === "assistant" ? { ...x, ...fn(x) } : x)));
    };

    try {
      ensureBubble();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      await sendMessage(
        text,
        (e) => {
          switch (e.type) {
            case "status":
              needsBreak = true;
              patchBubble(() => ({ status: prettyStatus(e.text) }));
              break;
            case "chart":
              patchBubble((b) => ({ charts: [...(b.charts ?? []), e.spec] }));
              break;
            case "text":
              saidSomething = true;
              if (voice && voiceOnRef.current) speaker.feed(e.delta);
              patchBubble((b) => {
                const sep = needsBreak && b.text && !b.text.endsWith("\n") ? "\n\n" : "";
                needsBreak = false;
                return { text: b.text + sep + e.delta };
              });
              break;
            case "confirm": {
              if (current !== null) {
                const id = current;
                update((it) =>
                  it
                    .map((x) => (x.id === id && x.kind === "assistant" ? { ...x, streaming: false, status: undefined } : x))
                    .filter((x) => !(x.id === id && x.kind === "assistant" && !x.text.trim() && !x.charts?.length)),
                );
              }
              current = null;
              update((it) => [...it, { id: nextId++, kind: "confirm", event: e, state: "pending" }]);
              if (voice && voiceOnRef.current) {
                waitingRef.current = true;
                speaker.flush();
                speaker.say(VOICE_TEXT[voiceLangRef.current].approve);
                setPhase("waiting");
              }
              break;
            }
            case "confirm_resolved":
              update((it) =>
                it.map((x) =>
                  x.kind === "confirm" && x.event.confirm_id === e.confirm_id
                    ? { ...x, state: e.approved ? "approved" : "cancelled" }
                    : x,
                ),
              );
              if (voice) {
                waitingRef.current = false;
                if (voiceOnRef.current) setPhase("thinking");
              }
              break;
            case "done":
              // the final answer replaces what streamed in this bubble (earlier bubbles keep their narration)
              patchBubble(() => ({ text: e.text, streaming: false, status: undefined, meta: e }));
              setAllowance(e.allowance);
              // the answer that used the last of the allowance: show why before the next question
              if (e.allowance && e.allowance.used_pct >= 100) void load();
              if (voice && voiceOnRef.current) speaker.flush();
              break;
            case "error":
              update((it) => [...it, { id: nextId++, kind: "error", text: e.message }]);
              if (voice && voiceOnRef.current) speaker.say(VOICE_TEXT[voiceLangRef.current].error);
              break;
          }
        },
        ctrl.signal,
        { voice },
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const msg = err instanceof AssistantError ? err.message : "Could not reach the assistant. Is it running?";
      if (err instanceof AssistantError && (err.status === 403 || err.status === 429)) {
        setBlocked(msg); // switched off or over a limit: say why instead of offering the box again
        stopVoice();
      } else {
        update((it) => [...it, { id: nextId++, kind: "error", text: msg }]);
      }
    } finally {
      // close any bubble left streaming (e.g. the stream ended early)
      update((it) =>
        it
          .map((x) => (x.kind === "assistant" && x.streaming ? { ...x, streaming: false, status: undefined } : x))
          .filter((x) => !(x.kind === "assistant" && !x.text.trim() && !x.meta && !x.charts?.length)),
      );
      if (filler) clearTimeout(filler);
      setBusy(false);
      busyRef.current = false;
      waitingRef.current = false;
      abortRef.current = null;
      // nothing (left) to say: go straight back to listening
      if (voice && voiceOnRef.current && !speaker.busy) startListening();
    }
  };
  sendRef.current = send;

  const answer = async (item: Extract<Item, { kind: "confirm" }>, approved: boolean, typed: string) => {
    update((it) => it.map((x) => (x.id === item.id && x.kind === "confirm" ? { ...x, state: "sending", error: undefined } : x)));
    try {
      await answerConfirmation(item.event.confirm_id, approved, typed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      update((it) => it.map((x) => (x.id === item.id && x.kind === "confirm" ? { ...x, state: "pending", error: msg } : x)));
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const position = "fixed z-50 bottom-20 right-4 lg:bottom-6 lg:right-6";

  if (off) return null;

  if (!open) {
    return (
      <button
        type="button"
        data-testid="assistant-open"
        aria-label="Open Karma Assistant"
        onClick={() => setOpen(true)}
        className={cn(
          position,
          "h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center",
          "hover:scale-105 active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <Sparkles className="h-5 w-5" />
        {busy && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-400 animate-pulse" />}
      </button>
    );
  }

  return (
    <div
      data-testid="assistant-panel"
      role="dialog"
      aria-label="Karma Assistant"
      dir="ltr"
      className={cn(
        position,
        wide
          ? "w-[min(780px,calc(100vw-2rem))] h-[min(820px,calc(100vh-7rem))]"
          : "w-[min(420px,calc(100vw-2rem))] h-[min(640px,calc(100vh-7rem))]",
        "flex flex-col rounded-xl border bg-background text-foreground shadow-2xl overflow-hidden",
      )}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2.5 bg-muted/40">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-tight">Karma Assistant</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {model ? `${model} · your history is saved until you clear it` : "Ask about your data, or ask it to do something"}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:inline-flex" onClick={() => setWide((w) => !w)} title={wide ? "Smaller" : "Larger"} data-testid="assistant-expand">
          {wide ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setClearing("ask")} disabled={busy || items.length === 0} title="Clear history" data-testid="assistant-reset">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} title="Close" data-testid="assistant-close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {clearing !== "no" && (
        <div data-testid="assistant-clear-confirm" className="flex items-center gap-2 border-b bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs">
          <span className="flex-1">Clear the whole conversation? This can't be undone.</span>
          <Button size="sm" variant="destructive" className="h-7" disabled={clearing === "working"} onClick={clearHistory} data-testid="assistant-clear-yes">
            {clearing === "working" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Clear"}
          </Button>
          <Button size="sm" variant="outline" className="h-7" disabled={clearing === "working"} onClick={() => setClearing("no")}>
            Keep
          </Button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {!loaded && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading your conversation…
          </div>
        )}
        {loaded && items.length === 0 && (
          <div className="text-sm text-muted-foreground space-y-3 pt-2">
            <p>
              Ask about customers, orders, invoices, payments, trips or stock — or ask it to make a change. Nothing is
              changed without your approval.
            </p>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  dir="auto"
                  className="text-start rounded-lg border px-3 py-2 text-foreground hover:bg-muted transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {items.map((item) => {
          if (item.kind === "user")
            return (
              <div key={item.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap" dir="auto">
                  {item.voice && <Mic className="inline h-3 w-3 me-1 opacity-70 align-[-1px]" aria-label="spoken" />}
                  {item.text}
                </div>
              </div>
            );
          if (item.kind === "error")
            return (
              <div key={item.id} className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {item.text}
              </div>
            );
          if (item.kind === "confirm") return <ConfirmCard key={item.id} item={item} onAnswer={answer} />;
          return (
            <div key={item.id} className={item.charts?.length ? "w-full" : "max-w-[95%]"} data-testid="assistant-answer">
              {item.text ? <Markdown text={item.text} /> : null}
              {item.charts?.map((c, i) => <AssistantChart key={i} spec={c} tall={wide} />)}
              {item.streaming && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>{item.status ?? "Thinking…"}</span>
                </div>
              )}
              {item.meta && (
                <div className="mt-1 text-[10px] text-muted-foreground/80">
                  {item.meta.seconds}s · {item.meta.tool_calls} lookups
                </div>
              )}
            </div>
          );
        })}
      </div>

      {voiceOn ? (
        <VoiceBar
          phase={phase}
          interim={interim}
          lang={voiceLang}
          onTap={tapOrb}
          onEnd={stopVoice}
          onLang={() => {
            const next: VoiceLang = voiceLang === "en" ? "ar" : "en";
            setVoiceLang(next);
            voiceLangRef.current = next;
            if (phase === "listening") {
              listener.stop();
              setTimeout(startListening, 50);
            }
          }}
        />
      ) : blocked ? (
      <div className="border-t p-3 text-sm text-muted-foreground" data-testid="assistant-blocked">
        {blocked}
      </div>
      ) : (
      <div className="border-t p-2">
        {allowance && <AllowanceMeter allowance={allowance} />}
        <div className="flex items-end gap-2">
          <Button
            size="icon"
            variant="outline"
            className="h-[38px] w-[38px] shrink-0"
            onClick={startVoice}
            disabled={!voiceSupported()}
            title={voiceSupported() ? "Talk to the assistant" : "Voice isn't supported in this browser"}
            data-testid="assistant-mic"
          >
            <Mic className="h-4 w-4" />
          </Button>
          <textarea
            ref={inputRef}
            data-testid="assistant-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            dir="auto"
            placeholder={busy ? "Working…" : "Ask or tell the assistant…"}
            className="flex-1 resize-none max-h-32 min-h-[38px] rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button size="icon" className="h-[38px] w-[38px] shrink-0" onClick={() => send()} disabled={busy || !input.trim()} data-testid="assistant-send">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}

function VoiceBar({
  phase,
  interim,
  lang,
  onTap,
  onEnd,
  onLang,
}: {
  phase: VoicePhase;
  interim: string;
  lang: VoiceLang;
  onTap: () => void;
  onEnd: () => void;
  onLang: () => void;
}) {
  const t = VOICE_TEXT[lang];
  const orb = {
    listening: "bg-red-500 text-white shadow-[0_0_0_6px_rgba(239,68,68,0.25)] animate-pulse",
    thinking: "bg-muted text-muted-foreground",
    speaking: "bg-primary text-primary-foreground shadow-[0_0_0_6px_hsl(var(--primary)/0.25)]",
    waiting: "bg-amber-400 text-amber-950",
    paused: "bg-muted text-foreground hover:bg-muted/80",
  }[phase];
  return (
    <div className="border-t px-3 py-3 bg-muted/30" data-testid="assistant-voice-bar" data-phase={phase}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onTap}
          disabled={phase === "thinking" || phase === "waiting"}
          aria-label={t[phase]}
          data-testid="assistant-voice-orb"
          className={cn("h-14 w-14 shrink-0 rounded-full flex items-center justify-center transition-all", orb)}
        >
          {phase === "listening" && <Mic className="h-6 w-6" />}
          {phase === "thinking" && <Loader2 className="h-6 w-6 animate-spin" />}
          {phase === "speaking" && <Volume2 className="h-6 w-6 animate-pulse" />}
          {phase === "waiting" && <Hand className="h-6 w-6" />}
          {phase === "paused" && <MicOff className="h-6 w-6" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium" dir="auto" data-testid="assistant-voice-status">
            {t[phase]}
          </div>
          <div className="text-xs text-muted-foreground truncate min-h-[1rem]" dir="auto" data-testid="assistant-voice-interim">
            {phase === "listening" ? interim : ""}
          </div>
        </div>
        <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={onLang} title="Speaking language" data-testid="assistant-voice-lang">
          {lang === "en" ? "EN" : "عربي"}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onEnd} title="End voice mode" data-testid="assistant-voice-end">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ConfirmCard({
  item,
  onAnswer,
}: {
  item: Extract<Item, { kind: "confirm" }>;
  onAnswer: (item: Extract<Item, { kind: "confirm" }>, approved: boolean, typed: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const e = item.event;
  const strong = e.tier === "strong";
  const done = item.state === "approved" || item.state === "cancelled";
  return (
    <div
      data-testid="assistant-confirm"
      className={cn(
        "rounded-lg border p-3 text-sm",
        strong ? "border-red-300 bg-red-50 dark:bg-red-950/30" : "border-amber-300 bg-amber-50 dark:bg-amber-950/30",
        done && "opacity-80",
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className={cn("h-4 w-4 mt-0.5 shrink-0", strong ? "text-red-600" : "text-amber-600")} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold" dir="auto">
            {e.title}
            {e.target ? <span className="font-normal"> — {e.target}</span> : null}
          </div>
          {strong && <div className="text-xs text-red-700 dark:text-red-300">Money, stock or delete — please check carefully.</div>}
          <ul className="mt-1.5 space-y-0.5 text-xs">
            {(e.lines.length ? e.lines : ["(no other details)"]).map((l, i) => (
              <li key={i} dir="auto" className="whitespace-pre-wrap break-words">
                {l}
              </li>
            ))}
          </ul>
          <div className="mt-1 text-[10px] text-muted-foreground font-mono break-all">
            {e.method} {e.path}
          </div>
        </div>
      </div>

      {done ? (
        <div className={cn("mt-2 flex items-center gap-1 text-xs font-medium", item.state === "approved" ? "text-green-700" : "text-muted-foreground")}>
          {item.state === "approved" ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          {item.state === "approved" ? "Approved" : "Cancelled — nothing changed"}
        </div>
      ) : (
        <div className="mt-2.5 space-y-2">
          {strong && (
            <input
              data-testid="assistant-confirm-text"
              value={typed}
              onChange={(ev) => setTyped(ev.target.value)}
              placeholder="Type CONFIRM to approve"
              className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              data-testid="assistant-approve"
              variant={strong ? "destructive" : "default"}
              disabled={item.state === "sending" || (strong && typed.trim() !== "CONFIRM")}
              onClick={() => onAnswer(item, true, typed)}
            >
              {item.state === "sending" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Approve"}
            </Button>
            <Button size="sm" variant="outline" data-testid="assistant-cancel" disabled={item.state === "sending"} onClick={() => onAnswer(item, false, "")}>
              Cancel
            </Button>
          </div>
          {item.error && <div className="text-xs text-destructive">{item.error}</div>}
        </div>
      )}
    </div>
  );
}


const WARN_AT_PCT = 80;

/** How much of the company's plan is used this period. Never shows a dollar amount. */
function AllowanceMeter({ allowance }: { allowance: Allowance }) {
  const pct = Math.min(100, Math.max(0, allowance.used_pct));
  const warn = pct >= WARN_AT_PCT;
  const resets = new Date(allowance.resets_on + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  return (
    <div className="mb-2 px-1" data-testid="assistant-allowance">
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span className={warn ? "text-amber-700 dark:text-amber-400" : undefined}>
          {pct}% of this period's assistant allowance used
        </span>
        <span>Resets {resets}</span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-1 rounded-full ${warn ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
