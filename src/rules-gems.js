import {need,integer} from './util.js';
import {table} from './catalog.js';
export const gemRules={
 itemGems(r,id){return this.all('select * from game_item_gems where character_id=? and item_id=? order by slot',r.id,id);},
 inlayGem(r,slot,bag,pos){
  integer(slot,1,4);need([1,0].includes(bag),'invalid_gem_bag');integer(pos,0,99);
  const stage=this.get('select item_id from game_forge_stage where character_id=? and slot=0',r.id);need(stage,'forge_item_missing','Önce mücevher takılacak ekipmanı seç.');const gear=this.item(r,stage.item_id),gt=table('itemtemplate')[gear.template_id];
  need(gt.MasterType===1&&[101,103,104,106,107,108,109,110].includes(gt.SonType),'invalid_gem_equipment');
  const gem=this.inventory(r).find(i=>i.bag===bag&&i.position===pos);need(gem&&gem.id!==gear.id,'item_not_owned');const t=table('itemtemplate')[gem.template_id];
  need(t.SonType===205,'not_a_gem');need(r.level>=t.NeedGrades,'item_level');
  const gems=this.itemGems(r,gear.id);need(!gems.some(g=>g.slot===slot),'gem_slot_occupied','Önce yuvadaki mücevheri çıkar.');need(!gems.some(g=>table('itemtemplate')[g.gem_template_id].Property1===t.Property1),'gem_type_duplicate','Aynı tür mücevher bu ekipmanda zaten takılı.');
  this.run('insert into game_item_gems values(?,?,?,?,?)',gear.id,r.id,slot,t.TemplateId,gem.bound);
  if(gem.bound)this.run('update game_items set bound=1 where id=?',gear.id);
  if(gem.count===1)this.run('delete from game_items where id=?',gem.id);else this.run('update game_items set count=count-1 where id=?',gem.id);
  this.fact(r,'gem_inlay',gear.id);this.notice(r,'gem:'+gear.id+':'+slot+':'+this.now(),'gem','Mücevher ekipmana takıldı.');return this.inventory(r);
 },
 removeGem(r,slot){
  need(slot===-1||Number.isSafeInteger(slot)&&slot>=1&&slot<=4,'invalid_gem_slot');const stage=this.get('select item_id from game_forge_stage where character_id=? and slot=0',r.id);need(stage,'forge_item_missing');
  const gems=this.itemGems(r,stage.item_id).filter(g=>slot===-1||g.slot===slot);need(gems.length,'gem_slot_empty','Bu yuvada mücevher yok.');
  const cost=gems.reduce((n,g)=>n+Number(table('itemtemplate')[g.gem_template_id].Property3),0);integer(cost);this.wallet(r,'gold',-cost,'gem_remove');
  for(const gem of gems){this.addItem(r,gem.gem_template_id,1,!!gem.bound);this.run('delete from game_item_gems where item_id=? and slot=?',gem.item_id,gem.slot);}return this.inventory(r);
 },
};
