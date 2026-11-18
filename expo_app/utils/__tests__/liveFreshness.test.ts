// imported explicitly: @types/jest is not a dependency of this project
import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_FRESH_MINUTES,
  ageMs,
  freshMinutesFrom,
  isFresh,
  lastSeenLabel,
  parseRecordedAt,
} from '@/utils/liveFreshness';

const NOW = Date.parse('2026-11-18T19:40:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const FRESH_MINUTES = 5;

/** Echoes the key and its vars, so a test can assert which label was chosen. */
const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

describe('parseRecordedAt', () => {
  it('reads an ISO timestamp with a zone', () => {
    expect(parseRecordedAt('2026-11-18T16:24:12.000Z')).toBe(Date.parse('2026-11-18T16:24:12.000Z'));
  });

  it('reads a timestamp without a zone as UTC', () => {
    expect(parseRecordedAt('2026-11-18T16:24:12')).toBe(Date.parse('2026-11-18T16:24:12Z'));
  });

  it.each([undefined, null, '', 42, 'not a date'])('returns null for %p', (value) => {
    expect(parseRecordedAt(value)).toBeNull();
  });
});

describe('ageMs', () => {
  it('is the time since the fix', () => {
    expect(ageMs(NOW - 3 * HOUR, NOW)).toBe(3 * HOUR);
  });

  it('is zero, not negative, when the device clock runs ahead', () => {
    expect(ageMs(NOW + MINUTE, NOW)).toBe(0);
  });

  it('is unknown without a fix time', () => {
    expect(ageMs(null, NOW)).toBeNull();
  });
});

describe('isFresh', () => {
  it.each([
    ['a fix inside the window', NOW - MINUTE, true],
    ['a fix exactly at the window edge', NOW - FRESH_MINUTES * MINUTE, true],
    ['a fix just past the window', NOW - FRESH_MINUTES * MINUTE - 1, false],
    ['a retained fix from hours ago', NOW - 3 * HOUR, false],
    ['a fix with no time', null, false],
  ])('%s -> %p', (_label, recordedAt, expected) => {
    expect(isFresh(recordedAt as number | null, NOW, FRESH_MINUTES)).toBe(expected);
  });
});

describe('freshMinutesFrom', () => {
  it('uses the account setting from client-config', () => {
    expect(freshMinutesFrom({ fresh_minutes: 12 })).toBe(12);
  });

  it.each([null, undefined, {}, { fresh_minutes: 0 }, { fresh_minutes: 'x' }])(
    'falls back to the default for %p',
    (config) => {
      expect(freshMinutesFrom(config as { fresh_minutes?: unknown } | null | undefined)).toBe(
        DEFAULT_FRESH_MINUTES,
      );
    },
  );
});

describe('lastSeenLabel', () => {
  it.each([
    [NOW - 42_000, 'liveMap.secondsAgo:{"n":42}'],
    [NOW - 7 * MINUTE, 'liveMap.minutesAgo:{"n":7}'],
    [NOW - 3 * HOUR - 17 * MINUTE, 'liveMap.hoursAgo:{"n":3}'],
    [NOW - 50 * HOUR, 'liveMap.daysAgo:{"n":2}'],
    [null, 'liveMap.lastSeenUnknown'],
  ])('labels a fix at %p as %p', (recordedAt, expected) => {
    expect(lastSeenLabel(recordedAt as number | null, NOW, t)).toBe(expected);
  });
});
