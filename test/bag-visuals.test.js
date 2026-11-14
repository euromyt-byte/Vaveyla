import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {jsonFile} from '../src/util.js';
function client(patched){
 class Field{constructor(){this.text='';this.vars={};}setVar(k,v){this.vars[k]=v;return this;}flushVars(){this.text=this.text.replace(/\{(\w+)(?:=[^}]*)?\}/g,(_,key)=>this.vars[key]??'');return this;}onClick(){}offClick(){}}
 class PropBase{onConstruct(){}dispose(){}}
 class Base{OnShowWind(){}}
 const army={};const ctx=vm.createContext({r:class{},oa:class{},Bh:class{},i0:class{},cEt:PropBase,Sn:Base,
 Ok:{Instance:{isSystemOpen:()=>false}},bk:{BAG_BATTLE_GUARD:1,BAG_BAG:2},B:{Instance:{GetTranslation:key=>key}},
 n0:{Instance:army},ba:{THANE_INFO_UPDATE:1},dJ:{Instance:{addEventListener(){},removeEventListener(){}}},Ue:{UPDATE_BAG:1,DELETE_BAG:2},
 pn:{setTipData(){}},Ent:{CommonTips:1},G$:{Instance:{currentPlayerModel:{playerInfo:{petList:[]}}}},x:()=>true,r_:{FASHION_STORE_SCENE:1}});
 let src=fs.readFileSync(new URL('./fixtures/client-bag-visuals.js',import.meta.url),'utf8');
 if(patched)for(const [a,b]of jsonFile('client-patches.json').patches)if(src.includes(a))src=src.replace(a,b);
 vm.runInContext(src,ctx);return {ctx,army,Field};
}
test('native role opening fails on absent wardrobe info; initialized empty message allows character/equipment/property steps',()=>{
 for(const patched of [false,true]){
  const {ctx,army}=client(patched),model=new ctx.NativeArmyInit();Object.assign(army,model);
  const calls=[],view=new ctx.NativeRoleOpen();
  for(const n of ['updatePersonalInfo','updateFight','updateEquip','refreshHeroFigure','updatePlayerExp','changeView','updateRedPoint','updateFashionRedPoint','checkHonorRedDot','checkJewelRedDot','checkRoleRedDot','checkFortuneRedDot','updateAchieventRetDot','updateMasteryRedPoint','updateDetailTips','onSelectTab0'])view[n]=()=>calls.push(n);
  Object.assign(view,{fashionModel:{},account:{switchIcon(){}},property_com:{onShow:()=>calls.push('property')},page:{},tab0:{},tab1:{},getIndexByBagLeftType:()=>0,hide_0:{},hide_1:{},hide_2:{},hide_3:{},checkbox_fashion:{},frameData:null,thane:{}});
  if(!patched){assert.throws(()=>view.OnShowWind(),/status/);assert.ok(!calls.includes('refreshHeroFigure'));}
  else{view.OnShowWind();assert.ok(calls.includes('updateEquip'));assert.ok(calls.includes('refreshHeroFigure'));assert.ok(calls.includes('property'));assert.equal(army.fashionInfoMsg.status,'1,1,1,1');}
 }
});
test('property labels are Turkish and real hero values replace Chinese design placeholders',()=>{
 const {ctx,army,Field}=client(true),v=new ctx.NativeProperty();
 for(const prefix of ['txt_point_','txt_property_','txt_battleguard_'])for(let i=0;i<9;i++)v[prefix+i]=new Field();
 for(const key of ['txt_point_value5','txt_point_value6','txt_property_value4','txt_property_value5','petIcon','btn_help','detailsBtn'])v[key]=new Field();
 v.hasActiveBattle={};v.OnConstruct=null;v.onConstruct();
 for(let i=0;i<5;i++)assert.doesNotMatch(v['txt_point_'+i].text,/力量|6543218/);
 const hero={id:7,baseProperty:{totalPower:11,totalAgility:12,totalIntellect:13,totalPhysique:14,totalCaptain:15},attackProrerty:{totalIntensity:0,totalTenacity:0,totalPhyAttack:37,totalPhyDefence:38,totalMagicAttack:39,totalMagicDefence:40,totalForceHit:0,totalParry:0,totalLive:1111,totalConatArmy:99,fireResi:0,waterResi:0,windResi:0,electResi:0,darkResi:0,lightResi:0,reduceResi:0}};
 army.thane={grades:10};v.setData(hero);assert.match(v.txt_point_0.text,/Güç.*11/);assert.match(v.txt_property_0.text,/Fiziksel Saldırı.*37/);assert.match(v.txt_property_6.text,/Can.*1111/);
 assert.equal(v._data,hero);assert.doesNotMatch(v.txt_property_7.text,/6543218|力量/);
});
