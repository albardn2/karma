// Client for the Karma Assistant service (backend/assistant/server.py) — the same
// service and the same per-user conversation as the web app's chat panel, so a
// conversation started on the web continues on the phone and vice versa.
//
// Hidden unless the build sets ASSISTANT_URL (app.config.ts -> extra.assistantUrl).
// Every request carries the signed-in user's own token: the assistant acts with
// exactly that user's permissions.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { fetch as streamingFetch } from 'expo/fetch';
import { refreshAccessToken } from '@/utils/api';

export const ASSISTANT_URL: string = String(Constants.expoConfig?.extra?.assistantUrl ?? '').replace(/\/$/, '');
export const assistantEnabled = () => ASSISTANT_URL.length > 0;

// ---------------------------------------------------------------- types (mirror the web client)

export interface ChartSpec {
  title: string;
  type: 'bar' | 'horizontal_bar' | 'stacked_bar' | 'line' | 'area' | 'pie' | 'heatmap' | 'map';
  labels: string[];
  series: { name: string; values: (number | null)[] }[];
  unit?: string | null;
  note?: string | null;
  source: { kind: string; endpoint?: string; rows_matched?: number; without_coordinates?: number };
  truncated: boolean;
  // map only
  pins?: { lat: number; lon: number; label?: string; value?: number | null; group?: string }[];
  groups?: string[];
  heat?: { lat: number; lon: number; weight: number; count: number }[];
  routes?: { name: string; coords: [number, number][]; start: string | null; end: string | null }[];
  bounds?: [[number, number], [number, number]];
  value_field?: string | null;
}

export interface ConfirmEvent {
  type: 'confirm';
  confirm_id: string;
  tier: 'write' | 'strong';
  title: string;
  target: string | null;
  lines: string[];
  method: string;
  path: string;
}

export interface DoneEvent {
  type: 'done';
  text: string;
  stop_reason: string;
  allowance: Allowance | null;
  seconds: number;
  model_calls: number;
  tool_calls: number;
}

/** How much of the company's plan this billing period has used; null when uncapped. */
export interface Allowance {
  used_pct: number;
  /** ISO date the allowance resets on */
  resets_on: string;
}

export type AssistantEvent =
  | { type: 'status'; text: string }
  | { type: 'text'; delta: string }
  | { type: 'chart'; spec: ChartSpec }
  | ConfirmEvent
  | { type: 'confirm_resolved'; confirm_id: string; approved: boolean }
  | DoneEvent
  | { type: 'error'; message: string };

export type StoredItem =
  | { kind: 'user'; text: string; voice?: boolean }
  | { kind: 'assistant'; text: string; charts?: ChartSpec[]; meta?: Partial<DoneEvent> | null }
  | { kind: 'confirm'; state: 'pending' | 'approved' | 'cancelled'; event: Omit<ConfirmEvent, 'type'> }
  | { kind: 'error'; text: string };

export interface ConversationState {
  model: { id: string; label: string };
  /** off for the company, its allowance used up, or the user's hourly limit */
  access?: { allowed: boolean; code?: string; reason: string; allowance: Allowance | null };
  busy: boolean;
  items: StoredItem[];
}

export class AssistantError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// ---------------------------------------------------------------- requests

const BASE = () => `${ASSISTANT_URL}/assistant/conversation`;

async function authHeaders(): Promise<Record<string, string>> {
  const token = await AsyncStorage.getItem('access_token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function failure(res: { status: number; json: () => Promise<any> }): Promise<AssistantError> {
  let msg = `The assistant returned ${res.status}.`;
  try {
    const body = await res.json();
    if (body?.error) msg = body.error;
  } catch {
    /* not JSON */
  }
  return new AssistantError(msg, res.status);
}

/** fetch with the app's token; on 401 renew the token once and retry, like apiCall does */
async function call(path: string, init: { method?: string; body?: string; signal?: AbortSignal } = {}) {
  let res = await streamingFetch(path, { ...init, headers: await authHeaders() });
  if (res.status === 401 && (await refreshAccessToken()) === 'ok') {
    res = await streamingFetch(path, { ...init, headers: await authHeaders() });
  }
  return res;
}

export async function getConversation(): Promise<ConversationState> {
  const res = await call(BASE());
  if (!res.ok) throw await failure(res);
  return res.json();
}

/** Is the assistant on for this user's company right now? `code` is "off" when the
 *  company hasn't been switched on (the button is hidden), "budget"/"rate" when
 *  it's over a limit (the button stays; the screen says why). */
export async function getAccess(): Promise<{ allowed: boolean; code: string; reason: string }> {
  const res = await call(`${ASSISTANT_URL}/assistant/access`);
  if (!res.ok) throw await failure(res);
  return res.json();
}

export async function clearConversation(): Promise<void> {
  const res = await call(BASE(), { method: 'DELETE' });
  if (!res.ok) throw await failure(res);
}

export async function answerConfirmation(confirmId: string, approved: boolean, confirmText = ''): Promise<void> {
  const res = await call(`${BASE()}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ confirm_id: confirmId, approved, confirm_text: confirmText }),
  });
  if (!res.ok) throw await failure(res);
}

/** Sends a message and calls onEvent for every streamed event until the turn ends. */
export async function sendMessage(
  text: string,
  onEvent: (e: AssistantEvent) => void,
  opts: { voice?: boolean; signal?: AbortSignal } = {},
): Promise<void> {
  const res = await call(`${BASE()}/messages`, {
    method: 'POST',
    body: JSON.stringify({ text, ...(opts.voice ? { voice: true } : {}) }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw await failure(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue; // ": keep-alive"
        try {
          onEvent(JSON.parse(line.slice(6)) as AssistantEvent);
        } catch {
          /* skip a malformed event rather than abort the turn */
        }
      }
    }
  }
}
