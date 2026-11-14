import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {Store} from '../src/store.js';
import {Game} from '../src/game.js';
import {Assets} from '../src/assets.js';
import {runtimeCatalog} from '../src/runtime-catalog.js';
import {SPHYNX} from '../src/custom-mount.js';
import {jsonFile,ROOT} from '../src/util.js';
import {encode,decode} from '../src/pb.js';
import * as packets from '../src/packets.js';
import {fixture,enter} from './network.test.js';

async function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vaveyla-sphynx-'));let s=await new Store(dir+'/players.sqlite3').initialize(),g=new Game(s);const a=s.register('sphynx_owner','sphynx-password-123');s.createRole(a.id,'SphynxHero',1,1);g.snapshot(a.id);t.after(()=>{s.close();fs.rmSync(dir,{recursive:true});});return {a,get s(){return s;},get g(){return g;},get r(){return s.role(a.id);},restart:async()=>{s.close();s=await new Store(dir+'/players.sqlite3').initialize();g=new Game(s);}};}

test('Sphynx activates free once, selection/ride persist across SQLite reopen, ownership and expiry cannot be bypassed',async t=>{
 const f=await setup(t),gold=f.r.gold,diamonds=f.r.diamonds;
 assert.throws(()=>f.g.tx(f.a.id,r=>f.g.selectMount(r,990001)),e=>e.code==='mount_not_owned');
 f.g.tx(f.a.id,r=>f.g.activateMount(r,990001,0));f.g.tx(f.a.id,r=>f.g.activateMount(r,990001,0));assert.equal(f.g.ownedMounts(f.r).length,1);assert.equal(f.r.gold,gold);assert.equal(f.r.diamonds,diamonds);
 f.g.tx(f.a.id,r=>f.g.selectMount(r,990001));assert.equal(packets.fullArmy(f.r,f.g.snapshot(f.a.id))[2].mountTempId,990001);
 await f.restart();assert.deepEqual(f.g.mountState(f.r),{selected:990001,mounted:true,grade:1});
 f.g.tx(f.a.id,r=>f.g.rideMount(r,0));assert.equal(f.g.mountState(f.r).mounted,false);assert.equal(packets.fullArmy(f.r,f.g.snapshot(f.a.id))[2].mountTempId,0);
 f.g.tx(f.a.id,r=>f.g.rideMount(r,1));const before=f.g.mountState(f.r);assert.throws(()=>f.g.tx(f.a.id,r=>f.g.selectMount(r,1000)),e=>e.code==='mount_not_owned');assert.deepEqual(f.g.mountState(f.r),before);
 f.s.run('update game_mounts set expires_at=? where character_id=?',f.s.clock()-1,f.r.id);assert.equal(f.g.mountState(f.r).mounted,false);assert.throws(()=>f.g.tx(f.a.id,r=>f.g.rideMount(r,1)),e=>e.code==='mount_not_selected');
});

test('custom catalog entry survives named source table and the native packed/unpacked dictionary registration without duplicates',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vaveyla-sphynx-catalog-'));try{fs.mkdirSync(root+'/xml');fs.writeFileSync(root+'/xml/t_s_mounttemplate.json',JSON.stringify({t_s_mounttemplate:[{TemplateId:1000,AvatarPath:'/mount_horse_white'}]}));assert.equal(runtimeCatalog(new Assets(root),'mounttemplate').get(990001).TemplateName_tr,'Sfenks Muhafızı');
 const [a,b]=jsonFile('client-patches.json').patches.find(([a])=>a.startsWith('parseConfigToDic(t,e,i){'));const prefix=b.slice('parseConfigToDic(t,e,i){'.length,b.indexOf('this.configMapDic[t]'));
 const ctx=vm.createContext({R:()=>({key:'tr'})});vm.runInContext(fs.readFileSync(new URL('./fixtures/client-sphynx-mount.js',import.meta.url),'utf8'),ctx);ctx.e={mDataList:[{TemplateId:1000}]};ctx.t='t_s_mounttemplate';vm.runInContext(prefix,ctx);vm.runInContext(prefix,ctx);assert.equal(ctx.e.mDataList.length,2);assert.equal(ctx.e.mDataList[1].AvatarPath,SPHYNX.AvatarPath);assert.equal(ctx.e.mDataList[1].TemplateNameLang,'Sfenks Muhafızı');
 ctx.e={mDataList:[]};ctx.t='t_s_other';vm.runInContext(prefix,ctx);assert.equal(ctx.e.mDataList.length,0);
 }finally{fs.rmSync(root,{recursive:true});}
});

test('all 55 source map frame names and 26 preview frames resolve to valid transparent custom atlases through Assets',()=>{
 const assets=new Assets();for(const [kind,count,suffix]of [['swf/avatar',55,''],['equip_show',26,''],['equip_show',26,'_s']]){
 const logical=`res/animation/${kind}/mount_vaveyla_sphynx${suffix}/2/2.json`,file=assets.locate(logical);assert.ok(file);const d=JSON.parse(assets.body(logical,file));assert.equal(Object.keys(d.frames).length,count);assert.equal(d.meta.prefix,`./${kind}/mount_vaveyla_sphynx${suffix}/2/`);
 const png=fs.readFileSync(assets.locate(logical.replace('.json','.png'))),w=png.readUInt32BE(16),h=png.readUInt32BE(20);assert.equal(png[25],6);for(const f of Object.values(d.frames)){assert.ok(f.frame.x>=0&&f.frame.y>=0&&f.frame.x+f.frame.w<=w&&f.frame.y+f.frame.h<=h);}
 if(kind==='swf/avatar'){assert.ok(d.extra.walksPara);for(let x=0;x<8;x++)for(let y=0;y<5;y++)assert.ok(d.frames[`W_${x}_${y}.png`]);}
 }assert.equal(assets.locate('res/animation/swf/avatar/mount_vaveyla_sphynx/2/../../private.sqlite3'),null);
});

async function drain(c){c.send(20008);const rows=[];for(let i=0;i<150;i++){const p=await c.receive();if(p.code===4234)return rows;rows.push(p);}throw Error('reply limit');}
test('native mount activate/select/ride buttons over encrypted websocket update own and Sky avatars without recreating the scene',async t=>{
 const app=await fixture(t),a=app.store.register('sphynx_wire','sphynx-wire-password-123');app.store.createRole(a.id,'SphynxWire',1,1);app.game.snapshot(a.id);app.store.run('update characters set level=80 where account_id=?',a.id);
 const login=app.store.login(a.username,'sphynx-wire-password-123'),key='f'.repeat(32);app.store.issueTicket(a.id,key,login.token,'local');const c=await enter(app,a,key);t.after(()=>c.ws.terminate());c.send(8688,'simple.PropertyMsg',{param1:10000});await drain(c);
 let commits=0;const own={commit(){commits++;}},space={commit(){commits++;}},ctx=vm.createContext({com:{road:{yishi:{proto:{campaign:{CampaignReqMsg:class{}}}}}},Bn:{C_MOUNT_CHANGE:8532,C_ARMYMOUNT_AVATARCHANGE:8533},vZ:{Instance:{send:(code,body)=>c.send(code,'campaign.CampaignReqMsg',JSON.parse(JSON.stringify(body)))}},n0:{Instance:{army:own}},YU:{Instance:{model:{selfArmy:space}}}});
 let source=fs.readFileSync(new URL('./fixtures/client-sphynx-mount.js',import.meta.url),'utf8');for(const[a,b]of jsonFile('client-patches.json').patches)if(source.includes(a))source=source.replace(a,b);vm.runInContext(source,ctx);const native=new ctx.NativeMountRide();native._mountInfo={dispatchChangeEvent(){}};
 c.send(8536,'campaign.CampaignReqMsg',{paraInt1:990001,paraInt2:0});await drain(c);native.changeMount(990001);
 let rows=await drain(c);assert.ok(!rows.some(p=>[4595,4606,22].includes(p.code)));let reply=rows.find(p=>p.code===4426);assert.ok(reply);native.__onMountInfoUpdate({readBody:()=>decode('campaign.CampaignReqMsg',reply.payload)});assert.equal(own.mountTemplateId,990001);assert.equal(space.mountTemplateId,990001);assert.equal(native._mountInfo.templateId,990001);
 native.dismount();rows=await drain(c);reply=rows.find(p=>p.code===4426);native.__onMountInfoUpdate({readBody:()=>decode('campaign.CampaignReqMsg',reply.payload)});assert.equal(space.mountTemplateId,0);
 native.mount();rows=await drain(c);reply=rows.find(p=>p.code===4426);native.__onMountInfoUpdate({readBody:()=>decode('campaign.CampaignReqMsg',reply.payload)});assert.equal(space.mountTemplateId,990001);assert.ok(commits>=6);
 const res=await fetch('http://127.0.0.1:'+app.httpPort+'/res/animation/swf/avatar/mount_vaveyla_sphynx/2/2.json');assert.equal(res.status,200);assert.equal(Object.keys((await res.json()).frames).length,55);
});
