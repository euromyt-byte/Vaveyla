import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import vm from 'node:vm';
import {Store} from '../src/store.js';
import {Game} from '../src/game.js';
import {table,services} from '../src/catalog.js';
import {packagePlan,drawPackage} from '../src/item-effects.js';
import {jsonFile} from '../src/util.js';
import {encode,decode} from '../src/pb.js';
import {fixture as networkFixture,enter} from './network.test.js';
async function setup(t){const dir=fs.mkdtempSync(os.tmpdir()+'/vaveyla-random-pack-'),s=await new Store(dir+'/p.sqlite3').initialize(),g=new Game(s),a=s.register('random_owner','random-password-123');s.createRole(a.id,'RandomOwner',1,1);g.snapshot(a.id);s.run('update characters set level=80,gold=100000,diamonds=1000 where account_id=?',a.id);t.after(()=>{s.close();fs.rmSync(dir,{recursive:true});});return {s,g,a,get r(){return s.role(a.id);}};}
function add(f,id,count=1){f.g.tx(f.a.id,r=>f.g.addItem(r,id,count));return f.g.snapshot(f.a.id).inventory.find(i=>i.template_id===id&&i.bag===1);}

test('A/B fashion and technology packs use every actual source weight, awarding exactly one source item per opening',()=>{
 for(const id of [2125061,2125062,2125066]){
  const plan=packagePlan(table('itemtemplate')[id]),rows=services.dropitem.filter(d=>d.DropId===id);assert.ok(plan);assert.equal(plan.fixed.length,0);assert.equal(plan.total,rows.reduce((n,d)=>n+d.Random,0));
  let offset=0;for(const row of rows){for(const roll of [offset,offset+row.Random-1]){const out=drawPackage(plan,1,max=>{assert.equal(max,plan.total);return roll;});assert.equal(out.length,1);assert.equal(out[0].template_id,row.ItemId);assert.equal(out[0].count,row.Data);}offset+=row.Random;}
 }
 const mixed=packagePlan(table('itemtemplate')[2070001]);assert.ok(mixed.fixed.length&&mixed.weighted.length);const out=drawPackage(mixed,2,()=>0);assert.equal(out.find(i=>i.template_id===2030102).count,40);
});

test('named random packs consume once, award valid fashion/cards and preserve source weights and inventory totals',async t=>{
 const f=await setup(t);for(const id of [2125061,2125062,2125066]){
  const pack=add(f,id),plan=packagePlan(table('itemtemplate')[id]);f.g.packageRoll=max=>max-1;const result=f.g.tx(f.a.id,r=>f.g.useItem(r,pack.id,1));
  assert.equal(result.reward.items.length,1);assert.equal(result.reward.items[0].template_id,plan.weighted.at(-1).template_id);assert.equal(result.reward.items[0].count,1);
  assert.ok(!f.g.snapshot(f.a.id).inventory.some(i=>i.template_id===id));
 }
});

test('Mini Spaceship card uses the clicked card, not a different canonical card or diamonds; duplicate active card remains owned',async t=>{
 const f=await setup(t),card=add(f,2183015,2),mount={TemplateId:8235,NeedItemId_O:0,NeedMountGrade:0,Property1:150,Power:10};f.g.sourceCatalog=()=>new Map([[8235,mount]]);
 const diamonds=f.r.diamonds;const used=f.g.tx(f.a.id,r=>f.g.useItem(r,card.id,1));assert.equal(used.used_count,1);assert.equal(f.g.ownedMounts(f.r)[0].template_id,8235);assert.equal(f.r.diamonds,diamonds);
 const remaining=f.g.snapshot(f.a.id).inventory.find(i=>i.template_id===2183015);assert.ok(remaining);const again=f.g.tx(f.a.id,r=>f.g.useItem(r,remaining.id,1));assert.equal(again.used_count,0);assert.equal(f.g.snapshot(f.a.id).inventory.filter(i=>i.template_id===2183015).reduce((n,i)=>n+i.count,0),1);
});

test('random result rollback and full-bag mail preserve packs/rewards; use receipt prevents SQLite ID reuse from consuming the awarded card',async t=>{
 const f=await setup(t),pack=add(f,2125066),before=f.g.snapshot(f.a.id).inventory;
 f.g.packageRoll=()=>-1;assert.throws(()=>f.g.tx(f.a.id,r=>f.g.useItem(r,pack.id,1)),e=>e.code==='invalid_package_roll');assert.deepEqual(f.g.snapshot(f.a.id).inventory,before);
 f.g.packageRoll=()=>0;const req={id:pack.id,template_id:pack.template_id,bag:1,pos:pack.position,count:1,token:`VAVEYLA_ITEM_USE_V1:${pack.id}:${pack.template_id}:attempt-0001`};
 const result=f.g.tx(f.a.id,r=>f.g.consumeItemRequest(r,req));const inv=f.g.snapshot(f.a.id).inventory;assert.equal(result.reward.items[0].template_id,2180300);
 f.g.tx(f.a.id,r=>f.g.consumeItemRequest(r,req));assert.deepEqual(f.g.snapshot(f.a.id).inventory,inv);
 assert.throws(()=>f.g.tx(f.a.id,r=>f.g.consumeItemRequest(r,{...req,token:`VAVEYLA_ITEM_USE_V1:${pack.id}:${pack.template_id}:attempt-0002`})),e=>e.code==='item_not_owned');
 // One batch stack occupies one slot, while two different rewards need two slots.
 const batch=add(f,2125066,2);for(let n=0;n<98;n++){try{f.g.tx(f.a.id,r=>f.g.addItem(r,1011101,1));}catch(e){if(e.code!=='bag_full')throw e;break;}}
 const positions=f.g.snapshot(f.a.id).inventory.filter(i=>i.bag===1).length;assert.equal(positions,100);
 const plan=packagePlan(table('itemtemplate')[2125066]);f.g.packageRoll=()=>plan.total-1;
 // The real package permits one-at-a-time use; a full bag still leaves the consumed slot available.
 const opened=f.g.tx(f.a.id,r=>f.g.useItem(r,batch.id,1));assert.equal(opened.reward.mailed_items[0].template_id,plan.weighted.at(-1).template_id);assert.equal((opened.reward.items??[]).reduce((n,i)=>n+i.count,0)+(opened.reward.mailed_items??[]).reduce((n,i)=>n+i.count,0),1);
});

function nativeItem(send,itemAt){const ctx=vm.createContext({Date,Math,yo:class{},dJ:{Instance:{getItemByPOB:itemAt}},Bn:{U_C_BAG_USEITEM:5006},vZ:{Instance:{send}}});let src=fs.readFileSync(new URL('./fixtures/client-item-use-out.js',import.meta.url),'utf8');for(const[a,b]of jsonFile('client-patches.json').patches)if(src.includes(a))src=src.replace(a,b);vm.runInContext(src,ctx);return new ctx.NativeItemUse();}

test('native Use5006 opens all named packs and activates Mini Spaceship with4427; packet retries preserve exactly one grant',async t=>{
 const app=await networkFixture(t),a=app.store.register('package_wire','package-wire-password-123');app.store.createRole(a.id,'PackageWire',1,1);app.game.snapshot(a.id);app.store.run('update characters set level=80,gold=100000,diamonds=1000 where account_id=?',a.id);
 app.game.sourceCatalog=()=>new Map([[8235,{TemplateId:8235,NeedItemId_O:0,NeedMountGrade:0,Property1:150}]]);
 const ids=[2125061,2125062,2125066,2183015];app.game.tx(a.id,r=>{for(const id of ids)app.game.addItem(r,id,1);});const pending=app.game.snapshot(a.id).inventory.filter(i=>ids.includes(i.template_id));
 const login=app.store.login(a.username,'package-wire-password-123'),key='b'.repeat(32);app.store.issueTicket(a.id,key,login.token,'local');const c=await enter(app,a,key);t.after(()=>c.ws.terminate());let req;const sender=nativeItem((code,body)=>{req=JSON.parse(JSON.stringify(body));c.send(code,'item.ItemUseMsg',req);},pos=>{const i=app.game.snapshot(a.id).inventory.find(i=>i.bag===1&&i.position===pos);return i?{id:i.id,templateId:i.template_id}:null;});
 const packets=[];const flush=async()=>{c.send(20008);for(let i=0;i<100;i++){const p=await c.receive();if(p.code===4234)return;packets.push(p);}throw Error('item reply limit');};
 for(const item of pending){sender.sendUseItem(item.position);assert.match(req.battleId,new RegExp('^VAVEYLA_ITEM_USE_V1:'+item.id+':'+item.template_id+':'));await flush();const inv=app.game.snapshot(a.id).inventory;c.send(5006,'item.ItemUseMsg',req);await flush();assert.deepEqual(app.game.snapshot(a.id).inventory,inv);}
 assert.equal(app.game.ownedMounts(app.store.role(a.id))[0].template_id,8235);assert.ok(packets.some(p=>p.code===4427));
 assert.equal(app.store.get('select count(*) n from game_item_use_actions').n,4);
});
