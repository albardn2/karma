// Minimal MQTT 3.1.1 client over WebSocket — connect / subscribe / publish
// (QoS 0) / close. Hand-rolled to avoid mqtt.js's Node polyfill requirements
// under Vite. Works with the browser WebSocket and Node >= 22 for tests.

const PROTOCOL_LEVEL = 4;

const toUtf8 = (s: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.codePointAt(i) as number;
    if (cp > 0xffff) i++;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return out;
};

const fromUtf8 = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

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

export interface MqttMessage {
  topic: string;
  payload: string;
}

export interface MqttClientOptions {
  url: string;
  clientId: string;
  keepaliveSec?: number;
  onMessage?: (msg: MqttMessage) => void;
  onStatus?: (status: 'connecting' | 'connected' | 'closed' | 'error') => void;
}

export class MqttClient {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private packetId = 1;
  // MQTT control packets can split/merge across WS frames; buffer accordingly
  private recvBuffer = new Uint8Array(0);
  private readonly opts: MqttClientOptions;

  constructor(opts: MqttClientOptions) {
    this.opts = opts;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const keepalive = this.opts.keepaliveSec ?? 60;
      this.opts.onStatus?.('connecting');
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
        const body = [
          ...utf8Field('MQTT'),
          PROTOCOL_LEVEL,
          0x02, // clean session
          keepalive >> 8,
          keepalive & 0xff,
          ...utf8Field(this.opts.clientId),
        ];
        ws.send(packet(0x10, body).buffer as ArrayBuffer);
      };
      ws.onmessage = (ev) => {
        this.append(new Uint8Array(ev.data as ArrayBuffer));
        for (const [type, body] of this.drainPackets()) {
          if (type === 0x20) {
            // CONNACK
            clearTimeout(timeout);
            if (body[1] === 0) {
              this.connected = true;
              this.opts.onStatus?.('connected');
              this.pingTimer = setInterval(() => {
                if (ws.readyState === 1) ws.send(new Uint8Array([0xc0, 0x00]).buffer as ArrayBuffer);
              }, Math.max((keepalive - 15) * 1000, 15000));
              resolve();
            } else {
              fail(new Error(`MQTT connection refused (code ${body[1]})`));
            }
          } else if (type === 0x30) {
            // PUBLISH (QoS 0 — we never subscribe above QoS 0)
            const topicLen = (body[0] << 8) | body[1];
            const topic = fromUtf8(body.slice(2, 2 + topicLen));
            const payload = fromUtf8(body.slice(2 + topicLen));
            this.opts.onMessage?.({ topic, payload });
          }
          // SUBACK/PINGRESP: nothing to do
        }
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

  subscribe(topicFilter: string): boolean {
    if (!this.ws || this.ws.readyState !== 1 || !this.connected) return false;
    const id = this.packetId++ & 0xffff || 1;
    const body = [id >> 8, id & 0xff, ...utf8Field(topicFilter), 0x00 /* QoS 0 */];
    this.ws.send(packet(0x82, body).buffer as ArrayBuffer);
    return true;
  }

  publish(topic: string, payload: string, retain = false): boolean {
    if (!this.ws || this.ws.readyState !== 1 || !this.connected) return false;
    const body = [...utf8Field(topic), ...toUtf8(payload)];
    this.ws.send(packet(0x30 | (retain ? 0x01 : 0x00), body).buffer as ArrayBuffer);
    return true;
  }

  close(): void {
    if (this.ws && this.ws.readyState === 1) {
      try {
        this.ws.send(new Uint8Array([0xe0, 0x00]).buffer as ArrayBuffer);
      } catch {
        // closing anyway
      }
      this.ws.close();
    }
    this.cleanup();
  }

  private append(chunk: Uint8Array): void {
    const merged = new Uint8Array(this.recvBuffer.length + chunk.length);
    merged.set(this.recvBuffer);
    merged.set(chunk, this.recvBuffer.length);
    this.recvBuffer = merged;
  }

  /** Yield complete [packetType, body] pairs from the receive buffer. */
  private drainPackets(): Array<[number, Uint8Array]> {
    const packets: Array<[number, Uint8Array]> = [];
    let buf = this.recvBuffer;
    while (buf.length >= 2) {
      // decode remaining-length varint
      let len = 0;
      let mult = 1;
      let i = 1;
      let ok = false;
      while (i < Math.min(buf.length, 5)) {
        const byte = buf[i];
        len += (byte & 0x7f) * mult;
        mult *= 128;
        i++;
        if ((byte & 0x80) === 0) {
          ok = true;
          break;
        }
      }
      if (!ok || buf.length < i + len) break; // incomplete packet — wait for more
      packets.push([buf[0] & 0xf0, buf.slice(i, i + len)]);
      buf = buf.slice(i + len);
    }
    this.recvBuffer = buf;
    return packets;
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
