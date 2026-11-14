import {jsonFile,need,integer} from './util.js';
const source=jsonFile('hot-events-source.json');
const PREFIX='VAVEYLA_HOT_V1:';
export const hotEnvelope=(code,body)=>[code,'campaign.CampaignReqMsg',{paraString1:PREFIX+JSON.stringify(body)}];
export const hotEventRules={
 hotEventDay(){return Math.floor(this.now()/86400);},
 hotEventKey(){return 'hot-daily:'+source.event_id+':'+this.hotEventDay();},
 hotEventState(r){
  need(r.level>=source.minimum_level,'hot_event_level','Sıcak Etkinlikler 15. seviyede açılır.');
  const claimed=!!this.get('select 1 from game_reward_events where character_id=? and event_id=?',r.id,this.hotEventKey());
  return {datas:[{activeId:source.event_id,value:1,state:0,type:13,activeCharge:0,packdata:[{packId:'daily',status:claimed?2:1,countDown:0,isShow:true,getCount:claimed?1:0,finishValue:1,param1:'0'}]}]};
 },
 hotEventTemplates(r){
  need(r.level>=source.minimum_level,'hot_event_level');const day=this.hotEventDay(),format=seconds=>new Date(seconds*1000).toISOString().slice(0,19).replace('T',' '),begin=format(day*86400),end=format((day+1)*86400-1),gift=source.source_gift;
  const items=gift.Item.split('|').map(pair=>{const[id,count]=pair.split(',').map(Number);need(id>0&&Number.isSafeInteger(count)&&count>0,'invalid_hot_event_source');return {templateId:id,templateType:1,count,isbind:true,length:0,job:0};});
  return {dataStamp:day+1,mainType:0,curPage:1,maxPage:1,actives:[{activeId:source.event_id,activeType:13,vaveylaStartMs:day*86400000,vaveylaEndMs:(day+1)*86400000-1,title:gift.Name_tr||gift.Name_en,detail:'Yerel günlük ücretsiz hediye. Her karakter günde bir kez alabilir. Günlük yenilenme: 00:00 UTC.',conditionDetail:'Giriş yap ve hediyeni al.',getway:'',beginDate:begin,endDate:end,startTime:begin,stopTime:end,order:1,packages:[{packageId:'daily',order:1,items,conditions:[{conditionId:14,conditionValue:1,conditionBak:0,conditionBak2:0,conditionBak3:0,conditionBak4:0}]}]}]};
 },
 hotEventPackets(r,templates=false){if(r.level<source.minimum_level)return [];return [...(templates?[hotEnvelope(4475,this.hotEventTemplates(r))]:[]),hotEnvelope(4476,this.hotEventState(r))];},
 hotEventRequest(r,req){
  need(req&&[1,2].includes(req.type),'invalid_hot_event_request');integer(req.count,1,1);need(typeof req.activeId==='string'&&['',source.event_id].includes(req.activeId),'unknown_hot_event');
  if(req.type===2){need(req.activeId===source.event_id&&req.packageId==='daily','unknown_hot_event');this.hotEventState(r);const items=source.source_gift.Item.split('|').map(pair=>{const[template_id,count]=pair.split(',').map(Number);return {template_id,count,bound:true};});this.reward(r,this.hotEventKey(),{items});}
  return this.hotEventState(r);
 },
};
