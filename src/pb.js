import { jsonFile, need, GameError } from "./util.js";
export const schemas = jsonFile("wartune_schemas.json").messages;
const wires = {
  int32: 0,
  uint32: 0,
  sint32: 0,
  int64: 0,
  uint64: 0,
  sint64: 0,
  bool: 0,
  fixed64: 1,
  sfixed64: 1,
  double: 1,
  string: 2,
  bytes: 2,
  fixed32: 5,
  sfixed32: 5,
  float: 5,
};
const nameOf = (n) => {
  n = n.replace(/^com\.road\.yishi\.proto\./, "");
  need(schemas[n], "unknown_message");
  return n;
};
function vint(x) {
  x = BigInt(x);
  need(x >= 0n && x <= 0xffffffffffffffffn, "invalid_value");
  const out = [];
  while (x > 127n) {
    out.push(Number(x & 127n) | 128);
    x >>= 7n;
  }
  out.push(Number(x));
  return Buffer.from(out);
}
function readVar(b, s) {
  let n = 0n;
  for (let i = 0; i < 10; i++) {
    need(s.p < s.end, "malformed_protobuf");
    const x = b[s.p++];
    need(i !== 9 || x <= 1, "malformed_protobuf");
    n |= BigInt(x & 127) << BigInt(7 * i);
    if (!(x & 128)) return n;
  }
  throw new GameError("malformed_protobuf");
}
function take(b, s, n) {
  n = Number(n);
  need(
    Number.isSafeInteger(n) && n >= 0 && n <= s.end - s.p,
    "malformed_protobuf",
  );
  const out = b.subarray(s.p, s.p + n);
  s.p += n;
  return out;
}
function num(x, bits, signed) {
  need(
    (typeof x === "bigint" || Number.isSafeInteger(x)) &&
      typeof x !== "boolean",
    "invalid_value",
  );
  x = BigInt(x);
  const lo = signed ? -(1n << BigInt(bits - 1)) : 0n,
    hi = (1n << BigInt(bits - (signed ? 1 : 0))) - 1n;
  need(x >= lo && x <= hi, "invalid_value");
  return x;
}
function scalar(t, x, depth) {
  if (!(t in wires)) {
    const b = encode(t, x, depth + 1);
    return Buffer.concat([vint(b.length), b]);
  }
  if (t === "string" || t === "bytes") {
    need(
      t === "string"
        ? typeof x === "string" &&
            !/[\ud800-\udfff]/u.test(
              x.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ""),
            )
        : Buffer.isBuffer(x) || x instanceof Uint8Array,
      "invalid_value",
    );
    const b = Buffer.from(x);
    need(b.length <= 1048576, "message_too_large");
    return Buffer.concat([vint(b.length), b]);
  }
  if (t === "bool") {
    need(typeof x === "boolean", "invalid_value");
    return Buffer.from([+x]);
  }
  if (wires[t] === 0) {
    const bits = +t.match(/\d+/)[0],
      signed = !t.startsWith("u");
    let n = num(x, bits, signed);
    if (t.startsWith("sint")) n = (n << 1n) ^ (n >> BigInt(bits - 1));
    else n = BigInt.asUintN(64, n);
    return vint(n);
  }
  const n = wires[t] === 1 ? 8 : 4,
    b = Buffer.alloc(n);
  if (t === "double" || t === "float") {
    need(typeof x === "number", "invalid_value");
    t === "double" ? b.writeDoubleLE(x) : b.writeFloatLE(x);
  } else {
    const signed = t.startsWith("s"),
      v = num(x, n * 8, signed);
    if (n === 8) signed ? b.writeBigInt64LE(v) : b.writeBigUInt64LE(v);
    else signed ? b.writeInt32LE(Number(v)) : b.writeUInt32LE(Number(v));
  }
  return b;
}
export function encode(name, message, depth = 0) {
  name = nameOf(name);
  need(depth <= 32, "recursion_limit");
  need(
    message && typeof message === "object" && !Array.isArray(message),
    "invalid_message",
  );
  const fields = schemas[name].fields,
    names = new Set(fields.map((f) => f.name));
  need(
    Object.keys(message).every((k) => names.has(k)),
    "invalid_field",
    `Bilinmeyen protobuf alanı (${name}).`,
  );
  const chunks = [];
  let size = 0;
  const push = (b) => {
    size += b.length;
    need(size <= 1048576, "message_too_large");
    chunks.push(b);
  };
  for (const f of fields) {
    const x = message[f.name];
    if (x == null) {
      need(!f.required, "missing_required");
      continue;
    }
    const type = f.type,
      wire = wires[type] ?? 2;
    if (f.repeated) {
      need(Array.isArray(x) && x.length <= 65536, "invalid_value");
      if (f.packed && x.length) {
        const b = Buffer.concat(x.map((v) => scalar(type, v, depth)));
        push(vint((f.id << 3) | 2));
        push(vint(b.length));
        push(b);
      } else
        for (const v of x) {
          push(vint((f.id << 3) | wire));
          push(scalar(type, v, depth));
        }
    } else {
      push(vint((f.id << 3) | wire));
      push(scalar(type, x, depth));
    }
  }
  return Buffer.concat(chunks);
}
function safe(n) {
  return n >= BigInt(Number.MIN_SAFE_INTEGER) &&
    n <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(n)
    : n;
}
function value(t, b, s, depth) {
  const w = wires[t] ?? 2;
  if (w === 0) {
    let n = readVar(b, s);
    if (t === "bool") return n !== 0n;
    if (t.startsWith("sint")) {
      const bits = +t.match(/\d+/)[0];
      need(n < 1n << BigInt(bits), "malformed_protobuf");
      n = (n >> 1n) ^ -(n & 1n);
    } else if (t === "int32") n = BigInt.asIntN(32, n);
    else if (t === "int64") n = BigInt.asIntN(64, n);
    else if (t === "uint32") need(n <= 0xffffffffn, "malformed_protobuf");
    return safe(n);
  }
  if (w === 1 || w === 5) {
    const raw = take(b, s, w === 1 ? 8 : 4);
    return t === "double"
      ? raw.readDoubleLE()
      : t === "float"
        ? raw.readFloatLE()
        : t === "fixed64"
          ? safe(raw.readBigUInt64LE())
          : t === "sfixed64"
            ? safe(raw.readBigInt64LE())
            : t === "sfixed32"
              ? raw.readInt32LE()
              : raw.readUInt32LE();
  }
  const raw = take(b, s, readVar(b, s));
  if (t === "bytes") return Buffer.from(raw);
  if (t === "string") {
    try {
      return new TextDecoder("utf8", { fatal: true }).decode(raw);
    } catch {
      throw new GameError("malformed_protobuf");
    }
  }
  return decode(t, raw, depth + 1);
}
function skip(b, s, w, id, depth) {
  need(depth <= 32, "recursion_limit");
  if (w === 0) {
    readVar(b, s);
    return;
  }
  if (w === 1 || w === 5) {
    take(b, s, w === 1 ? 8 : 4);
    return;
  }
  if (w === 2) {
    take(b, s, readVar(b, s));
    return;
  }
  if (w === 3) {
    while (s.p < s.end) {
      const t = readVar(b, s),
        wi = Number(t & 7n),
        fi = Number(t >> 3n);
      if (wi === 4) {
        need(fi === id, "malformed_protobuf");
        return;
      }
      skip(b, s, wi, fi, depth + 1);
    }
  }
  throw new GameError("malformed_protobuf");
}
export function decode(name, b, depth = 0) {
  name = nameOf(name);
  need(depth <= 32 && b.length <= 1048576, "message_too_large");
  const fields = schemas[name].fields,
    byId = new Map(fields.map((f) => [f.id, f])),
    out = {},
    seen = new Set();
  for (const f of fields)
    out[f.name] =
      f.type === "bytes" && !f.repeated
        ? Buffer.alloc(0)
        : structuredClone(f.default);
  const s = { p: 0, end: b.length };
  let count = 0;
  while (s.p < s.end) {
    const tag = readVar(b, s),
      id = Number(tag >> 3n),
      w = Number(tag & 7n);
    need(id >= 1 && id < 1 << 29, "malformed_protobuf");
    const f = byId.get(id);
    if (!f) {
      skip(b, s, w, id, depth);
      continue;
    }
    if (
      w === 2 &&
      f.repeated &&
      f.type in wires &&
      !["bytes", "string"].includes(f.type)
    ) {
      const packed = take(b, s, readVar(b, s)),
        inner = { p: 0, end: packed.length };
      while (inner.p < inner.end) {
        out[f.name].push(value(f.type, packed, inner, depth));
        need(++count <= 65536, "message_too_large");
      }
    } else {
      need(w === (wires[f.type] ?? 2), "malformed_protobuf");
      const v = value(f.type, b, s, depth);
      if (f.repeated) {
        out[f.name].push(v);
        need(++count <= 65536, "message_too_large");
      } else out[f.name] = v;
    }
    seen.add(id);
  }
  need(
    fields.every((f) => !f.required || seen.has(f.id)),
    "missing_required",
  );
  return out;
}
