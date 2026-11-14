import os from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { once } from "node:events";
import WebSocket from "ws";
import { App } from "../src/app.js";
import { Cipher, packet, unpack } from "../src/wire.js";
import { encode, decode } from "../src/pb.js";
class Client {
  constructor(ws) {
    this.ws = ws;
    this.queue = [];
    this.waiters = [];
    ws.on("message", (raw) => {
      const f = this.waiters.shift();
      if (f) f(Buffer.from(raw));
      else this.queue.push(Buffer.from(raw));
    });
  }
  async raw() {
    if (this.queue.length) return this.queue.shift();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("WS response timeout")),
        14000,
      );
      this.waiters.push((b) => {
        clearTimeout(timer);
        resolve(b);
      });
    });
  }
  async request(code, name, body, replyCode, replyName) {
    this.ws.send(new Cipher().encrypt(packet(code, encode(name, body))));
    const got = unpack(new Cipher().decrypt(await this.raw()));
    assert.equal(got.code, replyCode);
    return decode(replyName, got.payload);
  }
  send(code, name = null, body = {}) {
    this.ws.send(
      this.out.encrypt(
        packet(code, name ? encode(name, body) : Buffer.alloc(0)),
      ),
    );
  }
  async receive(expected) {
    let p = unpack(this.in.decrypt(await this.raw()));
    while (
      (p.code === 301 && expected !== 301) ||
      (p.code === 83 && expected !== 83) ||
      (p.code === 537 && expected !== 537) ||
      (p.code === 4410 && expected !== 4410)
    ) {
      if(p.code===301){this.fashion=decode("campaign.CampaignReqMsg",p.payload);p=unpack(this.in.decrypt(await this.raw()));continue;}
      if (p.code === 4410) {
        this.vip = decode("vip.VipInfoMsg", p.payload);
        p = unpack(this.in.decrypt(await this.raw()));
        continue;
      }
      if (p.code === 537) {
        this.systems = decode("systemopen.SystemOpenHashOpenList", p.payload);
        p = unpack(this.in.decrypt(await this.raw()));
        continue;
      }
      this.notices ??= [];
      this.notices.push(decode("chat.ChatChannelMsg", p.payload));
      p = unpack(this.in.decrypt(await this.raw()));
    }
    if (expected != null) assert.equal(p.code, expected);
    return p;
  }
}
async function fixture(t) {
  const dir = fs.mkdtempSync(os.tmpdir() + "/vaveyla-node-network-"),
    app = await new App({
      database: dir + "/players.sqlite3",
      httpPort: 0,
      wartunePort: 0,
      wsPort: 0,
      adminToken: "node-admin-test-key",
    }).start();
  t.after(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true });
  });
  return app;
}
async function connect(app, port = app.wartunePort) {
  const ws = new WebSocket("ws://127.0.0.1:" + port + "/ws");
  await once(ws, "open");
  return new Client(ws);
}
async function http(app, method, path, data, token) {
  const r = await fetch("http://127.0.0.1:" + app.httpPort + path, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
async function loginCharacter(app) {
  const a = (
      await http(app, "POST", "/api/register", {
        username: "wire_owner",
        password: "wire-password-123",
      })
    ).data.account,
    s = (
      await http(app, "POST", "/api/login", {
        username: "wire_owner",
        password: "wire-password-123",
      })
    ).data;
  const c = await connect(app),
    site = "local",
    pass = "correlation",
    password = "gateway-only",
    key = crypto.createHash("md5").update(password).digest("hex");
  await c.request(
    28678,
    "login.createLoginReq",
    { userName: a.username, token: s.token, site, pass },
    3846,
    "login.createLoginRsp",
  );
  const list = await c.request(
    28672,
    "login.GetPlayerListReq",
    { userName: a.username, key: pass, site },
    3843,
    "login.GetPlayerListRsp",
  );
  assert.deepEqual(list.infoList, []);
  const ready = await c.request(
    28674,
    "login.playerLoginReq",
    { userName: a.username, loginKey: pass, password, site, userId: 0 },
    3844,
    "login.playerLoginRsp",
  );
  assert.equal(ready.message, "Login Succeed No Visualize");
  const created = await c.request(
    28676,
    "login.registerRoleReq",
    {
      userId: a.id,
      userName: a.username,
      nickName: "WireHero",
      sex: 0,
      icon: 6,
      camp: 1,
      site,
      md5Password: key,
    },
    3845,
    "login.registerRoleRsp",
  );
  assert.equal(created.value, true);
  c.ws.close();
  return { a, s, key };
}
async function enter(app, a, key) {
  const c = await connect(app),
    keys = Buffer.from([1, 3, 5, 7, 9, 11, 13, 15]);
  c.ws.send(
    new Cipher().encrypt(
      packet(
        20001,
        encode("player.LoginReqMsg", { playerId: a.id, key, ekeys: [...keys] }),
      ),
    ),
  );
  c.in = new Cipher(keys);
  c.out = new Cipher(keys);
  await c.receive(3841);
  await c.receive(3);
  c.systems = decode(
    "systemopen.SystemOpenHashOpenList",
    (await c.receive(537)).payload,
  );
  c.vip = decode("vip.VipInfoMsg", (await c.receive(4410)).payload);
  return c;
}
test("real HTTP + encrypted client login/create + first tutorial primary skill and actual victory", async (t) => {
  const app = await fixture(t),
    { a, s, key } = await loginCharacter(app);
  const c = await enter(app, a, key);
  c.send(8224, "player.PlayerDataMsg", { user: true });
  assert.equal(
    decode("player.LoginStateMsg", (await c.receive(6)).payload).state,
    0,
  );
  c.send(5127, "novice.NoviceReqMsgMsg", { type: 1 });
  for (const id of [150, 125, 21, 127]) await c.receive(id);
  const row = (await import("../src/catalog.js")).training.campaigndata.find(
    (n) => n.Id === 1000103,
  );
  c.send(5124, "worldmap.PosMoveMsg", {
    mapId: 10001,
    armyId: a.id,
    routes: [{ x: row.Property1 * 20, y: row.Property2 * 20 }],
  });
  c.send(5125, "campaign.CampaignReqMsg", {
    paraInt1: 1000103,
    paraBool1: true,
  });
  await c.receive(128);
  const b = decode("battle.BattlePrepareMsg", (await c.receive(157)).payload);
  c.send(10007, "battle.LoadOverMsg", {
    battleId: b.battleId,
    armyId: a.id,
    serverName: "VAVEYLA",
  });
  await c.receive(156);
  c.send(10008, "battle.UseSkillMsg", {
    battleId: b.battleId,
    heroId: 1,
    skillId: 30711,
  });
  await c.receive(75);
  const attack = decode(
    "battle.AttackOrderMsg",
    (await c.receive(153)).payload,
  );
  assert.ok(attack.damages.some((d) => d.leftValue === 0));
  const result = decode(
    "battle.BattleReportMsg",
    (await c.receive(4103)).payload,
  );
  assert.equal(result.battleResult, 1);
  await c.receive(128);
  // The battle completion syncs authoritative player/army/quest state before
  // the next command response. Validate these pushes instead of leaving them
  // queued and mistaking them for the heartbeat response below.
  const afterBattle = decode("player.PlayerMsg", (await c.receive(3)).payload);
  assert.equal(afterBattle.grades, app.store.role(a.id).level);
  const afterArmy = decode("army.ArmyMsg", (await c.receive(150)).payload);
  assert.equal(afterArmy.mapId, 10001);
  decode("quest.QuestUpdatedRspMsg", (await c.receive(112)).payload);
  c.send(10007, "battle.LoadOverMsg", {
    battleId: b.battleId,
    armyId: a.id,
    serverName: "VAVEYLA",
  });
  assert.deepEqual(
    decode("battle.BattleReportMsg", (await c.receive(4103)).payload),
    result,
  );
  // An invalid interaction is a business rejection, not a forced logout.
  c.send(5125, "campaign.CampaignReqMsg", {
    paraInt1: 9999999,
    paraBool1: true,
  });
  await c.receive(83);
  c.send(20008);
  await c.receive(4234);
  assert.equal(
    app.store.get(
      "select count(*) as n from wartune_training_results where won=1",
    ).n,
    1,
  );
  const state = await http(app, "GET", "/api/game", null, s.token);
  assert.equal(state.data.player.gold, 0);
  assert.equal(state.data.player.diamonds, 0);
  app.game.tx(a.id, (r) =>
    app.game.reward(r, "network-reward", {
      xp: 25,
      gold: 33,
      items: [{ template_id: 2125149, count: 1 }],
    }),
  );
  c.send(20008);
  await c.receive(4234);
  const player = decode("player.PlayerMsg", (await c.receive(3)).payload);
  assert.equal(player.gp, 0);
  assert.ok(app.game.snapshot(a.id).player.pending_xp >= 25);
  await c.receive(150);
  const items = decode("item.ItemMovedListMsg", (await c.receive(115)).payload);
  assert.ok(items.moved.some((m) => m.item?.templateId === 2125149));
  await c.receive(109);
  await c.receive(112);
  const notice = decode("chat.ChatChannelMsg", (await c.receive(83)).payload);
  assert.equal(notice.channel, 2);
  assert.match(notice.encodeMsg, /25 XP/);
  c.send(20008);
  await c.receive(4234);
  c.ws.close();
  const reused = await connect(app);
  reused.ws.send(
    new Cipher().encrypt(
      packet(
        20001,
        encode("player.LoginReqMsg", {
          playerId: a.id,
          key,
          ekeys: [1, 2, 3, 4, 5, 6, 7, 8],
        }),
      ),
    ),
  );
  const [closeCode] = await once(reused.ws, "close");
  assert.equal(closeCode, 1008);
});
test("HTTP/JSON WebSocket account ownership, admin guard, duplicate JSON and expiry", async (t) => {
  const app = await fixture(t);
  const reg = await http(app, "POST", "/api/register", {
      username: "json_owner",
      password: "json-password-123",
    }),
    a = reg.data.account,
    login = (
      await http(app, "POST", "/api/login", {
        username: "json_owner",
        password: "json-password-123",
      })
    ).data;
  app.store.createRole(a.id, "JsonHero", 1, 1);
  const c = await connect(app, app.wsPort);
  c.ws.send(
    JSON.stringify({ id: "auth", type: "auth", data: { token: login.token } }),
  );
  assert.equal(JSON.parse((await c.raw()).toString()).ok, true);
  c.ws.send(
    JSON.stringify({
      id: "state",
      type: "game.state",
      data: { account_id: 999 },
    }),
  );
  assert.equal(JSON.parse((await c.raw()).toString()).ok, false);
  assert.equal(
    (await http(app, "GET", "/api/admin/players", null, login.token)).status,
    403,
  );
  const bad = await fetch("http://127.0.0.1:" + app.httpPort + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"username":"x","username":"json_owner","password":"json-password-123"}',
  });
  assert.equal(bad.status, 400);
  app.store.run("update sessions set expires_at=0");
  assert.equal(
    (await http(app, "GET", "/api/me", null, login.token)).status,
    401,
  );
  c.ws.close();
});

test("original client double-slash nickname endpoint remains a path, not a URL authority", async (t) => {
  const app = await fixture(t);
  const r = await fetch(
    "http://127.0.0.1:" + app.httpPort + "//nicknamecheck",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "nickname=FreshNodeHero",
    },
  );
  assert.equal(r.status, 200);
  assert.match(await r.text(), /value="true"/);
});
export { fixture, connect, http, enter };

test("system journal replays latest20 messages after authenticated user load", async (t) => {
  const app = await fixture(t),
    a = app.store.register("journal_login", "journal-password-123");
  app.store.createRole(a.id, "JournalLogin", 1, 1);
  app.game.tx(a.id, (r) => {
    for (let i = 0; i < 22; i++)
      app.game.notice(r, "history:" + i, "info", "Geçmiş " + i);
  });
  const login = app.store.login(a.username, "journal-password-123"),
    key = "b".repeat(32);
  app.store.issueTicket(a.id, key, login.token, "local");
  const c = await enter(app, a, key);
  t.after(() => c.ws.terminate());
  const expected = app.store
    .all(
      "select message from game_notifications where character_id=? order by id desc limit 20",
      app.store.role(a.id).id,
    )
    .reverse()
    .map((r) => r.message);
  c.send(8224, "player.PlayerDataMsg", { user: true });
  const messages = [];
  for (let i = 0; i < 60 && messages.length < 20; i++) {
    const p = unpack(c.in.decrypt(await c.raw()));
    if (p.code === 83) messages.push(decode("chat.ChatChannelMsg", p.payload));
  }
  assert.equal(messages.length, 20);
  assert.deepEqual(
    messages.map((m) => m.encodeMsg),
    expected,
  );
  assert.ok(messages.every((m) => m.channel === 2));
});

test("completed tutorial hand-in recovers on authenticated user load without repeating its reward", async (t) => {
  const app = await fixture(t),
    a = app.store.register("handoff_login", "handoff-password-123");
  app.store.createRole(a.id, "HandoffLogin", 1, 1);
  const { Battle, FIGHTS } = await import("../src/battle.js"),
    { win, arrival } = await import("./core.test.js");
  const b = new Battle(app.game, app.store.role(a.id));
  b.intro();
  for (const id of FIGHTS) {
    if (id === 1000203) {
      b.checkpoint({ newNoviceProcess: 90 });
      b.checkpoint({ newNoviceProcess: 110 });
      arrival(b, 1000108);
    }
    win(b, id);
  }
  assert.equal(app.store.role(a.id).level, 4);
  const login = app.store.login(a.username, "handoff-password-123"),
    key = "c".repeat(32);
  app.store.issueTicket(a.id, key, login.token, "local");
  const c = await enter(app, a, key);
  t.after(() => c.ws.terminate());
  c.send(8224, "player.PlayerDataMsg", { user: true });
  await c.receive(52);
  assert.equal(app.store.role(a.id).level, 5);
  assert.equal(app.store.role(a.id).gold, 10000);
  const role = app.store.role(a.id);
  assert.equal(
    app.store.get(
      "select count(*) n from game_reward_events where character_id=? and event_id='quest:45:0:1'",
      role.id,
    ).n,
    1,
  );
  c.send(8224, "player.PlayerDataMsg", { user: true });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(app.store.role(a.id).gold, 10000);
});

test("failed UI resource requests appear in bounded diagnostics without recording private paths", async (t) => {
  const app = await fixture(t);
  const base = "http://127.0.0.1:" + app.httpPort;
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await fetch(base + "/res/release/UI/BaseCommon-missing.fui")).status,
      404,
    );
  await fetch(base + "/res/backups/private.json");
  const got = await http(app, "GET", "/api/client-diagnostics");
  assert.equal(got.data.asset_errors.length, 1);
  assert.equal(
    got.data.asset_errors[0].path,
    "res/release/UI/BaseCommon-missing.fui",
  );
  assert.equal(got.data.asset_errors[0].count, 2);
});
