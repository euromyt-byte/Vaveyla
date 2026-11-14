import os from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Store } from "../src/store.js";
import { Game } from "../src/game.js";
import { Battle } from "../src/battle.js";
import { hash, ROOT } from "../src/util.js";
async function setup(t) {
  const root = fs.mkdtempSync(os.tmpdir() + "/vaveyla-node-persist-"),
    s = await new Store(root + "/original.sqlite3").initialize();
  t.after(() => {
    try {
      s.close();
    } catch {}
    fs.rmSync(root, { recursive: true });
  });
  const g = new Game(s),
    a = s.register("persist_owner", "persist-password-123"),
    b = s.register("persist_other", "persist-password-123");
  s.createRole(a.id, "PersistHero", 1, 1);
  s.createRole(b.id, "OtherHero", 1, 2);
  for (const x of [a, b]) {
    g.snapshot(x.id);
    s.run(
      "update characters set level=80,gold=2000000 where account_id=?",
      x.id,
    );
  }
  return { root, s, g, a, b };
}
test("guild permissions, donations and consent-only duel persist without duplicate rewards", async (t) => {
  const { s, g, a, b } = await setup(t);
  const guild = g.action(
    a.id,
    "guild.create",
    { name: "VAVEYLA Test" },
    "guild-create",
  ).result;
  g.action(b.id, "guild.apply", { guild_id: guild.id }, "apply");
  assert.throws(
    () =>
      g.action(
        b.id,
        "guild.application",
        { character_id: s.role(b.id).id, accept: true },
        "no-rights",
      ),
    (e) => e.code === "not_in_guild",
  );
  g.action(
    a.id,
    "guild.application",
    { character_id: s.role(b.id).id, accept: true },
    "accept",
  );
  const donation = g.action(b.id, "guild.donate", { amount: 100 }, "donate");
  assert.deepEqual(
    g.action(b.id, "guild.donate", { amount: 100 }, "donate"),
    donation,
  );
  assert.equal(g.guild(guild.id).bank, 100);
  const invite = g.action(
    a.id,
    "duel.invite",
    { target_id: s.role(b.id).id },
    "invite",
  ).result;
  assert.throws(
    () =>
      g.action(
        a.id,
        "duel.reply",
        { duel_id: invite.duel_id, accept: true },
        "spoof",
      ),
    (e) => e.code === "duel_not_owned",
  );
  const balances = [s.role(a.id).gold, s.role(b.id).gold];
  const result = g.action(
    b.id,
    "duel.reply",
    { duel_id: invite.duel_id, accept: true },
    "reply",
  ).result;
  assert.equal(result.state, "finished");
  assert.equal(result.reward, null);
  assert.deepEqual(
    g.action(
      b.id,
      "duel.reply",
      { duel_id: invite.duel_id, accept: true },
      "reply",
    ).result,
    result,
  );
  assert.deepEqual([s.role(a.id).gold, s.role(b.id).gold], balances);
  assert.ok(g.duelStatus(s.role(a.id), invite.duel_id).actions.length > 0);
});
test("native online SQLite import includes uncheckpointed WAL rows and refuses overwrite", async (t) => {
  const { root, s, a } = await setup(t),
    dest = root + "/node.sqlite3";
  s.setDiamonds(s.role(a.id).id, 733, "copy fixture");
  const argv = [
      path.join(ROOT, "scripts/import-database.js"),
      "--source",
      s.path,
      "--destination",
      dest,
    ],
    before = hash(fs.readFileSync(s.path));
  const copied = spawnSync(process.execPath, argv, { encoding: "utf8" });
  assert.equal(copied.status, 0, copied.stderr);
  assert.equal(hash(fs.readFileSync(s.path)), before);
  const imported = await new Store(dest).initialize();
  try {
    assert.equal(imported.role(a.id).diamonds, 733);
    assert.equal(
      imported.login("persist_owner", "persist-password-123").account.id,
      a.id,
    );
    assert.ok(fs.existsSync(imported.backupPath));
    assert.equal(
      spawnSync(process.execPath, argv, { encoding: "utf8" }).status,
      1,
    );
    assert.equal(imported.role(a.id).diamonds, 733);
  } finally {
    imported.close();
  }
});
test("running battle resumes after reopening SQLite, stale connection cannot overwrite and expired auth fails", async (t) => {
  const { root, s, g, a } = await setup(t);
  s.run("update characters set level=1 where account_id=?", a.id);
  const r = s.role(a.id),
    first = new Battle(g, r);
  first.intro();
  const competing = new Battle(g, r);
  competing.intro();
  assert.throws(
    () => first.commit("stale_fixture"),
    (e) => e.code === "stale_battle",
  );
  const n = competing.row(1000103);
  competing.move(r, {
    mapId: 10001,
    armyId: r.player_id,
    routes: [{ x: n.Property1 * 20, y: n.Property2 * 20 }],
    moveType: 0,
  });
  competing.arrive(r, { paraInt1: n.Id, paraBool1: true });
  competing.load(
    r,
    { armyId: r.player_id, battleId: competing.id, serverName: "VAVEYLA" },
    0,
  );
  competing.tick(competing.nextDue);
  const active = structuredClone(competing.active);
  const session = s.login("persist_owner", "persist-password-123");
  assert.equal(s.gateway(a.id, hash(session.token)).id, a.id);
  s.run("update sessions set expires_at=0");
  assert.throws(
    () => s.gateway(a.id, hash(session.token)),
    (e) => e.code === "invalid_ticket",
  );
  s.close();
  const next = await new Store(root + "/original.sqlite3").initialize();
  try {
    const resumed = new Battle(new Game(next), next.role(a.id));
    resumed.intro();
    assert.equal(resumed.id, active.id);
    assert.equal(resumed.active.sequence, active.sequence);
    assert.equal(resumed.active.player_hp, active.player_hp);
    assert.deepEqual(resumed.active.enemies, active.enemies);
    assert.equal(resumed.stage, "preparing");
    assert.equal(
      resumed.load(
        next.role(a.id),
        { armyId: a.id, battleId: resumed.id, serverName: "VAVEYLA" },
        10,
      )[0][0],
      156,
    );
  } finally {
    next.close();
  }
});

test("a failed SQLite BEGIN leaves transaction nesting usable after the lock clears", async (t) => {
  const { s, root } = await setup(t);
  const other = new Store(root + "/original.sqlite3");
  try {
    s.db.exec("PRAGMA busy_timeout=1");
    other.db.exec("BEGIN IMMEDIATE");
    assert.throws(() => s.tx(() => s.run("select 1")));
    assert.equal(s.depth, 0);
    other.db.exec("ROLLBACK");
    assert.equal(s.tx(() => s.get("select 7 as n")).n, 7);
  } finally {
    other.close();
  }
});

test("an older map2 save restores missing Dinah and boss without resetting player damage or cooldowns", async (t) => {
  const { s, g, a } = await setup(t);
  s.run("update characters set level=1 where account_id=?", a.id);
  const b = new Battle(g, s.role(a.id));
  b.intro();
  Object.assign(b.document, {
    map_id: 10002,
    defeated: [1000103, 1000104, 1000106, 1000203],
  });
  const target = b.row(1000205);
  b.document.position = [target.Property1 * 20, target.Property2 * 20];
  b.arrive(b.role, { paraInt1: 1000205, paraBool1: true });
  b.active.player_hp = 187;
  b.active.rage = 17;
  b.active.cooldowns = { 10711: 9 };
  delete b.active.support;
  b.active.enemies = b.active.enemies.filter((e) => e.id !== 11);
  b.commit("old-save-fixture");
  const resumed = new Battle(g, s.role(a.id));
  resumed.intro();
  assert.equal(resumed.active.player_hp, 187);
  assert.equal(resumed.active.rage, 17);
  assert.deepEqual(resumed.active.cooldowns, { 10711: 9 });
  assert.equal(resumed.active.support.id, 10);
  assert.equal(resumed.active.enemies.filter((e) => e.id === 11).length, 1);
});
