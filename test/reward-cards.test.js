import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import vm from 'node:vm';
import {Store} from '../src/store.js';
import {Game} from '../src/game.js';
import {Battle} from '../src/battle.js';
import {nodes,maps,fights} from '../src/catalog.js';
import {CARD_PREFIX} from '../src/battle-rewards.js';
import {encode,decode} from '../src/pb.js';
import {arrival,win} from './core.test.js';
import {fixture as networkFixture,enter} from './network.test.js';

function clear(g,s,a,cid,claim=false){
 const b=new Battle(g,s.role(a.id),cid);
 while(!b.document.completed){
  for(const n of nodes(b.document.map_id).filter(n=>fights(cid).some(f=>f.Id===n.Id)))win(b,n.Id,claim);
  if(!b.document.completed)arrival(b,nodes(b.document.map_id).find(n=>n.MasterType===62&&n.MoveToNodeIds.length).Id);
 }
 return b;
}
async function fixture(t){
 const dir=fs.mkdtempSync(os.tmpdir()+'/vaveyla-cards-');
 let s=await new Store(dir+'/test.sqlite3').initialize();
 const a=s.register('cards_owner','cards-password-123');s.createRole(a.id,'CardsHero',1,1);
 let g=new Game(s);g.snapshot(a.id);s.run('update characters set level=80 where account_id=?',a.id);
 t.after(()=>{s.close();fs.rmSync(dir,{recursive:true});});
 return {a,get s(){return s;},get g(){return g;},restart:async()=>{s.close();s=await new Store(dir+'/test.sqlite3').initialize();g=new Game(s);}};
}
function claim(b,index=2){return b.claimReward(b.s.role(b.role.account_id),{paraInt1:b.role.player_id,paraInt2:index,paraString1:b.document.card_reward.token});}
function parse(row){return JSON.parse(decode(row[1],encode(row[1],row[2])).paraString1.slice(CARD_PREFIX.length));}

test('five persistent choices, token/owner checks, atomic rollback, SQLite reopen and single inventory grant',async t=>{
 const f=await fixture(t);let b=clear(f.g,f.s,f.a,1001);
 assert.ok(b.pendingReward());assert.equal(b.document.card_reward.slots.length,5);
 assert.equal(b.rewardPackets()[0][0],137);
 assert.equal(parse(b.rewardPackets()[0]).dropItems.length,5);
 assert.throws(()=>b.abandon(),e=>e.code==='reward_pending');
 const token=b.document.card_reward.token;
 assert.throws(()=>b.claimReward(b.role,{paraInt1:999,paraInt2:2,paraString1:token}));
 assert.throws(()=>b.claimReward(b.role,{paraInt1:b.role.player_id,paraInt2:2,paraString1:'wrong'}));
 const before=f.g.snapshot(f.a.id).inventory;
 f.s.db.exec("CREATE TRIGGER reject_card_update BEFORE UPDATE OF state_json ON game_campaign_runs WHEN json_extract(NEW.state_json,'$.card_reward.claimed') IS NOT NULL BEGIN SELECT RAISE(ABORT,'test claim rollback'); END");
 assert.throws(()=>claim(b));
 assert.ok(b.pendingReward());assert.deepEqual(f.g.snapshot(f.a.id).inventory,before);
 assert.equal(f.s.get("select count(*) n from game_reward_events where event_id like 'battle-card:%'").n,0);
 f.s.db.exec('DROP TRIGGER reject_card_update');
 await f.restart();b=new Battle(f.g,f.s.role(f.a.id),1001,{resume:true});
 assert.equal(b.document.card_reward.token,token);assert.ok(b.pendingReward());
 const row=claim(b),value=parse(row),after=f.g.snapshot(f.a.id).inventory;
 assert.equal(row[0],26);assert.equal(value.index,2);
 const count=items=>items.filter(i=>i.template_id===value.templateId).reduce((n,i)=>n+i.count,0);
 assert.equal(count(after)-count(before),1);assert.equal(b.pendingReward(),false);
 assert.deepEqual(parse(claim(b,4)),value);assert.deepEqual(f.g.snapshot(f.a.id).inventory,after);
 await f.restart();b=new Battle(f.g,f.s.role(f.a.id),1001,{resume:true});
 assert.deepEqual(parse(claim(b,0)),value);
 assert.equal(f.s.get("select count(*) n from game_reward_events where event_id like 'battle-card:%'").n,1);
});

test('Byron boss completion ignores source-hidden spawns and legacy completed saves gain a pending screen without replaying XP',async t=>{
 const f=await fixture(t);clear(f.g,f.s,f.a,1001,true);
 const b=clear(f.g,f.s,f.a,1002);
 const hidden=maps(1002).flatMap(m=>nodes(m.Id)).filter(n=>n.NodeState===9&&(n.Soldiers||n.Heros));
 assert.ok(hidden.length);assert.ok(hidden.every(n=>!b.document.defeated.includes(n.Id)));
 assert.ok(b.document.completed&&b.pendingReward());
 const old=structuredClone(b.document);delete old.card_reward;old.completed=false;
 f.s.run('update game_campaign_runs set state_json=?,revision=revision+1 where character_id=?',JSON.stringify(old),b.role.id);
 const before=f.g.snapshot(f.a.id).player;
 const resumed=new Battle(f.g,f.s.role(f.a.id),1002,{resume:true});resumed.completeIfWon();
 assert.ok(resumed.document.completed&&resumed.pendingReward());
 assert.deepEqual(f.g.snapshot(f.a.id).player,before);
});

test('full bag card reward is mailed once with the selected item preserved',async t=>{
 const f=await fixture(t),b=clear(f.g,f.s,f.a,1001);
 for(let p=0;p<100;p++)f.s.run('insert into game_items(character_id,template_id,count,bound,bag,position) values(?,?,1,1,1,?)',b.role.id,2125149,p);
 const value=parse(claim(b,1));assert.ok(value.templateId>0);
 assert.equal(b.document.card_reward.claimed.receipt.mailed_items.length,1);
 const mails=f.s.get('select count(*) n from game_mail').n;
 claim(b,0);assert.equal(f.s.get('select count(*) n from game_mail').n,mails);
});

function clientContext(c,userId){
 const timers=[],opened=[],flipped=[],tips=[];
 const ctx=vm.createContext({window:{},Sn:class{OnShowWind(){}},$B:class{configure(t){this._pkg=t;}},
 jH:class{},tG:class{},KH:class{},gl:class{},l8:class{},g_t:class{},
 sa:{CAMPAIGN_MAP_SCENE:'campaign',BATTLE_SCENE:'battle'},s6:{Instance:{currentType:'campaign'}},
 TC:{BATTLE_CHALLENGE:30,CAMPAIGN_BATTLE:6},C6:{Instance:{battleModel:{battleType:12}}},
 b6:{CampaignOverState:false,Instance:{mapId:1021,mapModel:{isSingleCampaign:true}}},
 eJ:{Instance:{clean(){}}},cd:{Instance:{addPkgToBuffer:(p,s,fn)=>fn(p)}},
 Qn:{Instance:{notify(){}}},Le:{UI_OUT_SCENE:1},Mn:{U_C_CAMPAIGN_CARDS:135,U_C_CAMPAIGN_REPORT:137},
 Ent:{ChestFrame:'chest',AutoWalkWnd:'auto'},QQ:{Instance:{open:(name,data)=>opened.push({name,data}),isOpen:()=>false}},
 Cn:{Instance:{playMusic(){},playSound(){}}},on:{CAMPAIGN_SUCCEED:1,CHEST_SOUND:2},
 y_t:{xjy(){},info(){}},B:{Instance:{GetTranslation:s=>s}},
 a6:{Instance:{show:s=>tips.push(s)}},wF:{checkInDigitHeroWar:()=>false},
 G$:{Instance:{currentPlayerModel:{playerInfo:{userId}}}},n0:{Instance:{army:{id:userId},thane:{userId,grades:80}}},
 Ze:{UPDATE_CHEST_INFO:'card'},rn:{Instance:{dispatchEvent:(type,data)=>{if(type==='card')ctx.chest.__updateCardHandler(data);}}},
 Bn:{U_C_CAMPAIGN_TAKE_CARD:5122,U_C_CAMPAIGN_FINISH:5180},
 vZ:{Instance:{send:(code,body)=>c.send(code,'campaign.CampaignReqMsg',JSON.parse(JSON.stringify(body)))}},
 fgui:{Events:{CLICK_ITEM:1}},Laya:{Handler:{create:()=>()=>{}}},ic:class{addEventListener(){}start(){}stop(){}},
 Kd:{TIMER:1},wq:{CountDownTime:18,TurnExitTime:8},$a:{ChestFrame:{AgainLimitLevel:1}},s:{dightHeroWar:false},
 setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},
 });
 vm.runInContext(fs.readFileSync(new URL('./fixtures/client-reward-screen.js',import.meta.url),'utf8'),ctx);
 ctx.wl={Instance:new ctx.NativeCardOut()};
 const input=new ctx.NativeReportIn(),report=new ctx.NativeReport(),claims=new ctx.NativeClaimIn();
 input.addQueue=p=>{report.configure(p);report.handlePackage();};
 ctx.AF={Instance:claims};
 const packet=raw=>({position:0,code:raw.code,readBody:()=>decode('campaign.CampaignReqMsg',raw.payload)});
 const makeChest=()=>{
  const chest=new ctx.NativeChest();
  const cards=Array.from({length:5},(_,index)=>({index,isPay:false,opened:false,updateData:(id,name,item)=>flipped.push({index,id,item})}));
  Object.assign(chest,{params:{frameData:opened.at(-1).data,single:true},cardList:{on(){},numItems:0,numChildren:5,getChildAt:i=>cards[i]},showAgain:{},showBtns:{},btnLeave:{},txtTotalExp:{},txt_vip_value:{},txt_team_value:{},txt_prop_value:{},txtCountDown:{}});
  ctx.chest=chest;chest.OnShowWind();return {chest,cards};
 };
 return {ctx,timers,opened,flipped,tips,input,claims,packet,makeChest};
}

test('real encrypted reconnect opens native five-card screen, blocks exit, flips chosen card, updates bag and exits only after selection',async t=>{
 const app=await networkFixture(t),a=app.store.register('cards_wire','cards-password-123');
 app.store.createRole(a.id,'CardsWire',1,1);app.game.snapshot(a.id);app.store.run('update characters set level=80 where account_id=?',a.id);
 app.game.tx(a.id,r=>app.game.signDaily(r));
 const b=clear(app.game,app.store,a,1001);
 const stamina=app.game.snapshot(a.id).resources.stamina;
 const login=app.store.login(a.username,'cards-password-123'),key='9'.repeat(32);
 app.store.issueTicket(a.id,key,login.token,'local');const c=await enter(app,a,key);t.after(()=>c.ws.terminate());
 const drain=async()=>{c.send(20008);const rows=[];for(let i=0;i<100;i++){const p=await c.receive();if(p.code===4234)return rows;rows.push(p);}throw Error('response limit');};
 c.send(8224,'player.PlayerDataMsg',{user:true});let rows=await drain();
 const raw=rows.find(p=>p.code===137);assert.ok(raw);assert.ok(!rows.some(p=>p.code===22));
 assert.equal(app.game.snapshot(a.id).resources.stamina,stamina);
 const ui=clientContext(c,a.id);ui.input.__campaignResultHandler(ui.packet(raw));
 assert.equal(ui.opened[0].name,'chest');
 const {chest,cards}=ui.makeChest();assert.equal(chest.cardList.numItems,5);assert.equal(chest.txtTotalExp.text,'+700');
 chest.leaveCampaign();assert.equal(ui.tips.length,1);
 c.send(5025,'room.RoomExitMsg',{msg:''});rows=await drain();assert.ok(!rows.some(p=>p.code===22));
 chest.onClickItem(cards[3]);rows=await drain();const ack=rows.find(p=>p.code===26);assert.ok(ack);
 ui.claims.__campaingTakeCardHandler(ui.packet(ack));
 assert.equal(ui.flipped[0].index,3);assert.equal(chest.showBtns.selectedIndex,1);
 const selected=b.document.card_reward.slots[3].template_id;
 assert.ok(app.game.snapshot(a.id).inventory.some(i=>i.template_id===selected&&i.count>=1));
 assert.ok(rows.some(p=>p.code===115),'inventory update must accompany the claim');
 assert.equal(ui.timers[0].ms,8000);ui.timers[0].fn();
 rows=await drain();assert.ok(rows.some(p=>p.code===22));
 assert.equal(app.store.get("select count(*) n from game_reward_events where event_id like 'battle-card:%'").n,1);
});
