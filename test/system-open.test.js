import { test } from "node:test";
import assert from "node:assert/strict";
import { systemOpenPacket, systemStatus } from "../src/system-open.js";
import { encode, decode } from "../src/pb.js";
test("source system list opens owned inventory at level5 and skills6 without fabricating unsupported sylph functionality", () => {
  const ids = (l) =>
    decode(
      "systemopen.SystemOpenHashOpenList",
      encode(
        "systemopen.SystemOpenHashOpenList",
        systemOpenPacket({ level: l })[2],
      ),
    ).sysId;
  assert.ok(!ids(4).includes(101));
  for (const n of [101, 10101, 1010101, 10102]) assert.ok(ids(5).includes(n));
  assert.ok(!ids(5).includes(135));
  assert.ok(ids(6).includes(135));
  assert.ok(ids(15).includes(105));
  assert.ok(!ids(80).includes(139));
  const pet = systemStatus({ level: 40 }).find((r) => r.system_id === 139);
  assert.equal(pet.required_level, 40);
  assert.equal(pet.level_met, true);
  assert.equal(pet.implemented_entry, false);
});

import {coreFixture} from './core.test.js';
import {Session} from '../src/session.js';
import {unpack} from '../src/wire.js';
test('gateway publishes source unlock list once, again after level change and on fresh connection',async t=>{
 const {s,g,a,r}=await coreFixture(t);g.snapshot(a.id);s.run('update characters set level=5 where id=?',r.id);
 const session=new Session({store:s,game:g});session.state='gateway_active';session.account=a;
 const send=()=>session.sendable([[3,'player.PlayerMsg',{}]]).map(unpack);
 const first=send();assert.ok(first.some(p=>p.code===537));const list=decode('systemopen.SystemOpenHashOpenList',first.find(p=>p.code===537).payload);assert.ok(list.sysId.includes(101));assert.ok(!list.sysId.includes(135));assert.ok(!send().some(p=>p.code===537));
 s.run('update characters set level=6 where id=?',r.id);assert.ok(decode('systemopen.SystemOpenHashOpenList',send().find(p=>p.code===537).payload).sysId.includes(135));
 const next=new Session({store:s,game:g});next.state='gateway_active';next.account=a;assert.ok(next.sendable([[3,'player.PlayerMsg',{}]]).map(unpack).some(p=>p.code===537));
});
