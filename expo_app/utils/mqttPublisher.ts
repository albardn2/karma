// Minimal MQTT 3.1.1 publisher over WebSocket.
//
// The app only ever PUBLISHes (QoS 0, retained) — it never subscribes — so a
// tiny hand-rolled client beats dragging mqtt.js's Node polyfills (Buffer,
// process.nextTick, events) into Hermes. Works with React Native's global
// WebSocket and with Node >= 22 (undici) for tests.

const PROTOCOL_LEVEL = 4; // MQTT 3.1.1

const toUtf8 = (s: string): number[] => {
  // hand-rolled UTF-8: Hermes doesn't reliably ship TextEncoder
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.codePointAt(i) as number;
    if (cp > 0xffff) i++; // surrogate pair consumed
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return out;
};

const utf8Field = (s: string): number[] => {
  const b = toUtf8(s);
  return [b.length >> 8, b.length & 0xff, ...b];
};

const varint = (n: number): number[] => {
  const out: number[] = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    out.push(byte);
  } while (n > 0);
  return out;
};

const packet = (header: number, body: number[]): Uint8Array =>
  new Uint8Array([header, ...varint(body.length), ...body]);

const connectPacket = (clientId: string, keepaliveSec: number): Uint8Array =>
  packet(0x10, [
    ...utf8Field('MQTT'),
    PROTOCOL_LEVEL,
    0x02, // clean session, no will, no auth
    keepaliveSec >> 8,
    keepaliveSec & 0xff,
    ...utf8Field(clientId),
  ]);

const publishPacket = (topic: string, payload: string, retain: boolean): Uint8Array =>
  packet(0x30 | (retain ? 0x01 : 0x00), [...utf8Field(topic), ...toUtf8(payload)]);

const PINGREQ = new Uint8Array([0xc0, 0x00]);
const DISCONNECT = new Uint8Array([0xe0, 0x00]);

export interface MqttPublisherOptions {
  url: string; // wss://host:port/mqtt
  clientId: string;
  keepaliveSec?: number;
  onStatus?: (status: 'connecting' | 'connected' | 'closed' | 'error') => void;
}

/**
 * Fire-and-forget MQTT publisher. connect() resolves once CONNACK arrives;
 * publish() is QoS 0 (no ack). Call close() to end cleanly. Create a new
 * instance to reconnect.
 */
export class MqttPublisher {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private readonly opts: MqttPublisherOptions;

  constructor(opts: MqttPublisherOptions) {
    this.opts = opts;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const keepalive = this.opts.keepaliveSec ?? 60;
      this.opts.onStatus?.('connecting');
      // 'mqtt' subprotocol is required by spec for MQTT over WebSocket
      const ws = new WebSocket(this.opts.url, ['mqtt']);
      this.ws = ws;
      ws.binaryType = 'arraybuffer';

      const fail = (err: unknown) => {
        this.opts.onStatus?.('error');
        this.cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const timeout = setTimeout(() => fail(new Error('MQTT connect timeout')), 15000);

      ws.onopen = () => {
        ws.send(connectPacket(this.opts.clientId, keepalive).buffer as ArrayBuffer);
      };
      ws.onmessage = (ev) => {
        const bytes = new Uint8Array(ev.data as ArrayBuffer);
        // CONNACK: 0x20 0x02 <ack flags> <return code 0 = accepted>
        if (bytes[0] === 0x20) {
          clearTimeout(timeout);
          if (bytes[3] === 0) {
            this.connected = true;
            this.opts.onStatus?.('connected');
            this.pingTimer = setInterval(() => {
              if (ws.readyState === 1) ws.send(PINGREQ.buffer as ArrayBuffer);
            }, Math.max((keepalive - 15) * 1000, 15000));
            resolve();
          } else {
            fail(new Error(`MQTT connection refused (code ${bytes[3]})`));
          }
        }
        // PINGRESP (0xd0) and anything else: ignore — we never subscribe
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        fail(new Error('MQTT websocket error'));
      };
      ws.onclose = () => {
        clearTimeout(timeout);
        this.connected = false;
        this.opts.onStatus?.('closed');
        this.cleanup();
      };
    });
  }

  publish(topic: string, payload: string, retain = true): boolean {
    if (!this.ws || this.ws.readyState !== 1 || !this.connected) return false;
    this.ws.send(publishPacket(topic, payload, retain).buffer as ArrayBuffer);
    return true;
  }

  close(): void {
    if (this.ws && this.ws.readyState === 1) {
      try {
        this.ws.send(DISCONNECT.buffer as ArrayBuffer);
      } catch {
        // closing anyway
      }
      this.ws.close();
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.connected = false;
    this.ws = null;
  }
}
