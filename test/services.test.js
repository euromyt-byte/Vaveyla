import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { Store } from "../src/store.js";
import { Game } from "../src/game.js";
import { Battle } from "../src/battle.js";
import { Session } from "../src/session.js";
import { encode, decode } from "../src/pb.js";
import { table, services } from "../src/catalog.js";
async function fixture(t) {
  const dir = fs.mkdtempSync(os.tmpdir() + "/vaveyla-services-");
  let now = 1794375635;
  const s = await new Store(dir + "/db.sqlite3", {
    clock: () => now,
  }).initialize();
  t.after(() => {
    s.close();
    fs.rmSync(dir, { recursive: true });
  });
  s.register("unused", "service-password-123");
  const g = new Game(s),
    accounts = [];
  for (let n = 0; n < 3; n++) {
    const a = s.register("service_" + n, "service-password-123");
    s.createRole(a.id, "Service " + n, 1, n + 1);
    g.snapshot(a.id);
    s.run(
      "update characters set level=80,gold=2000000 where account_id=?",
      a.id,
    );
    accounts.push(a);
  }
  return {
    s,
    g,
    a: accounts[0],
    b: accounts[1],
    c: accounts[2],
    advance: (n) => (now += n),
  };
}
function request(f, account, code, name, body) {
  const session = new Session({ store: f.s, game: f.g }),
    r = f.s.role(account.id);
  const rows = session.gamePacket(
    r,
    { code, payload: name ? encode(name, body) : Buffer.alloc(0) },
    (m, ...args) => f.g.tx(account.id, (r) => f.g[m](r, ...args)),
  );
  assert.ok(rows, "unhandled " + code);
  for (const [c, n, b] of rows)
    try {
      decode(n, encode(n, b));
    } catch (e) {
      throw new Error(`code ${c}, ${n}: ${e.message}`);
    }
  return rows;
}
test("virtual currency rewards use source IDs and remain atomic and replay-safe", async (t) => {
  const { s, g, a } = await fixture(t);
  const reward = {
    items: [
      { template_id: -400, count: 20 },
      { template_id: -500, count: 200 },
      { template_id: -100, count: 15 },
      { template_id: -700, count: 25 },
    ],
  };
  const before = s.role(a.id).gold;
  g.tx(a.id, (r) => g.reward(r, "virtual", reward));
  g.tx(a.id, (r) => g.reward(r, "virtual", reward));
  const v = g.snapshot(a.id);
  assert.equal(v.player.diamonds, 20);
  assert.equal(v.resources.bound_diamonds, 200);
  assert.equal(v.player.gold, before + 15);
  assert.equal(v.player.xp, 25);
  assert.equal(v.inventory.length, 0);
  assert.throws(() =>
    g.tx(a.id, (r) =>
      g.reward(r, "bad", {
        gold: 5,
        items: [{ template_id: -123456, count: 1 }],
      }),
    ),
  );
  assert.equal(s.role(a.id).gold, before + 15);
});
test("source shop prices, bound currency, limits, idempotency and insufficient balances", async (t) => {
  const { s, g, a } = await fixture(t);
  g.tx(a.id, (r) =>
    g.reward(r, "bound", { items: [{ template_id: -500, count: 198 }] }),
  );
  const before = s.role(a.id).diamonds;
  const result = g.action(
    a.id,
    "shop.buy",
    { shop_id: 10001, count: 2, pay_type: 0 },
    "shop-order",
  );
  assert.equal(result.result.template_id, 2030503);
  assert.equal(g.snapshot(a.id).resources.bound_diamonds, 0);
  assert.equal(s.role(a.id).diamonds, before);
  assert.deepEqual(
    g.action(
      a.id,
      "shop.buy",
      { shop_id: 10001, count: 2, pay_type: 0 },
      "shop-order",
    ),
    result,
  );
  assert.equal(g.snapshot(a.id).inventory[0].count, 2);
  assert.throws(
    () =>
      g.action(
        a.id,
        "shop.buy",
        { shop_id: 10001, count: 1, pay_type: 1 },
        "cannot-pay",
      ),
    (e) => e.code === "insufficient_funds",
  );
  assert.equal(s.get("select count(*) as n from game_shop_purchases").n, 1);
  g.tx(a.id, (r) =>
    g.reward(r, "many-bound", { resources: { bound_diamonds: 999999 } }),
  );
  assert.throws(
    () =>
      g.action(
        a.id,
        "shop.buy",
        { shop_id: 10001, count: 19, pay_type: 0 },
        "limit",
      ),
    (e) => e.code === "shop_limit",
  );
});
test("currency and XP consumables consume only owned inventory and roll back failures", async (t) => {
  const { s, g, a, b } = await fixture(t);
  g.tx(a.id, (r) => g.addItem(r, 2030101, 1));
  let i = g.snapshot(a.id).inventory[0];
  assert.throws(
    () => g.action(b.id, "inventory.use", { item_id: i.id, count: 1 }, "theft"),
    (e) => e.code === "item_not_owned",
  );
  const before = s.role(a.id).gold;
  g.action(a.id, "inventory.use", { item_id: i.id, count: 1 }, "use-once");
  g.action(a.id, "inventory.use", { item_id: i.id, count: 1 }, "use-once");
  assert.equal(s.role(a.id).gold, before + 1000);
  assert.equal(g.snapshot(a.id).inventory.length, 0);
  g.tx(a.id, (r) => g.addItem(r, 208005, 1));
  i = g.snapshot(a.id).inventory[0];
  assert.throws(
    () =>
      g.action(a.id, "inventory.use", { item_id: i.id, count: 1 }, "unknown"),
    (e) => e.code === "unsupported_item_effect",
  );
  assert.equal(g.snapshot(a.id).inventory[0].count, 1);
});
test("mail ownership, read/claim/delete lifecycle and attachment replay", async (t) => {
  const { s, g, a, b } = await fixture(t);
  const id = g.tx(a.id, (r) =>
    g.systemMail(r, "mail-fixture", "Ödül", "Deneme", {
      gold: 99,
      items: [{ template_id: 2125149, count: 1 }],
    }),
  );
  assert.throws(
    () => g.tx(b.id, (r) => g.claimMail(r, id)),
    (e) => e.code === "mail_not_owned",
  );
  assert.throws(
    () => g.tx(a.id, (r) => g.deleteMail(r, id)),
    (e) => e.code === "mail_has_attachment",
  );
  assert.equal(g.tx(a.id, (r) => g.readMail(r, id)).read_at, s.clock());
  const before = s.role(a.id).gold;
  g.action(a.id, "mail.claim", { mail_id: id }, "claim");
  g.action(a.id, "mail.claim", { mail_id: id }, "claim");
  g.action(a.id, "mail.claim", { mail_id: id }, "claim-again");
  assert.equal(s.role(a.id).gold, before + 99);
  assert.equal(g.snapshot(a.id).inventory[0].count, 1);
  g.action(a.id, "mail.delete", { mail_id: id }, "delete");
  assert.equal(g.tx(a.id, (r) => g.mails(r)).length, 0);
  const sent = g.action(
    a.id,
    "mail.send",
    { recipient: b.id, subject: "Merhaba", body: "Yerel posta" },
    "send",
  ).result;
  assert.equal(
    g.tx(b.id, (r) => g.mail(r, sent.mail_id)).sender_id,
    s.role(a.id).id,
  );
});
test("full inventory rewards are mailed once and cannot be claimed until space exists", async (t) => {
  const { s, g, a } = await fixture(t),
    r = s.role(a.id);
  for (let p = 0; p < 100; p++)
    s.run(
      "insert into game_items(character_id,template_id,bag,position,count,bound) values(?,?,1,?,1,1)",
      r.id,
      2125149,
      p,
    );
  const reward = { gold: 5, items: [{ template_id: 1113401, count: 1 }] };
  g.tx(a.id, (r) => g.reward(r, "overflow", reward));
  g.tx(a.id, (r) => g.reward(r, "overflow", reward));
  let mails = g.tx(a.id, (r) => g.mails(r));
  assert.equal(mails.length, 1);
  assert.throws(
    () => g.tx(a.id, (r) => g.claimMail(r, mails[0].id)),
    (e) => e.code === "bag_full",
  );
  assert.equal(g.tx(a.id, (r) => g.mail(r, mails[0].id)).claimed_at, null);
  s.run("delete from game_items where character_id=? and position=99", r.id);
  g.tx(a.id, (r) => g.claimMail(r, mails[0].id));
  assert.equal(
    g.snapshot(a.id).inventory.filter((i) => i.template_id === 1113401).length,
    1,
  );
  assert.equal(
    g.tx(a.id, (r) => g.claimMail(r, mails[0].id)).already_claimed,
    true,
  );
});
test("all source seven-day rewards, UTC rollover and repeat claims are preserved", async (t) => {
  const { s, g, a, advance } = await fixture(t);
  for (let day = 1; day <= 7; day++) {
    g.action(a.id, "daily.sign", {}, "sign" + day);
    g.action(a.id, "daily.sign", {}, "duplicate" + day);
    assert.equal(g.tx(a.id, (r) => g.daily(r)).total_days, day);
    g.action(a.id, "daily.claim", { day }, "reward" + day);
    g.action(a.id, "daily.claim", { day }, "duplicate-reward" + day);
    if (day < 7) advance(86400);
  }
  const v = g.snapshot(a.id);
  assert.equal(v.resources.bound_diamonds, 1400);
  assert.equal(
    v.inventory.reduce((n, i) => n + i.count, 0),
    3,
  );
  assert.equal(g.tx(a.id, (r) => g.daily(r)).reward_bits, 127);
});
test("guild create, invites, permission checks, source-timed upgrade and persistence", async (t) => {
  const { s, g, a, b, c, advance } = await fixture(t);
  const id = g.action(a.id, "guild.create", { name: "Native Guild" }, "create")
    .result.id;
  g.action(a.id, "guild.open", { enabled: false }, "close");
  assert.throws(
    () => g.action(b.id, "guild.apply", { guild_id: id }, "closed"),
    (e) => e.code === "guild_applications_closed",
  );
  g.action(a.id, "guild.open", { enabled: true }, "open");
  const invite = g.action(
    a.id,
    "guild.invite",
    { character_id: s.role(b.id).id },
    "invite",
  ).result;
  assert.throws(
    () =>
      g.action(
        c.id,
        "guild.invite_reply",
        { invite_id: invite.id, accept: true },
        "steal",
      ),
    (e) => e.code === "invite_not_owned",
  );
  g.action(
    b.id,
    "guild.invite_reply",
    { invite_id: invite.id, accept: true },
    "accept",
  );
  assert.equal(g.guild(id).members.length, 2);
  g.action(b.id, "guild.donate", { amount: 1000 }, "donate");
  g.action(a.id, "guild.upgrade", {}, "upgrade");
  assert.equal(g.guild(id).level, 1);
  advance(3600);
  assert.equal(g.guild(id).level, 2);
  assert.equal(g.guild(id).bank, 600);
  assert.throws(
    () =>
      g.action(b.id, "guild.kick", { character_id: s.role(a.id).id }, "bad"),
    (e) => e.code === "guild_permission",
  );
});
test("native guild/mail/shop/daily requests return schema-valid messages with real state", async (t) => {
  const f = await fixture(t),
    { s, g, a, b } = f;
  request(f, a, 5130, "consortia.ConsortiaMsg", {
    consortiaName: "Wire Guild",
  });
  for (const c of [8207, 8211, 8209]) request(f, a, c);
  g.tx(a.id, (r) =>
    g.reward(r, "wire-currency", { resources: { bound_diamonds: 99 } }),
  );
  assert.ok(
    request(f, a, 5154, "shop.ShopMsg", {
      buyInfo: { goodId: 10001, count: 1, receiveId: a.id, type: 1 },
      payType: 0,
    }).some((r) => r[0] === 90),
  );
  request(f, a, 8218);
  request(f, a, 8790);
  const signed = request(f, a, 8789, "active.SevenSignReceiveReq", { site: 1 });
  assert.equal((signed.find((p) => p[0] === 4704)[2].rewardSite >> 1) & 1, 1);
  const mail = g.tx(a.id, (r) =>
    g.systemMail(r, "wire-mail", "Ödül", "Ödülünü al", { gold: 3 }),
  );
  request(f, a, 8204, "mail.MailListReqMsg", { reqType: 0 });
  request(f, a, 5022, "mail.MailMsg", { mailsIdArray: [mail], reqType: 1 });
  request(f, a, 5022, "mail.MailMsg", { mailsIdArray: [mail], reqType: 0 });
  request(f, a, 8206, "mail.MailDelReqMsg", { delList: [mail], reqType: 0 });
});
test("boss kill, all-campaign, tax and next-day quest conditions use server facts", async (t) => {
  const { s, g, a, advance } = await fixture(t);
  g.tx(a.id, (r) => {
    const base = g.baseline(r),
      boss = { CondictionType: 26, Para1: "1011", Para2: 1 };
    assert.equal(g.condition(r, boss, base).complete, false);
    g.fact(r, "kill", 1011);
    assert.equal(g.condition(r, boss, base).complete, true);
    g.fact(r, "campaign_clear", 1001, 3);
    assert.equal(
      g.condition(r, { CondictionType: 31, Para1: "1", Para2: 3 }, base)
        .complete,
      true,
    );
    assert.equal(
      g.condition(r, { CondictionType: 31, Para1: "2", Para2: 1 }, base)
        .supported,
      false,
    );
    g.fact(r, "tax", 0);
    assert.equal(
      g.condition(r, { CondictionType: 42, Para1: "0", Para2: 1 }, base)
        .complete,
      true,
    );
  });
  const accepted = Math.floor(s.clock() / 86400);
  g.tx(a.id, (r) => g.signDaily(r));
  advance(86400);
  g.tx(a.id, (r) => {
    g.signDaily(r);
    assert.equal(
      g.condition(
        r,
        { CondictionType: 39, Para1: "0", Para2: 1 },
        { __accepted_day: accepted },
      ).complete,
      true,
    );
  });
});

test("old resource constraint and guild balances migrate once with an intact pre-migration backup", async (t) => {
  const { s, g, a } = await fixture(t),
    r = s.role(a.id);
  g.action(
    a.id,
    "guild.create",
    { name: "Migration Guild" },
    "migration-guild",
  );
  g.action(a.id, "guild.donate", { amount: 1000 }, "migration-donate");
  s.tx(() => {
    s.db.exec(
      "CREATE TABLE old_resources(character_id INTEGER NOT NULL REFERENCES characters(id),currency TEXT NOT NULL CHECK(currency IN('honor','guild_offer')),amount INTEGER NOT NULL CHECK(amount>=0),PRIMARY KEY(character_id,currency))",
    );
    s.run("insert into old_resources values(?,'honor',33)", r.id);
    s.db.exec(
      "DROP TABLE game_resources; ALTER TABLE old_resources RENAME TO game_resources",
    );
    s.run("delete from game_migrations where name=?", "guild-wallet-1.1.0");
  });
  await s.initialize();
  assert.ok(fs.existsSync(s.backupPath));
  assert.equal(g.snapshot(a.id).resources.honor, 33);
  assert.equal(g.snapshot(a.id).resources.guild_offer, 1000);
  g.tx(a.id, (r) => g.resource(r, "bound_diamonds", 77));
  assert.equal(g.snapshot(a.id).resources.bound_diamonds, 77);
  await s.initialize();
  assert.equal(g.snapshot(a.id).resources.guild_offer, 1000);
});
test("town dialogue quests require accepted source prerequisites and cannot be claimed during a campaign", async (t) => {
  const { s, g, a } = await fixture(t);
  s.run("update characters set level=15 where account_id=?", a.id);
  g.snapshot(a.id);
  const before = s.role(a.id).gold;
  s.run(
    "insert into game_campaign_runs values(?,?,?)",
    s.role(a.id).id,
    0,
    JSON.stringify({ completed: false, abandoned: false }),
  );
  assert.throws(
    () =>
      g.action(
        a.id,
        "quest.claim",
        { quest_id: 174, selected_item: 0 },
        "not-in-town",
      ),
    (e) => e.code === "dialogue_requires_city",
  );
  assert.equal(s.role(a.id).gold, before);
  s.run("delete from game_campaign_runs where character_id=?", s.role(a.id).id);
  g.action(a.id, "quest.claim", { quest_id: 174, selected_item: 0 }, "talk");
  assert.equal(s.role(a.id).gold, before + 10000);
  g.action(
    a.id,
    "quest.claim",
    { quest_id: 174, selected_item: 0 },
    "talk-again",
  );
  assert.equal(s.role(a.id).gold, before + 10000);
});

test("campaign stamina is charged once, resumed without charge and restored only once per new UTC day", async (t) => {
  const { s, g, a, advance } = await fixture(t);
  g.tx(a.id, (r) => g.signDaily(r));
  const one = new Battle(g, s.role(a.id), 1001);
  assert.equal(g.snapshot(a.id).resources.stamina, 180);
  const resumed = new Battle(g, s.role(a.id), 1001);
  assert.equal(g.snapshot(a.id).resources.stamina, 180);
  resumed.abandon();
  g.tx(a.id, (r) => g.resource(r, "stamina", -170));
  assert.throws(
    () => new Battle(g, s.role(a.id), 1001),
    (e) => e.code === "insufficient_stamina",
  );
  assert.equal(g.snapshot(a.id).resources.stamina, 10);
  g.tx(a.id, (r) => g.signDaily(r));
  assert.equal(g.snapshot(a.id).resources.stamina, 10);
  advance(86400);
  g.tx(a.id, (r) => g.signDaily(r));
  assert.equal(g.snapshot(a.id).resources.stamina, 200);
  g.tx(a.id, (r) => g.addItem(r, 2030503, 1));
  const item = g
    .snapshot(a.id)
    .inventory.find((i) => i.template_id === 2030503);
  g.action(
    a.id,
    "inventory.use",
    { item_id: item.id, count: 1 },
    "stamina-potion",
  );
  assert.equal(g.snapshot(a.id).resources.stamina, 250);
});

test("an EXP book during the tutorial keeps its XP without breaking the level1 guide", async (t) => {
  const { s, g, a } = await fixture(t);
  s.run("update characters set level=1 where account_id=?", a.id);
  const b = new Battle(g, s.role(a.id));
  b.intro();
  g.tx(a.id, (r) => g.addItem(r, 2030703, 1));
  const item = g
    .snapshot(a.id)
    .inventory.find((i) => i.template_id === 2030703);
  g.action(
    a.id,
    "inventory.use",
    { item_id: item.id, count: 1 },
    "book-in-tutorial",
  );
  const v = g.snapshot(a.id);
  assert.equal(v.player.level, 1);
  assert.equal(v.player.xp, 0);
  assert.equal(v.player.pending_xp, 5000);
  assert.equal(v.inventory.length, 0);
  assert.equal(g.snapshot(a.id).player.pending_xp, 5000);
});
test("Unicode mailboxes stream all pages below the actual 16-bit wire size limit", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 18; i++)
    f.g.tx(f.a.id, (r) =>
      f.g.systemMail(r, "long-mail:" + i, "Uzun posta", "😀".repeat(2000), {}),
    );
  const rows = request(f, f.a, 8204, "mail.MailListReqMsg", { reqType: 0 });
  assert.equal(rows.length, 3);
  assert.equal(rows.flatMap((r) => r[2].mailInfos).length, 18);
  for (const row of rows)
    assert.ok(encode(row[1], row[2]).length + 20 <= 65535);
  assert.equal(rows.at(-1)[2].curPage, rows.at(-1)[2].maxPage);
});
