import {randomInt} from 'node:crypto';
import {jsonFile} from './util.js';
const source=jsonFile('combat-status-source.json'),rows=new Map(source.rows.map(r=>[r.Id,r]));
export function skillStatus(t){
 if(!t)return null;
 const ids=String(t.BufferIds??'').split(',').map(Number),buffs=ids.map(id=>rows.get(id));
 if(t.SonType===115&&buffs.length===3&&buffs.every(Boolean)){
  const heal=buffs.find(b=>b.AttackType===33&&b.AttackData===1&&b.AttackWay===4),block=buffs.find(b=>b.AttackType===43),critical=buffs.find(b=>b.AttackType===31);
  if(heal&&block&&critical&&block.ValidCount===critical.ValidCount)return {kind:'endurance',healPercent:heal.ValuePercent,blockPercent:block.AttackValue,criticalDelta:critical.AttackValue,turns:block.ValidCount};
 }
 if(t.SonType===118&&buffs.length===1&&buffs[0]?.AttackType===501)return {kind:'bleed',attackPercent:buffs[0].ValuePercent,turns:buffs[0].ValidCount};
 return null;
}
export function incomingStatusDamage(amount,status,criticalPercent=0,roll=()=>randomInt(10000)){
 const critical=Math.max(0,Math.min(100,criticalPercent+(status?.criticalDelta??0)));
 if(critical>0&&roll()<critical*100)amount=Math.floor(amount*source.local_combat_policy.critical_damage_percent/100);
 if(status?.blockPercent>0&&roll()<Math.min(100,status.blockPercent)*100)amount=Math.floor(amount*source.local_combat_policy.blocked_damage_percent/100);
 return Math.max(0,amount);
}
