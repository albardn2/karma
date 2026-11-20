// Speech helpers for the assistant: what gets read aloud, and in which language.
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), getAvailableVoicesAsync: jest.fn(async () => []) }));
jest.mock('expo-speech-recognition', () => ({ ExpoSpeechRecognitionModule: {} }));

import * as Speech from 'expo-speech';
import { Speaker, cleanForSpeech, isArabic } from '../voice';

describe('cleanForSpeech', () => {
  it('drops tables, ids, markdown and arrows', () => {
    const text = [
      '**74,200 SYP** is owed by abu nadeem.',
      '',
      '| Customer | Owes |',
      '|---|---|',
      '| a | 1 |',
      '- يدين لنا **أبو نديم** → منذ 460 يوماً',
      '`8146620f-a498-4294-995c-2dbfac686892`',
    ].join('\n');
    expect(cleanForSpeech(text)).toBe('74,200 SYP is owed by abu nadeem.\nيدين لنا أبو نديم, منذ 460 يوماً');
  });
});

describe('isArabic', () => {
  it('detects the language of a sentence', () => {
    expect(isArabic('يدين لنا أبو نديم بـ 74,200 ليرة')).toBe(true);
    expect(isArabic('Abu nadeem owes 74,200 SYP')).toBe(false);
  });
});

describe('Speaker', () => {
  it('speaks complete sentences as they stream, in the right language, then goes idle', async () => {
    const said: { text: string; language?: string }[] = [];
    (Speech.speak as unknown as jest.Mock<(text: string, opts: any) => void>).mockImplementation((text, opts) => {
      said.push({ text, language: opts.language });
      setTimeout(() => opts.onDone?.(), 0);
    });
    const sp = new Speaker();
    const idle = new Promise<void>((resolve) => (sp.onIdle = resolve));
    sp.feed('The school category has 36 customers. Minima');
    sp.feed('rkets are the biggest group.\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    sp.flush();
    await idle;
    expect(said).toEqual([
      { text: 'The school category has 36 customers.', language: 'en-US' },
      { text: 'Minimarkets are the biggest group.', language: 'en-US' },
    ]);
    said.length = 0;
    const idle2 = new Promise<void>((resolve) => (sp.onIdle = resolve));
    sp.say('لحظة من فضلك.');
    await idle2;
    expect(said).toEqual([{ text: 'لحظة من فضلك.', language: 'ar-SA' }]);
  });
});
