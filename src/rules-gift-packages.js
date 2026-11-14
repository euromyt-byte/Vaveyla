import {need,integer,nonce} from './util.js';
export function giftPeriod(type,now){
 integer(type,1,3);const d=new Date((now-5*3600)*1000),day=Math.floor((now-5*3600)/86400);
 return type===1?'d:'+day:type===2?'w:'+Math.floor((day+3)/7):'m:'+d.getUTCFullYear()+'-'+(d.getUTCMonth()+1);
}
export const giftPackageRules={
 giftCounts(r){
  const source=this.sourceRows('giftpackage'),infos=[];
  for(const row of this.all('select * from game_gift_purchases where character_id=?',r.id)){
   const t=source.get(row.package_id);if(t&&[1,2,3].includes(t.Type)&&row.period===giftPeriod(t.Type,this.now()))infos.push({id:row.package_id,num:row.count});
  }
  const byId=new Map(infos.map(x=>[x.id,x.num]));
  const products=[...source.values()].filter(t=>t.ProductId&&[1,2,3].includes(t.Type)).map(t=>({productId:t.ProductId,count:byId.get(t.Id)||0}));
  return {infos,products};
 },
 claimGiftPackage(r,id,count,productId){
  integer(id,1);integer(count,1,100);const t=this.sourceRows('giftpackage').get(id);need(t,'unknown_gift_package');
  need(String(t.ProductId??'')===productId,'gift_product_mismatch');
  need(r.level>=Number(t.NeedGrades||0),'gift_level');
  const limit=integer(Number(t.PurchaseLimit),1,10000),period=giftPeriod(t.Type,this.now()),used=this.get('select count from game_gift_purchases where character_id=? and package_id=? and period=?',r.id,id,period)?.count??0;
  need(used+count<=limit,'gift_purchase_limit','Bu paketin dönemlik alma sınırına ulaştın.');
  need(typeof t.Item==='string'&&t.Item.length>0&&t.Item.length<20000,'invalid_gift_rewards');
  const items=t.Item.split('|').filter(Boolean).map(pair=>{need(/^-?[1-9][0-9]*,[1-9][0-9]*$/.test(pair),'invalid_gift_rewards');const [template_id,n]=pair.split(',').map(Number);return {template_id,count:integer(n*count,1),bound:true};});need(items.length>0&&items.length<=100,'invalid_gift_rewards');
  const normalized=this.normalizeReward({items});const reward=this.reward(r,'gift-package:'+id+':'+nonce(),normalized);
  this.run('insert into game_gift_purchases values(?,?,?,?) on conflict(character_id,package_id,period) do update set count=excluded.count',r.id,id,period,used+count);
  return {package_id:id,product_id:productId,count,real_payment:false,reward,period,purchased:used+count};
 },
};
