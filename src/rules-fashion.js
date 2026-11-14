import {need,integer} from './util.js';
import {table,config} from './catalog.js';
const slots={hatAvata:[9,110,'hat'],clothAvata:[10,112,'fashionCloth'],armAvata:[11,111,'fashionArm'],wingAvata:[8,109,'wing']};
export const fashionRules={
 fashionInfo(r){
  const status=this.get('select status from game_fashion_state where character_id=?',r.id)?.status??'1,1,1,1';
  const progress=this.get('select grades,gp from game_fashion_progress where character_id=?',r.id)??{grades:1,gp:0};
  const result={...progress,status,flag:0,hatAvata:0,clothAvata:0,armAvata:0,wingAvata:0,appearance:{hat:'',fashionCloth:'',fashionArm:'',wing:''}};
  const borrowed=JSON.parse(this.get('select looks_json from game_fashion_looks where character_id=?',r.id)?.looks_json??'{}');
  const visible=status.split(',');let n=0;
  for(const [field,[pos,type,key]]of Object.entries(slots)){
   const item=this.get('select template_id from game_items where character_id=? and bag=4 and position=?',r.id,pos),t=table('itemtemplate')[borrowed[field]??item?.template_id];
   if(t?.SonType===type){result[field]=t.TemplateId;if(visible[n]==='1')result.appearance[key]=String(t.Avata||'');}n++;
  }
  return result;
 },
 fashionBook(r){
  const ids=Object.values(table('itemtemplate')).filter(t=>t.MasterType===1&&[109,110,111,112].includes(t.SonType)).map(t=>t.TemplateId);
  for(const row of this.all('select distinct template_id from game_items where character_id=? and bag in(1,4)',r.id))if(ids.includes(row.template_id))this.run('insert or ignore into game_fashion_book values(?,?)',r.id,row.template_id);
  return {info:this.all('select template_id from game_fashion_book where character_id=? order by template_id',r.id).map(x=>({tempId:x.template_id,appraisalSkill:this.get('select skill_id from game_fashion_appraisals where character_id=? and template_id=?',r.id,x.template_id)?.skill_id??0,isSwitch:false})),fashionIds:ids};
 },
 saveFashionBook(r,id){integer(id,1);const book=this.fashionBook(r);need(book.info.some(x=>x.tempId===id),'fashion_not_owned');return book;},
 composeFashion(r,req){return this.craftingRequest(r,req,'fashion',()=>{
  integer(req.count,1,9999);const slot=this.get('select item_id from game_forge_stage where character_id=? and slot=0',r.id);need(slot,'forge_item_missing');
  const item=this.item(r,slot.item_id),t=table('itemtemplate')[item.template_id];need(item.bag===1&&req.count<=item.count,'invalid_fashion_material');
  const fashion=t.MasterType===1&&[109,110,111,112].includes(t.SonType);need(fashion||[208020,208021].includes(t.TemplateId),'invalid_fashion_material');
  need(!this.forgeGrade(r,item.id)&&!this.itemGems(r,item.id).length,'fashion_modified','Geliştirilmiş veya taş takılmış eşyayı birleştirmeden önce geri al.');
  const gain=integer(Number(config(fashion?(t.SonType===109?'Fashion_Wing':'Fashion_Other'):t.TemplateId===208020?'Fashion_Soul':'Fashion_Lucky')),1,1000000)*req.count;
  const levels=new Map([...this.sourceCatalog('upgradetemplate').values()].filter(x=>x.Types===113).map(x=>['113:'+x.Grades,x])),progress=this.get('select grades,gp from game_fashion_progress where character_id=?',r.id)??{grades:1,gp:0};
  need(levels.has('113:'+(progress.grades+1)),'fashion_max_grade','Moda gelişimi en yüksek seviyede veya özgün gelişim kataloğu eksik.');
  let grade=progress.grades,gp=integer(progress.gp+gain,0,2147483647),next;
  while((next=levels.get('113:'+(grade+1)))&&gp>=integer(next.Data,1,2147483647)){gp-=next.Data;grade++;}
  this.fashionBook(r);if(req.count===item.count)this.run('delete from game_items where id=?',item.id);else this.run('update game_items set count=count-? where id=?',req.count,item.id);
  this.run('insert into game_fashion_progress values(?,?,?) on conflict(character_id) do update set grades=excluded.grades,gp=excluded.gp',r.id,grade,gp);
  this.notice(r,'craft:'+req.token,'fashion','Moda birleştirme tamamlandı.');return {composeResult:true,pos:0,objectId:0,bagType:0,grades:grade,gp};
 });},
 appraiseFashion(r,req){return this.craftingRequest(r,req,'fashion-appraisal',()=>{
  integer(req.templateId,1);need(r.level>=27,'fashion_appraisal_level','Moda değerlendirme 27. seviyede açılır.');const book=this.fashionBook(r);need(book.info.some(x=>x.tempId===req.templateId),'fashion_not_owned');const t=table('itemtemplate')[req.templateId];need(t&&[109,110,111,112].includes(t.SonType),'invalid_fashion_item');const quality=integer(t.Property2,1,5),previous=this.get('select skill_id from game_fashion_appraisals where character_id=? and template_id=?',r.id,req.templateId),skills=this.sourceCatalog('skilltemplate'),old=previous&&skills.get(previous.skill_id);need(!previous||old,'fashion_skill_missing');
  const grade=(old?.Grades??0)+1;need(grade<=5,'fashion_appraisal_max');const next=[...skills.values()].find(s=>s.MasterType===t.SonType*10&&s.SonType===quality&&s.Grades===grade);need(next,'fashion_skill_missing');const props=this.sourceCatalog('skillpropertytemplate').get(next.TemplateId);need(props,'fashion_skill_missing');
  if(previous)this.takeCraftMaterial(r,208020,6-quality);else this.wallet(r,'gold',200000*(quality-6),'fashion-appraisal');
  this.run('insert into game_fashion_appraisals values(?,?,?,?) on conflict(character_id,template_id) do update set skill_id=excluded.skill_id,properties_json=excluded.properties_json',r.id,t.TemplateId,next.TemplateId,JSON.stringify(props));this.notice(r,'craft:'+req.token,'fashion','Moda değerlendirmesi tamamlandı.');return {templateId:t.TemplateId,appraisalSkill:next.TemplateId,grades:grade};
 });},
 changeFashion(r,req){
  need(req&&[0,1].includes(req.flag),'invalid_fashion_operation');
  need(typeof req.status==='string'&&/^[01],[01],[01],[01]$/.test(req.status),'invalid_fashion_status');
  const borrowed={};
  if(req.flag===1)for(const [field,[pos,type]]of Object.entries(slots)){
   const id=req[field]??0;integer(id,0);const current=this.get('select * from game_items where character_id=? and bag=4 and position=?',r.id,pos);
   if(id===0){if(current)this.moveItem(r,current.id,1,this.freePosition(r),1);continue;}
   const t=table('itemtemplate')[id];need(t?.SonType===type,'invalid_fashion_item');
   if(current?.template_id===id)continue;
   const item=this.all('select * from game_items where character_id=? and template_id=? and bag=1 order by position',r.id,id).find(i=>!this.forgeStage(r,i.id));if(!item){need(this.fashionBook(r).info.some(x=>x.tempId===id),'fashion_not_owned','Bu moda eşyası çantanda veya koleksiyonunda bulunmalı.');this.checkDestination(r,{template_id:id,count:1},4,pos);borrowed[field]=id;continue;}
   this.moveItem(r,item.id,4,pos,1);
  }
  if(req.flag===1)this.run('insert into game_fashion_looks values(?,?) on conflict(character_id) do update set looks_json=excluded.looks_json',r.id,JSON.stringify(borrowed));
  this.run('insert into game_fashion_state values(?,?) on conflict(character_id) do update set status=excluded.status',r.id,req.status);
  return this.fashionInfo(r);
 },
};
