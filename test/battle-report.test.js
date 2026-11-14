import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { Store } from '../src/store.js';
import { Game } from '../src/game.js';
import { Battle } from '../src/battle.js';
import { nodes } from '../src/catalog.js';
import { encode } from '../src/pb.js';

test('completed campaign report survives SQLite reopen and repeated loads without another reward', async t => {
  const dir = fs.mkdtempSync(os.tmpdir() + '/vaveyla-report-');
  let s = await new Store(dir + '/test.sqlite3').initialize();
  t.after(() => { s.close(); fs.rmSync(dir, { recursive: true }); });
  const a = s.register('report_owner', 'report-password-123');
  s.createRole(a.id, 'ReportHero', 1, 1);
  let g = new Game(s);
  g.snapshot(a.id);
  s.run('update characters set level=80 where account_id=?', a.id);
  const b = new Battle(g, s.role(a.id), 1001);
  const n = nodes(b.document.map_id).find(n => [41, 42].includes(n.MasterType) && (n.Soldiers || n.Heros));
  b.move(b.role, { mapId: n.CampaignId, armyId: b.role.player_id, routes: [{x:n.Property1*20,y:n.Property2*20}], moveType:0 });
  b.arrive(b.role, {paraInt1:n.Id,paraBool1:true});
  const req = {battleId:b.id,armyId:b.role.player_id,serverName:'VAVEYLA'};
  b.load(b.role,req,0);
  let first;
  for(let i=0;i<3000&&b.stage!=='finished';i++) {
    const rows=b.stage==='running'?b.tick(b.nextDue):b.finish(s.role(a.id),b.nextDue);
    first=rows.find(r=>r[0]===4103)?.[2]??first;
  }
  assert.ok(first?.gpBonus > 0);
  const rewardCount=()=>s.get('select count(*) n from game_reward_events').n;
  const before=rewardCount();
  const battleNotice=()=>s.get("select count(*) n from game_notifications where event_key=?",'battle-result:'+b.id).n;
  assert.equal(battleNotice(),1);
  const player=g.snapshot(a.id).player;
  const check = encounter => {
    for(let i=0;i<2;i++) {
      const report=encounter.load(s.role(a.id),req)[0][2];
      assert.deepEqual(encode('battle.BattleReportMsg',report),encode('battle.BattleReportMsg',first));
      report.baseItem.push({templateId:1,count:99,type:0});
    }
    assert.equal(rewardCount(),before);
    assert.equal(battleNotice(),1);
    assert.deepEqual(g.snapshot(a.id).player,player);
  };
  check(b);
  s.close();
  s=await new Store(dir+'/test.sqlite3').initialize();
  g=new Game(s);
  check(new Battle(g,s.role(a.id),1001));
});
