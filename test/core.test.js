import {Session} from "../src/session.js";
import os from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Store } from "../src/store.js";
import { Game } from "../src/game.js";
import { Battle, FIGHTS } from "../src/battle.js";
import { encode, decode } from "../src/pb.js";
import * as packets from "../src/packets.js";
import { et, maps, nodes, fights, training } from "../src/catalog.js";
async function fixture(t) {
  const dir = fs.mkdtempSync(os.tmpdir() + "/vaveyla-node-core-"),
    s = await new Store(dir + "/players.sqlite3", {
      clock: () => 1794375635,
    }).initialize();
  t.after(() => {
    s.close();
    fs.rmSync(dir, { recursive: true });
  });
  s.register("unused", "secure-password-123");
  const a = s.register("node_owner", "secure-password-123");
  s.createRole(a.id, "NodeHero", 1, 1);
  return { s, g: new Game(s), a, r: s.role(a.id) };
}
function validate(rows) {
  for (const [code, name, body] of rows) {
    try {
      decode(name, encode(name, body));
    } catch (e) {
      throw new Error(`packet ${code} ${name}: ${e.code} ${e.message}`, {
        cause: e,
      });
    }
  }
}
function arrival(b, id) {
  const n = b.row(id);
  b.move(b.role, {
    mapId: n.CampaignId,
    armyId: b.role.player_id,
    routes: [{ x: n.Property1 * 20, y: n.Property2 * 20 }],
    moveType: 0,
  });
  return b.arrive(b.role, { paraInt1: id, paraBool1: true });
}
function win(b, id, claimCard = true) {
  validate(arrival(b, id));
  validate(
    b.load(
      b.role,
      { armyId: b.role.player_id, battleId: b.id, serverName: "VAVEYLA" },
      0,
    ),
  );
  let result;
  for (let i = 0; i < 3000; i++) {
    if (b.stage === "running") validate(b.tick(b.nextDue));
    else {
      result = b.finish(b.game.s.role(b.role.account_id), b.nextDue);
      validate(result);
    }
    if (b.stage === "finished") break;
  }
  assert.equal(b.stage, "finished");
  assert.ok(b.active.player_hp > 0);
  assert.ok(b.active.enemies.every((a) => a.hp === 0));
  if (claimCard && b.pendingReward())
    validate([b.claimReward(b.game.s.role(b.role.account_id),{paraInt1:b.role.player_id,paraInt2:0,paraString1:b.document.card_reward.token})]);
  return result;
}
test("initial packets are schema-valid, use network account IDs and read SQLite balances", async (t) => {
  const { s, g, a, r } = await fixture(t);
  s.setDiamonds(r.id, 321, "test");
  const v = g.snapshot(a.id);
  assert.equal(v.player.diamonds, 321);
  assert.notEqual(r.id, r.player_id);
  validate([
    packets.player(s.role(a.id), v),
    ...packets.initial(s.role(a.id), v, {
      castle: true,
      build: true,
      sys: true,
      aas: true,
      army: true,
      tree: true,
      snsReq: true,
      bag: true,
      quest: true,
      reward: true,
    }),
    packets.fullArmy(r, v),
    ...packets.city(g, r),
  ]);
  const troop = packets.fullArmy(r, v)[2];
  assert.equal(troop.playerId, a.id);
  assert.equal(troop.simpleHeroInfo.heroId, r.id);
});
test("single-use tickets, expiry, immutable idempotency keys and unchanged diamonds", async (t) => {
  const { s, g, a, r } = await fixture(t);
  const session = s.login("node_owner", "secure-password-123");
  s.issueTicket(a.id, "a".repeat(32), session.token, "local");
  assert.equal(s.consumeTicket(a.id, "a".repeat(32)).account.id, a.id);
  assert.throws(() => s.consumeTicket(a.id, "a".repeat(32)));
  const action = g.action(
    a.id,
    "world.move",
    { x: 15001, y: 15000, revision: 0 },
    "move",
  );
  assert.deepEqual(
    g.action(a.id, "world.move", { x: 15001, y: 15000, revision: 0 }, "move"),
    action,
  );
  assert.throws(() =>
    g.action(a.id, "world.move", { x: 15002, y: 15000, revision: 0 }, "move"),
  );
  assert.equal(s.role(a.id).diamonds, 0);
});
test("five tutorial battles, Dinah heal, final XP, city reward and building2/3", async (t) => {
  const { s, g, a, r } = await fixture(t),
    b = new Battle(g, r);
  b.intro();
  validate(b.introPackets());
  for (const id of FIGHTS) {
    if (id === 1000203) {
      b.checkpoint({ newNoviceProcess: 90 });
      b.checkpoint({ newNoviceProcess: 110 });
      validate(arrival(b, 1000108));
    }
    win(b, id);
  }
  assert.ok(b.document.completed);
  assert.equal(s.role(a.id).level, 4);
  g.action(a.id, "quest.claim", { quest_id: 45, selected_item: 0 }, "quest45");
  assert.equal(s.role(a.id).level, 5);
  assert.equal(s.role(a.id).gold, 10000);
  g.action(a.id, "building.upgrade", { son_type: 901 }, "hall2");
  g.action(a.id, "building.upgrade", { son_type: 901 }, "hall3");
  assert.equal(
    g.snapshot(a.id).buildings.find((b) => b.son_type === 901).grade,
    3,
  );
});
test("all45 normal campaigns and all3 routes clear visible fights on91 maps without requiring hidden spawns", async (t) => {
  const { s, g, a, r } = await fixture(t);
  g.snapshot(a.id);
  s.run("update characters set level=80 where id=?", r.id);
  g.tx(a.id, (r) => g.resource(r, "stamina", 4800, "level80_campaign_fixture"));
  s.run("insert into game_pawns values(?,?,?,?)", r.id, 101, 10180, 0);
  s.run("insert into game_pawn_slots values(?,?,?,?)", r.id, 0, 101, 100);
  const seen = new Set(),
    defeated = new Set();
  let count = 0;
  function run(cid, branch = 0) {
    const b = new Battle(g, s.role(a.id), cid);
    b.branchChoice = (options) => (options.length > 1 ? branch : 0);
    const visited = new Set();
    while (!b.document.completed) {
      const mid = b.document.map_id;
      assert.ok(!visited.has(mid));
      visited.add(mid);
      seen.add(mid);
      for (const n of nodes(mid).filter((n) =>
        fights(cid).some((f) => f.Id === n.Id),
      )) {
        const report = win(b, n.Id);
        assert.equal(report[0][2].battleResult, 1);
        assert.deepEqual(b.finish(b.role, 1e9), []);
        defeated.add(n.Id);
        count++;
      }
      if (!b.document.completed) {
        const portal = nodes(mid).find(
          (n) => n.MasterType === 62 && n.MoveToNodeIds.length,
        );
        assert.ok(portal);
        validate(arrival(b, portal.Id));
      }
    }
  }
  for (const id of Object.keys(et("campaign")).map(Number)) run(id);
  run(1307, 1);
  run(1307, 2);
  assert.equal(seen.size, 91);
  const visible = new Set(Object.keys(et("campaign")).flatMap(cid=>fights(+cid).map(n=>n.Id)));
  assert.equal(defeated.size, visible.size);
  assert.ok(count > defeated.size);
  assert.equal(
    s.get("select count(*) as n from game_campaign_results where won=1").n,
    count,
  );
  assert.equal(packets.rank(g, s.role(a.id))[2].rankInfo.length, 45);
  // Every source campaign supports replay only after the genuine results above.
  g.tx(a.id, (r) => {
    g.wallet(r, "gold", 100000, "raid_test_fixture");
    g.resource(r, "bound_diamonds", 1000, "raid_test_fixture");
  });
  for (const cid of Object.keys(et("campaign")).map(Number)) {
    const q = {
      sweepType: 1,
      opType: 1,
      campaignId: cid,
      count: 1,
      eIndex: 0,
      enterType: 1,
    };
    const start = g.tx(a.id, (r) => g.campaignSweep(r, q));
    assert.equal(start.status, 11);
    const done = g.tx(a.id, (r) =>
      g.campaignSweep(r, { ...q, opType: 2, payType: 2 }),
    );
    assert.equal(done.status, 11);
    assert.equal(done.result[0].finishCount, 1);
    validate([[4425, "campaign.CampaignSweepRsp", done]]);
  }
  assert.equal(
    s.get(
      "select count(*) n from game_reward_events where event_id like 'sweep:%'",
    ).n,
    45,
  );
  assert.equal(
    s.get("select count(*) n from game_campaign_results where won=1").n,
    count,
  );
});

test("all six avatars retain both visible skills and Dinah heals in every second-map tutorial fight", async (t) => {
  const { s, g } = await fixture(t);
  let healPackets = 0;
  for (let icon = 1; icon <= 6; icon++) {
    const a = s.register("avatar_" + icon, "avatar-password-123");
    s.createRole(a.id, "Avatar " + icon, icon <= 3 ? 1 : 0, icon);
    const b = new Battle(g, s.role(a.id));
    b.intro();
    validate(b.introPackets());
    for (const id of FIGHTS) {
      if (id === 1000203) {
        b.checkpoint({ newNoviceProcess: 90 });
        b.checkpoint({ newNoviceProcess: 110 });
        validate(arrival(b, 1000108));
      }
      validate(arrival(b, id));
      if (id >= 1000203) {
        const base = (((icon - 1) % 3) + 1) * 10000;
        assert.ok(b.active.allowed_skills.includes(base + 711));
        assert.ok(b.active.allowed_skills.includes(base + 811));
        assert.equal(b.active.support.template, 1004);
      }
      validate(
        b.load(
          b.role,
          { armyId: a.id, battleId: b.id, serverName: "VAVEYLA" },
          0,
        ),
      );
      for (let n = 0; n < 3000 && b.stage !== "finished"; n++) {
        const rows =
          b.stage === "running"
            ? b.tick(b.nextDue)
            : b.finish(s.role(a.id), b.nextDue);
        validate(rows);
        for (const [code, , body] of rows)
          if (code === 153 && body.livingId === 10) {
            assert.ok(
              body.damages.every((d) => !d.isHarmful && d.damageValue <= 0),
            );
            healPackets++;
          }
      }
      assert.equal(b.stage, "finished");
      assert.ok(b.active.player_hp > 0);
      assert.ok(b.active.enemies.every((e) => e.hp === 0));
    }
    assert.ok(b.document.completed);
    if(b.pendingReward())b.claimReward(s.role(a.id),{paraInt1:b.role.player_id,paraInt2:0,paraString1:b.document.card_reward.token});
    // Screenshot regression: quest45 completed at level4 must accept the exact
    // native Reward button payload for every avatar, with no duplicate grants.
    const session = new Session({store:s,game:g});
    const req={code:5014,payload:encode("quest.QuestFinishedReqMsg",{templateId:45,rewardItemId:0,isPass:false})};
    const mutate=(method,...args)=>g.tx(a.id,r=>g[method](r,...args));
    const before=g.snapshot(a.id);
    const rows=session.gamePacket(s.role(a.id),req,mutate);validate(rows);
    assert.ok(rows.some(row=>row[0]===52&&row[2].templateId===45));
    const after=g.snapshot(a.id);assert.equal(after.player.level,5);assert.equal(after.player.gold,before.player.gold+10000);
    assert.equal(after.inventory.length-before.inventory.length,4);
    assert.equal(after.quests.find(q=>q.quest_id===45).status,"claimed");
    session.gamePacket(s.role(a.id),req,mutate);
    assert.deepEqual(g.snapshot(a.id).player,after.player);
  }
  assert.ok(healPackets >= 12);
});

export { fixture as coreFixture, arrival, win };
