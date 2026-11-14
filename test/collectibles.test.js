import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import vm from 'node:vm';
import {Store} from '../src/store.js';
import {Game} from '../src/game.js';
import {game,table} from '../src/catalog.js';
import {jsonFile} from '../src/util.js';
import {runtimeCatalog} from '../src/runtime-catalog.js';
import {zipSync,strToU8} from 'fflate';
import {Assets} from '../src/assets.js';
import {encode,decode} from '../src/pb.js';
import {fixture as networkFixture,enter} from './network.test.js';
function sources(g){const card=game.itemtemplate.find(t=>t.SonType===218&&t.Property2<0&&t.Property1>0);assert.ok(card);const mount={TemplateId:card.Property1,NeedItemId_O:card.TemplateId,NeedMountGrade:0,Property1:150,Power:17};const rune={TemplateId:2001,RuneGrade:1,RuneType:2,RuneIndex:2,NeedGrade:1};g.sourceCatalog=n=>new Map((n==='mounttemplate'?[mount]:[rune]).map(t=>[t.TemplateId,t]));return {card,mount,rune};}
async function setup(t){const dir=fs.mkdtempSync(os.tmpdir()+'/vaveyla-collectibles-');let now=1794375635,s=await new Store(dir+'/p.sqlite3',{clock:()=>now}).initialize(),g=new Game(s);const a=s.register('collectibles','collectibles-password-123');s.createRole(a.id,'CollectibleHero',1,1);g.snapshot(a.id);s.run('update characters set level=80,gold=100000,diamonds=1000 where account_id=?',a.id);const src=sources(g);t.after(()=>{s.close();fs.rmSync(dir,{recursive:true});});return {a,src,get s(){return s;},get g(){return g;},get r(){return s.role(a.id);},advance:n=>now+=n,restart:async()=>{s.close();s=await new Store(dir+'/p.sqlite3',{clock:()=>now}).initialize();g=new Game(s);sources(g);}};}
function add(f,id,count=1){f.g.tx(f.a.id,r=>f.g.addItem(r,id,count));return f.g.snapshot(f.a.id).inventory.find(i=>i.template_id===id&&i.bag===1);}

test('gem inlay consumes one owned gem, persists joins and stats, rejects duplicate type and returns the gem with source extraction fee',async t=>{
 const f=await setup(t),gear=add(f,1011102),gem=add(f,2050101,2),hp=add(f,2050601);f.g.tx(f.a.id,r=>f.g.moveItem(r,gear.id,4,0,1));const attack=f.g.snapshot(f.a.id).combat.physical_attack;
 f.g.tx(f.a.id,r=>f.g.moveItem(r,gear.id,0,0,1));f.g.tx(f.a.id,r=>f.g.inlayGem(r,1,1,gem.position));
 assert.equal(f.g.snapshot(f.a.id).inventory.find(i=>i.id===gear.id).join_1,2050101);assert.equal(f.g.snapshot(f.a.id).inventory.find(i=>i.id===gem.id).count,1);
 assert.throws(()=>f.g.tx(f.a.id,r=>f.g.inlayGem(r,2,1,gem.position)),e=>e.code==='gem_type_duplicate');
 f.g.tx(f.a.id,r=>f.g.recoverForgeItems(r));assert.equal(f.g.snapshot(f.a.id).combat.physical_attack,attack+32);
 await f.restart();assert.equal(f.g.snapshot(f.a.id).inventory.find(i=>i.id===gear.id).join_1,2050101);
 f.g.tx(f.a.id,r=>f.g.moveItem(r,gear.id,0,0,1));const gold=f.r.gold;f.g.tx(f.a.id,r=>f.g.removeGem(r,1));assert.equal(f.r.gold,gold-table('itemtemplate')[2050101].Property3);assert.equal(f.g.itemGems(f.r,gear.id).length,0);
 assert.equal(f.g.snapshot(f.a.id).inventory.filter(i=>i.template_id===2050101).reduce((n,i)=>n+i.count,0),2);
 f.g.tx(f.a.id,r=>f.g.inlayGem(r,3,1,hp.position));f.g.tx(f.a.id,r=>f.g.recoverForgeItems(r));f.g.tx(f.a.id,r=>f.g.moveItem(r,gear.id,1,f.g.freePosition(r),1));
 assert.throws(()=>f.g.tx(f.a.id,r=>f.g.sellItem(r,gear.id,1)),e=>e.code==='item_has_gems');f.g.tx(f.a.id,r=>f.g.arrangeItems(r,1));assert.equal(f.g.itemGems(f.r,gear.id)[0].gem_template_id,2050601);
});

test('mount activation consumes source card once and persists permanent status and bonuses; rune learning consumes its matching stone once',async t=>{
 const f=await setup(t),card=add(f,f.src.card.TemplateId,2),stone=add(f,3020002,2),before=f.g.snapshot(f.a.id).combat.physical_attack;
 f.g.tx(f.a.id,r=>f.g.activateMount(r,f.src.mount.TemplateId,0));f.g.tx(f.a.id,r=>f.g.activateMount(r,f.src.mount.TemplateId,0));
 assert.equal(f.g.snapshot(f.a.id).inventory.filter(i=>i.template_id===card.template_id).reduce((n,i)=>n+i.count,0),1);assert.equal(f.g.mountList(f.r).avatarInfo[0].expairDate,'2000-01-01 00:00:00');assert.equal(f.g.snapshot(f.a.id).combat.physical_attack,before+17*4);
 f.g.tx(f.a.id,r=>f.g.learnRune(r,f.src.rune.TemplateId,stone.position,1));f.g.tx(f.a.id,r=>f.g.learnRune(r,f.src.rune.TemplateId,stone.position,1));assert.equal(f.g.snapshot(f.a.id).inventory.filter(i=>i.template_id===stone.template_id).reduce((n,i)=>n+i.count,0),1);assert.equal(f.g.runePacket(f.r).runeinfo[0].runeId,2001);
 await f.restart();assert.equal(f.g.ownedMounts(f.r).length,2);assert.equal(f.g.runePacket(f.r).runeinfo.length,1);
});

test('runtime catalog validates rows and prefers the active client over a different original copy',()=>{
 const dir=fs.mkdtempSync(os.tmpdir()+'/vaveyla-runtime-catalog-');try{fs.mkdirSync(dir+'/xml');fs.writeFileSync(dir+'/xml/t_s_mounttemplate-a123456789.json',JSON.stringify([{TemplateId:7,NeedItemId_O:2180002}]));const assets=new Assets(dir);assert.equal(runtimeCatalog(assets,'mounttemplate').get(7).NeedItemId_O,2180002);assert.throws(()=>runtimeCatalog(assets,'../private'),e=>e.code==='unknown_runtime_catalog');assert.throws(()=>runtimeCatalog(assets,'runetemplate'),e=>e.code==='source_catalog_missing');fs.writeFileSync(dir+'/xml/t_s_runetemplate.json',JSON.stringify([{TemplateId:2},{TemplateId:2}]));assert.throws(()=>runtimeCatalog(assets,'runetemplate'),e=>e.code==='invalid_source_catalog');fs.mkdirSync(dir+'/other/xml',{recursive:true});fs.writeFileSync(dir+'/other/xml/t_s_mounttemplate.json',JSON.stringify([{TemplateId:8}]));assert.equal(runtimeCatalog(new Assets(dir,dir+'/other'),'mounttemplate').get(7).NeedItemId_O,2180002);}finally{fs.rmSync(dir,{recursive:true});}
});

function native(send){const proto={campaign:{CampaignReqMsg:class{}}};const ctx=vm.createContext({com:{road:{yishi:{proto}}},Bn:{U_C_ITEM_INLAY:5151,U_C_ITEM_INLAYJOIN:5152,U_C_HERO_RUNE_OP:8605,C_MOUNTAVATAR_ACTIVE:8536},vZ:{Instance:{send}},Tr:{RUNE_STUDY:1,RUNE_TAKE:3,RUNE_HOLE_ACTIVE:4,RUNE_HOLE_CARVE:5,RUNE_HOLE_REPLACE:6},n0:{Instance:{army:{userId:1}}},G$:{Instance:{currentPlayerModel:{playerInfo:{}}}},B:{Instance:{GetTranslation:s=>s}},a6:{Instance:{show(){}}},rn:{Instance:{sendNotification(){}}},je:{RUNE_UPGRADE:1},ho:{parse:s=>new Date(s.replace(' ','T')+'Z')},$p:class{},nZ:{Instance:{getChannel:()=>({postTDAnalyticsEvent(){}})}},Er:{sqh5_C_mount_unlock:1}});let src=fs.readFileSync(new URL('./fixtures/client-collectibles.js',import.meta.url),'utf8');for(const[a,b]of jsonFile('client-patches.json').patches)if(src.includes(a))src=src.replace(a,b);vm.runInContext(src,ctx);return ctx;}

test('native mount/rune/gem buttons over encrypted websocket update inventory and original model handlers without inventing protobuf tags',async t=>{
 const app=await networkFixture(t),a=app.store.register('collectible_wire','collectible-wire-password-123');app.store.createRole(a.id,'CollectWire',1,1);app.game.snapshot(a.id);app.store.run('update characters set level=80,gold=100000 where account_id=?',a.id);const activeLoader=app.game.sourceCatalog,src=sources(app.game);
 const catalogDir=fs.mkdtempSync(os.tmpdir()+'/vaveyla-wire-catalog-');t.after(()=>fs.rmSync(catalogDir,{recursive:true}));
 const clientRoot=catalogDir+'/client',originalRoot=catalogDir+'/original';for(const root of [clientRoot,originalRoot])fs.mkdirSync(root+'/xml',{recursive:true});
 fs.writeFileSync(clientRoot+'/xml/t_s_mounttemplate-a123456789.json',JSON.stringify([src.mount]));
 fs.writeFileSync(clientRoot+'/xml/t_s_runetemplate-b123456789.json',JSON.stringify([src.rune]));
 fs.writeFileSync(clientRoot+'/xml/t_s_mounttemplate.json',JSON.stringify([{...src.mount,NeedItemId_O:0,Property1:999999}]));
 fs.writeFileSync(originalRoot+'/xml/t_s_mounttemplate.json',JSON.stringify([{...src.mount,NeedMountGrade:999}]));
 fs.writeFileSync(clientRoot+'/version.zip',zipSync({'version.json':strToU8(JSON.stringify({'xml/t_s_mounttemplate.json':'xml/t_s_mounttemplate-a123456789.json','xml/t_s_runetemplate.json':'xml/t_s_runetemplate-b123456789.json'}))}));
 app.assets=new Assets(clientRoot,originalRoot);app.game.sourceCatalog=activeLoader;
 app.game.tx(a.id,r=>{for(const id of [src.card.TemplateId,3020002,1011102,2050101])app.game.addItem(r,id,1);});const inv=app.game.snapshot(a.id).inventory,gear=inv.find(i=>i.template_id===1011102),gem=inv.find(i=>i.template_id===2050101),stone=inv.find(i=>i.template_id===3020002);
 const login=app.store.login(a.username,'collectible-wire-password-123'),key='a'.repeat(32);app.store.issueTicket(a.id,key,login.token,'local');const c=await enter(app,a,key);t.after(()=>c.ws.terminate());
 const ctx=native((code,body)=>c.send(code,'campaign.CampaignReqMsg',JSON.parse(JSON.stringify(body)))),out=new ctx.NativeCollectibleSend(),mount=new ctx.NativeMountReply(),rune=new ctx.NativeRuneReply();const active=new Map();mount._mountInfo={};mount.currentActiveId=src.mount.TemplateId;mount._avatarList={clear:()=>active.clear(),clearHideMountFramSpecialList(){},addWildSoul:m=>active.set(m.templateId,m),dispatchChangeEvent(){},getWildSoulInfo:id=>active.get(id)};
 const learned={grade:0,runeCurGp:0,commit(){}};rune.thane={runeCate:{getInfoByIndex:()=>learned}};ctx.I_t={Instance:{getTemplateByID:()=>src.rune}};ctx.u_t={t_s_runetemplate:1};
 const flush=async()=>{c.send(20008);for(let i=0;i<100;i++){const p=await c.receive();if(p.code===4234)return;if(p.code===4427)mount.__onMountListUpdate({readBody:()=>decode('campaign.CampaignReqMsg',p.payload)});if(p.code===4495)rune.__runeOperateHandler({readBody:()=>decode('campaign.CampaignReqMsg',p.payload)});}throw Error('reply limit');};
 out.activateMount(src.mount.TemplateId);await flush();assert.ok(active.has(src.mount.TemplateId));
 ctx.NativeCollectibleSend.sendStudyRune(src.rune.TemplateId,stone.position);await flush();assert.equal(learned.grade,1);assert.equal(learned.runeId,src.rune.TemplateId);
 c.send(5005,'item.ItemReqMsg',{beginObjId:0,objectId:0,beginBagType:1,beginPos:gear.position,endObjId:0,endBagType:0,endPos:0,count:1});await flush();ctx.NativeCollectibleSend.sendItemMount(1,gem.position,1);await flush();assert.equal(app.game.itemGems(app.store.role(a.id),gear.id)[0].gem_template_id,2050101);
 const full=app.game.snapshot(a.id);assert.equal(full.runes.runeinfo.length,1);
});


test('runtime catalog selects manifest-published XML instead of stale logical/original copies, matching the browser resource',()=>{
 const dir=fs.mkdtempSync(os.tmpdir()+'/vaveyla-catalog-version-');
 try{
  const client=dir+'/client',original=dir+'/original';for(const root of [client,original])fs.mkdirSync(root+'/xml',{recursive:true});
  const logical='xml/t_s_mounttemplate.json',published='xml/t_s_mounttemplate-a123456789.json';
  fs.writeFileSync(client+'/'+logical,JSON.stringify([{TemplateId:7,Property1:1}]));
  fs.writeFileSync(client+'/'+published,JSON.stringify([{TemplateId:9,Property1:150}]));
  fs.writeFileSync(original+'/'+logical,JSON.stringify([{TemplateId:8,Property1:999}]));
  fs.writeFileSync(client+'/version.zip',zipSync({'version.json':strToU8(JSON.stringify({[logical]:published}))}));
  const assets=new Assets(client,original),rows=runtimeCatalog(assets,'mounttemplate');
  assert.deepEqual([...rows.keys()],[9,990001]);assert.equal(rows.get(9).Property1,150);
  assert.equal(JSON.parse(fs.readFileSync(assets.locate(published),'utf8'))[0].TemplateId,[...rows.keys()][0]);
 }finally{fs.rmSync(dir,{recursive:true});}
});

test('runtime catalog falls back when client has no table but still rejects ambiguous active mappings and malformed active files',()=>{
 const dir=fs.mkdtempSync(os.tmpdir()+'/vaveyla-catalog-fallback-');
 try{
  const client=dir+'/client',original=dir+'/original';for(const root of [client,original])fs.mkdirSync(root+'/xml',{recursive:true});
  fs.writeFileSync(original+'/xml/t_s_runetemplate.json',JSON.stringify([{TemplateId:21}]));
  assert.equal(runtimeCatalog(new Assets(client,original),'runetemplate').get(21).TemplateId,21);
  fs.mkdirSync(client+'/a');fs.mkdirSync(client+'/b');const one='a/t_s_mounttemplate-a123456789.json',two='b/t_s_mounttemplate-b123456789.json';
  fs.writeFileSync(client+'/'+one,JSON.stringify([{TemplateId:1}]));fs.writeFileSync(client+'/'+two,JSON.stringify([{TemplateId:2}]));
  fs.writeFileSync(client+'/version.zip',zipSync({'version.json':strToU8(JSON.stringify({'a/t_s_mounttemplate.json':one,'b/t_s_mounttemplate.json':two}))}));
  assert.throws(()=>runtimeCatalog(new Assets(client,original),'mounttemplate'),e=>e.code==='source_catalog_ambiguous');
  fs.writeFileSync(client+'/xml/t_s_runetemplate.json','{broken');
  assert.throws(()=>runtimeCatalog(new Assets(client,original),'runetemplate'),e=>e.code==='invalid_source_catalog');
 }finally{fs.rmSync(dir,{recursive:true});}
});
