import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { encode, decode } from "../src/pb.js";
import { Cipher, unpack, packet } from "../src/wire.js";
function revive(x) {
  if (x && typeof x === "object" && "__long" in x) return BigInt(x.__long);
  if (x && typeof x === "object" && "__bytes" in x)
    return Buffer.from(x.__bytes, "hex");
  if (Array.isArray(x)) return x.map(revive);
  if (x && typeof x === "object")
    return Object.fromEntries(
      Object.entries(x).map(([k, v]) => [k, revive(v)]),
    );
  return x;
}
function normalize(x) {
  if (typeof x === "bigint") return { $int: String(x) };
  if (Buffer.isBuffer(x)) return { $bytes: x.toString("hex") };
  if (Array.isArray(x)) return x.map(normalize);
  if (x && typeof x === "object")
    return Object.fromEntries(
      Object.entries(x).map(([k, v]) => [k, normalize(v)]),
    );
  return x;
}
test("every extracted schema matches Python/original-client wire bytes and field defaults", () => {
  const cases = JSON.parse(
    fs.readFileSync(
      new URL("./fixtures/protobuf-vectors.json", import.meta.url),
    ),
  );
  for (const c of cases) {
    const actual = encode(c.name, revive(c.value));
    assert.equal(actual.toString("hex"), c.hex, c.name);
    assert.deepEqual(
      normalize(decode(c.name, actual)),
      normalize(revive(c.decoded)),
      c.name,
    );
  }
});
test("rolling keys and packet headers match the established original-client vectors", () => {
  const c = new Cipher(),
    d = new Cipher();
  for (const v of JSON.parse(
    fs.readFileSync(new URL("./fixtures/wire-vectors.json", import.meta.url)),
  )) {
    assert.equal(
      c.encrypt(Buffer.from(v.plain, "hex")).toString("hex"),
      v.cipher,
    );
    assert.equal(c.key.toString("hex"), v.key);
    assert.equal(
      d.decrypt(Buffer.from(v.cipher, "hex")).toString("hex"),
      v.plain,
    );
    assert.equal(
      packet(
        unpack(Buffer.from(v.plain, "hex")).code,
        unpack(Buffer.from(v.plain, "hex")).payload,
        unpack(Buffer.from(v.plain, "hex")).clientId,
      ).toString("hex"),
      v.plain,
    );
  }
});
test("malformed and unauthorized field types are rejected", () => {
  assert.throws(() => decode("player.LoginReqMsg", Buffer.from([10, 20, 1])));
  assert.throws(() => encode("player.LoginReqMsg", { playerId: true }));
  assert.throws(() => encode("player.LoginReqMsg", { inventedTag: 1 }));
  assert.throws(() => encode("login.playerLoginRsp", { message: "\ud800" }));
});
test("all selected native schemas match the original generated client encoder", () => {
  const vectors = JSON.parse(
    fs.readFileSync(
      new URL("./fixtures/expanded-client-vectors.json", import.meta.url),
    ),
  );
  assert.equal(vectors.length, 249);
  for (const c of vectors)
    assert.equal(
      encode(c.name, revive(c.value)).toString("hex"),
      c.hex,
      c.name,
    );
});
