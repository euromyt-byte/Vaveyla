import {need,integer,MAX,canonical} from './util.js';
import {table} from './catalog.js';
export const craftingRules={
 craftingRequest(r,req,operation,perform){
  need(req&&/^VAVEYLA_CRAFT_V1:[a-z0-9-]{6,64}$/.test(req.token),'client_refresh_required');
  const fingerprint=canonical({operation,...req}),old=this.get('select * from game_craft_actions where character_id=? and token=?',r.id,req.token);
  if(old){need(old.fingerprint===fingerprint,'craft_request_conflict');return JSON.parse(old.result_json);}
  const result=perform();this.run('insert into game_craft_actions values(?,?,?,?)',r.id,req.token,fingerprint,JSON.stringify(result));return result;
 },
 takeCraftMaterial(r,id,count,{staged=false}={}){
  integer(count,1,MAX);need(table('itemtemplate')[id],'unknown_item');
  const rows=this.all('select * from game_items where character_id=? and template_id=? and bag=1 order by id',r.id,id).filter(i=>staged||!this.forgeStage(r,i.id));
  need(rows.reduce((n,i)=>n+i.count,0)>=count,'craft_material_missing','Birleştirme için yeterli malzeme yok.');
  for(const i of rows){const n=Math.min(count,i.count);if(n===i.count)this.run('delete from game_items where id=?',i.id);else this.run('update game_items set count=count-? where id=?',n,i.id);count-=n;if(!count)break;}
 },
 composeItem(r,req){return this.craftingRequest(r,req,'compose',()=>{
  integer(req.recipe,1);integer(req.count,1,1000);const recipe=this.sourceCatalog('compose').get(req.recipe);need(recipe,'unknown_recipe');
  need(r.level>=integer(recipe.NeedMinLevel??1,0,200),'craft_level');
  const output=table('itemtemplate')[integer(recipe.NewMaterial,1)];need(output,'unknown_item');
  const materials=new Map();for(let i=1;i<=4;i++){const id=recipe['Material'+i]??0;if(!id)continue;integer(id,1);const count=integer(recipe['Count'+i],1,MAX)*req.count;integer(count,1,MAX);materials.set(id,(materials.get(id)||0)+count);}
  need(materials.size>0,'invalid_recipe');const cost=integer(recipe.NeedGold??0,0,MAX)*req.count;integer(cost,0,MAX);
  let main=null,grade=0,gems=[];
  const mainTemplate=table('itemtemplate')[recipe.Material1];
  if(req.count===1&&recipe.Count1===1&&mainTemplate?.MasterType===1&&output.MasterType===1&&mainTemplate.SonType===output.SonType){
   main=this.all('select * from game_items where character_id=? and template_id=? and bag in(1,4) order by bag desc,id',r.id,recipe.Material1).find(i=>!this.forgeStage(r,i.id));
   need(main,'craft_material_missing');grade=this.forgeGrade(r,main.id);gems=this.itemGems(r,main.id);
   need(grade<=output.StrengthenMax,'craft_enhancement_limit','Hedef ekipmanın güçlendirme sınırı mevcut seviyeden düşük.');
  }
  this.wallet(r,'gold',-cost,'compose:'+req.recipe);
  for(const[id,count]of materials){if(main&&id===main.template_id){this.run('delete from game_items where id=?',main.id);if(count>1)this.takeCraftMaterial(r,id,count-1);}else this.takeCraftMaterial(r,id,count);}
  const oldIds=new Set(this.all('select id from game_items where character_id=?',r.id).map(i=>i.id));
  this.addItem(r,output.TemplateId,req.count,main?!!main.bound:true);
  if(main){const made=this.all('select * from game_items where character_id=? and template_id=? and bag=1',r.id,output.TemplateId).find(i=>!oldIds.has(i.id));need(made,'craft_output_missing');
   if(grade)this.run('insert into game_item_enhancements values(?,?,?)',made.id,r.id,grade);
   for(const gem of gems)this.run('insert into game_item_gems values(?,?,?,?,?)',made.id,r.id,gem.slot,gem.gem_template_id,gem.bound);
   if(main.bag===4&&r.level>=output.NeedGrades)this.moveItem(r,made.id,4,main.position,1);
  }this.notice(r,'craft:'+req.token,'craft','Birleştirme tamamlandı.');return {composeResult:true,templateId:output.TemplateId,count:req.count};
 });},
 transformItem(r,req){return this.craftingRequest(r,req,'transform',()=>{
  integer(req.source,1);integer(req.destination,1);integer(req.count,1,9999);need(req.source!==req.destination,'invalid_transform');
  const source=table('itemtemplate')[req.source],dest=table('itemtemplate')[req.destination];need(source&&dest&&source.TransformId>0,'invalid_transform');
  const recipe=this.sourceCatalog('transformtemplate').get(source.TransformId);need(recipe,'unknown_transform');
  const ids=Array.from({length:8},(_,i)=>recipe['Material'+(i+1)]).filter(Boolean);need(ids.includes(req.source)&&ids.includes(req.destination),'invalid_transform');
  const items=this.all('select * from game_items where character_id=? and template_id=? and bag=1',r.id,req.source),staged=items.find(i=>this.forgeStage(r,i.id)?.slot===0);
  need(staged&&staged.count>=req.count,'forge_item_missing');
  const grade=this.forgeGrade(r,staged.id),gems=this.itemGems(r,staged.id);need((!grade&&!gems.length)||(source.MasterType===1&&dest.MasterType===1&&source.SonType===dest.SonType&&grade<=dest.StrengthenMax&&req.count===staged.count),'transform_equipment_incompatible','Hedef eşya mevcut geliştirme ve taşlarla uyumlu değil.');
  const discount=Math.max(0,Math.min(100,this.vipPrivilegeValue(r,14)));const cost=Math.floor(integer(recipe.CostGold,0,MAX)*req.count*(100-discount)/100);integer(cost,0,MAX);this.wallet(r,'gold',-cost,'transform');
  if(req.count===staged.count&&req.count<=dest.MaxCount)this.run('update game_items set template_id=? where id=?',req.destination,staged.id);else{if(req.count===staged.count)this.run('delete from game_items where id=?',staged.id);else this.run('update game_items set count=count-? where id=?',req.count,staged.id);this.addItem(r,req.destination,req.count,!!staged.bound);}
  this.notice(r,'craft:'+req.token,'craft','Eşya dönüştürüldü.');return {composeResult:true,templateId:req.destination,count:req.count};
 });},
};
