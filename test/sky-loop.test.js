import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fixture,enter} from './network.test.js';
import {decode} from '../src/pb.js';

async function drain(c){c.send(20008);const rows=[];for(let i=0;i<150;i++){const p=await c.receive();if(p.code===4234)return rows;rows.push(p);}throw Error('reply limit');}

test('native SPACE_SCENE presence8747(false) and repeated user refresh cannot recreate or exit the ready Sky City',async t=>{
 const app=await fixture(t),a=app.store.register('sky_loop','sky-loop-password-123');app.store.createRole(a.id,'SkyLoop',1,1);app.game.snapshot(a.id);app.store.run('update characters set level=80 where account_id=?',a.id);
 const login=app.store.login(a.username,'sky-loop-password-123'),key='d'.repeat(32);app.store.issueTicket(a.id,key,login.token,'local');const c=await enter(app,a,key);t.after(()=>c.ws.terminate());
 c.send(8688,'simple.PropertyMsg',{param1:10000});const initial=await drain(c);assert.equal(initial.filter(p=>p.code===4595).length,1);
 const session=[...app.sessions].find(s=>s.account?.id===a.id),r=app.store.role(a.id),world=app.game.world(r);
 // The original Uo.enterCastle and SPACE_SCENE hook, using the real encrypted connection.
 const ctx=vm.createContext({ko:class{},Bn:{C_ENTER_CASTLE:8747},vZ:{Instance:{send:(code,body)=>c.send(code,'simple.PropertyMsg',JSON.parse(JSON.stringify(body)))}},sa:{SPACE_SCENE:'SPACE_SCENE',FARM:'FARM'}});
 vm.runInContext('globalThis.Uo={Instance:{enterCastle(t=!1){let e=new ko;e.param7=t,vZ.Instance.send(Bn.C_ENTER_CASTLE,e)}}};globalThis.nativeSpaceHook=t=>t==sa.FARM||t==sa.SPACE_SCENE&&Uo.Instance.enterCastle(!1);',ctx);
 for(let i=0;i<4;i++){
  ctx.nativeSpaceHook('SPACE_SCENE');let rows=await drain(c);assert.ok(!rows.some(p=>[22,6,4595,4606].includes(p.code)));assert.equal(session.skyActive,true);
  c.send(8224,'player.PlayerDataMsg',{user:true});rows=await drain(c);assert.ok(rows.some(p=>p.code===4597));assert.ok(!rows.some(p=>[22,6,4595,4606].includes(p.code)));
  c.send(8688,'simple.PropertyMsg',{param1:10000});rows=await drain(c);assert.ok(rows.some(p=>p.code===4597));assert.ok(!rows.some(p=>p.code===4595));
 }
 assert.deepEqual(app.game.world(r),world);
 // True presence can still move back to Castle; it must not return SPACE_CREATE.
 ctx.Uo.Instance.enterCastle(true);const exit=await drain(c);assert.ok(exit.some(p=>p.code===22));assert.ok(!exit.some(p=>p.code===4595));assert.equal(app.game.world(r).map_id,5);assert.equal(session.skyActive,false);
});
