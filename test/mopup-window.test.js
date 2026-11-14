import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {jsonFile} from '../src/util.js';
import {decode} from '../src/pb.js';
import {fixture as networkFixture,enter} from './network.test.js';
import {Battle} from '../src/battle.js';
import {nodes,fights} from '../src/catalog.js';
import {arrival,win} from './core.test.js';

function client(patched=true,send=()=>{},scene='castle'){
 const sent=[],loops=[],once=[],opened=[],buffers=[];let now=100000,closed=false,view,ctrl,manager;
 class Events{constructor(){this.listeners=[];}addEventListener(type,fn,owner){this.listeners.push({type,fn,owner});}removeEventListener(type,fn,owner){this.listeners=this.listeners.filter(l=>l.type!==type||l.fn!==fn||l.owner!==owner);}dispatchEvent(type){for(const l of [...this.listeners])if(l.type===type)l.fn.call(l.owner);}show(){}hide(){}dispose(){}}
 class RawButton{constructor(name,title=''){this.name=name;this.title=title;this.scaleX=this.scaleY=1;this.enabled=true;this.visible=true;this.displayObject={active:true};this.handlers=[];this.asButton=this;}on(type,owner,fn){this.handlers.push({type,owner,fn});}off(type,owner,fn){this.handlers=this.handlers.filter(h=>h.type!==type||h.owner!==owner||h.fn!==fn);}emit(type){if(!this.enabled||!this.visible)return;for(const h of [...this.handlers])if(h.type===type)h.fn.call(h.owner,{type,currentTarget:this});}}
 class Base{get frameData(){return this.params.frameData;}set frameData(v){this.params={frameData:v};}get model(){return this.ctrl.data;}OnShowWind(){this.isShowing=true;}OnHideWind(){this.isShowing=false;this.visible=false;this.modelMask=null;closed=true;}hide(){this.OnHideWind();this.dispose();}dispose(){this.destroyed=true;this.parent=null;this.stage=null;}}
 const ctx=vm.createContext({Sn:Base,Yr:Events,Wr:class{},f_t:{isWxMiniGame:()=>false},tn:{Common:1},$s:{Scale:1},yn:class{paraScale=0.95},on:{CONFIRM_SOUND:1},fgui:{GButton:RawButton},Cn:{Instance:{playSound(){}}},FQ:{Instance:{getDifferEmWindow:t=>t}},x6:{Instance:{isSingleInstanceWnd:()=>false}},oa:class{clear(){for(const k of Object.keys(this))delete this[k];}},
  Qn:{listen(){}},Mn:{U_C_CAMPAIGN_SWEEP:4425},lz:class{},dz:class{},
  oy:{CampaignMopup:1,MazeMopup:2,PetCampaignMopup:3,PveSecretMopup:4},ry:{CampaignMopupPre:1,CampaignMopuping:2,MazeMopupPre:3,MazeMopuping:4,PetCampaignMopupPre:5,PetCampaignMopupping:6},hy:{Mopup:1,GetResult:3,Cancel:4},ly:{Mopuping:1,Mopuped:2},
  y_t:{xjy(){},warn(){},error:s=>{throw Error(s);}},B:{Instance:{GetTranslation:s=>s}},a6:{Instance:{show(){}}},
  wF:{checkMaze:()=>false,checkMaze2:()=>false,checkMaze3:()=>false},G$:{Instance:{currentPlayerModel:{towerInfo:{},playerInfo:{weary:200}}}},
  Laya:{Event:{MOUSE_DOWN:'down',MOUSE_UP:'up',MOUSE_OUT:'out'},timer:{loop:(ms,owner,fn)=>loops.push({ms,owner,fn}),clear:(owner,fn)=>{for(let i=loops.length-1;i>=0;i--)if(loops[i].owner===owner&&loops[i].fn===fn)loops.splice(i,1);},once:(ms,owner,fn)=>once.push(()=>fn.call(owner))},Handler:{create:()=>({recover(){}})}},
  Date:class extends Date{static now(){return now;}},s6:{Instance:{currentType:scene}},sa:{CASTLE_SCENE:'castle',SPACE_SCENE:'space'},
  QQ:{Instance:{open:(type,data)=>opened.push({type,data})}},Ent:{Mopup:'mopup'},
  cd:{Instance:{addPkgToBuffer:(pkt,target,fn)=>{buffers.push(target);if(target===scene)fn(pkt);}}},
  ti:{UPDATE_KINGCONTRACT:1},hi:{RETURN_TO_WIN:'return'},rn:{Instance:{addEventListener(){},removeEventListener(){},dispatchEvent:(type,...args)=>{if(type==='return')manager.__returnToWin(...args);}}},
  nh:{TEMP_ID_GOLD:1,TEMP_ID_POWER:2},I_t:{Instance:{getTemplateByID:()=>({CampaignId:1001,CampaignNameLang:'Kurt İni'})}},u_t:{t_s_campaign:'campaign'},
  mJ:{Instance:{getConfigInfoByConfigName:key=>({ConfigValue:key==='Campaign_Sweep_Time'?60:100})}},
  X6:{isNumber:s=>Number.isFinite(Number(s))},ho:{getConsortiaCountDate:n=>n+'s'},qo:{Instance:{gold:{count:100000}}},g_t:class{},
  Bn:{C_CAMPAIGN_SWEEP:8528},vZ:{Instance:{send:(code,body)=>{const q=JSON.parse(JSON.stringify(body));sent.push({code,body:q});send(code,q);}}},
 });
 let source=fs.readFileSync(new URL('./fixtures/client-mopup-window.js',import.meta.url),'utf8');
 if(patched)for(const [old,replacement]of jsonFile('client-patches.json').patches)if(source.includes(old))source=source.replace(old,replacement);
 vm.runInContext(source,ctx);
 Base.prototype.OnBtnClose=ctx.NativeMopupClose.prototype.OnBtnClose;
 for(const key of Object.getOwnPropertyNames(ctx.NativeWindowController.prototype))if(key!=='constructor')ctx.NativeMopupCtrl.prototype[key]=ctx.NativeWindowController.prototype[key];
 ctrl=new ctx.NativeMopupCtrl();ctrl.data=new ctx.NativeMopupData();ctrl.data.campaignId=1001;
 view=new ctx.NativeMopupWindow();view.ctrl=ctrl;ctrl.view=view;view.params={frameData:{type:1,state:1}};view.typeWin='mopup';view.visible=true;view.stage={};view.parent={};view.modelMask={};
 ctrl.delDataListener=ctrl.delEventListener=ctrl.clearDataPreHide=()=>{};ctrl.moduleName='mopup';
 manager=new ctx.NativeWindowManager();manager.getCtrl=()=>ctrl;
 const pool=[];
 view.list={isDisposed:false,get numChildren(){return pool.length;},addItemFromPool(){const r={txtStateDesc:{},txtGetExp:{text:''},setTitle(){},setItemList(items){this.items=items;}};pool.push(r);return r;},getChildAt:i=>pool[i],removeChildToPoolAt:i=>pool.splice(i,1),removeChildrenToPool:()=>pool.splice(0)};
 for(const key of ['gPower','gOpenBox','gGoods','gMopuping','gMopupPre','txtCountDesc','txtFrameTitle','txtCostGold','txtCostTime','txt_rewardCount','txtCostPower','txtLeftTime','btnSpeed','btnStop','btnTickMysteryBox','btnTickSilverBox'])view[key]={text:'',enabled:true};
 view.tipItem1=view.tipItem2=view.tipItem3={setInfo(){}};
 view.stepper={value:1,show(){this.value=1;},resetStepper(v){this.value=v;}};
 const rawButtons=['btnStart','btnStop','btnClose'].map(name=>new RawButton(name));
 view.recordBtnElement=rawButtons;view.UIButtonObj=new Map;
 view._onBtnClick=ctx.NativeButtonDispatch.prototype._onBtnClick;
 ctx.NativeButtonDispatch.prototype.initButton.call(view);
 const click=(name='btnStop')=>{now+=200;const button=rawButtons.find(b=>b.name===name);button.emit('down');button.emit('up');};
 view.OnShowWind();
 const receive=body=>ctrl.__refreshMopupInfoHandler({readBody:()=>body});
 const tick=()=>{now+=1000;for(const l of [...loops])l.fn.call(l.owner);};
 return {ctx,ctrl,view,manager,click,receive,tick,sent,loops,once,opened,buffers,pool,get closed(){return closed;}};
}
const running=()=>({status:1,sweepType:1,campaignId:1001,totalGp:0,dropItems:[],result:[{type:2,campaignId:1001,gp:0,time:60,finishCount:0,count:1,items:[]}]});
const done=()=>({status:11,sweepType:1,campaignId:1001,totalGp:700,dropItems:[],result:[{type:1,campaignId:1001,gp:700,finishCount:1,count:1,items:[{templateId:208005,count:1}]}]});

test('native raid regression: keep running rows, poll periodically, show completion and close Confirm',()=>{
 const before=client(false);before.receive(running());
 assert.equal(before.pool.length,0,'original client deletes its running row');assert.equal(before.loops.length,0,'original client never starts its poll timer');
 before.view.btnStopClick();assert.equal(before.closed,false,'original Confirm does nothing before its missing completion flag');
 const ui=client();ui.receive(running());
 assert.equal(ui.pool.length,1);assert.equal(ui.loops.length,1);assert.equal(ui.view.btnStop.title,'Kapat');
 const count=ui.sent.length;ui.tick();assert.ok(ui.sent.length>count);assert.equal(ui.sent.at(-1).body.opType,3);
 ui.receive({...running(),status:4});assert.equal(ui.pool.length,1,'polling replaces, rather than duplicates, the current row');
 ui.receive(done());assert.equal(ui.pool.length,1);assert.equal(ui.pool[0].itemType,2);assert.equal(ui.pool[0].info.gp,700);
 assert.equal(ui.loops.length,0);assert.equal(ui.view.btnStop.title,'Onayla');assert.equal(ui.view.btnStop.enabled,true);
 ui.click();assert.equal(ui.closed,true);assert.equal(ui.sent.at(-1).body.opType,4);
 assert.equal(ui.loops.length,0);
});

test('running raid Close cancels and clears polling; a stored raid reopens in Castle instead of waiting forever for Space',()=>{
 const ui=client();ui.receive(running());ui.click();assert.ok(ui.closed);assert.equal(ui.loops.length,0);assert.equal(ui.sent.at(-1).body.opType,4);
 const stored={...running(),status:10};
 const old=client(false);old.receive(stored);old.once.shift()();assert.equal(old.opened.length,0);assert.equal(old.buffers[0],'space');
 const restored=client();restored.receive(stored);restored.once.shift()();assert.equal(restored.buffers[0],'castle');assert.equal(restored.opened.length,1);
 const cancelledRestore=client();cancelledRestore.receive(stored);cancelledRestore.view.btnCloseClick();cancelledRestore.once.shift()();
 assert.equal(cancelledRestore.opened.length,0,'a delayed login reply must not reopen a raid the player just closed');
});

test('real encrypted instant raid UI shows reward and closes Confirm without waiting or a second grant',async t=>{
 let now=1794375635;
 const app=await networkFixture(t),a=app.store.register('raid_ui','raid-ui-password-123');
 app.store.clock=()=>now;app.game.now=()=>now;
 app.store.createRole(a.id,'RaidUiHero',1,1);app.game.snapshot(a.id);app.store.run('update characters set level=80,gold=100000 where account_id=?',a.id);
 const b=new Battle(app.game,app.store.role(a.id),1001);
 while(!b.document.completed)for(const n of nodes(b.document.map_id).filter(n=>fights(1001).some(f=>f.Id===n.Id)))win(b,n.Id);
 const login=app.store.login(a.username,'raid-ui-password-123'),key='7'.repeat(32);app.store.issueTicket(a.id,key,login.token,'local');
 const c=await enter(app,a,key);t.after(()=>c.ws.terminate());
 const ui=client(true,(code,body)=>c.send(code,'campaign.CampaignSweepReq',body));
 const flush=async()=>{c.send(20008);for(let i=0;i<100;i++){const p=await c.receive();if(p.code===4234)return;if(p.code===4425)ui.receive(decode('campaign.CampaignSweepRsp',p.payload));}throw Error('raid UI response limit');};
 ui.click('btnStart');await flush();await flush();
 assert.equal(ui.view.isMopuping,true);assert.equal(ui.pool.length,1);assert.equal(ui.loops.length,0);
 assert.equal(ui.ctrl.data.mopupEnd,true);assert.equal(ui.view.btnStop.title,'Onayla');assert.equal(ui.loops.length,0);
 assert.ok(ui.pool.some(r=>r.itemType===2&&r.info.gp>0));
 const inv=app.game.snapshot(a.id).inventory;const xp=app.game.snapshot(a.id).player.xp;
 assert.equal(app.store.get("select count(*) n from game_reward_events where event_id like 'sweep:%'").n,1);
 ui.click();await flush();assert.ok(ui.closed);
 assert.deepEqual(app.game.snapshot(a.id).inventory,inv);assert.equal(app.game.snapshot(a.id).player.xp,xp);
 assert.equal(app.store.get("select count(*) n from game_reward_events where event_id like 'sweep:%'").n,1);
});


test('raid Confirm uses native pointer dispatch and controller cleanup even with absent template or send failure',()=>{
 const old=client(false);old.receive(running());old.receive(done());old.view.stage=null;old.click();assert.equal(old.closed,false,'native manager ignores close when stage is absent');
 const noTemplate=client(false);noTemplate.receive(running());noTemplate.receive(done());noTemplate.view._campaignTemp=null;assert.throws(()=>noTemplate.click(),/CampaignId/);assert.equal(noTemplate.closed,false);
 for(const broken of ['missing-template','send-failure','manager-closed-guard']){
  const ui=client();ui.receive(done());
  if(broken==='missing-template')ui.view._campaignTemp=null;
  if(broken==='send-failure')ui.ctrl.sendMopupInfo=()=>{throw Error('socket closed');};
  if(broken==='manager-closed-guard')ui.view.stage=null;
  ui.click();
  assert.equal(ui.closed,true,broken);assert.equal(ui.view.modelMask,null,broken+' removes modal mask');
  assert.equal(ui.ctrl.view,null,broken+' disposes controller view');
  assert.equal(ui.ctrl.data.isMopup,false);assert.equal(ui.loops.length,0);
 }
});
