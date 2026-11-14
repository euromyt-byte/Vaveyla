import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {Store} from '../src/store.js';
import {Game} from '../src/game.js';
import {table} from '../src/catalog.js';
import {SPHYNX} from '../src/custom-mount.js';
import {jsonFile} from '../src/util.js';
import {decode} from '../src/pb.js';
import {fixture,enter} from './network.test.js';

async function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vaveyla-polish-')),s=await new Store(dir+'/p.sqlite3').initialize(),g=new Game(s),a=s.register('polish_owner','polish-password-123');s.createRole(a.id,'PolishHero',1,1);g.snapshot(a.id);s.run('update characters set level=80,gold=100000 where account_id=?',a.id);t.after(()=>{s.close();fs.rmSync(dir,{recursive:true});});return {s,g,a,get r(){return s.role(a.id);}};}
function add(f,id,count=1){f.g.tx(f.a.id,r=>f.g.addItem(r,id,count));return f.g.snapshot(f.a.id).inventory.find(i=>i.template_id===id&&i.bag===1);}

test('worn equipment and its HP gem remain active while staged in forge, updating combat power immediately and preserving it on close',async t=>{
 const f=await setup(t),gear=add(f,1011102),gem=add(f,2050602);f.g.tx(f.a.id,r=>f.g.moveItem(r,gear.id,4,0,1));const before=f.g.snapshot(f.a.id).combat;
 f.g.tx(f.a.id,r=>f.g.moveItem(r,gear.id,0,0,1));assert.deepEqual(f.g.snapshot(f.a.id).combat,before);
 f.g.tx(f.a.id,r=>f.g.inlayGem(r,1,1,gem.position));const live=f.g.snapshot(f.a.id).combat,boost=table('itemtemplate')[gem.template_id].Live;assert.ok(boost>0);assert.equal(live.max_hp-before.max_hp,boost);assert.equal(live.fighting_capacity-before.fighting_capacity,Math.floor(boost/5));
 f.g.tx(f.a.id,r=>f.g.recoverForgeItems(r));assert.deepEqual(f.g.snapshot(f.a.id).combat,live);
 // The same item in bag 1 is a forge target, not worn equipment.
 f.g.tx(f.a.id,r=>f.g.moveItem(r,gear.id,1,f.g.freePosition(r),1));const unequipped=f.g.snapshot(f.a.id).combat;f.g.tx(f.a.id,r=>f.g.moveItem(r,gear.id,0,0,1));assert.deepEqual(f.g.snapshot(f.a.id).combat,unequipped);
});

test('every character opening mounts receives permanent free Sphynx and a preview selection without mounting, debits or duplicate grants',async t=>{
 const f=await setup(t),b=f.s.register('polish_other','polish-password-123');f.s.createRole(b.id,'PolishOther',1,1);f.g.snapshot(b.id);
 for(const a of [f.a,b]){const before=f.s.role(a.id);for(let i=0;i<3;i++)f.g.tx(a.id,r=>f.g.mountList(r));const r=f.s.role(a.id);assert.equal(f.g.ownedMounts(r).filter(m=>m.template_id===990001).length,1);assert.deepEqual(f.g.mountState(r),{selected:990001,mounted:false,grade:1});assert.equal(r.gold,before.gold);assert.equal(r.diamonds,before.diamonds);assert.equal(f.g.ownedMounts(r)[0].expires_at,0);}
});

async function drain(c){c.send(20008);const rows=[];for(let i=0;i<150;i++){const p=await c.receive();if(p.code===4234)return rows;rows.push(p);}throw Error('reply limit');}
test('real native mount panel receives a default preview and working Bin button; live avatars update before mount UI listeners run',async t=>{
 const app=await fixture(t),a=app.store.register('polish_wire','polish-wire-password');app.store.createRole(a.id,'PolishWire',1,1);app.game.snapshot(a.id);app.store.run('update characters set level=80 where account_id=?',a.id);const login=app.store.login(a.username,'polish-wire-password'),key='a'.repeat(32);app.store.issueTicket(a.id,key,login.token,'local');const c=await enter(app,a,key);t.after(()=>c.ws.terminate());c.send(8688,'simple.PropertyMsg',{param1:10000});await drain(c);
 const own={mountTemplateId:0,commit(){}},space={mountTemplateId:0,curMultiMountIdentity:0,commit(){}},ctx=vm.createContext({console,Date,com:{road:{yishi:{proto:{campaign:{CampaignReqMsg:class{}}}}}},Bn:{C_MOUNT_CHANGE:8532,C_ARMYMOUNT_AVATARCHANGE:8533},vZ:{Instance:{send:(code,body)=>c.send(code,'campaign.CampaignReqMsg',JSON.parse(JSON.stringify(body)))}},n0:{Instance:{army:own,thane:{changeShapeId:0}}},YU:{Instance:{model:{selfArmy:space,canLand:()=>true}}},s6:{Instance:{currentType:'SPACE_SCENE'}},sa:{SPACE_SCENE:'SPACE_SCENE'},Mc:{NONE_TYPE:0},Wk:{isInSpace:true,isInCampaign:false},a6:{Instance:{show:msg=>{throw Error(msg);}}},B:{Instance:{GetTranslation:s=>s}},r:class{dispatchEvent(){if(this.listener)this.listener();}},d:class{},mJ:{Instance:{getTemplatesByType:id=>id===19?[{Data:0,Grades:1},{Data:20,Grades:2}]:[{Data:0,Grades:1},{Data:10,Grades:2}],getMountTemplateById:id=>id===990001?SPHYNX:null}},Qa:{sortOn:rows=>rows},Xa:{NUMERIC:1},Gi:{MOUNT_INFO_CHANGE:1}});
 let source=fs.readFileSync(new URL('./fixtures/client-sphynx-mount.js',import.meta.url),'utf8')+'\n'+fs.readFileSync(new URL('./fixtures/client-mount-panel.js',import.meta.url),'utf8');for(const[a,b]of jsonFile('client-patches.json').patches)if(source.includes(a))source=source.replace(a,b);vm.runInContext(source,ctx);const native=new ctx.NativeMountRide();native._mountInfo=new ctx.NativeMountInfo();ctx.dm={Instance:native};
 const apply=rows=>{for(const p of rows)if(p.code===4426)native.__onMountInfoUpdate({readBody:()=>decode('campaign.CampaignReqMsg',p.payload)});};
 c.send(8530);apply(await drain(c));assert.equal(native._mountInfo.template.AvatarPath,'/mount_vaveyla_sphynx');assert.ok(native._mountInfo.growExpMax>0);assert.equal(own.mountTemplateId,0);
 // Exercise the actual native item button, not a direct server operation.
 const item=new ctx.NativeMountItem();item._vData=SPHYNX;item.vData=SPHYNX;item._isLock=false;item._lastClickTime=0;
 native._mountInfo.listener=()=>{assert.equal(own.mountTemplateId,990001);assert.equal(space.mountTemplateId,990001);};item.mountBtnClick({stopPropagation(){}});const replies=await drain(c);assert.ok(!replies.some(p=>[4595,4606,22].includes(p.code)));apply(replies);assert.equal(app.game.mountState(app.store.role(a.id)).mounted,true);
});

test('unsupported market content reports missing reward definition without the obsolete real-payment warning and cannot grant currency',async t=>{
 const f=await setup(t),before=f.r.diamonds;assert.throws(()=>f.g.tx(f.a.id,r=>f.g.freeRecharge(r,'wartuneh5.giftpack.pay4.99',1)),e=>e.code==='source_catalog_missing'&&!e.message.includes('gerçek ödeme'));assert.equal(f.r.diamonds,before);
});
