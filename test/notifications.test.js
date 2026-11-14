import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { Store } from "../src/store.js";
import { Game } from "../src/game.js";
import { Session } from "../src/session.js";
import { systemMessage } from "../src/packets.js";
import { encode, decode } from "../src/pb.js";
import { unpack } from "../src/wire.js";
import { systemErrorText, unavailableFeatureText } from "../src/system-text.js";
async function fixture(t) {
  const dir = fs.mkdtempSync(os.tmpdir() + "/vaveyla-node-notices-"),
    s = await new Store(dir + "/db.sqlite3", {
      clock: () => 1794375635,
    }).initialize();
  t.after(() => {
    s.close();
    fs.rmSync(dir, { recursive: true });
  });
  const a = s.register("notice_owner", "notice-password-123");
  s.createRole(a.id, "NoticeHero", 1, 1);
  const g = new Game(s);
  g.snapshot(a.id);
  return { s, g, a, r: s.role(a.id) };
}
test("reward and level messages are durable, transactional and not repeated by reward replay", async (t) => {
  const { s, g, a } = await fixture(t);
  const reward = {
    xp: 3000,
    gold: 120,
    items: [{ template_id: 2125149, count: 1 }],
  };
  g.tx(a.id, (r) => g.reward(r, "notice-fixture", reward));
  const v = g.snapshot(a.id),
    notes = g.notices(s.role(a.id));
  assert.equal(v.player.level, 2);
  assert.equal(v.player.gold, 120);
  assert.equal(v.inventory[0].template_id, 2125149);
  assert.equal(notes.length, 2);
  assert.deepEqual(
    notes.map((n) => n.kind),
    ["level", "reward"],
  );
  assert.match(notes[1].message, /3000 XP/);
  g.tx(a.id, (r) => g.reward(r, "notice-fixture", reward));
  assert.equal(g.notices(s.role(a.id)).length, 2);
  assert.equal(g.snapshot(a.id).inventory[0].count, 1);
  assert.throws(() =>
    g.tx(a.id, (r) => {
      g.reward(r, "rolled-back", { gold: 99 });
      throw Error("rollback");
    }),
  );
  assert.equal(g.snapshot(a.id).player.gold, 120);
  assert.equal(g.notices(s.role(a.id)).length, 2);
  assert.equal(g.notices(s.role(a.id), notes[0].id, 1)[0].id, notes[1].id);
  assert.throws(() => g.notices(s.role(a.id), -1));
});
test("system channel2 is encoded, safe text is preserved and a connection emits each new notice once", async (t) => {
  const { s, g, a, r } = await fixture(t);
  const session = new Session({ store: s, game: g });
  Object.assign(session, {
    state: "gateway_active",
    account: a,
    noticeCursor: 0,
  });
  const [code, name, body] = systemMessage("<danger>& XP");
  const decoded = decode(name, encode(name, body));
  assert.equal(code, 83);
  assert.equal(decoded.channel, 2);
  assert.ok(decoded.isCenterTip);
  assert.equal(decoded.encodeMsg, "&lt;danger&gt;&amp; XP");
  g.tx(a.id, (r) => g.reward(r, "stream", { gold: 15 }));
  const rows = session.sendable([]).map(unpack);
  assert.ok(rows.some((r) => r.code === 3));
  assert.ok(rows.some((r) => r.code === 115));
  assert.equal(rows.filter((r) => r.code === 83).length, 1);
  assert.deepEqual(session.sendable([]), []);
  const other = s.register("notice_other", "notice-password-123");
  s.createRole(other.id, "Other Notice", 1, 1);
  g.snapshot(other.id);
  assert.deepEqual(g.notices(s.role(other.id)), []);
});
test("claiming a source quest sends the actual reward item packet and repeat claims grant nothing", async (t) => {
  const { s, g, a } = await fixture(t);
  s.run("update characters set level=60 where account_id=?", a.id);
  g.tx(a.id, (r) => g.acceptQuest(r, 958));
  const session = new Session({ store: s, game: g }),
    req = {
      code: 5014,
      payload: encode("quest.QuestFinishedReqMsg", {
        templateId: 958,
        rewardItemId: 0,
        isPass: false,
      }),
    },
    mutate = (method, ...args) => g.tx(a.id, (r) => g[method](r, ...args));
  const before = g.snapshot(a.id).inventory.length;
  const rows = session.gamePacket(s.role(a.id), req, mutate);
  const items = rows.find((r) => r[0] === 115);
  assert.ok(items);
  assert.ok(
    decode(items[1], encode(items[1], items[2])).moved.some(
      (m) => m.item?.templateId === 2125149 && m.item.count === 1,
    ),
  );
  assert.equal(g.snapshot(a.id).inventory.length, before + 1);
  const notes = g.notices(s.role(a.id)).length;
  session.gamePacket(s.role(a.id), req, mutate);
  assert.equal(g.notices(s.role(a.id)).length, notes);
  assert.equal(g.snapshot(a.id).inventory[0].count, 1);
});
test("live reward refresh preserves encounter map, damage and both tutorial skill keys", async (t) => {
  const { s, g, a } = await fixture(t);
  const session = new Session({ store: s, game: g });
  Object.assign(session, {
    state: "gateway_active",
    account: a,
    noticeCursor: 0,
    encounter: {
      entered: true,
      campaign: false,
      stage: "running",
      document: { map_id: 10002, position: [120, 240], completed: false },
      active: { player_hp: 177, player_max_hp: 300 },
    },
  });
  g.tx(a.id, (r) => g.reward(r, "live-map", { xp: 25, gold: 1 }));
  const army = decode(
    "army.ArmyMsg",
    session
      .sendable([])
      .map(unpack)
      .find((r) => r.code === 150).payload,
  );
  assert.equal(army.mapId, 10002);
  assert.equal(army.curPosX, 6);
  assert.equal(army.simpleHeroInfo.hp, 177);
  assert.equal(army.simpleHeroInfo.fastKey, "107,108,-1,-1,-1");
  assert.equal(army.simpleHeroInfo.skillScript, "10711,10811");
});

test("live XP/item rewards use native chat83 and tips while replay stays quiet and cannot re-grant",async t=>{
  const {s,g,a}=await fixture(t);
  const session=new Session({store:s,game:g});
  Object.assign(session,{state:"gateway_active",account:a,noticeCursor:0});
  g.tx(a.id,r=>g.reward(r,"visible-reward",{xp:25,gold:10,items:[{template_id:2125149,count:2}]}));
  const live=session.sendable([]).map(unpack).filter(p=>p.code===83).map(p=>decode("chat.ChatChannelMsg",p.payload));
  assert.ok(live.some(p=>/25 XP/.test(p.encodeMsg)&&p.isCenterTip));
  assert.ok(live.some(p=>/×2/.test(p.encodeMsg)));
  assert.ok(live.every(p=>p.channel===2));
  const inventory=g.snapshot(a.id).inventory,player=g.snapshot(a.id).player;
  session.noticeReplayThrough=session.noticeCursor;
  session.noticeCursor=0;
  const replay=session.sendable([]).map(unpack).filter(p=>p.code===83).map(p=>decode("chat.ChatChannelMsg",p.payload));
  assert.equal(replay.length,live.length);
  assert.ok(replay.every(p=>!p.isCenterTip&&!p.isBigTip));
  assert.deepEqual(g.snapshot(a.id).inventory,inventory);
  assert.deepEqual(g.snapshot(a.id).player,player);
  assert.deepEqual(session.sendable([]),[]);
  assert.match(systemErrorText({code:"insufficient_stamina",message:"insufficient_stamina"}),/dayanıklılığın/);
  assert.equal(systemErrorText({code:"campaign_level",message:"Bu bölüm için 7. seviye gerekiyor."}),"Bu bölüm için 7. seviye gerekiyor.");
  assert.match(unavailableFeatureText(5122),/ödül kartı/);
});
