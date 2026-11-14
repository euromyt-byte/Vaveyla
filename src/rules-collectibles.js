import {SPHYNX} from "./custom-mount.js";
import {need,integer,date} from './util.js';
import {table} from './catalog.js';
export const collectibleRules={
 sourceRows(name){const rows=this.sourceCatalog?.(name);need(rows instanceof Map,'source_catalog_missing','Özgün '+name+' kataloğu gerekli.');return rows;},
 ownedMounts(r){return this.all('select * from game_mounts where character_id=? and (expires_at=0 or expires_at>?) order by template_id',r.id,this.now());},
 unlockSphynx(r){
  this.run('insert or ignore into game_mounts values(?,?,?,0,?)',r.id,SPHYNX.TemplateId,this.now(),JSON.stringify(SPHYNX));
  // Prepare the preview without mounting or spending resources.
  const state=this.get('select template_id from game_mount_state where character_id=?',r.id);
  if(!state||!this.ownedMounts(r).some(m=>m.template_id===state.template_id)){
   const selected=this.ownedMounts(r).find(m=>m.template_id!==SPHYNX.TemplateId)?.template_id??SPHYNX.TemplateId;
   this.run('insert into game_mount_state values(?,?,0) on conflict(character_id) do update set template_id=excluded.template_id,mounted=0',r.id,selected);
  }
 },
 mountView(r){
  const owned=this.ownedMounts(r).map(m=>JSON.parse(m.template_json)),sum=k=>owned.reduce((n,m)=>n+(Number(m[k])||0),0);
  return {...this.mountState(r),grow_exp:0,property_grade_max:1,power:sum('Power'),intellect:sum('Intellect'),physique:sum('Physique'),agility:sum('Agility')};
 },
 mountList(r){this.unlockSphynx(r);return {soulScore:0,avatarInfo:this.ownedMounts(r).map(m=>({mountTempId:m.template_id,activeDate:date(m.activated_at),expairDate:m.expires_at?date(m.expires_at):"2000-01-01 00:00:00",isExist:true,param1:0,param2:0,starLevel:0,blessing:0}))};},
 activateMount(r,id,pay,selectedCardId=null){
  integer(id,1);need([0,1].includes(pay),'invalid_pay_type');
  const selected=selectedCardId===null?null:this.item(r,selectedCardId);
  if(selected){const ct=table('itemtemplate')[selected.template_id];need(selected.bag===1&&!this.forgeStage(r,selected.id)&&ct?.SonType===218&&Number(ct.Property1)===id,'invalid_mount_card');}
  if(this.ownedMounts(r).some(m=>m.template_id===id))return this.mountList(r);
  const t=id===SPHYNX.TemplateId?SPHYNX:this.sourceRows('mounttemplate').get(id);need(t,'unknown_mount');
  const grade=this.get("select amount from game_resources where character_id=? and currency='mount_grade'",r.id)?.amount??1;
  need(grade>=Number(t.NeedMountGrade||0),'mount_grade','Bu binek için binek seviyen yetersiz.');
  const card=Number(t.NeedItemId_O||0),item=selected??this.inventory(r).find(i=>i.bag===1&&i.template_id===card);let expires=0;
  if(id===SPHYNX.TemplateId){/* Free permanent server-exclusive mount. */}
  else if(item){const ct=table('itemtemplate')[item.template_id];need(ct,'invalid_mount_card');if(ct.SonType===218&&ct.Property2>0)expires=this.now()+ct.Property2*86400;
   if(item.count===1)this.run('delete from game_items where id=?',item.id);else this.run('update game_items set count=count-1 where id=?',item.id);
  }else{const cost=Number(t.Property1||0);integer(cost);need(cost>0,"mount_card_required","Bu binek için etkinleştirme kartı gerekiyor.");this.spendPremium(r,cost,pay===0?2:1,'mount_activate');}
  this.run('insert into game_mounts values(?,?,?,?,?) on conflict(character_id,template_id) do update set activated_at=excluded.activated_at,expires_at=excluded.expires_at,template_json=excluded.template_json',r.id,id,this.now(),expires,JSON.stringify(t));
  this.notice(r,'mount:'+id+':'+this.now(),'mount','Binek etkinleştirildi.');return this.mountList(r);
 },
 mountState(r){
  const state=this.get("select * from game_mount_state where character_id=?",r.id),selected=state?.template_id??0;
  const owned=selected&&this.ownedMounts(r).some(m=>m.template_id===selected);
  const riding=state?.mounted===1;
  return {selected:owned?selected:0,mounted:!!(owned&&riding),grade:1};
 },
 selectMount(r,id){
  integer(id,1);need(this.ownedMounts(r).some(m=>m.template_id===id),'mount_not_owned','Önce bineği etkinleştirmelisin.');
  this.run("insert into game_mount_state values(?,?,1) on conflict(character_id) do update set template_id=excluded.template_id,mounted=1",r.id,id);
  return this.rideMount(r,1);
 },
 rideMount(r,enabled){
  need([0,1].includes(enabled),'invalid_mount_operation');
  if(enabled&&!this.mountState(r).selected)this.unlockSphynx(r);
  if(enabled)need(this.mountState(r).selected>0,'mount_not_selected','Önce Binekler bölümünden bir binek seçmelisin.');
  this.run("update game_mount_state set mounted=? where character_id=?",enabled,r.id);
  return this.mountState(r);
 },
 runePacket(r){return {userId:r.player_id,runeinfo:this.all('select * from game_runes where character_id=? order by rune_type',r.id).map(x=>({runeId:x.template_id,runeGp:0,swallowCount:0,runeHole:'',tempHole:'',newSkillTempId:0})),runeKey:''};},
 learnRune(r,id,pos,count){
  integer(id,1);integer(pos,0,99);need(count===1,'invalid_rune_count');const rows=this.sourceRows('runetemplate');let t=rows.get(id);need(t,'unknown_rune');
  if(t.RuneGrade===0)t=rows.get(t.NextRuneId);need(t&&t.RuneGrade===1,'rune_first_level','İlk seviye sembol seçilmelidir.');integer(t.RuneType,1);
  const old=this.get('select 1 from game_runes where character_id=? and rune_type=?',r.id,t.RuneType);if(old)return this.runePacket(r);
  need(r.level>=Number(t.NeedGrade||0),'rune_level','Sembol için karakter seviyen yetersiz.');
  const item=this.inventory(r).find(i=>i.bag===1&&i.position===pos),it=item&&table('itemtemplate')[item.template_id];need(it?.SonType===302&&it.Property1===t.RuneType,'rune_stone_required','Bu sembole ait öğrenme taşı çantanda olmalı.');
  if(item.count===1)this.run('delete from game_items where id=?',item.id);else this.run('update game_items set count=count-1 where id=?',item.id);
  this.run('insert into game_runes values(?,?,?)',r.id,t.RuneType,t.TemplateId);this.notice(r,'rune:'+t.RuneType,'rune','Sembol öğrenildi.');return this.runePacket(r);
 },
};
