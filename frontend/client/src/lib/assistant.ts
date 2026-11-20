// Client for the Karma Assistant service (backend/assistant/server.py).
//
// The widget is only rendered when VITE_ASSISTANT_URL is set, so builds that
// don't configure it (today: every deployed environment) ship no assistant UI.
// Every request carries the signed-in user's own token; the service acts with
// exactly that user's permissions.

export const ASSISTANT_URL: string = (import.meta.env.VITE_ASSISTANT_URL || "").replace(/\/$/, "");

export interface MapPin {
  lat: number;
  lon: number;
  label?: string;
  value?: number | null;
  group?: string;
}

export interface MapSpec {
  type: "map";
  title: string;
  mode: "pins" | "heat" | "pins_and_heat";
  pins: MapPin[];
  groups: string[];
  heat: { lat: number; lon: number; weight: number; count: number }[];
  heat_cell_deg: number | null;
  routes: { name: string; coords: [number, number][]; start: string | null; end: string | null }[];
  bounds: [[number, number], [number, number]];
  unit?: string | null;
  value_field?: string | null;
  note?: string | null;
  source: { kind: string; endpoint?: string; rows_matched?: number; without_coordinates?: number };
  truncated: boolean;
}

export interface ChartSpec {
  title: string;
  type: "bar" | "horizontal_bar" | "stacked_bar" | "line" | "area" | "pie" | "heatmap" | "map";
  labels: string[];
  series: { name: string; values: (number | null)[] }[];
  x_label?: string | null;
  y_label?: string | null;
  unit?: string | null;
  note?: string | null;
  source: { kind: "query"; endpoint?: string; rows_matched?: number; rows_fetched?: number; truncated?: boolean } | { kind: "model" };
  truncated: boolean;
}

export type AssistantEvent =
  | { type: "status"; text: string }
  | { type: "text"; delta: string }
  | { type: "chart"; spec: ChartSpec }
  | {
      type: "confirm";
      confirm_id: string;
      tier: "write" | "strong";
      title: string;
      target: string | null;
      lines: string[];
      method: string;
      path: string;
    }
  | { type: "confirm_resolved"; confirm_id: string; approved: boolean }
  | {
      type: "done";
      text: string;
      stop_reason: string;
      cost_usd: number;
      seconds: number;
      model_calls: number;
      tool_calls: number;
    }
  | { type: "error"; message: string };

/** One saved chat-panel entry, exactly as the service stores it (backend/assistant/store.py). */
export type StoredItem =
  | { kind: "user"; text: string; voice?: boolean }
  | {
      kind: "assistant";
      text: string;
      charts?: ChartSpec[];
      meta?: { cost_usd: number; seconds: number; model_calls: number; tool_calls: number; stop_reason: string } | null;
    }
  | {
      kind: "confirm";
      state: "pending" | "approved" | "cancelled";
      event: Omit<Extract<AssistantEvent, { type: "confirm" }>, "type">;
    }
  | { kind: "error"; text: string };

/** The signed-in user's saved conversation (one per user per company, kept until cleared). */
export interface ConversationState {
  model: { id: string; label: string };
  /** off for the company, over its monthly budget, or the user's hourly limit */
  access?: { allowed: boolean; reason: string };
  busy: boolean;
  items: StoredItem[];
  updated_at: number | null;
}

export class AssistantError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function headers(): HeadersInit {
  const token = localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function failure(res: Response): Promise<AssistantError> {
  let msg = `The assistant returned ${res.status}.`;
  try {
    const body = await res.json();
    if (body?.error) msg = body.error;
  } catch {
    /* not JSON */
  }
  return new AssistantError(msg, res.status);
}

const BASE = () => `${ASSISTANT_URL}/assistant/conversation`;

export async function getConversation(): Promise<ConversationState> {
  const res = await fetch(BASE(), { headers: headers() });
  if (!res.ok) throw await failure(res);
  return res.json();
}

export async function clearConversation(): Promise<void> {
  const res = await fetch(BASE(), { method: "DELETE", headers: headers() });
  if (!res.ok) throw await failure(res);
}

/** Sends a message and calls onEvent for every server-sent event until the turn ends. */
export async function sendMessage(
  text: string,
  onEvent: (e: AssistantEvent) => void,
  signal?: AbortSignal,
  opts?: { voice?: boolean },
): Promise<void> {
  const res = await fetch(`${BASE()}/messages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ text, ...(opts?.voice ? { voice: true } : {}) }),
    signal,
  });
  if (!res.ok || !res.body) throw await failure(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue; // ": keep-alive" comments
        try {
          onEvent(JSON.parse(line.slice(6)) as AssistantEvent);
        } catch {
          /* ignore a malformed event rather than abort the turn */
        }
      }
    }
  }
}

export async function answerConfirmation(confirmId: string, approved: boolean, confirmText?: string): Promise<void> {
  const res = await fetch(`${BASE()}/confirm`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ confirm_id: confirmId, approved, confirm_text: confirmText ?? "" }),
  });
  if (!res.ok) throw await failure(res);
}
