import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {jsonFile} from '../src/util.js';

function setup(patch=true){
 const textures=new Map(),pending=[],released=[];let snapshots=0;
 class Sprite{
  constructor(){this.children=[];this.x=0;this.y=0;this.scaleX=1;this.scaleY=1;this.width=0;this.height=0;this.graphics={clear(){},destroy(){},drawTexture(){}};}
  addChild(v){v.removeSelf();v.parent=this;this.children.push(v);return v;}
  addChildAt(v,i){this.addChild(v);this.children.splice(this.children.indexOf(v),1);this.children.splice(i,0,v);return v;}
  removeChild(v){this.children=this.children.filter(x=>x!==v);v.parent=null;}
  removeSelf(){this.parent?.removeChild(this);return this;}
  on(){}off(){}destroy(){}globalToLocal(v){return v;}
  drawToTexture(){snapshots++;throw Error('GPU render target unavailable');}
 }
 class Rectangle{constructor(x=0,y=0,width=0,height=0){Object.assign(this,{x,y,width,height});}get right(){return this.x+this.width;}get bottom(){return this.y+this.height;}}
 const ctx=vm.createContext({console,Laya:{Sprite,Rectangle,Point:class{constructor(x=0,y=0){this.x=x;this.y=y;}},Event:{RESIZE:'resize'}},G1:{drawWay:2},M1:{drawOff:100},Nl:{thumbnail:null},Ze:{MOVE_SCENET_END:'move'},Dl:{stage:{on(){},off(){}},stageWidth:1024,stageHeight:576},s6:{Instance:{currentType:'SPACE_SCENE'}},sa:{SPACE_SCENE:'SPACE_SCENE',CAMPAIGN_MAP_SCENE:'CAMPAIGN_MAP_SCENE'},Ba:{getMapBackPaths:id=>'maps/'+id+'/'},f_t:{useAstc:false},o6:{Instance:{loadRes(url,done){pending.push({url,done});},getRes:url=>textures.get(url),releaseRes:url=>released.push(url)}}});
 let src=fs.readFileSync(new URL('./fixtures/client-sky-render.js',import.meta.url),'utf8');for(const[a,b]of patch?jsonFile('client-patches.json').patches:[])if(src.includes(a))src=src.replace(a,b);vm.runInContext(src,ctx);
 const parent=new Sprite();parent.stage={};const bg=new ctx.NativeSkyBackground(parent,{Id:10000,MapFileId:10000,Width:9000,Height:6000},null,true);
 function flush(skip){while(pending.length){const {url,done}=pending.shift();if(url===skip){done(null);continue;}const texture={url,width:256,height:256};textures.set(url,texture);done(texture);}}
 return {ctx,bg,parent,pending,textures,released,flush,get snapshots(){return snapshots;}};
}

test('Sky City draws source tiles directly when GPU snapshots fail, retaining visible map during movement and resize',()=>{
 const f=setup();assert.equal(f.bg.drawWay,3);
 f.bg.forceUpdate({x:2200,y:2000,width:1024,height:576});assert.ok(f.pending.length>0);f.flush();
 const before=f.bg.children.filter(c=>c.texture);assert.ok(before.length>6);assert.equal(f.snapshots,0);
 const kept=before.find(t=>t.x>=2304&&t.y>=2048);assert.ok(kept);
 f.bg.forceUpdate({x:2300,y:2000,width:1024,height:576});assert.ok(f.bg.children.includes(kept));f.flush();assert.equal(f.snapshots,0);
 f.bg.forceUpdate({x:2300,y:2000,width:1600,height:900});f.flush();assert.ok(f.bg.children.filter(c=>c.texture).length>before.length);assert.equal(f.snapshots,0);
 f.bg.forceUpdate({x:6000,y:4000,width:1024,height:576});f.flush();assert.ok(!f.bg.children.includes(kept));assert.ok(f.bg.children.some(c=>c.texture&&c.x>=5888));
 const other=new f.ctx.NativeSkyBackground(f.parent,{Id:5,MapFileId:5,Width:1000,Height:1000},null);assert.equal(other.drawWay,1);
 f.bg.dispose();assert.ok(f.released.length>0);
});

test('Sky City displays loaded tiles despite one missing image and ignores late image callbacks after leaving',()=>{
 const f=setup();f.bg.forceUpdate({x:2300,y:2000,width:1024,height:576});const missing=f.pending[0].url;f.flush(missing);assert.ok(f.bg.children.filter(c=>c.texture).length>0);assert.equal(f.snapshots,0);
 f.bg.forceUpdate({x:2400,y:2000,width:1024,height:576});assert.ok(f.pending.some(p=>p.url===missing));f.flush();
 f.bg.forceUpdate({x:6000,y:4000,width:1024,height:576});assert.ok(f.pending.length>0);f.bg.dispose();assert.doesNotThrow(()=>f.flush());assert.equal(f.snapshots,0);
});

test('original Sky City compositor requires GPU snapshots and fails in the same unavailable-render-target fixture',()=>{
 const f=setup(false);assert.equal(f.bg.drawWay,2);f.bg.forceUpdate({x:2200,y:2000,width:1024,height:576});assert.throws(()=>f.flush(),/GPU render target unavailable/);assert.equal(f.snapshots,1);
});
