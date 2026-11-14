import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {Store} from '../src/store.js';
import {Game} from '../src/game.js';
import {game,SLOTS} from '../src/catalog.js';
import {job} from '../src/util.js';
import {encode,decode} from '../src/pb.js';
import {questPacket} from '../src/packets.js';
import {fixture as networkFixture,enter} from './network.test.js';

function prepare(s,g,a){
 g.snapshot(a.id);s.run('update characters set level=40 where account_id=?',a.id);
 const r=s.role(a.id);
 // Established prerequisite for this isolated quest fixture, not a live repair.
 s.run("insert into game_quests(character_id,quest_id,status,accepted_at,claimed_at,period,baseline_json,claims) values(?,130,'claimed',0,0,0,'{}',1)",r.id);
 g.tx(a.id,r=>g.acceptQuest(r,944));return r;
}
function gear(r,level){return game.itemtemplate.find(t=>t.MasterType===1&&t.NeedGrades===level&&t.Job.includes(job(r))&&SLOTS[t.SonType]&&[2,r.sex].includes(t.Sexs));}
function add(g,a,id){g.tx(a.id,r=>g.addItem(r,id,1));return g.snapshot(a.id).inventory.find(i=>i.template_id===id&&i.bag===1);}
function status(g,a){return g.snapshot(a.id).quests.find(q=>q.quest_id===944);}

test('quest944 counts currently worn level10+ gear for all six avatars, excluding bag, other owner and low level; persists across SQLite reopen',async t=>{
 const dir=fs.mkdtempSync(os.tmpdir()+'/vaveyla-equip-quest-');let s=await new Store(dir+'/players.sqlite3').initialize(),g=new Game(s);
 t.after(()=>{s.close();fs.rmSync(dir,{recursive:true});});const accounts=[];
 for(let icon=1;icon<=6;icon++){
  const a=s.register('equip_'+icon,'equipment-password-123');s.createRole(a.id,'EquipHero'+icon,icon>3?0:1,icon);const r=prepare(s,g,a);accounts.push(a);
  assert.equal(status(g,a).complete,false);assert.deepEqual(status(g,a).unsupported_conditions,[]);
  const low=gear(r,1),high=gear(r,10);assert.ok(low&&high);
  const l=add(g,a,low.TemplateId),h=add(g,a,high.TemplateId);
  assert.equal(status(g,a).complete,false,'level10 gear in bag does not count');
  g.tx(a.id,r=>g.moveItem(r,l.id,4,SLOTS[low.SonType][0],1));assert.equal(status(g,a).complete,false,'hero level does not upgrade low gear');
  g.tx(a.id,r=>g.moveItem(r,h.id,4,SLOTS[high.SonType][0],1));assert.equal(status(g,a).complete,true);
  g.tx(a.id,r=>g.moveItem(r,h.id,1,g.freePosition(r),1));assert.equal(status(g,a).complete,false,'unequipped gear no longer meets condition');
  const higher=gear(r,20);assert.ok(higher);const item=add(g,a,higher.TemplateId);g.tx(a.id,r=>g.moveItem(r,item.id,4,SLOTS[higher.SonType][0],1));assert.equal(status(g,a).complete,true,'higher-level gear also counts');
 }
 const owner=s.register('empty_owner','equipment-password-123');s.createRole(owner.id,'EmptyOwner',1,1);prepare(s,g,owner);assert.equal(status(g,owner).complete,false,'other characters gear does not count');
 s.close();s=await new Store(dir+'/players.sqlite3').initialize();g=new Game(s);
 for(const a of accounts){assert.equal(status(g,a).complete,true);const [code,name,body]=questPacket(g.snapshot(a.id));assert.equal(code,112);const q=decode(name,encode(name,body)).quest.find(q=>q.templateId===944);assert.equal(q.isComplete,true);assert.equal(q.condition_1,1);}
 const a=accounts[0],gold=g.snapshot(a.id).player.gold;g.tx(a.id,r=>g.claimQuest(r,944));g.tx(a.id,r=>g.claimQuest(r,944));assert.equal(g.snapshot(a.id).player.gold,gold+2000);
});

test('native equip5005 immediately updates quest944 packet112 and hand-in5014 grants source gold only once',async t=>{
 const app=await networkFixture(t),a=app.store.register('equip_wire','equipment-password-123');app.store.createRole(a.id,'EquipWire',1,1);const r=prepare(app.store,app.game,a),template=gear(r,10),item=add(app.game,a,template.TemplateId);
 const login=app.store.login(a.username,'equipment-password-123'),key='8'.repeat(32);app.store.issueTicket(a.id,key,login.token,'local');const c=await enter(app,a,key);t.after(()=>c.ws.terminate());
 c.send(5005,'item.ItemReqMsg',{beginObjId:0,objectId:0,beginBagType:1,beginPos:item.position,endObjId:r.id,endBagType:4,endPos:SLOTS[template.SonType][0],count:1});
 const until=async code=>{for(let i=0;i<50;i++){const p=await c.receive();if(p.code===code)return p;}throw Error('expected packet '+code);};
 const p=await until(112),q=decode('quest.QuestUpdatedRspMsg',p.payload).quest.find(q=>q.templateId===944);assert.equal(q.isComplete,true);assert.equal(q.condition_1,1);
 const gold=app.game.snapshot(a.id).player.gold;
 for(let i=0;i<2;i++){c.send(5014,'quest.QuestFinishedReqMsg',{templateId:944,rewardItemId:0,isPass:false});await until(52);}
 assert.equal(app.game.snapshot(a.id).player.gold,gold+2000);
});
