import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import vm from 'node:vm';
import {Store} from '../src/store.js';
import {Game} from '../src/game.js';
import {Assets} from '../src/assets.js';
import {runtimeCatalog} from '../src/runtime-catalog.js';
import {giftPeriod} from '../src/rules-gift-packages.js';
import {table,et} from '../src/catalog.js';
import {jsonFile} from '../src/util.js';
import * as p from '../src/packets.js';
import {systemOpenPacket} from '../src/system-open.js';
import {decode} from '../src/pb.js';
import {fixture,enter,http} from './network.test.js';

const product='wartuneh5.giftpack.pay1.99';
async function setup(t){const dir=fs.mkdtempSync(os.tmpdir()+'/vaveyla-systems-');let now=Date.parse('2026-11-13T12:00:00Z')/1000,s=await new Store(dir+'/test.sqlite3',{clock:()=>now}).initialize(),g=new Game(s);const a=s.register('systems_owner','systems-password-123');s.createRole(a.id,'SystemsHero',1,1);g.snapshot(a.id);s.run('update characters set level=73,gold=100000 where account_id=?',a.id);t.after(()=>{s.close();fs.rmSync(dir,{recursive:true});});fs.mkdirSync(dir+'/xml');fs.writeFileSync(dir+'/xml/t_s_giftpackage.json',JSON.stringify({t_s_giftpackage:[{Id:41,Type:1,PurchaseLimit:2,NeedGrades:5,ProductId:product,Item:'-400,60|-5500,60|208020,2'}]}));g.sourceCatalog=name=>runtimeCatalog(new Assets(dir),name);return {s,g,a,dir,advance:n=>now+=n,get r(){return s.role(a.id);}};}
function native(ctx){vm.createContext(ctx);let source=fs.readFileSync(new URL('./fixtures/client-market-fashion-skills.js',import.meta.url),'utf8');for(const[a,b]of jsonFile('client-patches.json').patches)if(source.includes(a))source=source.replace(a,b);vm.runInContext(source,ctx);return ctx;}

test('source gift package items, diamonds and VIP XP are free, idempotent and limited by source reset periods',async t=>{
 const f=await setup(t),args={product_id:product,count:1,other_id:41,active_type:0};const before=f.r;
 const first=f.g.action(f.a.id,'recharge.free',args,'gift:first');assert.deepEqual(f.g.action(f.a.id,'recharge.free',args,'gift:first'),first);assert.equal(f.r.diamonds-before.diamonds,60);assert.equal(f.r.gold,before.gold);assert.equal(f.g.snapshot(f.a.id).inventory.find(i=>i.template_id===208020).count,2);assert.equal(first.result.reward.resources.vip_xp,60);
 f.g.action(f.a.id,'recharge.free',args,'gift:second');assert.throws(()=>f.g.action(f.a.id,'recharge.free',args,'gift:third'),e=>e.code==='gift_purchase_limit');assert.equal(f.g.giftCounts(f.r).infos[0].num,2);
 f.advance(86400);assert.equal(f.g.giftCounts(f.r).infos.length,0);f.g.action(f.a.id,'recharge.free',args,'gift:tomorrow');assert.equal(f.r.diamonds-before.diamonds,180);
 assert.notEqual(giftPeriod(1,Date.parse('2026-11-13T04:59:59Z')/1000),giftPeriod(1,Date.parse('2026-11-13T05:00:00Z')/1000));assert.notEqual(giftPeriod(2,Date.parse('2026-11-16T04:59:59Z')/1000),giftPeriod(2,Date.parse('2026-11-16T05:00:00Z')/1000));assert.notEqual(giftPeriod(3,Date.parse('2026-12-01T04:59:59Z')/1000),giftPeriod(3,Date.parse('2026-12-01T05:00:00Z')/1000));
});

test('gift package forgery and invalid item definitions roll back purchases; a full bag receives mail without losing source rewards',async t=>{
 const f=await setup(t);assert.throws(()=>f.g.tx(f.a.id,r=>f.g.claimGiftPackage(r,41,1,'wrong')),e=>e.code==='gift_product_mismatch');assert.equal(f.s.get('select count(*) n from game_gift_purchases').n,0);
 for(let i=0;i<100;i++)f.g.tx(f.a.id,r=>f.g.addItem(r,1011101,1));const out=f.g.tx(f.a.id,r=>f.g.claimGiftPackage(r,41,1,product));assert.equal(out.reward.mailed_items[0].template_id,208020);
 f.g.sourceCatalog=()=>new Map([[99,{Id:99,Type:1,PurchaseLimit:1,ProductId:product,Item:'-400,20|999999999,1'}]]);const diamonds=f.r.diamonds;assert.throws(()=>f.g.tx(f.a.id,r=>f.g.claimGiftPackage(r,99,1,product)));assert.equal(f.r.diamonds,diamonds);assert.equal(f.s.get('select count(*) n from game_gift_purchases where package_id=99').n,0);
});

test('six native fast-key slots save with trailing delimiter and survive full army refresh and database reopen',async t=>{
 const f=await setup(t),rows=Object.values(et('skilltemplate')).filter(x=>x.MasterType===1&&x.UseWay!==2&&x.Grades===1);const selected=[];for(const row of rows)if(!selected.some(x=>x.SonType===row.SonType))selected.push(row);assert.ok(selected.length>=6);const used=selected.slice(0,6);f.s.run('update game_skills set learned_json=? where character_id=?',JSON.stringify(used.map(x=>x.TemplateId)),f.r.id);const value=used.map(x=>x.SonType).join(',')+',';
 const saved=f.g.tx(f.a.id,r=>f.g.equipSkills(r,value));assert.equal(saved.fast_keys,value);assert.equal(p.fullArmy(f.r,f.g.snapshot(f.a.id))[2].simpleHeroInfo.fastKey,value);
 const reopened=await new Store(f.s.path).initialize();try{assert.equal(new Game(reopened).snapshot(f.a.id).skills.fast_keys,value);}finally{reopened.close();}
 assert.throws(()=>f.g.tx(f.a.id,r=>f.g.equipSkills(r,'107,107,-1,-1,-1,-1,')),e=>e.code==='skill_not_learned');
});

test('fashion tab opens at source level, owned clothes equip atomically, hide state persists and native handler updates wardrobe/hero',async t=>{
 const f=await setup(t),ids={hatAvata:1100201,clothAvata:1120201,armAvata:1110201,wingAvata:1090201};for(const id of Object.values(ids))f.g.tx(f.a.id,r=>f.g.addItem(r,id,1));f.g.tx(f.a.id,r=>f.g.changeFashion(r,{flag:1,status:'1,1,1,1',...ids}));const info=f.g.fashionInfo(f.r);assert.equal(info.clothAvata,1120201);assert.equal(p.fullArmy(f.r,f.g.snapshot(f.a.id))[2].fashionCloth,table('itemtemplate')[1120201].Avata);assert.ok(systemOpenPacket(f.r)[2].sysId.includes(10103));
 const list=new Map(),hero={id:1,beginChanges(){},commit(){}};const ctx=native({com:{road:{yishi:{proto:{campaign:{CampaignReqMsg:class{}}}}}},i0:class{},g_t:class{get templateInfo(){return table('itemtemplate')[this.templateId];}},rn:{Instance:{dispatchEvent(){}}},Le:{FASHION_SHOW_CHANGE:1},V$:{selectedItemInfo:null}});const model=new ctx.NativeFashion();model.thane=hero;model.fashionList={clear:()=>list.clear(),add:(k,v)=>list.set(k,v)};model.dragonFashionList={clear(){},add(){}};model.fashionModel={getFashionObjectSkillTemplate:()=>null,isIdentify:false};model.__fashionHandler({readBody:()=>({paraString1:'VAVEYLA_FASHION_V1:'+JSON.stringify(info)})});assert.equal(list.size,4);assert.equal(hero.armsFashionAvata,table('itemtemplate')[1110201].Avata);
 f.g.tx(f.a.id,r=>f.g.changeFashion(r,{flag:0,status:'0,0,0,0'}));assert.equal(f.g.fashionInfo(f.r).appearance.fashionCloth,'');assert.equal(f.g.snapshot(f.a.id).inventory.filter(i=>i.bag===4).length,4);
 const before=f.g.snapshot(f.a.id).inventory;assert.throws(()=>f.g.tx(f.a.id,r=>f.g.changeFashion(r,{flag:1,status:'1,1,1,1',...ids,armAvata:1110202})));assert.deepEqual(f.g.snapshot(f.a.id).inventory,before);
});

test('missing free source Depot is repaired from level1 once and an existing upgraded Depot is preserved',async t=>{
 const f=await setup(t);f.s.run("update characters set level=1 where account_id=?",f.a.id);let v=f.g.snapshot(f.a.id);assert.equal(v.buildings.filter(b=>b.son_type===301).length,1);assert.equal(v.buildings.find(b=>b.son_type===301).template_id,30101);f.s.run('update game_buildings set template_id=30110 where character_id=? and son_type=301',f.r.id);v=f.g.snapshot(f.a.id);assert.equal(v.buildings.find(b=>b.son_type===301).template_id,30110);assert.ok(p.buildings(f.r,v,true,f.s.clock())[0][2].building.some(b=>b.sonType===301&&b.isExist));
});

async function drain(c){c.send(20008);const rows=[];for(let i=0;i<150;i++){const p=await c.receive();if(p.code===4234)return rows;rows.push(p);}throw Error('reply limit');}
test('real encrypted skill save and shop counts use native handlers without moving scene; HTTP free package refreshes server-owned inventory',async t=>{
 const app=await fixture(t),a=app.store.register('systems_wire','systems-wire-password');app.store.createRole(a.id,'SystemsWire',1,1);app.game.snapshot(a.id);app.store.run('update characters set level=73 where account_id=?',a.id);
 app.game.sourceCatalog=()=>new Map([[41,{Id:41,Type:1,PurchaseLimit:2,NeedGrades:5,ProductId:product,Item:'-400,60|208020,2'}]]);const login=app.store.login(a.username,'systems-wire-password'),key='c'.repeat(32);app.store.issueTicket(a.id,key,login.token,'local');const c=await enter(app,a,key);t.after(()=>c.ws.terminate());
 const ctx=native({Dr:class{},Bn:{U_C_HERO_SETFASTKEY:5167},vZ:{Instance:{send:(code,body)=>c.send(code,'army.HeroFastKeyMsg',JSON.parse(JSON.stringify(body)))}},Q$:class{},com:{road:{yishi:{proto:{campaign:{CampaignReqMsg:class{}}}}}},rn:{Instance:{dispatchEvent(){}}},Li:{PROMOTION_INFO_UPDATE:1},G$:{Instance:{}}});ctx.NativeSkillSave.sendSetFastKey('-1,-1,107,108,-1,-1,');const rows=await drain(c),reply=rows.find(p=>p.code===64);assert.ok(reply);const owner=new ctx.NativeSkillSave();owner.thane={skillCate:{commit(){}}};owner.__fastKeySetHandler({readBody:()=>decode('army.HeroFastKeyMsg',reply.payload)});assert.equal(owner.thane.skillCate.fastKey,'-1,-1,107,108,-1,-1,');
 const response=await http(app,'POST','/api/game/recharge.free',{request_id:'gift-http',data:{product_id:product,count:1,other_id:41,active_type:0}},login.token);assert.equal(response.status,200);
 c.send(9061,'campaign.CampaignReqMsg',{paraInt1:0,paraString1:'VAVEYLA_SHOP_GIFT_V1'});const counts=(await drain(c)).find(p=>p.code===4971);const handler=new ctx.NativeGiftReply();handler.model={giftPackageDataMap:new Map()};handler.__onGiftPackageInfo({readBody:()=>decode('campaign.CampaignReqMsg',counts.payload)});assert.equal(handler.model.giftPackageDataMap.get(41),1);assert.equal(ctx.G$.Instance.productData.get(product),1);
});
