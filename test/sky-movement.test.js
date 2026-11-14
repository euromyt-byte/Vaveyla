import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {jsonFile} from '../src/util.js';
import {fixture,enter} from './network.test.js';

async function drain(c){c.send(20008);const rows=[];for(let i=0;i<150;i++){const p=await c.receive();if(p.code===4234)return rows;rows.push(p);}throw Error('reply limit');}

test('native Sky movement receiver discards delayed own-walk and camera echoes, retaining remote-player routes',()=>{
 let applied=0,last;const id=17,ctx=vm.createContext({s6:{Instance:{currentType:'SPACE_SCENE'}},sa:{SPACE_SCENE:'SPACE_SCENE'},n0:{Instance:{army:{userId:id}}},YU:{Instance:{model:{moveArmyTo(v){applied++;last=v;}}}},com:{road:{yishi:{proto:{worldmap:{PosMoveMsg:class{}}}}}}});
 let src=fs.readFileSync(new URL('./fixtures/client-sky.js',import.meta.url),'utf8');for(const[a,b]of jsonFile('client-patches.json').patches)if(src.includes(a))src=src.replace(a,b);vm.runInContext(src,ctx);const receiver=new ctx.NativeSkyMove();
 for(let i=0;i<10;i++)for(const moveType of [0,1,2])receiver.__spaceSyncPosHandler({readBody:()=>({armyId:id,moveType,routes:[{x:140,y:120},{x:141,y:121}]})});assert.equal(applied,0);
 receiver.__spaceSyncPosHandler({readBody:()=>({armyId:18,moveType:2,routes:[{x:200,y:200}]})});assert.equal(applied,0);
 receiver.__spaceSyncPosHandler({readBody:()=>({armyId:18,moveType:1,routes:[{x:142,y:120}]})});assert.equal(applied,1);assert.equal(last.players[0].playerId,18);assert.equal(last.players[0].path[0].x,142);
});

test('encrypted native Sky walk batches save final positions without replay packets; camera and idle leave the character still',async t=>{
 const app=await fixture(t),a=app.store.register('sky_walk','sky-walk-password-123');app.store.createRole(a.id,'SkyWalk',1,1);app.game.snapshot(a.id);app.store.run('update characters set level=80 where account_id=?',a.id);
 const login=app.store.login(a.username,'sky-walk-password-123'),key='e'.repeat(32);app.store.issueTicket(a.id,key,login.token,'local');const c=await enter(app,a,key);t.after(()=>c.ws.terminate());c.send(8688,'simple.PropertyMsg',{param1:10000});await drain(c);const r=app.store.role(a.id);
 for(let x=141;x<=148;x++){
  c.send(8690,'worldmap.PosMoveMsg',{mapId:10000,armyId:r.player_id,routes:[{x:x-1,y:120},{x,y:120}],moveType:1});const rows=await drain(c);assert.ok(!rows.some(p=>[4594,4595,4606].includes(p.code)));assert.equal(app.game.world(r).x,x*20);
 }
 const stopped=app.game.world(r);
 for(let i=0;i<3;i++){c.send(8690,'worldmap.PosMoveMsg',{mapId:10000,armyId:r.player_id,routes:[{x:200+i,y:200}],moveType:2});assert.ok(!(await drain(c)).some(p=>p.code===4594));assert.deepEqual(app.game.world(r),stopped);}
 for(let i=0;i<3;i++){assert.ok(!(await drain(c)).some(p=>p.code===4594));assert.deepEqual(app.game.world(r),stopped);}
 c.send(8690,'worldmap.PosMoveMsg',{mapId:10000,armyId:r.player_id+1,routes:[{x:140,y:120}],moveType:1});await drain(c);assert.deepEqual(app.game.world(r),stopped);
});
