import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fixture,enter} from './network.test.js';
import {encode,decode} from '../src/pb.js';
import {jsonFile} from '../src/util.js';
import * as packets from '../src/packets.js';
import {Battle} from '../src/battle.js';
import {nodes,fights} from '../src/catalog.js';
import {win,arrival} from './core.test.js';
async function settleMove(c){c.send(20008);let rows=[];for(let i=0;i<100;i++){const p=await c.receive();if(p.code===4234){assert.ok(!rows.some(p=>p.code===4594));return;}rows.push(p);}throw Error("move did not settle");}
async function receive(c,code){for(let i=0;i<100;i++){const p=await c.receive();if(p.code===code)return p;}throw Error('missing '+code);}

function native(send,id){
 const model={moveArmyTo(v){this.moved=v;}};
 const ctx=vm.createContext({com:{road:{yishi:{proto:{worldmap:{PosMoveMsg:class{},RouteMsg:class{}}}}}},Gp:class{},Bn:{C_PLAYER_SPACE_ENTER:8688,C_PLAYER_SPACE_LEAVE:8689,C_PLAYER_SPACE_MOVE:8690,C_GET_SPACE_PLAYER_ARMY_INFO:8701},vZ:{Instance:{send}},n0:{Instance:{army:{userId:id}}},YU:{SpaceMapId:10000,Instance:{exit:false,model,setup(id){this.map=id;},readMember(p){this.member=p;}}},CU:{Instance:{addCreateSceneQueue(){}}},G$:{Instance:{currentPlayerModel:{}}},GH:{Instance:{setup(){},nodeDic:new Map([[10000,[]]])}},Wk:{isEnterSpaceNow:()=>true},y_t:{base(){}},s6:{Instance:{currentType:0,setScene(t){this.currentType=t;}}},sa:{SPACE_SCENE:10000},oF:'room.RoomEnterMsg'});
 let src=fs.readFileSync(new URL('./fixtures/client-sky.js',import.meta.url),'utf8');
 for(const [a,b]of jsonFile('client-patches.json').patches)if(src.includes(a))src=src.replace(a,b);
 vm.runInContext(src,ctx);return ctx;
}

test('native Sky City entry, tile movement, camera scroll, SQLite reconnect and castle return over encrypted websocket',async t=>{
 const app=await fixture(t),a=app.store.register('sky_owner','sky-password-123');app.store.createRole(a.id,'SkyHero',1,1);app.game.snapshot(a.id);app.store.run('update characters set level=80 where account_id=?',a.id);
 const login=app.store.login(a.username,'sky-password-123'),key='b'.repeat(32);app.store.issueTicket(a.id,key,login.token,'local');let c=await enter(app,a,key);t.after(()=>c.ws.terminate());const r=app.store.role(a.id);
 const ctx=native((code,body)=>c.send(code,code===8690?'worldmap.PosMoveMsg':'simple.PropertyMsg',JSON.parse(JSON.stringify(body))),r.player_id);
 ctx.NativeSky.Instance.enterSpace();
 const reply=decode('room.RoomEnterMsg',(await receive(c,4595)).payload);assert.equal(reply.player[0].campaignId,10000);assert.equal(reply.player[0].playerId,r.player_id);assert.equal(reply.player[0].curPosX,140);
 new ctx.NativeSkyEntry().__createSpaceHandler({code:4595,readBody:()=>reply});assert.equal(ctx.s6.Instance.currentType,10000);assert.equal(ctx.YU.Instance.member.playerId,r.player_id);
 ctx.NativeSky.Instance.move([{x:141,y:120},{x:142,y:121}],1);
 await settleMove(c);assert.equal(ctx.YU.Instance.model.moved,undefined);assert.equal(app.game.world(r).x,2840);
 ctx.NativeSky.Instance.move([{x:300,y:200}],2);await settleMove(c);assert.equal(app.game.world(r).x,2840);
 ctx.NativeSky.Instance.requestPlayerInfos([]);assert.equal(decode('room.RoomEnterMsg',(await receive(c,4597)).payload).player.length,1);
 const returning=packets.city(app.game,r,{completed:true});assert.ok(returning.some(p=>p[0]===4595));assert.ok(!returning.some(p=>p[0]===22));
 c.ws.terminate();await new Promise(resolve=>setTimeout(resolve,30));
 app.store.issueTicket(a.id,key,login.token,'local');c=await enter(app,a,key);c.send(8224,'player.PlayerDataMsg',{user:true});const restored=decode('room.RoomEnterMsg',(await receive(c,4595)).payload);assert.equal(restored.player[0].curPosX,142);assert.equal(restored.player[0].curPosY,121);
 c.send(8689,'simple.PropertyMsg',{param1:0});await receive(c,22);assert.equal(app.game.world(r).map_id,5);
});

test('Sky City level and route validation preserve state and reject impersonated or invalid positions',async t=>{
 const app=await fixture(t),a=app.store.register('sky_checks','sky-password-123');app.store.createRole(a.id,'SkyCheck',1,1);app.game.snapshot(a.id);let r=app.store.role(a.id);
 assert.throws(()=>app.game.tx(a.id,r=>app.game.enterSky(r)),e=>e.code==='sky_level');assert.equal(app.game.world(r).map_id,5);
 app.store.run('update characters set level=15 where account_id=?',a.id);r=app.store.role(a.id);app.game.tx(a.id,r=>app.game.enterSky(r));const w=app.game.world(r);
 for(const q of [{mapId:10000,armyId:r.player_id+1,routes:[{x:140,y:120}],moveType:1},{mapId:10000,armyId:r.player_id,routes:[{x:450,y:120}],moveType:1},{mapId:10000,armyId:r.player_id,routes:[],moveType:1}])assert.throws(()=>app.game.tx(a.id,r=>app.game.moveSky(r,q)));
 assert.deepEqual(app.game.world(r),w);
});

test('Sky City entry cannot discard a real pending boss card; failed level checks keep the active campaign intact',async t=>{
 const app=await fixture(t),a=app.store.register('sky_reward','sky-password-123');app.store.createRole(a.id,'SkyReward',1,1);app.game.snapshot(a.id);app.store.run('update characters set level=80 where account_id=?',a.id);
 const login=app.store.login(a.username,'sky-password-123'),key='c'.repeat(32);app.store.issueTicket(a.id,key,login.token,'local');const c=await enter(app,a,key);t.after(()=>c.ws.terminate());const session=[...app.sessions].find(s=>s.account?.id===a.id);const b=new Battle(app.game,app.store.role(a.id),1001);session.encounter=b;
 const req={code:8688,payload:encode('simple.PropertyMsg',{param1:10000})};
 app.store.run('update characters set level=10 where account_id=?',a.id);
 const before=structuredClone(b.document);assert.throws(()=>session.world(req),e=>e.code==='sky_level');assert.deepEqual(b.document,before);assert.equal(app.game.world(app.store.role(a.id)).map_id,5);
 app.store.run('update characters set level=80 where account_id=?',a.id);
 while(!b.document.completed){for(const n of nodes(b.document.map_id).filter(n=>fights(1001).some(f=>f.Id===n.Id)))win(b,n.Id,false);if(!b.document.completed)arrival(b,nodes(b.document.map_id).find(n=>n.MasterType===62&&n.MoveToNodeIds.length).Id);}
 assert.ok(b.pendingReward());assert.throws(()=>session.world(req),e=>e.code==='reward_pending');assert.ok(b.pendingReward());assert.equal(app.game.world(app.store.role(a.id)).map_id,5);
});
