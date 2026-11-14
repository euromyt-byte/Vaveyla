import { test } from "node:test";
import assert from "node:assert/strict";
import { coreFixture } from "./core.test.js";
import { Session } from "../src/session.js";
import { encode, decode } from "../src/pb.js";
import { pt } from "../src/catalog.js";
function request(s, g, a, code, body) {
  const session = new Session({ store: s, game: g });
  const rows = session.gamePacket(
    s.role(a.id),
    { code, payload: encode("army.ArmyPawnInfoMsg", body) },
    (m, ...args) => g.tx(a.id, (r) => g[m](r, ...args)),
  );
  for (const [, n, b] of rows) decode(n, encode(n, b));
  return rows;
}
test("native pawn recruit and deploy accept protobuf default empty arrays and debit owned reserves once", async (t) => {
  const { s, g, a, r } = await coreFixture(t);
  g.snapshot(a.id);
  s.run("update characters set level=5,gold=10000 where id=?", r.id);
  const p = Object.values(pt()).find(
    (p) => p.Level === 1 && g.pawnUnlocked(s.role(a.id), p),
  );
  assert.ok(p);
  const decoded = decode(
    "army.ArmyPawnInfoMsg",
    encode("army.ArmyPawnInfoMsg", { tempateId: p.TemplateId, ownPawns: 10 }),
  );
  assert.deepEqual(decoded.pawnLive, []);
  request(s, g, a, 5155, { tempateId: p.TemplateId, ownPawns: 10 });
  let v = g.snapshot(a.id);
  assert.equal(v.player.gold, 10000 - p.GoldConsume * 10);
  assert.equal(v.army.units.find((x) => x.son_type === p.SonType).reserve, 10);
  request(s, g, a, 5156, { sites: 0, tempateId: p.TemplateId, ownPawns: 5 });
  v = g.snapshot(a.id);
  assert.equal(v.army.slots[0].count, 5);
  assert.equal(v.army.units.find((x) => x.son_type === p.SonType).reserve, 5);
});
test("pawn wire rejects nondefault extra fields, forged ownership and overdeployment atomically", async (t) => {
  const { s, g, a, r } = await coreFixture(t);
  g.snapshot(a.id);
  s.run("update characters set gold=10000 where id=?", r.id);
  const p = Object.values(pt()).find(
    (p) => p.Level === 1 && g.pawnUnlocked(s.role(a.id), p),
  );
  for (const extra of [
    { pawnLive: [{}] },
    { fightPos: 1 },
    { armyId: a.id + 99 },
  ])
    assert.throws(
      () =>
        request(s, g, a, 5155, {
          tempateId: p.TemplateId,
          ownPawns: 10,
          ...extra,
        }),
      (e) => e.code === "invalid_pawn_request",
    );
  assert.equal(s.role(a.id).gold, 10000);
  assert.equal(s.get("select count(*) n from game_pawns").n, 0);
  request(s, g, a, 5155, { tempateId: p.TemplateId, ownPawns: 10 });
  const before = g.snapshot(a.id);
  assert.throws(
    () =>
      request(s, g, a, 5156, {
        sites: 0,
        tempateId: p.TemplateId,
        ownPawns: 11,
      }),
    (e) => e.code === "pawn_not_owned",
  );
  assert.deepEqual(g.snapshot(a.id).army, before.army);
});
