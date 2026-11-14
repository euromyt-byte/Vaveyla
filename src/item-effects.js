import {randomInt} from 'node:crypto';
import {services,table} from './catalog.js';
import {need,integer} from './util.js';
const drops=new Map();for(const row of services.dropitem){if(!drops.has(row.DropId))drops.set(row.DropId,[]);drops.get(row.DropId).push(row);}
const output=d=>({template_id:d.ItemId,count:d.Data,bound:!!d.IsBind});
const valid=d=>Number(d.ValidDate)===0&&Number.isSafeInteger(d.Data)&&d.Data>0&&(d.ItemId<0||table('itemtemplate')[d.ItemId]);
// Type1/100 = guaranteed. Type4 = one relative-weight draw; mixed1+4
// packages grant their fixed rows plus one weighted result per opened pack.
export function packagePlan(t){
 if(![206,207,298,416].includes(t.SonType))return null;
 const rows=drops.get(Number(t.Property1));if(!rows?.length||!rows.every(valid))return null;
 const fixed=[],weighted=[];
 for(const row of rows){
  if(row.AppearType===1&&row.Random===100)fixed.push(output(row));
  else if(row.AppearType===4){let weight=Number(row.Random);if(Math.abs(weight-Math.round(weight))<1e-7)weight=Math.round(weight);if(!Number.isSafeInteger(weight)||weight<0)return null;if(weight>0)weighted.push({...output(row),weight});}
  else return null;
 }
 const total=weighted.reduce((n,d)=>n+d.weight,0);
 if(weighted.length&&(!Number.isSafeInteger(total)||total>=2**48))return null;
 if(!fixed.length&&!total)return null;return {fixed,weighted,total};
}
export function sourcePackage(t){const plan=packagePlan(t);return plan&&!plan.weighted.length?plan.fixed:null;}
export function drawPackage(plan,count,roll=randomInt){
 integer(count,1);const totals=new Map();
 const add=(item,n)=>{const key=item.template_id+':'+Number(item.bound),old=totals.get(key);if(old)old.count+=n;else totals.set(key,{template_id:item.template_id,count:n,bound:item.bound});};
 for(const item of plan.fixed)add(item,item.count*count);
 for(let i=0;i<count&&plan.total;i++){
  let value=roll(plan.total);need(Number.isSafeInteger(value)&&value>=0&&value<plan.total,'invalid_package_roll');
  for(const item of plan.weighted){if(value<item.weight){add(item,item.count);break;}value-=item.weight;}
 }
 return [...totals.values()];
}
