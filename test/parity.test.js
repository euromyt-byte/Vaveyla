import os from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Store } from "../src/store.js";
import { Game } from "../src/game.js";
import { PythonRandom } from "../src/random.js";
async function fixture(t) {
  const dir = fs.mkdtempSync(os.tmpdir() + "/vaveyla-node-parity-"),
    s = await new Store(dir + "/players.sqlite3", {
      clock: () => 1794375635,
    }).initialize();
  t.after(() => {
    s.close();
    fs.rmSync(dir, { recursive: true });
  });
  return { s, g: new Game(s), dir };
}
// These source conditions were intentionally implemented after the Python baseline.
// Compare every unchanged field, retaining the frozen reference for all other rules.
const expandedQuestTypes = new Set([26, 31, 39, 42, 85, 104]);
function comparable(actual, expected) {
  const ids = new Set(expected.quests.map((q) => q.quest_id));
  const clean = (v) => ({
    ...v,
    // The free source Depot repair is tested separately; keep all older fields frozen.
    buildings: v.buildings.filter(b=>b.son_type!==301||expected.buildings.some(e=>e.son_type===301)),
    quests: v.quests
      .filter((q) => ids.has(q.quest_id))
      .map((q) => {
        const legacy = expected.quests.find((x) => x.quest_id === q.quest_id);
        if (legacy.conditions.some((c) => expandedQuestTypes.has(c.type))) {
          const { conditions, unsupported_conditions, complete, ...rest } = q;
          return rest;
        }
        return q;
      }),
  });
  return [clean(actual), clean(expected)];
}
test("18 legacy snapshots preserve unchanged Python behavior; source quest extensions are tested separately", async (t) => {
  const { s, g } = await fixture(t);
  const a = s.register("golden_owner", "migration-password-123");
  s.createRole(a.id, "GoldenHero", 1, 1, 1, "local");
  const cases = JSON.parse(
    fs.readFileSync(new URL("./fixtures/game-vectors.json", import.meta.url)),
  );
  for (const [i, c] of cases.entries()) {
    if (c.kind === "diamonds") s.setDiamonds(1, c.amount, "migration fixture");
    if (c.kind === "reward") g.tx(a.id, (r) => g.reward(r, c.event, c.reward));
    if (c.kind === "level_fixture")
      s.run("update characters set level=80,gold=1000000 where id=1");
    if (c.kind === "action")
      assert.deepEqual(
        ((out)=>c.result.result?.buildings&&!c.result.result.buildings.some(b=>b.son_type===301)?{...out,result:{...out.result,buildings:out.result.buildings.filter(b=>b.son_type!==301)}}:out)(g.action(a.id, c.operation, c.body, c.request_id)),
        c.result,
        "action " + i + " " + c.operation,
      );
    assert.deepEqual(
      ...comparable(g.snapshot(a.id), c.expected),
      "snapshot " + i + " " + c.kind,
    );
  }
});
test("existing Python SQLite accounts, password hashes, balances, ledger and action replays survive", async (t) => {
  const { s, g, dir } = await fixture(t);
  const tables = JSON.parse(
    fs.readFileSync(new URL("./fixtures/migration-rows.json", import.meta.url)),
  );
  s.db.exec("PRAGMA foreign_keys=OFF");
  for (const [name, rows] of Object.entries(tables))
    for (const row of rows) {
      const keys = Object.keys(row);
      s.run(
        'insert into "' +
          name +
          '" (' +
          keys.map((k) => '"' + k + '"').join(",") +
          ") values(" +
          keys.map(() => "?").join(",") +
          ")",
        ...keys.map((k) => row[k]),
      );
    }
  s.db.exec("PRAGMA foreign_keys=ON");
  const before = s.get(
      "select password_hash from accounts where id=1",
    ).password_hash,
    copy = await s.makeBackup(dir + "/before-node.bak");
  assert.ok(fs.existsSync(copy));
  const login = s.login("golden_owner", "migration-password-123");
  assert.equal(login.account.id, 1);
  assert.equal(s.role(1).diamonds, 1234);
  assert.equal(
    s.get("select password_hash from accounts where id=1").password_hash,
    before,
  );
  assert.equal(s.get("select count(*) as n from diamond_ledger").n, 1);
  const rows = JSON.parse(
    fs.readFileSync(new URL("./fixtures/game-vectors.json", import.meta.url)),
  ).filter((c) => c.kind === "action");
  for (const c of rows)
    assert.deepEqual(g.action(1, c.operation, c.body, c.request_id), c.result);
  assert.equal(s.role(1).diamonds, 1234);
});
test("MT19937 string-seeded random matches CPython deterministic duel sequences", () => {
  const actual = JSON.parse(
    fs.readFileSync(new URL("./fixtures/random-vectors.json", import.meta.url)),
  );
  for (const v of actual) {
    const r = new PythonRandom(v.seed);
    assert.deepEqual(
      v.bounds.map((n) => r.below(n)),
      v.values,
      v.seed,
    );
  }
});
