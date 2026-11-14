import {need,integer,job,MAX} from './util.js';
import {et} from './catalog.js';
export const progressionRules={
 optionalProgressionCatalog(name){
  this._progressionCatalogFailures??=new Set();if(this._progressionCatalogFailures.has(name))return null;
  try{return this.sourceCatalog?.(name)??null;}catch(e){
   if(!['source_catalog_missing','unknown_runtime_catalog','invalid_source_catalog','catalog_too_large','source_catalog_ambiguous'].includes(e.code))throw e;
   this._progressionCatalogFailures.add(name);console.warn('wartune_progression_catalog_unavailable catalog='+name+' reason='+e.code+' detail='+String(e.message).replace(/[\r\n]/g,' ').slice(0,300));return null;
  }
 },
 skillTemplates(){
  const rows=this.optionalProgressionCatalog('skilltemplate');
  if(!rows)return et('skilltemplate');
  if(this._skillSource===rows)return this._skillIndex;
  const index={...et('skilltemplate')};
  for(const r of rows.values())if(Number.isSafeInteger(r.TemplateId)&&[1,2,3,9,10,20,30,100].includes(r.MasterType)&&Number.isSafeInteger(r.SonType)&&Number.isSafeInteger(r.Grades)&&r.Grades>=1&&Number.isSafeInteger(r.Index)&&Number.isSafeInteger(Number(r.NextTemplateId)))index[r.TemplateId]={...r,PreTemplateId:String(r.PreTemplateId??''),NextTemplateId:Number(r.NextTemplateId)};
  this._skillSource=rows;this._skillIndex=index;return index;
 },
 skillProperty(id){return this.optionalProgressionCatalog('skillpropertytemplate')?.get(id)??et('skillpropertytemplate')[id];},
 talentInfo(r){const state=this.get('select * from game_talent_progress where character_id=?',r.id)??{grade:0,spent:0};const learned=this.all('select template_id from game_talent_skills where character_id=? order by template_id',r.id).map(x=>x.template_id);return {userId:r.player_id,talentGrade:state.grade,talentPoint:Math.max(0,state.grade-state.spent),talentSkill:learned.join(','),currentBranch:0,sealOrder:[],isActiveSecond:false,talentIndex:0};},
 upgradeTalent(r,req){return this.craftingRequest(r,req,'talent-grade',()=>{
  need(r.level>=50,'talent_level','Yetenekler 50. seviyede açılır.');integer(req.count,1,100);const old=this.talentInfo(r),rows=[...this.sourceCatalog('upgradetemplate').values()];let gold=0,xp=0;
  for(let i=1;i<=req.count;i++){const next=rows.find(x=>x.Types===21&&x.Grades===old.talentGrade+i);need(next,'talent_max_grade');if(next.PlayerLevel>0)need(r.level>=next.PlayerLevel,'talent_level');gold+=integer(next.TemplateId,0,MAX);xp+=integer(next.Data,0,MAX);}
  integer(gold,0,MAX);integer(xp,0,MAX);const progress=this.get('select xp from game_progress where character_id=?',r.id);need(progress.xp>=xp,'talent_xp','Yetenek geliştirmek için yeterli EXP yok.');this.wallet(r,'gold',-gold,'talent-grade');this.run('update game_progress set xp=xp-?,revision=revision+1 where character_id=?',xp,r.id);
  this.run('insert into game_talent_progress values(?,?,0) on conflict(character_id) do update set grade=excluded.grade',r.id,old.talentGrade+req.count);return this.talentInfo(r);
 });},
 learnTalent(r,id){
  this.sourceCatalog('skilltemplate'); // Talent spending requires the verified full catalog.
  integer(id,1);need(r.level>=50,'talent_level');const skills=this.skillTemplates(),t=skills[id];need(t&&[job(r)*10,9,100].includes(t.MasterType)&&t.Index>9&&t.Index<100,'talent_job');const info=this.talentInfo(r),owned=info.talentSkill?info.talentSkill.split(',').map(Number):[],own=owned.map(id=>skills[id]).find(x=>x?.Index===t.Index&&x.MasterType===t.MasterType);
  if(own?.TemplateId===id)return info;
  const first=Object.values(skills).filter(x=>x.MasterType===t.MasterType&&x.Index===t.Index).sort((a,b)=>a.Grades-b.Grades)[0];need(own?Number(own.NextTemplateId)===id:first?.TemplateId===id,'talent_sequence');need(info.talentPoint>0,'talent_points');need(info.talentGrade>=t.NeedPlayerGrade,'talent_grade');
  for(const prior of String(t.PreTemplateId).match(/\d+/g)??[]){const p=skills[prior];need(p&&owned.some(id=>skills[id]?.MasterType===p.MasterType&&skills[id]?.Index===p.Index&&skills[id]?.Grades>=p.Grades),'talent_prerequisite');}
  let properties={};try{properties=this.sourceCatalog('skillpropertytemplate').get(id)??{};}catch(e){if(e.code!=='source_catalog_missing')throw e;}
  const effects=[];for(const buff of String(t.BufferIds??'').match(/\d+/g)??[]){if(+buff===0)continue;const b=this.sourceCatalog('skillbuffertemplate').get(+buff);need(b,'talent_effect_missing');for(const eff of String(b.TalentEffIds??'').match(/\d+/g)??[]){if(+eff===0)continue;const e=this.sourceCatalog('talenteffecttemplate').get(+eff);need(e,'talent_effect_missing');effects.push(e);}}
  need(Object.keys(properties).length||effects.length||t.Parameter1||t.Parameter2,'talent_effect_missing');
  if(own)this.run('delete from game_talent_skills where character_id=? and template_id=?',r.id,own.TemplateId);
  this.run('insert into game_talent_skills values(?,?,?,?)',r.id,id,JSON.stringify(properties),JSON.stringify(effects));this.run('update game_talent_progress set spent=spent+1 where character_id=?',r.id);return this.talentInfo(r);
 },
 progressionBonuses(r){const flat={},percent={};const add=(dest,row)=>{for(const k of ['Power','Agility','Intellect','Physique','Live','Attack','MagicAttack','Defence','MagicDefence','ForceHit','Parry']){const v=Number(row[k])||0;if(Number.isFinite(v))dest[k]=(dest[k]||0)+v;}};
  for(const row of this.all('select properties_json from game_talent_skills where character_id=?',r.id)){const p=JSON.parse(row.properties_json);add(p.AddType===0?percent:flat,p);}
  for(const row of this.all('select properties_json from game_fashion_appraisals where character_id=?',r.id))add(flat,JSON.parse(row.properties_json));return {flat,percent};
 },
 combatSkill(r,id,activeTalent=0){const skill=this.skillTemplates()[id];if(!skill)return null;const out={...skill};let cdFlat=0,cdPercent=0,spFlat=0,spPercent=0,damagePercent=0,damageFlat=0;
  for(const row of this.all('select template_id,effects_json from game_talent_skills where character_id=?',r.id))for(const e of JSON.parse(row.effects_json)){if(this.skillTemplates()[row.template_id]?.UseWay===1&&row.template_id!==activeTalent)continue;if(e.EffSkillType!==-1&&e.EffSkillType!==out.SonType)continue;cdFlat+=Number(e.EffCdValue)||0;cdPercent+=Number(e.EffCdPercent)||0;spFlat+=Number(e.EffSpValue)||0;spPercent+=Number(e.EffSpPercent)||0;damagePercent+=Number(e.EffDamPercent)||0;damageFlat+=Number(e.EffDamValue)||0;if(e.EffAttackObject)out.AcceptObject=e.EffAttackObject;}
  out.Parameter1=Math.trunc(out.Parameter1*(100+damagePercent)/100);out.Parameter2=Math.trunc((out.Parameter2+damageFlat)*(100+damagePercent)/100);
  out.CoolDown=Math.max(0,Math.trunc((out.CoolDown+cdFlat)*(100+cdPercent)/100));out.Cost=Math.max(-100,Math.min(100,Math.trunc(out.Cost*(out.Cost<=0?(100+spPercent)/100:1)+spFlat)));return out;
 },
};
