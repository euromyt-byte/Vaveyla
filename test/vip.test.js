import { unpack } from "../src/wire.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { coreFixture } from "./core.test.js";
import { Store } from "../src/store.js";
import { Game } from "../src/game.js";
import { encode, decode } from "../src/pb.js";
import { Session } from "../src/session.js";
import { fixture, http, enter } from "./network.test.js";
test("source package VIPEx, cumulative level thresholds and duplicate purchase IDs remain exact", async (t) => {
  const { s, g, a } = await coreFixture(t);
  g.snapshot(a.id);
  const args = { product_id: "wartuneh5.gem.pay0.99", count: 1 };
  const one = g.action(a.id, "recharge.free", args, "vip-pack");
  assert.equal(one.result.vip_xp, 100);
  assert.deepEqual(
    g.tx(a.id, (r) => g.vipStatus(r)),
    { xp: 100, level: 1, next_threshold: 120 },
  );
  g.action(a.id, "recharge.free", args, "vip-pack");
  assert.equal(g.tx(a.id, (r) => g.vipStatus(r)).xp, 100);
  g.action(a.id, "recharge.free", args, "vip-pack2");
  assert.equal(g.tx(a.id, (r) => g.vipStatus(r)).level, 2);
  g.tx(a.id, (r) =>
    g.reward(r, "virtual-vip", { items: [{ template_id: -5500, count: 160 }] }),
  );
  assert.equal(g.tx(a.id, (r) => g.vipStatus(r)).level, 3);
  assert.equal(g.tx(a.id, (r) => g.vipStatus(r)).xp, 360);
  g.tx(a.id, (r) =>
    g.reward(r, "virtual-vip", { items: [{ template_id: -5500, count: 160 }] }),
  );
  assert.equal(g.tx(a.id, (r) => g.vipStatus(r)).xp, 360);
});
test("legacy free purchases backfill VIP once and survive SQLite restart without altering diamonds", async (t) => {
  const { s, g, a, r } = await coreFixture(t);
  g.snapshot(a.id);
  s.run(
    "insert into game_actions values(?,?,?,?,?)",
    r.id,
    "legacy-purchase",
    "recharge.free",
    "fixture",
    JSON.stringify({
      result: { product_id: "wartuneh5.gem.pay4.99", count: 2 },
    }),
  );
  s.run("delete from game_vip where character_id=?", r.id);
  assert.equal(g.tx(a.id, (r) => g.vipStatus(r)).xp, 1000);
  assert.equal(g.tx(a.id, (r) => g.vipStatus(r)).xp, 1000);
  assert.equal(s.role(a.id).diamonds, 0);
  const copy = s.path + ".reopen";
  await s.makeBackup(copy);
  const reopened = await new Store(copy).initialize();
  try {
    const ng = new Game(reopened);
    assert.equal(ng.tx(a.id, (r) => ng.vipStatus(r)).xp, 1000);
    assert.equal(reopened.role(a.id).diamonds, 0);
  } finally {
    reopened.close();
  }
});
test("source VIP daily/free/paid gifts check grade, charge exact price and never duplicate rewards", async (t) => {
  const { s, g, a, r } = await coreFixture(t);
  g.snapshot(a.id);
  assert.throws(
    () => g.tx(a.id, (r) => g.claimVipGift(r, -1, 1)),
    (e) => e.code === "vip_level_required",
  );
  g.action(
    a.id,
    "recharge.free",
    { product_id: "wartuneh5.gem.pay0.99", count: 2 },
    "vip-funded",
  );
  g.tx(a.id, (r) => g.claimVipGift(r, -1, 1));
  const gold = s.role(a.id).gold;
  g.tx(a.id, (r) => g.claimVipGift(r, -1, 1));
  assert.equal(s.role(a.id).gold, gold);
  g.tx(a.id, (r) => g.claimVipGift(r, 0, 1));
  const inventory = g.snapshot(a.id).inventory,
    bound = g.snapshot(a.id).resources.bound_diamonds;
  g.tx(a.id, (r) => g.claimVipGift(r, 0, 1));
  assert.deepEqual(g.snapshot(a.id).inventory, inventory);
  assert.equal(g.snapshot(a.id).resources.bound_diamonds, bound);
  const diamonds = s.role(a.id).diamonds;
  g.tx(a.id, (r) => g.claimVipGift(r, 1, 1));
  assert.equal(s.role(a.id).diamonds, diamonds - 135);
  g.tx(a.id, (r) => g.claimVipGift(r, 1, 1));
  assert.equal(s.role(a.id).diamonds, diamonds - 135);
  assert.throws(
    () => g.tx(a.id, (r) => g.claimVipGift(r, 1, 2)),
    (e) => e.code === "insufficient_funds",
  );
  assert.equal(s.role(a.id).diamonds, diamonds - 135);
  const packet = g.tx(a.id, (r) => g.vipPacket(r));
  assert.equal(decode(packet[1], encode(packet[1], packet[2])).vipGrade, 2);
  assert.equal(packet[2].giftState[0].isFreeGift, false);
});
test("VIP daily gift uses UTC rollover and source cooldown reductions affect construction and research", async (t) => {
  const { s, g, a, r } = await coreFixture(t);
  g.snapshot(a.id);
  let now = s.clock();
  const vg = new Game(s);
  vg.now = () => now;
  vg.tx(a.id, (r) =>
    vg.reward(r, "vip", { items: [{ template_id: -5500, count: 100 }] }),
  );
  assert.equal(
    vg.tx(a.id, (r) => vg.vipPrivilegeValue(r, 29)),
    300,
  );
  assert.equal(
    vg.tx(a.id, (r) => vg.vipPrivilegeValue(r, 30)),
    60,
  );
  vg.tx(a.id, (r) => vg.claimVipGift(r, -1, 1));
  const gold = s.role(a.id).gold;
  now += 86400;
  vg.tx(a.id, (r) => vg.claimVipGift(r, -1, 1));
  assert.ok(s.role(a.id).gold >= gold + 10000);
  s.run("update characters set level=80,gold=1000000 where id=?", r.id);
  s.run(
    "update game_buildings set template_id=90120 where character_id=? and son_type=901",
    r.id,
  );
  vg.tx(a.id, (r) => vg.upgradeBuilding(r, 901));
  assert.equal(
    vg.snapshot(a.id).buildings.find((b) => b.son_type === 901).grade,
    21,
  );
  s.run(
    "insert into game_buildings(character_id,son_type,template_id) values(?,501,50180)",
    r.id,
  );
  s.run(
    "insert into game_buildings(character_id,son_type,template_id) values(?,1304,130420)",
    r.id,
  );
  vg.tx(a.id, (r) => vg.upgradeBuilding(r, 1304));
  assert.equal(
    vg.snapshot(a.id).buildings.find((b) => b.son_type === 1304).finishes_at -
      now,
    240,
  );
});
test("native VIP balance updates after free package and native gift command returns original response", async (t) => {
  const app = await fixture(t),
    a = app.store.register("vip_wire", "vip-wire-password");
  app.store.createRole(a.id, "VipWire", 1, 1);
  const login = app.store.login(a.username, "vip-wire-password"),
    key = "d".repeat(32);
  app.store.issueTicket(a.id, key, login.token, "local");
  const c = await enter(app, a, key);
  t.after(() => c.ws.terminate());
  assert.equal(c.vip.vipGrade, 0);
  const result = await http(
    app,
    "POST",
    "/api/game/recharge.free",
    {
      request_id: "vip-wire",
      data: { product_id: "wartuneh5.gem.pay0.99", count: 1 },
    },
    login.token,
  );
  assert.equal(result.status, 200);
  c.send(5016);
  await c.receive(3);
  let vip;
  for (let i = 0; i < 30; i++) {
    const p = unpack(c.in.decrypt(await c.raw()));
    if (p.code === 4410) {
      vip = decode("vip.VipInfoMsg", p.payload);
      break;
    }
  }
  assert.ok(vip);
  assert.equal(vip.vipGp, 100);
  assert.equal(vip.vipGrade, 1);
  c.send(8504, "vip.OpenGiftReq", { type: -1, grade: 1 });
  const gift = decode("vip.OpenGiftRsp", (await c.receive(4409)).payload);
  assert.equal(gift.ret, 1);
  assert.equal(app.store.role(a.id).gold, 10000);
});

test("VIP EXP mail rewards are owned, durable and claimed once", async (t) => {
  const { s, g, a, r } = await coreFixture(t);
  g.snapshot(a.id);
  const id = g.tx(a.id, (r) =>
    g.systemMail(r, "vip-exp-mail", "VIP EXP", "VIP ödülü", {
      items: [{ template_id: -5500, count: 250 }],
    }),
  );
  g.tx(a.id, (r) => g.claimMail(r, id));
  assert.equal(g.tx(a.id, (r) => g.vipStatus(r)).xp, 250);
  g.tx(a.id, (r) => g.claimMail(r, id));
  assert.equal(g.tx(a.id, (r) => g.vipStatus(r)).xp, 250);
});
test("VIP EXP overflow rolls back accompanying diamonds and ledger writes", async (t) => {
  const { s, g, a } = await coreFixture(t);
  g.snapshot(a.id);
  g.tx(a.id, (r) =>
    g.reward(r, "vip-max", { resources: { vip_xp: 2147483647 } }),
  );
  const before = s.role(a.id).diamonds,
    events = s.get("select count(*) n from game_reward_events").n;
  assert.throws(
    () =>
      g.tx(a.id, (r) =>
        g.reward(r, "vip-overflow", { diamonds: 25, resources: { vip_xp: 1 } }),
      ),
    (e) => e.code === "vip_xp_limit",
  );
  assert.equal(s.role(a.id).diamonds, before);
  assert.equal(s.get("select count(*) n from game_reward_events").n, events);
});

import vm from "node:vm";
import fs from "node:fs";
import { jsonFile } from "../src/util.js";
test("original VIP handler defers early packet until hero exists and then updates source model", () => {
  const patch = jsonFile("client-patches.json").patches.find(([s]) =>
    s.startsWith("_vipInfoHandler"),
  );
  const original = fs.readFileSync(
    new URL("./fixtures/vip-info-handler.js", import.meta.url),
    "utf8",
  );
  const pending = [],
    ctx = {
      Md: {},
      bd: class {
        VipType = 0;
        get IsVipAndNoExpirt() {
          return this.VipGrade > 0;
        }
      },
      xd: class {},
      n0: { Instance: { thane: null } },
      Ii: { VIP_PRIVILEGE_UPDATE: 1 },
      Laya: { timer: { once: (ms, self, cb) => pending.push(cb) } },
    };
  vm.createContext(ctx);
  const handler = vm.runInContext(original.replace(patch[0], patch[1]), ctx);
  handler._isFirst = false;
  handler.model = {};
  handler.dispatchEvent = () => {};
  handler._vipInfoHandler({
    readBody: () => ({
      vipGp: 100,
      vipGrade: 1,
      giftState: [],
      buffEndTime: 0,
      buffGainTime: 0,
      isGainBuff: false,
    }),
  });
  assert.equal(pending.length, 1);
  assert.equal(handler.model.vipInfo, undefined);
  ctx.n0.Instance.thane = {};
  pending.shift()();
  assert.equal(handler.model.vipInfo.VipGp, 100);
  assert.equal(handler.model.vipInfo.VipGrade, 1);
  assert.equal(ctx.n0.Instance.thane.IsVipAndNoExpirt, true);
});
