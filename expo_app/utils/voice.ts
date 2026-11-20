// Voice for the assistant on the phone:
//   - Listener: speech-to-text via expo-speech-recognition (iOS Speech framework /
//     Android SpeechRecognizer — the phone's own speech service, no extra cost).
//   - Speaker: text-to-speech via expo-speech (the phone's voices).
// Same behaviour as the web panel (frontend/client/src/lib/voice.ts): answers are
// spoken sentence by sentence while they stream.
import type * as SpeechType from 'expo-speech';
import type { ExpoSpeechRecognitionModule as RecognitionType } from 'expo-speech-recognition';

// Loaded only if the native code is in this build. An app binary built before
// these modules were added (e.g. one that receives this JS as an over-the-air
// update) would otherwise crash the whole assistant screen on import; without
// them the chat works and voice simply reports itself unavailable.
let Speech: typeof SpeechType | null = null;
let Recognition: typeof RecognitionType | null = null;
try {
  Speech = require('expo-speech');
} catch {
  Speech = null;
}
try {
  Recognition = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
} catch {
  Recognition = null;
}

export type VoiceLang = 'en' | 'ar';
const RECOGNITION_LANG: Record<VoiceLang, string> = { en: 'en-US', ar: 'ar-SA' };
const SPEECH_LANG: Record<VoiceLang, string> = { en: 'en-US', ar: 'ar-SA' };

export function voiceAvailable(): boolean {
  if (!Speech || !Recognition) return false;
  try {
    return Recognition.isRecognitionAvailable();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- text for speech

const ARABIC = /[؀-ۿ]/g;
export const isArabic = (s: string) => (s.match(ARABIC)?.length ?? 0) > s.replace(/\s/g, '').length * 0.3;

/** Answer text -> something pleasant to hear. Tables, code and ids are not read out. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n')
    .filter((l) => !/^\s*\|.*\|\s*$/.test(l) && !/^\s*[-:|\s]{3,}$/.test(l))
    .join('\n')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[*_#>]+/g, ' ')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
    .replace(/\s*[→←⇒]\s*/g, ', ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------- listening

export interface ListenHandlers {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onSilence: () => void;
  onError: (code: string, message?: string) => void;
}

export class Listener {
  private subs: { remove: () => void }[] = [];
  private gotFinal = false;
  private active = false;

  async start(lang: VoiceLang, h: ListenHandlers) {
    this.stop();
    const R = Recognition;
    if (!R || !Speech) return h.onError('unsupported');
    const perm = await R.requestPermissionsAsync();
    if (!perm.granted) return h.onError('not-allowed');
    this.gotFinal = false;
    this.active = true;
    this.subs = [
      R.addListener('result', (e) => {
        const text = e.results?.[0]?.transcript ?? '';
        if (e.isFinal) {
          if (text.trim() && !this.gotFinal) {
            this.gotFinal = true;
            h.onFinal(text.trim());
          }
        } else if (text) {
          h.onInterim(text);
        }
      }),
      R.addListener('error', (e) => {
        if (e.error === 'aborted' || e.error === 'no-speech' || e.error === 'speech-timeout') return; // -> end
        h.onError(e.error, e.message);
      }),
      R.addListener('end', () => {
        const wasActive = this.active;
        this.cleanup();
        if (wasActive && !this.gotFinal) h.onSilence();
      }),
    ];
    try {
      R.start({
        lang: RECOGNITION_LANG[lang],
        interimResults: true,
        continuous: false, // one utterance; ends after a pause
        addsPunctuation: true,
      });
    } catch (e: any) {
      this.cleanup();
      h.onError('start-failed', e?.message);
    }
  }

  private cleanup() {
    this.active = false;
    this.subs.forEach((s) => s.remove());
    this.subs = [];
  }

  stop() {
    const wasActive = this.active;
    this.cleanup();
    if (wasActive) {
      try {
        Recognition?.abort();
      } catch {
        /* already stopped */
      }
    }
  }
}

// ---------------------------------------------------------------- speaking

let voicesCache: SpeechType.Voice[] | null = null;
async function pickVoice(lang: VoiceLang): Promise<string | undefined> {
  if (!Speech) return undefined;
  try {
    voicesCache = voicesCache ?? (await Speech.getAvailableVoicesAsync());
  } catch {
    return undefined;
  }
  const mine = voicesCache.filter((v) => v.language?.toLowerCase().startsWith(lang));
  const best =
    mine.find((v) => String(v.quality).toLowerCase() === 'enhanced') ??
    mine.find((v) => /premium|enhanced|neural/i.test(v.name ?? '')) ??
    mine[0];
  return best?.identifier;
}

/** Speaks streamed text sentence by sentence while the answer is still arriving. */
export class Speaker {
  private buffer = '';
  private queue: string[] = [];
  private speaking = false;
  private stopped = false;
  onIdle: () => void = () => {};
  onStart: () => void = () => {};

  feed(delta: string) {
    this.stopped = false;
    this.buffer += delta;
    const parts = this.buffer.split(/(?<=[.!?؟])\s+|\n{2,}/);
    this.buffer = parts.pop() ?? '';
    parts.forEach((p) => this.enqueue(p));
  }

  flush() {
    const rest = this.buffer;
    this.buffer = '';
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
    this.buffer = '';
    this.queue = [];
    this.speaking = false;
    Speech?.stop();
  }

  private enqueue(raw: string) {
    const text = cleanForSpeech(raw);
    if (!text || !/[A-Za-z0-9À-ɏ؀-ۿ]/.test(text)) return;
    this.queue.push(text);
    if (!this.speaking) this.next();
  }

  private async next() {
    if (this.stopped) return;
    const text = this.queue.shift();
    if (!text) {
      this.speaking = false;
      this.onIdle();
      return;
    }
    this.speaking = true;
    const lang: VoiceLang = isArabic(text) ? 'ar' : 'en';
    const voice = await pickVoice(lang);
    if (this.stopped) return;
    if (!Speech) {
      void this.next();
      return;
    }
    Speech.speak(text, {
      language: SPEECH_LANG[lang],
      voice,
      rate: 1.0,
      onStart: () => this.onStart(),
      onDone: () => {
        void this.next();
      },
      onError: () => {
        void this.next();
      },
    });
  }
}
