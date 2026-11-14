import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import vm from "node:vm";
import { Store } from "../src/store.js";
import { Game } from "../src/game.js";
import { Battle, FIGHTS } from "../src/battle.js";
import { Session } from "../src/session.js";
import { table, et, maps, nodes, fights } from "../src/catalog.js";
import { encode, decode } from "../src/pb.js";
import { buildings, rank } from "../src/packets.js";
import { SWEEP, sourceSweepLoot } from "../src/rules-campaign.js";
import { win, arrival } from "./core.test.js";
import { fixture as networkFixture, enter } from "./network.test.js";
async function setup(t) {
  const dir = fs.mkdtempSync(os.tmpdir() + "/vaveyla-campaign-city-");
  let now = 1794375635;
  let s = await new Store(dir + "/players.sqlite3", {
    clock: () => now,
  }).initialize();
  const a = s.register("campaign_owner", "campaign-password-123");
  s.createRole(a.id, "CampaignHero", 1, 1);
  let g = new Game(s);
  g.snapshot(a.id);
  s.run(
    "update characters set level=80,gold=20000000 where account_id=?",
    a.id,
  );
  s.setDiamonds(s.role(a.id).id, 500, "fixture");
  const f = {
    a,
    dir,
    get s() {
      return s;
    },
    get g() {
      return g;
    },
    advance: (n) => (now += n),
    restart: async () => {
      s.close();
      s = await new Store(dir + "/players.sqlite3", {
        clock: () => now,
      }).initialize();
      g = new Game(s);
    },
  };
  t.after(() => {
    s.close();
    fs.rmSync(dir, { recursive: true });
  });
  return f;
}
function request(f, code, name, body = {}) {
  const s = new Session({ store: f.s, game: f.g });
  const rows = s.gamePacket(
    f.s.role(f.a.id),
    { code, payload: name ? encode(name, body) : Buffer.alloc(0) },
    (m, ...args) => f.g.tx(f.a.id, (r) => f.g[m](r, ...args)),
  );
  assert.ok(rows, "unhandled " + code);
  for (const [, n, b] of rows) decode(n, encode(n, b));
  return rows;
}
function sweep(f, op = 3, extra = {}) {
  return request(f, 8528, "campaign.CampaignSweepReq", {
    sweepType: 1,
    opType: op,
    campaignId: 1001,
    enterType: 1,
    ...extra,
  })[0][2];
}
function clear(f, cid = 1001) {
  const b = new Battle(f.g, f.s.role(f.a.id), cid);
  while (!b.document.completed) {
    const mid = b.document.map_id;
    for (const n of nodes(mid).filter((n) =>
      fights(cid).some((x) => x.Id === n.Id),
    ))
      win(b, n.Id);
    if (!b.document.completed)
      arrival(
        b,
        nodes(mid).find((n) => n.MasterType === 62 && n.MoveToNodeIds.length)
          .Id,
      );
  }
  return b;
}
function prepareCity(f) {
  const r = f.s.role(f.a.id);
  // Valid source prerequisites, explicitly seeded high-level fixture.
  for (const t of Object.values(table("buildingtemplate")).filter(
    (t) => t.BuildingGrade === 80,
  ))
    f.s.run(
      "insert into game_buildings(character_id,son_type,template_id) values(?,?,?) on conflict(character_id,son_type) do update set template_id=excluded.template_id",
      r.id,
      t.SonType,
      t.TemplateId,
    );
  return r;
}

test("confirmed scene exit uses native5025, stops combat, persists abandon and returns city after reconnect", async t => {
  const app = await networkFixture(t);
  const a = app.store.register("exit_wire", "exit-password-123");
  app.store.createRole(a.id, "ExitHero", 1, 1);
  app.game.snapshot(a.id);
  app.store.run("update characters set level=80 where account_id=?", a.id);
  const login = app.store.login(a.username, "exit-password-123"), key = "e".repeat(32);
  app.store.issueTicket(a.id, key, login.token, "local");
  const c = await enter(app, a, key);
  t.after(() => c.ws.terminate());
  const drain = async () => {
    c.send(20008);
    const rows = [];
    for (let i=0;i<80;i++) {
      const row = await c.receive();
      if (row.code === 4234) return rows;
      rows.push(row);
    }
    throw new Error("exit response did not settle");
  };
  c.send(5039, "campaign.CampaignReqMsg", {paraInt2:1001});
  await drain();
  const session = [...app.sessions].find(s => s.account?.id === a.id);
  const b = session.encounter;
  const n = nodes(b.document.map_id).find(n => [41,42].includes(n.MasterType) && (n.Soldiers || n.Heros));
  c.send(5124, "worldmap.PosMoveMsg", {mapId:n.CampaignId,armyId:a.id,routes:[{x:n.Property1*20,y:n.Property2*20}]});
  c.send(5125, "campaign.CampaignReqMsg", {paraInt1:n.Id,paraBool1:true});
  const prepared = (await drain()).find(r => r.code === 157);
  const battleId = decode("battle.BattlePrepareMsg", prepared.payload).battleId;
  c.send(10007, "battle.LoadOverMsg", {battleId,armyId:a.id,serverName:"VAVEYLA"});
  await drain();
  assert.equal(b.stage, "running");
  const stamina = app.game.snapshot(a.id).resources.stamina;
  const rewards = app.store.get("select count(*) n from game_reward_events").n;
  const context = vm.createContext({fl:class{},y_t:{info(){}},Bn:{U_C_CAMPAIGN_ROOM_EXIT:5025,U_C_CAMPAIGN_EXIT:5120},vZ:{Instance:{send:(code,body)=>c.send(code,"room.RoomExitMsg",JSON.parse(JSON.stringify(body)))}}});
  vm.runInContext(fs.readFileSync(new URL("./fixtures/client-exit-out.js", import.meta.url),"utf8"),context);
  c.send(5025,"room.RoomExitMsg",{msg:"kill self"});
  assert.equal((await drain()).some(r=>r.code===22),false);
  assert.equal(b.document.abandoned,false);
  new context.SourceExitOut().sendReturnCampaignRoom(a.id);
  const rows = await drain();
  const exit = rows.find(r=>r.code===22);
  assert.ok(exit, "native confirmed exit must receive CampaignExitMsg");
  assert.equal(decode("campaign.CampaignExitMsg",exit.payload).playerId,a.id);
  assert.equal(decode("campaign.CampaignExitMsg",exit.payload).result,1);
  assert.equal(decode("player.LoginStateMsg",rows.find(r=>r.code===6).payload).state,2);
  assert.equal(b.document.abandoned,true);
  assert.equal(b.nextDue,null);
  assert.equal(session.cityDue,null);
  assert.deepEqual(b.tick(1e12),[]);
  assert.deepEqual(b.finish(app.store.role(a.id),1e12),[]);
  assert.equal(app.store.get("select count(*) n from game_reward_events").n,rewards);
  assert.equal(app.game.snapshot(a.id).resources.stamina,stamina);
  const saved=JSON.parse(app.store.get("select state_json from game_campaign_runs where character_id=?",app.store.role(a.id).id).state_json);
  assert.equal(saved.abandoned,true);
  new context.SourceExitOut().sendReturnCampaignRoom(a.id);
  assert.ok((await drain()).some(r=>r.code===22));
  assert.equal(app.game.snapshot(a.id).resources.stamina,stamina);
  assert.equal(app.unsupported.has(5025),false);
  new context.SourceExitOut().sendExitCampaignScene(a.id);
  assert.ok((await drain()).some(r=>r.code===22));
  c.ws.terminate();
  const secondKey="f".repeat(32);
  app.store.issueTicket(a.id,secondKey,login.token,"local");
  const reconnected=await enter(app,a,secondKey);
  t.after(()=>reconnected.ws.terminate());
  const active=[...app.sessions].find(s=>s.account?.id===a.id&&s.sessionHash&&s.encounter!==b);
  assert.equal(active.encounter.campaign,false);
});

test("native5025 cannot bypass unfinished tutorial",async t=>{
  const app=await networkFixture(t);
  const a=app.store.register("exit_tutorial","exit-password-123");
  app.store.createRole(a.id,"ExitTutorial",1,1);
  const login=app.store.login(a.username,"exit-password-123"),key="d".repeat(32);
  app.store.issueTicket(a.id,key,login.token,"local");
  const c=await enter(app,a,key);
  t.after(()=>c.ws.terminate());
  c.send(5025,"room.RoomExitMsg",{msg:""});
  await c.receive(83);
  c.send(20008);
  await c.receive(4234);
  const session=[...app.sessions].find(s=>s.account?.id===a.id);
  assert.equal(session.encounter.document.completed,false);
  assert.equal(session.encounter.document.abandoned,undefined);
  assert.equal(app.unsupported.has(5025),false);
});

for (const activity of ["challenge", "raid"]) test(`native ${activity} starts from an already open different campaign without an extra exit click`, async t => {
  const app=await networkFixture(t), a=app.store.register("switch_"+activity,"switch-password-123");
  app.store.createRole(a.id,"Switch"+activity,1,1);
  const tutorial=new Battle(app.game,app.store.role(a.id));
  tutorial.intro();
  for(const id of FIGHTS){
    if(id===1000203){tutorial.checkpoint({newNoviceProcess:90});tutorial.checkpoint({newNoviceProcess:110});arrival(tutorial,1000108);}
    win(tutorial,id);
  }
  app.game.snapshot(a.id);
  app.store.run("update characters set level=80,gold=100000 where account_id=?",a.id);
  clear({s:app.store,g:app.game,a},1001);
  const previous=new Battle(app.game,app.store.role(a.id),1002);
  app.store.run("update characters set level=8 where account_id=?",a.id);
  const login=app.store.login(a.username,"switch-password-123"),key=(activity==="raid"?"a":"b").repeat(32);
  app.store.issueTicket(a.id,key,login.token,"local");
  const c=await enter(app,a,key); t.after(()=>c.ws.terminate());
  const session=[...app.sessions].find(s=>s.account?.id===a.id);
  const stamina=app.game.snapshot(a.id).resources.stamina;
  const ctx=vm.createContext({Date,Mn:{},Wr:class{},r:class{},Qn:{listen(){}},dz:class{},hy:{GetResult:3},y_t:{xjy(){}},com:{road:{yishi:{proto:{campaign:{CampaignReqMsg:class{}}}}}},Bn:{U_C_CAMPAIGN_ENTER:5039,C_CAMPAIGN_SWEEP:8528},vZ:{Instance:{send:(code,body)=>c.send(code,code===8528?"campaign.CampaignSweepReq":"campaign.CampaignReqMsg",JSON.parse(JSON.stringify(body)))}}});
  vm.runInContext(fs.readFileSync(new URL("./fixtures/client-campaign-actions.js",import.meta.url),"utf8"),ctx);
  // A rejected new activity must not abandon or charge the existing run.
  const before=app.store.get("select state_json,revision from game_campaign_runs where character_id=?",app.store.role(a.id).id);
  if(activity==="challenge")c.send(5039,"campaign.CampaignReqMsg",{paraInt2:999999});
  else c.send(8528,"campaign.CampaignSweepReq",{sweepType:1,opType:1,campaignId:1001,count:250,enterType:1});
  c.send(20008);
  for(let i=0;i<80;i++)if((await c.receive()).code===4234)break;
  assert.deepEqual(app.store.get("select state_json,revision from game_campaign_runs where character_id=?",app.store.role(a.id).id),before);
  assert.equal(session.encounter.document.abandoned,false);
  assert.equal(app.game.snapshot(a.id).resources.stamina,stamina);
  if(activity==="challenge")ctx.FH.sendStartCampaignScene(1001,1);
  else new ctx.cz().sendMopupInfo(1,1,1001,1,0,1,true,true);
  c.send(20008);
  const packets=[];
  for(let i=0;i<80;i++){const p=await c.receive();if(p.code===4234)break;packets.push(p);}
  if(activity==="challenge"){
    assert.ok(packets.some(p=>p.code===21),"challenge must return map entry");
    assert.equal(session.encounter.document.campaign_id,1001);
    assert.notEqual(session.encounter.document.run_id,previous.document.run_id);
    assert.equal(session.encounter.document.abandoned,false);
    // Retransmission resumes this same run without another stamina debit.
    c.send(5039,"campaign.CampaignReqMsg",{paraInt2:1001});c.send(20008);
    for(let i=0;i<80;i++)if((await c.receive()).code===4234)break;
  }else{
    const response=packets.find(p=>p.code===4425);
    assert.ok(response,"raid must return its native response");
    assert.equal(decode("campaign.CampaignSweepRsp",response.payload).status,11);
    assert.equal(app.game.pendingSweep(app.store.role(a.id)).campaign_id,1001);
    assert.equal(session.encounter.document.abandoned,true);
    assert.equal(session.encounter.nextDue,null);
  }
  assert.equal(app.game.snapshot(a.id).resources.stamina,stamina-20);
  if(activity==="raid"){
    c.send(8528,"campaign.CampaignSweepReq",{sweepType:1,opType:4,campaignId:1001,enterType:1});
    c.send(20008);
    const closed=[];
    for(let i=0;i<80;i++){const p=await c.receive();if(p.code===4234)break;closed.push(p);}
    assert.ok(closed.some(p=>p.code===22),"closing raid must leave the abandoned background map");
    assert.equal(app.game.activeSweep(app.store.role(a.id)),null);
    assert.equal(app.game.snapshot(a.id).resources.stamina,stamina-20);
    c.send(8528,"campaign.CampaignSweepReq",{sweepType:1,opType:4,campaignId:1001,enterType:1});c.send(20008);
    for(let i=0;i<80;i++)if((await c.receive()).code===4234)break;
    assert.equal(app.game.snapshot(a.id).resources.stamina,stamina-20);
  }
});
test("raid requires a server-recorded first clear, not a client rank or invented clear fact", async (t) => {
  const f = await setup(t),
    r = f.s.role(f.a.id);
  const before = f.g.snapshot(f.a.id);
  f.g.tx(f.a.id, (r) => f.g.fact(r, "campaign_clear", 1001));
  assert.throws(
    () => sweep(f, 1, { count: 2 }),
    (e) => e.code === "sweep_first_clear",
  );
  assert.equal(f.s.role(f.a.id).gold, before.player.gold);
  assert.equal(
    f.g.snapshot(f.a.id).resources.stamina,
    before.resources.stamina,
  );
  assert.equal(f.s.get("select count(*) n from game_campaign_sweeps").n, 0);
});
test("instant raid pays all XP now; start retries and SQLite restart preserve one charge and reward per repetition", async t=>{
 const f=await setup(t);clear(f);const before=f.g.snapshot(f.a.id),proof=f.g.tx(f.a.id,r=>f.g.sweepProof(r,1001));
 const start=sweep(f,1,{count:2});assert.equal(start.status,11);assert.equal(start.result[0].type,1);assert.equal(start.result[0].gp,2*proof.xp);assert.equal(start.result[0].time,undefined);
 assert.equal(f.g.snapshot(f.a.id).player.xp,before.player.xp+2*proof.xp);
 assert.equal(f.g.snapshot(f.a.id).resources.stamina,before.resources.stamina-40);
 const balance=f.s.role(f.a.id).gold;assert.equal(balance,before.player.gold-200);
 const inv=f.g.snapshot(f.a.id).inventory;sweep(f,1,{count:2});await f.restart();sweep(f,1,{count:2});
 assert.equal(f.s.get("select count(*) n from game_campaign_sweeps").n,1);assert.equal(f.s.role(f.a.id).gold,balance);assert.deepEqual(f.g.snapshot(f.a.id).inventory,inv);
 assert.equal(sweep(f,0).result[0].items.reduce((n,x)=>n+x.count,0),2);assert.deepEqual(f.g.snapshot(f.a.id).inventory,inv);
 assert.equal(sweep(f).result[0].gp,0);assert.equal(f.s.get("select count(*) n from game_reward_events where event_id like 'sweep:%'").n,2);
 sweep(f,4);assert.equal(f.g.pendingSweep(f.s.role(f.a.id)),null);
 sweep(f,1,{count:2});assert.equal(f.s.get("select count(*) n from game_campaign_sweeps").n,2);assert.equal(f.s.get("select count(*) n from game_reward_events where event_id like 'sweep:%'").n,4);
});
test("legacy partially rewarded timed raid completes remaining repetitions immediately with no premium or refund",async t=>{
 const f=await setup(t);clear(f);const r=f.s.role(f.a.id),proof=f.g.tx(f.a.id,r=>f.g.sweepProof(r,1001)),loot=sourceSweepLoot(1001,3),before=f.g.snapshot(f.a.id);
 const d={status:'running',started:1794375635,count:3,finished:1,seconds:60,gold:100,stamina:20,xp:proof.xp,loot,proofRun:proof.proofRun};
 f.g.tx(f.a.id,r=>{f.g.wallet(r,'gold',-300,'fixture_legacy');f.g.resource(r,'stamina',-60,'fixture_legacy');f.g.reward(r,'sweep:legacy:1',{xp:proof.xp,items:loot[0]});f.s.run('insert into game_campaign_sweeps values(?,?,?,?,?)','legacy',r.id,1001,JSON.stringify(d),1794375635);});
 const done=sweep(f,0);assert.equal(done.status,10);assert.equal(done.result[0].finishCount,3);assert.equal(done.result[0].gp,3*proof.xp);assert.equal(f.g.activeSweep(r),null);
 const paid=f.g.snapshot(f.a.id);assert.equal(paid.player.xp,before.player.xp+3*proof.xp);assert.equal(paid.resources.stamina,before.resources.stamina-60);
 sweep(f,2,{payType:1});sweep(f,4);sweep(f,4);assert.deepEqual(f.g.snapshot(f.a.id).player,paid.player);assert.equal(f.g.snapshot(f.a.id).resources.stamina,paid.resources.stamina);
 assert.equal(f.s.get("select count(*) n from game_reward_events where event_id like 'sweep:%'").n,3);
});
test("instant raid preserves first-clear and resource checks; speedup never charges premium",async t=>{
 const f=await setup(t);clear(f);const before=f.g.snapshot(f.a.id);
 assert.throws(()=>sweep(f,1,{count:1,sweepType:2}),e=>e.code==='unsupported_sweep');
 assert.throws(()=>sweep(f,1,{count:250}),e=>e.code==='insufficient_stamina');assert.deepEqual(f.g.snapshot(f.a.id).player,before.player);
 const start=sweep(f,1,{count:2});assert.equal(start.status,11);const paid=f.g.snapshot(f.a.id);
 sweep(f,2,{payType:1});sweep(f,2,{payType:2});assert.deepEqual(f.g.snapshot(f.a.id).player,paid.player);assert.deepEqual(f.g.snapshot(f.a.id).resources,paid.resources);
});
test("building packets initialize construction, research and alchemy; real level and prerequisites remain enforced", async (t) => {
  const f = await setup(t),
    r = f.s.role(f.a.id);
  f.s.run("update characters set level=3 where id=?", r.id);
  assert.deepEqual(
    request(f, 8279)[1][2].buildOrder.map((o) => o.orderType),
    [1, 2, 3],
  );
  for (let i = 0; i < 2; i++)
    request(f, 8203, "building.BuildingOptionReqMsg", { buildingId: 1 });
  assert.equal(
    f.g.snapshot(f.a.id).buildings.find((b) => b.son_type === 901).grade,
    3,
  );
  const gold = f.s.role(f.a.id).gold;
  assert.throws(
    () => request(f, 8203, "building.BuildingOptionReqMsg", { buildingId: 1 }),
    (e) => e.code === "building_player_level" && e.message.includes("4"),
  );
  assert.equal(f.s.role(f.a.id).gold, gold);
  request(f, 8203, "building.BuildingOptionReqMsg", { buildingId: 3 });
  assert.equal(
    f.g.snapshot(f.a.id).buildings.find((b) => b.son_type === 402).grade,
    2,
  );
});
test("construction and research run concurrently, same queue rejects, source cooldown settles and persists", async (t) => {
  const f = await setup(t),
    r = prepareCity(f);
  f.s.run(
    "update game_buildings set template_id=90120 where character_id=? and son_type=901",
    r.id,
  );
  f.s.run(
    "update game_buildings set template_id=130420 where character_id=? and son_type=1304",
    r.id,
  );
  const start = request(f, 8203, "building.BuildingOptionReqMsg", {
    buildingId: 1,
  });
  assert.ok(start.some((p) => p[0] === 151));
  request(f, 8203, "building.BuildingOptionReqMsg", { buildingId: 1304 });
  // Another physical construction with no dependency on the pending hall21.
  f.s.run(
    "update game_buildings set template_id=120119 where character_id=? and son_type=1201",
    r.id,
  );
  assert.throws(
    () => request(f, 8203, "building.BuildingOptionReqMsg", { buildingId: 2 }),
    (e) => e.code === "building_queue_full",
  );
  const queues = request(f, 8279)[1][2].buildOrder;
  assert.ok(queues[0].remainTime > 0);
  assert.equal(queues[1].remainTime, 300);
  await f.restart();
  f.advance(300);
  const v = f.g.snapshot(f.a.id);
  assert.equal(v.buildings.find((b) => b.son_type === 1304).grade, 21);
  const build = v.buildings.find((b) => b.son_type === 901);
  if (build.finishes_at) {
    f.advance(build.finishes_at - f.s.clock());
    assert.equal(
      f.g.snapshot(f.a.id).buildings.find((b) => b.son_type === 901).grade,
      21,
    );
  }
});
test("building speedup has original response 102, correct queue/cost and no free premium bypass", async (t) => {
  const f = await setup(t),
    r = prepareCity(f);
  f.s.run(
    "update game_buildings set template_id=130420 where character_id=? and son_type=1304",
    r.id,
  );
  request(f, 8203, "building.BuildingOptionReqMsg", { buildingId: 1304 });
  f.s.run("update characters set diamonds=0 where id=?", r.id);
  assert.throws(
    () => request(f, 5172, "building.BuildingReqMsg", { orderId: 2, index: 0 }),
    (e) => e.code === "insufficient_funds",
  );
  assert.equal(
    f.g.snapshot(f.a.id).buildings.find((b) => b.son_type === 1304).grade,
    20,
  );
  f.g.tx(f.a.id, (r) => f.g.resource(r, "bound_diamonds", 2, "fixture"));
  const rows = request(f, 5172, "building.BuildingReqMsg", {
    orderId: 2,
    index: 2,
  });
  assert.equal(rows.at(-1)[0], 102);
  assert.equal(rows.at(-1)[2].orderInfo[0].remainTime, 0);
  assert.equal(
    f.g.snapshot(f.a.id).buildings.find((b) => b.son_type === 1304).grade,
    21,
  );
  assert.equal(f.g.snapshot(f.a.id).resources.bound_diamonds, 0);
  request(f, 5172, "building.BuildingReqMsg", { orderId: 2, index: 2 });
  assert.equal(f.g.snapshot(f.a.id).resources.bound_diamonds, 0);
});
test("authenticated original challenge and building wire requests return map data and updated source templates", async (t) => {
  const app = await networkFixture(t);
  const a = app.store.register("buttons_wire", "buttons-password-123");
  app.store.createRole(a.id, "ButtonsHero", 1, 1);
  app.game.snapshot(a.id);
  const training = new Battle(app.game, app.store.role(a.id));
  training.intro();
  for (const id of FIGHTS) {
    if (id === 1000203) {
      training.checkpoint({ newNoviceProcess: 90 });
      training.checkpoint({ newNoviceProcess: 110 });
      arrival(training, 1000108);
    }
    win(training, id);
  }
  app.game.action(
    a.id,
    "quest.claim",
    { quest_id: 45, selected_item: 0 },
    "wire-training-quest",
  );
  assert.equal(app.store.role(a.id).level, 5);
  const login = app.store.login(a.username, "buttons-password-123"),
    key = "e".repeat(32);
  app.store.issueTicket(a.id, key, login.token, "local");
  const c = await enter(app, a, key);
  t.after(() => c.ws.terminate());
  c.send(8224, "player.PlayerDataMsg", { quest: true });
  let ranks;
  for (let i = 0; i < 20; i++) {
    const p = await c.receive();
    if (p.code === 4151) {
      ranks = decode("campaign.RankListRspMsg", p.payload);
      break;
    }
  }
  assert.deepEqual(ranks.rankInfo, []);
  c.send(8203, "building.BuildingOptionReqMsg", { buildingId: 1 });
  const b = decode(
    "building.BuildingInfoListMsg",
    (await c.receive(4130)).payload,
  );
  assert.equal(b.building.find((b) => b.buildingId === 1).templateId, 90102);
  let gotResources = false;
  for (let i = 0; i < 20; i++) {
    const p = await c.receive();
    if (p.code === 109) {
      gotResources = true;
      break;
    }
  }
  assert.ok(gotResources);
  // Drain the final quest response before the next request.
  await c.receive(112);
  c.send(5039, "campaign.CampaignReqMsg", { paraInt1: 1, paraInt2: 1001 });
  await c.receive(3);
  let created;
  for (let i = 0; i < 20; i++) {
    const p = await c.receive();
    if (p.code === 125) {
      created = decode("room.RoomCreatedMsg", p.payload);
      break;
    }
  }
  assert.ok(created);
  assert.equal(created.room.campaignId, maps(1001)[0].Id);
  const run = JSON.parse(
    app.store.get(
      "select state_json from game_campaign_runs where character_id=?",
      app.store.role(a.id).id,
    ).state_json,
  );
  assert.equal(run.campaign_id, 1001);
});

test("original client actions and model parsers accept server campaign ranks, queues and sweep progression", async (t) => {
  const f = await setup(t),
    sent = [];
  class Msg {}
  const ctx = {
    Date,
    console,
    globalThis: null,
    r: class {},
    Wr: class {},
    oa: class {
      add(k, v) {
        this[k] = v;
      }
    },
    PT: class {},
    BT: Msg,
    lz: Msg,
    Sd: Msg,
    Ld: Msg,
    com: { road: { yishi: { proto: { campaign: { CampaignReqMsg: Msg } } } } },
    Bn: {
      U_C_CAMPAIGN_ENTER: 5039,
      C_BUILDING_UPGRADE: 8203,
      U_C_BUILDING_ORDER_QUICK: 5172,
      C_CAMPAIGN_SWEEP: 8528,
    },
    Mn: {},
    vZ: { Instance: { send: (code, body) => sent.push({ code, body }) } },
    Qn: { listen() {} },
    y_t: {
      xjy() {},
      error() {
        throw Error("client controller failed");
      },
    },
    oy: { CampaignMopup: 1, PveSecretMopup: 4 },
    hy: { GetResult: 3 },
    dz: Msg,
    s: { dightHeroWar: false },
    xT: { OPEN_CAMPAIGN: 1, OVER_CAMPAIGN: 2, NO_ACCEPT_CAMPAIGN: 0 },
    I_t: {
      Instance: {
        campaignTemplateDic: {
          1001: { CampaignId: 1001, PreCampaignId: 0 },
          1003: { CampaignId: 1003, PreCampaignId: 1001 },
        },
      },
    },
    MT: { cannelClearance: false },
    Laya: { timer: { once() {} } },
    B: { Instance: { GetTranslation: (x) => x } },
    a6: { Instance: { show() {} } },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(
      new URL("./fixtures/client-campaign-actions.js", import.meta.url),
      "utf8",
    ),
    ctx,
  );
  ctx.MT.Instance = new ctx.SourceCampaigns();
  const rankManager = ctx.GT.Instance;
  rankManager.setup();
  const first = rank(f.g, f.s.role(f.a.id))[2];
  rankManager.__rankListHandler({
    readBody: () =>
      decode(
        "campaign.RankListRspMsg",
        encode("campaign.RankListRspMsg", first),
      ),
  });
  assert.equal(ctx.I_t.Instance.campaignTemplateDic[1001].state, 1);
  assert.equal(ctx.I_t.Instance.campaignTemplateDic[1003].state, 0);
  ctx.FH.sendStartCampaignScene(1001, 1);
  ctx.Ad.sendUpgradeBuild(1);
  ctx.Ad.sendCoolOrder(2, 1, true);
  assert.equal(sent[0].code, 5039);
  assert.equal(
    decode(
      "campaign.CampaignReqMsg",
      encode("campaign.CampaignReqMsg", sent[0].body),
    ).paraInt2,
    1001,
  );
  assert.equal(sent[1].body.buildingId, 1);
  assert.equal(sent[2].body.index, 2);
  const queues = new ctx.SourceQueue();
  queues.setOrderList(request(f, 8279)[1][2].buildOrder);
  assert.equal(queues.buildOrderTotal, 1);
  assert.equal(queues.tecOrderTotal, 1);
  clear(f);
  rankManager.__rankListHandler({
    readBody: () => rank(f.g, f.s.role(f.a.id))[2],
  });
  assert.equal(ctx.I_t.Instance.campaignTemplateDic[1001].state, 2);
  assert.equal(ctx.I_t.Instance.campaignTemplateDic[1003].state, 1);
  const ctrl = new ctx.cz();
  ctrl.data = { beginChanges() {}, commit() {}, mopupExt: 0 };
  let page = false;
  ctrl.view = { isShowing:true, setPage: () => (page = true) };
  ctrl.sendMopupInfo(1, 1, 1001, 1);
  const action = sent.at(-1);
  assert.equal(action.code, 8528);
  const start = request(
    f,
    action.code,
    "campaign.CampaignSweepReq",
    action.body,
  )[0][2];
  ctrl.__refreshMopupInfoHandler({ readBody: () => start });
  assert.equal(ctrl.data.mopupEnd, true);
  f.advance(60);
  const result = sweep(f);
  ctrl.__refreshMopupInfoHandler({ readBody: () => result });
  assert.equal(ctrl.data.mopupEnd, true);
  assert.equal(ctrl.data.isNormalEnd, true);
});

test("raid source-preview items are awarded on start and survive polling, retries and restart",async t=>{
 const f=await setup(t);clear(f);const before=f.g.snapshot(f.a.id),start=sweep(f,1,{count:2});
 assert.equal(start.dropItems.reduce((n,x)=>n+x.count,0),2);assert.ok(start.dropItems.every(x=>et('campaign')[1001].Item.includes(x.templateId)));
 assert.equal(start.result[0].items.reduce((n,x)=>n+x.count,0),2);
 const inventory=f.g.snapshot(f.a.id).inventory;assert.equal(inventory.reduce((n,x)=>n+x.count,0),before.inventory.reduce((n,x)=>n+x.count,0)+2);
 sweep(f);sweep(f,1,{count:2});await f.restart();sweep(f);assert.deepEqual(f.g.snapshot(f.a.id).inventory,inventory);
});

test("raid item overflow is mailed once instead of blocking completion or losing its reward", async (t) => {
  const f = await setup(t);
  clear(f);
  const r = f.s.role(f.a.id);
  const fill = Object.values(table("itemtemplate")).find(
    (x) =>
      x.MasterType === 1 &&
      x.MaxCount === 1 &&
      !et("campaign")[1001].Item.includes(x.TemplateId),
  );
  assert.ok(fill);
  const freeSlots = 100 - f.s.get("select count(*) n from game_items where character_id=? and bag=1",r.id).n;
  f.g.tx(f.a.id, (r) => {
    // A free card may already have created a stack of the raid item. Fill
    // existing stacks too, otherwise a full slot grid can still accept loot.
    for (const item of f.g.inventory(r).filter(i=>i.bag===1))
      f.s.run("update game_items set count=? where id=?",Math.max(1,table("itemtemplate")[item.template_id].MaxCount),item.id);
    for (let i = 0; i < freeSlots; i++) f.g.addItem(r, fill.TemplateId, 1, true);
  });
  sweep(f, 1, { count: 1 });
  f.advance(60);
  const done = sweep(f);
  assert.equal(done.status, 11);
  const mails = f.s.all(
    "select * from game_mail where character_id=? and event_key like 'overflow:sweep:%'",
    r.id,
  );
  assert.equal(mails.length, 1);
  sweep(f);
  assert.equal(
    f.s.all(
      "select * from game_mail where character_id=? and event_key like 'overflow:sweep:%'",
      r.id,
    ).length,
    1,
  );
});
