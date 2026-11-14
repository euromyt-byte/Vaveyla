import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import vm from 'node:vm';
import {Store} from '../src/store.js';
import {Game} from '../src/game.js';
import {Battle} from '../src/battle.js';
import {table,group,nodes,fights} from '../src/catalog.js';
import {jsonFile} from '../src/util.js';
import {encode,decode} from '../src/pb.js';
import {fixture as networkFixture,enter} from './network.test.js';
import {win} from './core.test.js';
async function setup(t){const dir=fs.mkdtempSync(os.tmpdir()+'/vaveyla-item-system-');let now=1794375635,s=await new Store(dir+'/p.sqlite3',{clock:()=>now}).initialize(),g=new Game(s);const a=s.register('item_system','item-system-password-123');s.createRole(a.id,'ItemSystem',1,1);g.snapshot(a.id);s.run('update characters set level=80,gold=1000000 where account_id=?',a.id);t.after(()=>{s.close();fs.rmSync(dir,{recursive:true});});return {a,get s(){return s;},get g(){return g;},get r(){return s.role(a.id);},advance:n=>now+=n,restart:async()=>{s.close();s=await new Store(dir+'/p.sqlite3',{clock:()=>now}).initialize();g=new Game(s);}};}
function add(f,id,count=1){f.g.tx(f.a.id,r=>f.g.addItem(r,id,count));return f.g.snapshot(f.a.id).inventory.find(i=>i.template_id===id&&i.bag===1);}
function request(item,grade,token='attempt-0001'){return {paraInt1:item,paraInt2:grade,paraString1:'VAVEYLA_FORGE_REQ_V1:'+token};}
function stage(f,item,slot=0,count=1){return f.g.tx(f.a.id,r=>f.g.moveItem(r,item.id,0,slot,count));}
function upgrade(f,q){return f.g.tx(f.a.id,r=>f.g.strengthenItem(r,q));}
function nativeForge(send,getItem){
 const proto={campaign:{CampaignReqMsg:class{}},item:{ItemInfoMsg:class{}}};
 const ctx=vm.createContext({Date,Math,com:{road:{yishi:{proto}}},dJ:{Instance:{getHideBagItemByPos:getItem}},Bn:{U_C_ITEM_STRENGTHEN:5150},vZ:{Instance:{send}},cJ:{TabIndex:{QH:0}}});
 let src=fs.readFileSync(new URL('./fixtures/client-forge-bridge.js',import.meta.url),'utf8');for(const[a,b]of jsonFile('client-patches.json').patches)if(src.includes(a))src=src.replace(a,b);vm.runInContext(src,ctx);return ctx;
}

test('forge stages real bag0, charges source formula, persists grade and replays a request without another charge',async t=>{
 const f=await setup(t),item=add(f,1011102),template=table('itemtemplate')[item.template_id];
 f.g.tx(f.a.id,r=>f.g.moveItem(r,item.id,4,0,1));const before=f.g.snapshot(f.a.id).combat.physical_attack;
 stage(f,item);assert.equal(f.g.snapshot(f.a.id).inventory.find(i=>i.id===item.id).bag,0);
 const gold=f.r.gold,q=request(item.id,0),result=upgrade(f,q);
 assert.equal(result.exist,true);assert.equal(result.strengthenGrade,1);
 const cost=Math.floor(1.5**(Math.floor(template.NeedGrades/10)+1)*(Math.min(template.Profile,4)+1)*5+500);assert.equal(f.r.gold,gold-cost);
 upgrade(f,q);assert.equal(f.r.gold,gold-cost);assert.equal(f.g.forgeGrade(f.r,item.id),1);
 assert.throws(()=>upgrade(f,request(item.id,0,'stale-0002')),e=>e.code==='forge_stale_grade');
 assert.throws(()=>f.g.tx(f.a.id,r=>f.g.sellItem(r,item.id,1)),e=>['forge_item_reserved','item_equipped'].includes(e.code));
 await f.restart();assert.equal(f.g.forgeGrade(f.r,item.id),1);assert.equal(f.g.snapshot(f.a.id).inventory.find(i=>i.id===item.id).bag,0);
 f.g.tx(f.a.id,r=>f.g.recoverForgeItems(r));assert.equal(f.g.snapshot(f.a.id).inventory.find(i=>i.id===item.id).bag,4);assert.ok(f.g.snapshot(f.a.id).combat.physical_attack>before);
});

test('forge failure consumes one selected luck stone, preserves grade, rolls back insufficient gold, and refuses cap/ownership forgeries',async t=>{
 const f=await setup(t),item=add(f,1011102),stone=add(f,2040101,3);stage(f,item);stage(f,stone,1,1);
 f.s.run('insert into game_item_enhancements values(?,?,?)',item.id,f.r.id,2);f.g.forgeRoll=()=>99;
 const result=upgrade(f,request(item.id,2));assert.equal(result.exist,false);assert.equal(f.g.forgeGrade(f.r,item.id),2);
 assert.equal(f.g.snapshot(f.a.id).inventory.filter(i=>i.template_id===2040101).reduce((n,i)=>n+i.count,0),2);
 f.s.run('update characters set gold=0 where id=?',f.r.id);const before=f.g.snapshot(f.a.id).inventory;
 assert.throws(()=>upgrade(f,request(item.id,2,'attempt-0002')),e=>e.code==='insufficient_funds');assert.deepEqual(f.g.snapshot(f.a.id).inventory,before);
 f.s.run('update game_item_enhancements set grade=? where item_id=?',table('itemtemplate')[item.template_id].StrengthenMax,item.id);
 assert.throws(()=>upgrade(f,request(item.id,table('itemtemplate')[item.template_id].StrengthenMax,'attempt-0003')),e=>e.code==='forge_max_grade');
 const other=f.s.register('other_items','item-system-password-123');f.s.createRole(other.id,'OtherItems',1,1);f.g.snapshot(other.id);
 assert.throws(()=>f.g.tx(other.id,r=>f.g.strengthenItem(r,request(item.id,0))),e=>e.code==='forge_item_missing');
});

test('Soul Crystal Pack opens to source100 crystals; actual EXP book grants5000, EXP scroll is a durable timed bonus and weaker books remain owned',async t=>{
 const f=await setup(t),pack=add(f,2060407);f.g.tx(f.a.id,r=>f.g.useItem(r,pack.id,1));let inv=f.g.snapshot(f.a.id).inventory;assert.ok(!inv.some(i=>i.id===pack.id&&i.template_id===2060407));assert.equal(inv.filter(i=>i.template_id===208014).reduce((n,i)=>n+i.count,0),100);
 const book=add(f,2030703),xp=f.g.snapshot(f.a.id).player.xp;f.g.tx(f.a.id,r=>f.g.useItem(r,book.id,1));assert.equal(f.g.snapshot(f.a.id).player.xp,xp+5000);
 const scroll=add(f,2013002);f.g.tx(f.a.id,r=>f.g.useItem(r,scroll.id,1));assert.equal(f.g.campaignXp(f.r,101),202);
 const weak=add(f,2013001);assert.throws(()=>f.g.tx(f.a.id,r=>f.g.useItem(r,weak.id,1)),e=>e.code==='buff_weaker');assert.ok(f.g.snapshot(f.a.id).inventory.some(i=>i.id===weak.id));
 await f.restart();assert.equal(f.g.campaignXp(f.r,101),202);f.advance(3600);assert.equal(f.g.campaignXp(f.r,101),101);
 const max=add(f,2013004);f.g.tx(f.a.id,r=>f.g.useItem(r,max.id,1));assert.equal(f.g.campaignXp(f.r,100),1100);
});

test('EXP bonus applies to source campaign battle and clear once, including instant raid, while source proof remains unboosted',async t=>{
 const f=await setup(t),scroll=add(f,2013002);f.g.tx(f.a.id,r=>f.g.useItem(r,scroll.id,1));
 const before=f.g.snapshot(f.a.id).player.xp,b=new Battle(f.g,f.r,1001);
 while(!b.document.completed)for(const n of nodes(b.document.map_id).filter(n=>fights(1001).some(x=>x.Id===n.Id)))win(b,n.Id);
 const proof=f.g.tx(f.a.id,r=>f.g.sweepProof(r,1001));assert.equal(f.g.snapshot(f.a.id).player.xp,before+2*proof.xp);
 const start=f.g.tx(f.a.id,r=>f.g.campaignSweep(r,{sweepType:1,opType:1,campaignId:1001,count:1,enterType:1,eIndex:0}));assert.equal(start.totalGp,proof.xp*2);
 assert.equal(f.g.snapshot(f.a.id).player.xp,before+4*proof.xp);
});

test('native forge request and result bridge operate over encrypted5005→5150→86 with persistent grade and duplicate request protection',async t=>{
 const app=await networkFixture(t),a=app.store.register('forge_wire','item-system-password-123');app.store.createRole(a.id,'ForgeWire',1,1);app.game.snapshot(a.id);app.store.run('update characters set level=80,gold=100000 where account_id=?',a.id);app.game.tx(a.id,r=>app.game.addItem(r,1011102,1));const item=app.game.snapshot(a.id).inventory.find(i=>i.template_id===1011102);
 const login=app.store.login(a.username,'item-system-password-123'),key='9'.repeat(32);app.store.issueTicket(a.id,key,login.token,'local');const c=await enter(app,a,key);t.after(()=>c.ws.terminate());let hidden=null,reply=null;
 const ctx=nativeForge((code,body)=>{c.send(code,'campaign.CampaignReqMsg',JSON.parse(JSON.stringify(body)));reply=body;},()=>hidden),ctrl=new ctx.NativeForgeResult();let received;
 ctrl.view={isShowing:true,refresh:(tab,event,pkt)=>{received=pkt.readBody({});}};
 const flush=async()=>{c.send(20008);for(let i=0;i<100;i++){const p=await c.receive();if(p.code===4234)return;if(p.code===115)for(const row of decode('item.ItemMovedListMsg',p.payload).moved)if(row.changeType===0&&row.changePos===0)hidden=row.item?.exist?row.item:null;if(p.code===86)ctrl.__onIntensifyResult({readBody:()=>decode('item.ItemInfoMsg',p.payload)});}throw Error('forge reply limit');};
 c.send(5005,'item.ItemReqMsg',{beginObjId:0,objectId:0,beginBagType:1,beginPos:item.position,endObjId:0,endBagType:0,endPos:0,count:1});await flush();assert.equal(hidden.id,item.id);
 ctx.NativeForgeSend.sendItemIntensify();await flush();assert.equal(received.strengResult,true);assert.equal(received.strengthenGrade,1);const gold=app.store.role(a.id).gold;
 c.send(5150,'campaign.CampaignReqMsg',JSON.parse(JSON.stringify(reply)));await flush();assert.equal(received.strengResult,true);assert.equal(received.strengthenGrade,1);assert.equal(app.store.role(a.id).gold,gold);assert.equal(app.game.forgeGrade(app.store.role(a.id),item.id),1);
});

test('enhancement follows item across swap and Arrange; selling it cannot transfer the grade to a reused SQLite ID',async t=>{
 const f=await setup(t),item=add(f,1011102),other=add(f,1011101);stage(f,item);upgrade(f,request(item.id,0));f.g.tx(f.a.id,r=>f.g.recoverForgeItems(r));
 f.g.tx(f.a.id,r=>f.g.moveItem(r,item.id,1,other.position,1));assert.equal(f.g.forgeGrade(f.r,item.id),1);assert.equal(f.g.forgeGrade(f.r,other.id),0);
 f.g.tx(f.a.id,r=>f.g.arrangeItems(r,1));assert.equal(f.g.forgeGrade(f.r,item.id),1);
 f.g.tx(f.a.id,r=>f.g.sellItem(r,item.id,1));assert.equal(f.g.forgeGrade(f.r,item.id),0);
 const replacement=add(f,1011102);assert.equal(f.g.forgeGrade(f.r,replacement.id),0);
});
