import {randomInt} from 'node:crypto';
import {need,integer,MAX} from './util.js';
import {table} from './catalog.js';
export const FORGE_MARK='VAVEYLA_FORGE_V1';
export const forgeRules={
 recoverForgeItems(r){this.run('delete from game_forge_stage where character_id=?',r.id);},
 campaignXp(r,xp){const buff=this.get("select percent from game_item_buffs where character_id=? and kind='campaign_xp' and expires_at>?",r.id,this.now());const value=Math.floor(xp*(100+(buff?.percent??0))/100);return integer(value,0,MAX);},
 forgeStage(r,id){return this.get('select * from game_forge_stage where character_id=? and item_id=?',r.id,id);},
 stageForge(r,i,pos,count){
  integer(pos,0,1);integer(count,1,i.count);const t=table('itemtemplate')[i.template_id];
  need([1,4].includes(i.bag),"forge_source_bag");
  need(!this.forgeStage(r,i.id),'forge_already_staged');
  need(pos===0?((t.MasterType===1&&i.count===1)||(t.TransformId>0)||[208020,208021].includes(t.TemplateId)):t.SonType===204,'invalid_forge_material','Bu alana ekipman veya şans taşı yerleştirilmeli.');
  if(count<i.count){
    this.run('update game_items set count=count-? where id=?',count,i.id);
    const result=this.run('insert into game_items(character_id,template_id,bag,position,count,bound) values(?,?,1,?,?,?)',r.id,i.template_id,this.freePosition(r),count,i.bound);
    i=this.item(r,Number(result.lastInsertRowid));
  }
  need(!this.get('select 1 from game_forge_stage where character_id=? and slot=?',r.id,pos),'forge_slot_busy','Önce demircilikteki eşyayı geri al.');
  need(r.level>=t.NeedGrades,'equipment_level');
  this.run('insert into game_forge_stage values(?,?,?)',r.id,pos,i.id);
  return {items:this.inventory(r),changed:true};
 },
 forgeGrade(r,id){return this.get('select grade from game_item_enhancements where character_id=? and item_id=?',r.id,id)?.grade??0;},
 strengthenItem(r,req){
  need(/^VAVEYLA_FORGE_REQ_V1:[a-z0-9-]{6,64}$/.test(req.paraString1),'client_refresh_required','Oyunu yeni sekmede açıp tekrar dene.');
  integer(req.paraInt1,1);integer(req.paraInt2,0,1000);
  const token=req.paraString1,old=this.get('select * from game_forge_actions where character_id=? and token=?',r.id,token);
  if(old){need(old.item_id===req.paraInt1&&old.from_grade===req.paraInt2,'forge_request_conflict');return JSON.parse(old.result_json);}
  const slot=this.get('select item_id from game_forge_stage where character_id=? and slot=0',r.id);need(slot&&slot.item_id===req.paraInt1,'forge_item_missing','Önce güçlendirilecek ekipmanı seç.');
  const item=this.item(r,slot.item_id),t=table('itemtemplate')[item.template_id],grade=this.forgeGrade(r,item.id);
  need(grade===req.paraInt2,'forge_stale_grade','Ekipman seviyesi değişti; tekrar seç.');
  need(t.MasterType===1&&grade<t.StrengthenMax&&grade<r.level,'forge_max_grade','Ekipman güçlendirme sınırına ulaştı.');
  const lucky=this.get('select item_id from game_forge_stage where character_id=? and slot=1',r.id),stone=lucky?this.item(r,lucky.item_id):null,st=stone?table('itemtemplate')[stone.template_id]:null;
  need(!st||st.SonType===204,'invalid_forge_material');
  const cost=Math.floor(1.5**(Math.floor(t.NeedGrades/10)+1)*(Math.min(t.Profile,4)+1)*(grade+1)**2.2*5+500);
  integer(cost,0,MAX);this.wallet(r,'gold',-cost,'forge_strengthen');
  const chance=Math.min(100,Math.max(10,100-grade*10)+(st?.Property1??0));
  const roll=this.forgeRoll?this.forgeRoll():randomInt(100);integer(roll,0,99);const success=roll<chance,next=grade+Number(success);
  if(stone){if(stone.count===1){this.run('delete from game_forge_stage where item_id=?',stone.id);this.run('delete from game_items where id=?',stone.id);}else this.run('update game_items set count=count-1 where id=?',stone.id);}
  if(success)this.run('insert into game_item_enhancements values(?,?,?) on conflict(item_id) do update set grade=excluded.grade',item.id,r.id,next);
  const result={id:item.id,pos:0,bagType:0,objectId:0,strengthenGrade:next,exist:success,property1:FORGE_MARK};
  this.run('insert into game_forge_actions values(?,?,?,?,?)',r.id,token,item.id,grade,JSON.stringify(result));
  this.notice(r,'forge:'+token,'forge',success?`Ekipman güçlendirildi: +${next}.`:'Güçlendirme başarısız; ekipman korundu.');
  return result;
 },
};
