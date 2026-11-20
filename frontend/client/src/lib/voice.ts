// Voice for the assistant, using the browser's Web Speech API:
//   - Listener: speech-to-text (SpeechRecognition). In Chrome/Edge the audio is
//     processed by the browser vendor's speech service; Safari uses Apple's.
//   - Speaker: text-to-speech (speechSynthesis) with the device's voices.
// No server and no extra cost. Either half can be swapped for a server-side
// provider later without touching the widget.

type Rec = any; // SpeechRecognition isn't in TS's DOM lib everywhere

// looked up when needed (not at import), so a browser that adds it late — or a
// test that provides one — is picked up
const recognitionCtor = (): (new () => Rec) | undefined =>
  typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : undefined;

export const voiceSupported = (): boolean =>
  !!recognitionCtor() && typeof window !== "undefined" && "speechSynthesis" in window;

export type VoiceLang = "en" | "ar";
const RECOGNITION_LANG: Record<VoiceLang, string> = { en: "en-US", ar: "ar-SY" };

// --------------------------------------------------------------------------- text for speech

const ARABIC = /[؀-ۿ]/g;
export const isArabic = (s: string) => (s.match(ARABIC)?.length ?? 0) > s.replace(/\s/g, "").length * 0.3;

/** Markdown/answer text -> something pleasant to hear. Tables and code are not read out. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .filter((l) => !/^\s*\|.*\|\s*$/.test(l) && !/^\s*[-:|\s]{3,}$/.test(l)) // table rows / separators
    .join("\n")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_#>]+/g, " ")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
    .replace(/\s*[→←⇒]\s*/g, ", ") // a neutral pause, not an English word inside Arabic
    .replace(/[ \t]+/g, " ")
    .trim();
}

// --------------------------------------------------------------------------- listening

export interface ListenHandlers {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  /** recognition ended without any speech (silence) */
  onSilence: () => void;
  onError: (code: string) => void;
}

export class Listener {
  private rec: Rec | null = null;
  private gotFinal = false;

  start(lang: VoiceLang, h: ListenHandlers) {
    this.stop();
    const Ctor = recognitionCtor();
    if (!Ctor) return h.onError("unsupported");
    const rec: Rec = new Ctor();
    rec.lang = RECOGNITION_LANG[lang];
    rec.interimResults = true;
    rec.continuous = false; // one utterance; the browser ends it after a pause
    rec.maxAlternatives = 1;
    this.gotFinal = false;
    rec.onresult = (ev: any) => {
      let interim = "";
      let final = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) h.onInterim(interim);
      if (final.trim()) {
        this.gotFinal = true;
        h.onFinal(final.trim());
      }
    };
    rec.onerror = (ev: any) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return; // handled by onend
      h.onError(ev.error || "error");
    };
    rec.onend = () => {
      if (this.rec === rec) this.rec = null;
      if (!this.gotFinal) h.onSilence();
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      h.onError("start-failed");
    }
  }

  stop() {
    const r = this.rec;
    this.rec = null;
    if (r) {
      r.onend = null;
      r.onresult = null;
      r.onerror = null;
      try {
        r.abort();
      } catch {
        /* already stopped */
      }
    }
  }
}

// --------------------------------------------------------------------------- speaking

function pickVoice(lang: VoiceLang): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const mine = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  // prefer the higher-quality voices browsers ship under these names
  return (
    mine.find((v) => /natural|neural|premium|enhanced|google/i.test(v.name)) ?? mine.find((v) => v.localService) ?? mine[0]
  );
}

/**
 * Speaks streamed text sentence by sentence, so the first words come out while
 * the rest of the answer is still being written.
 */
export class Speaker {
  private buffer = "";
  private queue: string[] = [];
  private speaking = false;
  private stopped = false;
  onIdle: () => void = () => {};
  onStart: () => void = () => {};

  /** add streamed text; complete sentences are queued for speech */
  feed(delta: string) {
    this.stopped = false;
    this.buffer += delta;
    const parts = this.buffer.split(/(?<=[.!?؟。])\s+|\n{2,}/);
    this.buffer = parts.pop() ?? "";
    for (const p of parts) this.enqueue(p);
  }

  /** the answer is complete: speak whatever is left */
  flush() {
    const rest = this.buffer;
    this.buffer = "";
    this.enqueue(rest);
    if (!this.speaking && this.queue.length === 0) this.onIdle();
  }

  say(text: string) {
    this.stopped = false;
    this.enqueue(text);
  }

  get busy() {
    return this.speaking || this.queue.length > 0;
  }

  cancel() {
    this.stopped = true;
    this.buffer = "";
    this.queue = [];
    this.speaking = false;
    window.speechSynthesis.cancel();
  }

  private enqueue(raw: string) {
    const text = cleanForSpeech(raw);
    // nothing speakable (only punctuation/symbols): skip — Latin, digits, Arabic letters/digits
    if (!text || !/[A-Za-z0-9À-ɏ؀-ۿ]/.test(text)) return;
    this.queue.push(text);
    if (!this.speaking) this.next();
  }

  private next() {
    if (this.stopped) return;
    const text = this.queue.shift();
    if (!text) {
      this.speaking = false;
      this.onIdle();
      return;
    }
    this.speaking = true;
    const u = new SpeechSynthesisUtterance(text);
    const lang: VoiceLang = isArabic(text) ? "ar" : "en";
    u.lang = lang === "ar" ? "ar-SA" : "en-US";
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.rate = 1.03;
    u.onstart = () => this.onStart();
    u.onend = () => this.next();
    u.onerror = () => this.next();
    window.speechSynthesis.speak(u);
  }
}

// voices load asynchronously in some browsers; touch the list early
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
}
