import { GameError, integer, need } from "./util.js";
export const INITIAL_KEY = Buffer.from([174, 191, 86, 120, 171, 205, 239, 241]),
  MAGIC = 0x71ab,
  HEADER = 20;
export const RESET = new Set([28678, 28672, 28674, 28676, 28680, 20001]);
export function checksum(b) {
  let sum = 119;
  for (let i = 6; i < b.length; i++) sum += b[i];
  return sum & 0x7f7f;
}
export function packet(
  code,
  payload = Buffer.alloc(0),
  clientId = 0,
  extend1 = 0,
  extend2 = 0,
) {
  integer(code, 0, 65535);
  for (const n of [clientId, extend1, extend2])
    integer(n, -2147483648, 2147483647);
  need(
    Buffer.isBuffer(payload) && payload.length + HEADER <= 65535,
    "packet_too_large",
  );
  const b = Buffer.alloc(HEADER + payload.length);
  b.writeUInt16BE(MAGIC, 0);
  b.writeUInt16BE(b.length, 2);
  b.writeUInt16BE(code, 6);
  b.writeInt32BE(clientId, 8);
  b.writeInt32BE(extend1, 12);
  b.writeInt32BE(extend2, 16);
  payload.copy(b, 20);
  b.writeUInt16BE(checksum(b), 4);
  return b;
}
export function unpack(b) {
  need(b.length >= 20, "short_packet");
  need(b.readUInt16BE(0) === MAGIC, "invalid_magic");
  need(b.readUInt16BE(2) === b.length, "invalid_length");
  need(b.readUInt16BE(4) === checksum(b), "invalid_checksum");
  return {
    code: b.readUInt16BE(6),
    clientId: b.readInt32BE(8),
    extend1: b.readInt32BE(12),
    extend2: b.readInt32BE(16),
    payload: b.subarray(20),
  };
}
export class Cipher {
  constructor(key = INITIAL_KEY) {
    this.setKey(key);
  }
  setKey(key) {
    need(key.length === 8, "invalid_key");
    this.key = Buffer.from(key);
  }
  transform(b, decrypt) {
    const out = Buffer.alloc(b.length);
    for (let i = 0; i < b.length; i++) {
      const slot = i % 8;
      if (!i) out[i] = b[i] ^ this.key[0];
      else {
        const prev = decrypt ? b[i - 1] : out[i - 1];
        this.key[slot] = ((this.key[slot] + prev) ^ i) & 255;
        out[i] = decrypt
          ? ((b[i] - prev) ^ this.key[slot]) & 255
          : ((b[i] ^ this.key[slot]) + prev) & 255;
      }
    }
    return out;
  }
  encrypt(b) {
    return this.transform(b, false);
  }
  decrypt(b) {
    return this.transform(b, true);
  }
}
export class LoginReader {
  constructor() {
    this.key = Buffer.from(INITIAL_KEY);
    this.buffer = Buffer.alloc(0);
  }
  append(raw) {
    need(Buffer.isBuffer(raw), "binary_required");
    need(this.buffer.length + raw.length <= 1048576, "buffer_limit");
    this.buffer = Buffer.concat([this.buffer, raw]);
  }
  next() {
    if (this.buffer.length < 4) return null;
    let partial = false;
    for (const key of [this.key, INITIAL_KEY]) {
      const peek = new Cipher(key).decrypt(this.buffer.subarray(0, 4));
      if (peek.readUInt16BE(0) !== MAGIC) continue;
      const n = peek.readUInt16BE(2);
      if (n < 20) continue;
      if (this.buffer.length < n) {
        partial = true;
        continue;
      }
      try {
        const cipher = new Cipher(key),
          p = unpack(cipher.decrypt(this.buffer.subarray(0, n)));
        if (
          RESET.has(p.code) ? !key.equals(INITIAL_KEY) : !key.equals(this.key)
        )
          continue;
        this.buffer = this.buffer.subarray(n);
        this.key = cipher.key;
        return p;
      } catch {}
    }
    if (partial) return null;
    throw new GameError("invalid_checksum", "Geçersiz istemci paketi.");
  }
}
