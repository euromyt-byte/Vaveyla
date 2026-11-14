import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import vm from 'node:vm';
import {Store} from '../src/store.js';
import {Game} from '../src/game.js';
import {Battle} from '../src/battle.js';
import {table,nodes} from '../src/catalog.js';
import {Assets} from '../src/assets.js';
import {runtimeCatalog} from '../src/runtime-catalog.js';
import {jsonFile} from '../src/util.js';
import {Session} from '../src/session.js';
import {encode,decode} from '../src/pb.js';
async function setup(t){const dir=fs.mkdtempSync(os.tmpdir()+'/vaveyla-eight-'),s=await new Store(dir+'/db.sqlite3').initialize(),g=new Game(s),a=s.register('eight_owner','eight-owner-password');s.createRole(a.id,'EightHero',1,1);g.snapshot(a.id);s.run('update characters set level=80,gold=1000000 where account_id=?',a.id);t.after(()=>{s.close();fs.rmSync(dir,{recursive:true});});return {dir,s,g,a,get r(){return s.role(a.id);}};}
function mutate(f,method,...args){return f.g.tx(f.a.id,r=>f.g[method](r,...args));}
function item(f,id,count=1){mutate(f,'addItem',id,count);return f.g.all('select * from game_items where character_id=? and template_id=? and bag=1',f.r.id,id).at(-1);}
function req(token,fields){return {token:'VAVEYLA_CRAFT_V1:'+token,...fields};}
function request(f,code,body){return new Session({store:f.s,game:f.g}).gamePacket(f.r,{code,payload:body?encode('campaign.CampaignReqMsg',body):Buffer.alloc(0)},(m,...args)=>mutate(f,m,...args));}

test('Sky dialogue quests 963 and 966 claim in the source city once, while level and quest prerequisites remain enforced',async t=>{
 const f=await setup(t);for(const id of [963,966]){const q=table('questtemplate')[id];for(const previous of String(q.PreQuestId).match(/\d+/g)??[])f.s.run("insert or replace into game_quests(character_id,quest_id,status,accepted_at,claims,baseline_json) values(?,?,'claimed',0,1,'{}')",f.r.id,+previous);mutate(f,'acceptQuest',id);assert.throws(()=>mutate(f,'claimQuest',id),e=>e.code==='dialogue_requires_city');mutate(f,'enterSky');const out=mutate(f,'claimQuest',id);assert.equal(out.already_claimed,false);const gold=f.r.gold;assert.equal(mutate(f,'claimQuest',id).already_claimed,true);assert.equal(f.r.gold,gold);mutate(f,'leaveSky');}
 f.s.run('update characters set level=73 where account_id=?',f.a.id);assert.equal(f.g.questAvailable(f.r,table('questtemplate')[966]),false);
});

test('Agoran shield learns, absorbs damage for three hero turns, and victory settles within a quarter second',async t=>{
 const f=await setup(t);assert.ok(mutate(f,'learnSkill',11311).learned.includes(11311));const b=new Battle(f.g,f.r,1001),n=nodes(b.document.map_id).find(n=>[41,42].includes(n.MasterType)&&(n.Soldiers||n.Heros));b.move(f.r,{mapId:n.CampaignId,armyId:f.r.player_id,routes:[{x:n.Property1*20,y:n.Property2*20}],moveType:0});b.arrive(f.r,{paraInt1:n.Id,paraBool1:true});b.load(f.r,{battleId:b.id,armyId:f.r.player_id,serverName:'VAVEYLA'},0);
 const a=b.active;a.allowed_skills.push(11311);a.queued_skill=11311;a.auto.enabled=false;a.allies=[];a.rage=60;b.tick(b.nextDue);assert.equal(a.shield.hp,Math.floor(a.player_max_hp*.15));assert.equal(a.rage,30);const hp=a.player_hp,shield=a.shield.hp;a.actor=a.enemies[0].id;a.enemies[0].attack=1;b.tick(b.nextDue);assert.equal(a.player_hp,hp);assert.equal(a.shield.hp,shield-1);
 a.actor=1;a.queued_skill=a.normal;for(const e of a.enemies)e.hp=1;b.tick(b.nextDue);for(let i=0;i<20&&b.stage==='running';i++){b.active.actor=1;for(const e of a.enemies)if(e.hp>0)e.hp=1;b.tick(b.nextDue);}assert.equal(b.stage,'finishing');assert.equal(b.active.delay,.25);const rows=b.finish(f.r,b.nextDue);assert.equal(rows.filter(r=>r[0]===4103).length,1);assert.deepEqual(b.finish(f.r,b.nextDue??0),[]);
});

test('rage persists from one encounter to the next in a scene and through a database-backed reattach',async t=>{
 const f=await setup(t),b=new Battle(f.g,f.r,1001),encounters=nodes(b.document.map_id).filter(n=>n.NodeState!==9&&[41,42].includes(n.MasterType)&&(n.Soldiers||n.Heros));assert.ok(encounters.length>1);
 function arrive(n){b.move(f.r,{mapId:n.CampaignId,armyId:f.r.player_id,routes:[{x:n.Property1*20,y:n.Property2*20}],moveType:0});b.arrive(f.r,{paraInt1:n.Id,paraBool1:true});}
 arrive(encounters[0]);b.active.rage=79;for(const enemy of b.active.enemies)enemy.hp=0;b.active.stage='finishing';b.nextDue=0;b.finish(f.r,0);arrive(encounters[1]);assert.equal(b.active.rage,79);const reattach=new Battle(f.g,f.r,1001,true);assert.equal(reattach.active.rage,79);
});

test('source compose recipes create equipment and gems atomically, honor levels and counts, reject replay conflicts and preserve missing materials',async t=>{
 const f=await setup(t),recipe={Id:10,Types:1,NewMaterial:1011101,NeedMinLevel:10,NeedGold:200,Material1:208020,Count1:2};f.g.sourceCatalog=()=>new Map([[10,recipe]]);item(f,208020,5);const r=req('compose-first',{recipe:10,count:2}),gold=f.r.gold;const result=mutate(f,'composeItem',r);assert.equal(result.count,2);assert.equal(f.r.gold,gold-400);assert.equal(f.g.all('select count from game_items where template_id=208020')[0].count,1);assert.deepEqual(mutate(f,'composeItem',r),result);assert.equal(f.r.gold,gold-400);assert.throws(()=>mutate(f,'composeItem',{...r,count:1}),e=>e.code==='craft_request_conflict');const inventory=f.g.inventory(f.r);assert.throws(()=>mutate(f,'composeItem',req('missing-stuff',{recipe:10,count:2})),e=>e.code==='craft_material_missing');assert.deepEqual(f.g.inventory(f.r),inventory);assert.equal(f.r.gold,gold-400);
});

test('staged gem transforms are restricted to their source recipe and charge once',async t=>{
 const f=await setup(t),gems=Object.values(table('itemtemplate')).filter(t=>t.TransformId>0),source=gems[0],destination=gems.find(t=>t.TemplateId!==source.TemplateId&&t.TransformId===source.TransformId);assert.ok(destination);f.g.sourceCatalog=()=>new Map([[source.TransformId,{TemplateId:source.TransformId,Material1:source.TemplateId,Material2:destination.TemplateId,CostGold:10}]]);const i=item(f,source.TemplateId,1);mutate(f,'moveItem',i.id,0,0,1);const data=req('transform-first',{source:source.TemplateId,destination:destination.TemplateId,count:1}),gold=f.r.gold;mutate(f,'transformItem',data);mutate(f,'transformItem',data);assert.equal(f.r.gold,gold-10);assert.ok(f.g.inventory(f.r).some(i=>i.template_id===destination.TemplateId));assert.throws(()=>mutate(f,'transformItem',req('transform-fake',{source:source.TemplateId,destination:208020,count:1})),e=>e.code==='invalid_transform');
});

test('fashion collection contains locked catalog styles and permanently records owned styles; source EXP materials can be staged and merged',async t=>{
 const f=await setup(t);item(f,1120201);let book=mutate(f,'fashionBook');assert.ok(book.fashionIds.includes(1120201));assert.ok(book.fashionIds.length>book.info.length);assert.ok(book.info.some(i=>i.tempId===1120201));const soul=item(f,208020,3);mutate(f,'moveItem',soul.id,0,0,3);f.g.sourceCatalog=()=>new Map([['113:2',{Types:113,Grades:2,Data:400}],['113:3',{Types:113,Grades:3,Data:800}]]);const data=req('fashion-first',{count:3}),out=mutate(f,'composeFashion',data);assert.equal(out.grades,2);assert.equal(out.gp,200);assert.deepEqual(mutate(f,'composeFashion',data),out);assert.equal(f.g.fashionInfo(f.r).grades,2);assert.equal(f.g.inventory(f.r).some(i=>i.template_id===208020),false);
 const rows=request(f,8625);const body=rows.find(r=>r[0]===4542)[2];assert.ok(JSON.parse(body.paraString1.slice(24)).fashionIds.length>0);
});

test('runtime crafting catalogs use source Id and composite upgrade keys',async t=>{
 const f=await setup(t);fs.mkdirSync(f.dir+'/xml');fs.writeFileSync(f.dir+'/xml/t_s_compose.json',JSON.stringify({t_s_compose:[{Id:1,NewMaterial:1011101}]}));fs.writeFileSync(f.dir+'/xml/t_s_upgradetemplate.json',JSON.stringify({t_s_upgradetemplate:[{Id:1,TemplateId:0,Types:113,Grades:2,Data:400},{Id:2,TemplateId:0,Types:113,Grades:3,Data:800}]}));const assets=new Assets(f.dir);assert.equal(runtimeCatalog(assets,'compose').get(1).NewMaterial,1011101);assert.equal(runtimeCatalog(assets,'upgradetemplate').get('113:0:3').Data,800);
});

test('native Sky recovery finds reachable ground beyond the immediate blocked neighbors without enabling flying or changing other scenes',()=>{
 let source=fs.readFileSync(new URL('./fixtures/client-eight-fixes.js',import.meta.url),'utf8');for(const[a,b]of jsonFile('client-patches.json').patches)if(source.includes(a))source=source.replace(a,b);const ctx={Laya:{Point:class{constructor(x,y){this.x=x;this.y=y;}}},com:{road:{yishi:{proto:{campaign:{CampaignReqMsg:class{}}}}}},vZ:{Instance:{send(){}}}};vm.createContext(ctx);vm.runInContext(source,ctx);const sky=new ctx.SkyRecovery();sky._model={mapTempInfo:{Id:10000,Width:1000,Height:1000},getNeighborII(){throw Error('unsafe original neighbor');}};sky.getWalkable=(x,y)=>x>=10&&x<50&&y>=0&&y<50;sky._findPath={find:()=>[{}]};const p=sky.getStartPoint(100,100,{x:400,y:100});assert.equal(p.x,200);assert.ok(p.y>=0);sky.getWalkable=()=>false;assert.equal(sky.getStartPoint(100,100,{x:400,y:100}).x,-20);
});

test('equipment recipe upgrades preserve the worn slot, enhancement, bound state and socketed gems',async t=>{
 const f=await setup(t),gear=item(f,1011101),dest=Object.values(table('itemtemplate')).find(t=>t.TemplateId!==gear.template_id&&t.SonType===101&&t.StrengthenMax>=2&&t.NeedGrades<=80&&(t.Job.includes(0)||t.Job.includes(1))&&[1,2].includes(t.Sexs));assert.ok(dest);mutate(f,'moveItem',gear.id,4,0,1);f.s.run('insert into game_item_enhancements values(?,?,2)',gear.id,f.r.id);const gem=Object.values(table('itemtemplate')).find(t=>t.SonType===205);f.s.run('insert into game_item_gems values(?,?,?,?,1)',gear.id,f.r.id,1,gem.TemplateId);f.g.sourceCatalog=()=>new Map([[10,{Id:10,Types:3,NewMaterial:dest.TemplateId,NeedMinLevel:1,NeedGold:0,Material1:1011101,Count1:1}]]);mutate(f,'composeItem',req('upgraded-gear',{recipe:10,count:1}));const made=f.g.get('select * from game_items where character_id=? and bag=4 and position=0',f.r.id);assert.equal(made.template_id,dest.TemplateId);assert.equal(f.g.forgeGrade(f.r,made.id),2);assert.equal(f.g.itemGems(f.r,made.id)[0].gem_template_id,gem.TemplateId);assert.equal(made.bound,1);
});

test('native crafting sender reaches server rules and reply wrappers without guessing StoreReq field tags',async t=>{
 const f=await setup(t),calls=[],ctx={Date,Math,com:{road:{yishi:{proto:{campaign:{CampaignReqMsg:class{}}}}}},Bn:{U_C_ITEM_COMPOSE:5153,C_FASHION_COMPOSE:8594,C_ITEM_TRANSFORM:8538},vZ:{Instance:{send:(code,body)=>calls.push({code,body})}}};let source=fs.readFileSync(new URL('./fixtures/client-eight-fixes.js',import.meta.url),'utf8');for(const[a,b]of jsonFile('client-patches.json').patches)if(source.includes(a))source=source.replace(a,b);vm.createContext(ctx);vm.runInContext(source,ctx);const sender=Object.values(ctx).find(x=>typeof x?.sendCompose==='function');assert.ok(sender);f.g.sourceCatalog=()=>new Map([[10,{Id:10,Types:1,NewMaterial:1011101,NeedMinLevel:1,NeedGold:0,Material1:208020,Count1:1}]]);item(f,208020);sender.sendCompose(10,1);assert.equal(calls[0].code,5153);const rows=request(f,5153,calls[0].body);assert.ok(rows.some(r=>r[0]===89));for(const[,name,body]of rows)decode(name,encode(name,body));assert.ok(f.g.inventory(f.r).some(i=>i.template_id===1011101));
});

test('a collected style remains wearable after being merged, without minting duplicate inventory items',async t=>{
 const f=await setup(t),hat=item(f,1100201);mutate(f,'fashionBook');f.s.run('delete from game_items where id=?',hat.id);mutate(f,'changeFashion',{flag:1,status:'1,1,1,1',hatAvata:1100201,clothAvata:0,armAvata:0,wingAvata:0});assert.equal(f.g.fashionInfo(f.r).hatAvata,1100201);assert.equal(f.g.inventory(f.r).length,0);const reopened=await new Store(f.s.path).initialize();try{assert.equal(new Game(reopened).fashionInfo(reopened.role(f.a.id)).hatAvata,1100201);}finally{reopened.close();}
});

test('failed native fashion merge releases its operation lock and re-enables the button for a corrected retry',()=>{
 let source=fs.readFileSync(new URL('./fixtures/client-eight-fixes.js',import.meta.url),'utf8');for(const[a,b]of jsonFile('client-patches.json').patches)if(source.includes(a))source=source.replace(a,b);const ctx={W$:class{},com:{road:{yishi:{proto:{campaign:{CampaignReqMsg:class{}}}}}}};vm.createContext(ctx);vm.runInContext(source,ctx);const view=new ctx.FashionComposeReply();view.model={opState:2};view.btn_compose={enabled:false};view.__onComposeCallback({readBody:()=>({paraString1:'VAVEYLA_CRAFT_V1:'+JSON.stringify({composeResult:false})})});assert.equal(view.model.opState,0);assert.equal(view.btn_compose.enabled,true);
});
