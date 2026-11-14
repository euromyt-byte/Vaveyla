import {need,integer} from './util.js';
import {table,group} from './catalog.js';

// Sky City positions on the native wire are tiles; game_world stores pixels.
export const skyRules={
 interactSkyNode(r,id){
  integer(id,1);const w=this.world(r);need(w.map_id===10000,'sky_required');const node=this.sourceRows('mapnode').get(id);need(node&&node.MapId===10000,'unknown_node');
  const range=Math.max(5,Number(node.HandlerRange)||0);need(Math.hypot(w.x/20-node.PosX,w.y/20-node.PosY)<=range,'node_too_far','Bu NPC ile konuşmak için yanına yaklaş.');
  for(const row of this.all("select quest_id from game_quests where character_id=? and status='accepted'",r.id))for(const c of group('questcondiction',row.quest_id))if(c.CondictionType===85){const [map,npc]=String(c.Para4).split(',').map(Number);if(map===10000&&npc===id&&this.factCount(r,'npc_talk',row.quest_id)===0)this.fact(r,'npc_talk',row.quest_id);}
  return {id};
 },
 enterSky(r){
  need(r.level>=15,'sky_level','Gökyüzü Şehri 15. seviyede açılır.');
  const w=this.world(r);
  if(w.map_id!==10000)this.run('update game_world set map_id=10000,x=2800,y=2400,moved_at=?,move_revision=move_revision+1 where character_id=?',this.now(),r.id);
  return this.world(r);
 },
 leaveSky(r){
  if(this.world(r).map_id===10000)this.enterWorld(r,5);
  return this.world(r);
 },
 moveSky(r,q){
  need(this.world(r).map_id===10000,'sky_required');
  need(q.armyId===r.player_id&&q.mapId===10000,'identity_mismatch');
  need([0,1,2].includes(q.moveType),'invalid_move_type');
  const t=table('map')[10000],path=q.routes;
  need(Array.isArray(path)&&path.length>0&&path.length<=128,'invalid_route');
  for(const pos of path){integer(pos.x,0,Math.ceil(t.Width/20)-1);integer(pos.y,0,Math.ceil(t.Height/20)-1);}
  // Type 2 scrolls the camera and must never relocate the character.
  if(q.moveType!==2){
   const end=path.at(-1);
   this.run('update game_world set x=?,y=?,moved_at=?,move_revision=move_revision+1 where character_id=?',end.x*20,end.y*20,this.now(),r.id);
  }
  return {mapId:10000,armyId:r.player_id,routes:path.map(p=>({x:p.x,y:p.y})),moveType:q.moveType};
 },
};
