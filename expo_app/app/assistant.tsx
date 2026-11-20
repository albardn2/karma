// The Karma Assistant screen: type or talk, answers stream in, charts and maps
// render inline, and every change waits for an on-screen approval.
//
// Opened from the floating button (components/assistant/AssistantFab.tsx) with
// router.push, so it sits ON TOP of the screen you were on: going back (header
// arrow, swipe, Android back button) pops just this screen and you are exactly
// where you were, scroll position included. The conversation is the same one
// the web app shows (stored per user by the assistant service).
import { Stack } from 'expo-router';
import { useHeaderHeight } from '@react-navigation/elements';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLanguage } from '@/contexts/LanguageContext';
import { AssistantChart, ConfirmCard, RichText } from '@/components/assistant/AssistantContent';
import {
  AssistantError, answerConfirmation, clearConversation, getConversation, sendMessage,
  type ChartSpec, type ConfirmEvent, type StoredItem,
} from '@/utils/assistant';
import { Listener, Speaker, voiceAvailable, type VoiceLang } from '@/utils/voice';

type Item =
  | { id: number; kind: 'user'; text: string; voice?: boolean }
  | { id: number; kind: 'assistant'; text: string; status?: string; streaming: boolean; charts?: ChartSpec[];
      meta?: { seconds?: number; tool_calls?: number; cost_usd?: number } | null }
  | { id: number; kind: 'confirm'; event: Omit<ConfirmEvent, 'type'>; state: 'pending' | 'sending' | 'approved' | 'cancelled'; error?: string }
  | { id: number; kind: 'error'; text: string };

type Phase = 'listening' | 'thinking' | 'speaking' | 'waiting' | 'paused';

const T: Record<VoiceLang, Record<string, string>> = {
  en: {
    listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking — tap to interrupt',
    waiting: 'Approve or cancel on screen', paused: 'Tap the mic to talk',
    approve: 'Please check it and approve on the screen.', error: 'Sorry, something went wrong.',
  },
  ar: {
    listening: 'أستمع…', thinking: 'أفكر…', speaking: 'أتحدث — اضغط للمقاطعة',
    waiting: 'وافق أو ألغِ على الشاشة', paused: 'اضغط على الميكروفون للتحدث',
    approve: 'يرجى المراجعة والموافقة على الشاشة.', error: 'عذراً، حدث خطأ.',
  },
};
const FILLERS: Record<VoiceLang, string[]> = {
  en: ['One moment.', 'Let me check.', 'Sure, one second.'],
  ar: ['لحظة من فضلك.', 'دعني أتحقق.', 'حسناً، لحظة.'],
};
const SUGGESTIONS = ['Who owes us the most in USD?', 'Revenue per service area this month', 'ما هي أكثر المواد مبيعاً هذا الشهر؟'];

function prettyStatus(s: string): string {
  if (s === 'searching tools') return 'Looking for the right data…';
  const m = /^calling (.+)$/.exec(s);
  if (m) {
    if (m[1] === 'query_data') return 'Analysing records…';
    const [resource, action = ''] = m[1].split('__');
    return `${action.replace(/_/g, ' ') || 'checking'} · ${resource.replace(/_/g, ' ')}`;
  }
  return s;
}

function micError(code: string): string {
  if (code === 'not-allowed' || code === 'service-not-allowed')
    return 'Microphone or speech recognition access is off for Karma. Turn it on in Settings, then try again.';
  if (code === 'language-not-supported') return "Speech recognition for this language isn't available on this phone.";
  if (code === 'network') return 'Speech recognition needs an internet connection.';
  // Also what the iOS Simulator reports: its speech recognizer can't load its
  // language model, although the microphone itself works. Real phones are fine.
  if (code === 'audio-capture')
    return "Couldn't hear you: the phone's speech recognizer didn't start. Try again, or type your question.";
  return `Voice stopped (${code}).`;
}

let nextId = 1;
const fromStored = (items: StoredItem[]): Item[] =>
  items.map((it): Item => {
    const id = nextId++;
    if (it.kind === 'assistant') return { id, kind: 'assistant', text: it.text, charts: it.charts, meta: it.meta ?? null, streaming: false };
    if (it.kind === 'confirm') return { id, kind: 'confirm', state: it.state, event: it.event };
    return { id, ...it } as Item;
  });

export default function AssistantScreen() {
  const { lang: appLang } = useLanguage();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // voice
  const [voiceOn, setVoiceOn] = useState(false);
  const [phase, setPhase] = useState<Phase>('paused');
  const [interim, setInterim] = useState('');
  const [voiceLang, setVoiceLang] = useState<VoiceLang>(appLang === 'ar' ? 'ar' : 'en');
  const listener = useRef(new Listener()).current;
  const speaker = useRef(new Speaker()).current;
  const voiceOnRef = useRef(false);
  const busyRef = useRef(false);
  const waitingRef = useRef(false);
  const langRef = useRef(voiceLang);
  langRef.current = voiceLang;
  const sendRef = useRef<(raw?: string, voice?: boolean) => void>(() => {});

  const update = (fn: (it: Item[]) => Item[]) => setItems((prev) => fn(prev));
  // the same error twice in a row (e.g. tapping the mic again) shows once
  const addError = (text: string) =>
    update((it) => {
      const last = it[it.length - 1];
      if (last?.kind === 'error' && last.text === text) return it;
      return [...it, { id: nextId++, kind: 'error', text }];
    });

  const load = useCallback(async () => {
    try {
      const c = await getConversation();
      setItems(fromStored(c.items));
      setLoaded(true);
      if (c.busy) {
        setBusy(true);
        busyRef.current = true;
        setTimeout(load, 2000);
      } else {
        setBusy(false);
        busyRef.current = false;
      }
    } catch (e) {
      setLoaded(true);
      addError(e instanceof Error ? e.message : 'Could not load the conversation.');
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      listener.stop();
      speaker.cancel();
    };
  }, []);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [items]);

  // ---------------------------------------------------------------- voice loop
  const startListening = () => {
    if (!voiceOnRef.current) return;
    setInterim('');
    setPhase('listening');
    listener.start(langRef.current, {
      onInterim: setInterim,
      onFinal: (t) => {
        setInterim('');
        setPhase('thinking');
        sendRef.current(t, true);
      },
      onSilence: () => voiceOnRef.current && setPhase('paused'),
      onError: (code) => {
        stopVoice();
        addError(micError(code));
      },
    });
  };
  speaker.onStart = () => voiceOnRef.current && setPhase('speaking');
  speaker.onIdle = () => {
    if (voiceOnRef.current && !busyRef.current && !waitingRef.current) startListening();
  };
  const startVoice = () => {
    if (!voiceAvailable()) return addError("Speech recognition isn't available on this phone.");
    speaker.cancel();
    voiceOnRef.current = true;
    setVoiceOn(true);
    if (busyRef.current) setPhase('thinking');
    else startListening();
  };
  function stopVoice() {
    voiceOnRef.current = false;
    setVoiceOn(false);
    listener.stop();
    speaker.cancel();
    setInterim('');
    setPhase('paused');
  }
  const tapOrb = () => {
    if (phase === 'speaking') {
      speaker.cancel();
      startListening();
    } else if (phase === 'listening') {
      listener.stop();
      setPhase('paused');
    } else if (phase === 'paused') startListening();
  };

  // ---------------------------------------------------------------- sending
  const send = async (raw?: string, voice = false) => {
    const text = (raw ?? input).trim();
    if (!text || busyRef.current) return;
    setInput('');
    setBusy(true);
    busyRef.current = true;
    update((it) => [...it, { id: nextId++, kind: 'user', text, ...(voice ? { voice: true } : {}) }]);
    let said = false;
    const filler = voice
      ? setTimeout(() => {
          if (!said && voiceOnRef.current && !speaker.busy) {
            const o = FILLERS[langRef.current];
            speaker.say(o[Math.floor(Math.random() * o.length)]);
          }
        }, 1200)
      : null;

    let current: number | null = null;
    let needsBreak = false;
    const bubble = () => {
      if (current === null) {
        const id = nextId++;
        current = id;
        update((it) => [...it, { id, kind: 'assistant', text: '', streaming: true }]);
      }
      return current;
    };
    const patch = (fn: (b: Extract<Item, { kind: 'assistant' }>) => Partial<Extract<Item, { kind: 'assistant' }>>) => {
      const id = bubble();
      update((it) => it.map((x) => (x.id === id && x.kind === 'assistant' ? { ...x, ...fn(x) } : x)));
    };

    try {
      bubble();
      await sendMessage(text, (e) => {
        switch (e.type) {
          case 'status':
            needsBreak = true;
            patch(() => ({ status: prettyStatus(e.text) }));
            break;
          case 'chart':
            patch((b) => ({ charts: [...(b.charts ?? []), e.spec] }));
            break;
          case 'text':
            said = true;
            if (voice && voiceOnRef.current) speaker.feed(e.delta);
            patch((b) => {
              const sep = needsBreak && b.text && !b.text.endsWith('\n') ? '\n\n' : '';
              needsBreak = false;
              return { text: b.text + sep + e.delta };
            });
            break;
          case 'confirm': {
            if (current !== null) {
              const id = current;
              update((it) => it
                .map((x) => (x.id === id && x.kind === 'assistant' ? { ...x, streaming: false, status: undefined } : x))
                .filter((x) => !(x.id === id && x.kind === 'assistant' && !x.text.trim() && !x.charts?.length)));
            }
            current = null;
            const { type: _t, ...event } = e;
            update((it) => [...it, { id: nextId++, kind: 'confirm', event, state: 'pending' }]);
            if (voice && voiceOnRef.current) {
              waitingRef.current = true;
              speaker.flush();
              speaker.say(T[langRef.current].approve);
              setPhase('waiting');
            }
            break;
          }
          case 'confirm_resolved':
            update((it) => it.map((x) =>
              x.kind === 'confirm' && x.event.confirm_id === e.confirm_id ? { ...x, state: e.approved ? 'approved' : 'cancelled' } : x));
            if (voice) {
              waitingRef.current = false;
              if (voiceOnRef.current) setPhase('thinking');
            }
            break;
          case 'done':
            patch(() => ({ text: e.text, streaming: false, status: undefined, meta: e }));
            if (voice && voiceOnRef.current) speaker.flush();
            break;
          case 'error':
            addError(e.message);
            if (voice && voiceOnRef.current) speaker.say(T[langRef.current].error);
            break;
        }
      }, { voice });
    } catch (e) {
      addError(e instanceof AssistantError ? e.message : 'Could not reach the assistant. Check your connection.');
    } finally {
      if (filler) clearTimeout(filler);
      update((it) => it
        .map((x) => (x.kind === 'assistant' && x.streaming ? { ...x, streaming: false, status: undefined } : x))
        .filter((x) => !(x.kind === 'assistant' && !x.text.trim() && !x.meta && !x.charts?.length)));
      setBusy(false);
      busyRef.current = false;
      waitingRef.current = false;
      if (voice && voiceOnRef.current && !speaker.busy) startListening();
    }
  };
  sendRef.current = send;

  const answer = async (id: number, confirmId: string, approved: boolean, typed: string) => {
    update((it) => it.map((x) => (x.id === id && x.kind === 'confirm' ? { ...x, state: 'sending', error: undefined } : x)));
    try {
      await answerConfirmation(confirmId, approved, typed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed';
      update((it) => it.map((x) => (x.id === id && x.kind === 'confirm' ? { ...x, state: 'pending', error: msg } : x)));
    }
  };

  const clearAll = async () => {
    setConfirmClear(false);
    try {
      await clearConversation();
      setItems([]);
    } catch (e) {
      addError(e instanceof Error ? e.message : 'Could not clear.');
    }
  };

  // ---------------------------------------------------------------- render
  const contentWidth = width - 32;
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Karma Assistant',
          headerRight: () => (
            <TouchableOpacity onPress={() => setConfirmClear(true)} disabled={busy || items.length === 0}
              accessibilityLabel="Clear history" testID="assistant-clear" style={{ padding: 6, opacity: busy || !items.length ? 0.35 : 1 }}>
              <MaterialIcons name="delete-sweep" size={24} color="#5469D4" />
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#f8fafc' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}>
        {confirmClear && (
          <View style={st.clearBar}>
            <Text style={{ flex: 1, fontSize: 13, color: '#7f1d1d' }}>Clear the whole conversation? This can't be undone.</Text>
            <TouchableOpacity onPress={clearAll} style={[st.smallBtn, { backgroundColor: '#dc2626' }]} testID="assistant-clear-yes">
              <Text style={{ color: '#fff', fontWeight: '600' }}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setConfirmClear(false)} style={[st.smallBtn, { borderWidth: 1, borderColor: '#cbd5e1' }]}>
              <Text>Keep</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
          {!loaded && <ActivityIndicator style={{ marginTop: 24 }} />}
          {loaded && items.length === 0 && (
            <View style={{ gap: 10 }}>
              <Text style={{ color: '#475569', fontSize: 14 }}>
                Ask about customers, orders, invoices, payments, trips or stock — or ask it to make a change. Nothing is
                changed without your approval. Tap the mic to talk.
              </Text>
              {SUGGESTIONS.map((q) => (
                <TouchableOpacity key={q} onPress={() => send(q)} style={st.suggestion}>
                  <Text style={{ color: '#0f172a' }}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {items.map((item) => {
            if (item.kind === 'user')
              return (
                <View key={item.id} style={st.userBubble}>
                  <Text style={{ color: '#fff', fontSize: 15 }}>{item.voice ? '🎤 ' : ''}{item.text}</Text>
                </View>
              );
            if (item.kind === 'error')
              return <Text key={item.id} style={st.error}>{item.text}</Text>;
            if (item.kind === 'confirm')
              return (
                <ConfirmCard key={item.id} event={item.event} state={item.state} error={item.error}
                  onAnswer={(ok, typed) => answer(item.id, item.event.confirm_id, ok, typed)} />
              );
            return (
              <View key={item.id}>
                {item.text ? <RichText text={item.text} color="#0f172a" /> : null}
                {item.charts?.map((c, i) => <AssistantChart key={i} spec={c} width={contentWidth} />)}
                {item.streaming && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <ActivityIndicator size="small" />
                    <Text style={{ color: '#64748b', fontSize: 12 }}>{item.status ?? 'Thinking…'}</Text>
                  </View>
                )}
                {item.meta && item.meta.seconds != null && (
                  <Text style={{ color: '#94a3b8', fontSize: 10, marginTop: 4 }}>
                    {item.meta.seconds}s · {item.meta.tool_calls} lookups
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>

        {voiceOn ? (
          <View style={[st.voiceBar, { paddingBottom: 12 + insets.bottom }]} testID="assistant-voice-bar">
            <TouchableOpacity onPress={tapOrb} disabled={phase === 'thinking' || phase === 'waiting'} testID="assistant-voice-orb"
              style={[st.orb, phase === 'listening' && { backgroundColor: '#ef4444' }, phase === 'speaking' && { backgroundColor: '#5469D4' },
                      phase === 'waiting' && { backgroundColor: '#f59e0b' }]}>
              {phase === 'thinking' ? <ActivityIndicator color="#334155" /> : (
                <MaterialIcons size={28} color={phase === 'paused' ? '#334155' : '#fff'}
                  name={phase === 'speaking' ? 'volume-up' : phase === 'waiting' ? 'pan-tool' : phase === 'paused' ? 'mic-off' : 'mic'} />
              )}
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: '#0f172a' }}>{T[voiceLang][phase]}</Text>
              <Text style={{ color: '#64748b', fontSize: 12 }} numberOfLines={2}>{phase === 'listening' ? interim : ''}</Text>
            </View>
            <TouchableOpacity style={st.langBtn} testID="assistant-voice-lang" onPress={() => {
              const next: VoiceLang = voiceLang === 'en' ? 'ar' : 'en';
              setVoiceLang(next);
              langRef.current = next;
              if (phase === 'listening') { listener.stop(); setTimeout(startListening, 50); }
            }}>
              <Text style={{ fontSize: 12, fontWeight: '600' }}>{voiceLang === 'en' ? 'EN' : 'عربي'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={stopVoice} style={{ padding: 6 }} accessibilityLabel="End voice mode" testID="assistant-voice-end">
              <MaterialIcons name="close" size={22} color="#334155" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[st.inputBar, { paddingBottom: 8 + insets.bottom }]}>
            <TouchableOpacity onPress={startVoice} style={st.micBtn} accessibilityLabel="Talk to the assistant" testID="assistant-mic">
              <MaterialIcons name="mic" size={22} color="#5469D4" />
            </TouchableOpacity>
            <TextInput value={input} onChangeText={setInput} placeholder={busy ? 'Working…' : 'Ask or tell the assistant…'}
              multiline style={st.input} testID="assistant-input" />
            <TouchableOpacity onPress={() => send()} disabled={busy || !input.trim()} testID="assistant-send"
              style={[st.sendBtn, (busy || !input.trim()) && { opacity: 0.4 }]}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcons name="send" size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

const st = StyleSheet.create({
  userBubble: { alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: '#5469D4', borderRadius: 16, borderBottomRightRadius: 4, paddingHorizontal: 12, paddingVertical: 8 },
  error: { color: '#b91c1c', backgroundColor: '#fef2f2', borderRadius: 8, padding: 10, fontSize: 13 },
  suggestion: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, backgroundColor: '#fff' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, fontSize: 15, backgroundColor: '#fff' },
  micBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  sendBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#5469D4', alignItems: 'center', justifyContent: 'center' },
  voiceBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#cbd5e1', backgroundColor: '#f1f5f9' },
  orb: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  langBtn: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' },
  clearBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: '#fef2f2', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#fecaca' },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
});
