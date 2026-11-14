import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {jsonFile,ROOT} from '../src/util.js';

const atlas=()=>JSON.parse(fs.readFileSync(ROOT+'/data/custom-mount/res/animation/swf/avatar/mount_vaveyla_sphynx/2/2.json'));
function native(extra,path= './swf/avatar/mount_vaveyla_sphynx/2/'){
 const ctx=vm.createContext({d:class{},RO:{STAND:3,WALK:4},La:{MOUNT:1,BODY:2},yO:{avatarShowNamePos:{}},Wn:{isEmptyObj:o=>Object.keys(o).length===0},wO:{RESOURCE_PLAYER_PASSENGER0_TYPE:21,RESOURCE_PLAYER_PASSENGER1_TYPE:22},y_t:{warn(){}}});
 let source=fs.readFileSync(new URL('./fixtures/client-sphynx-seat.js',import.meta.url),'utf8');for(const[a,b]of jsonFile('client-patches.json').patches)if(source.includes(a))source=source.replace(a,b);vm.runInContext(source,ctx);
 const v=new ctx.NativeSeatAvatar(),draws=[];Object.assign(v,{_avatarStandList:[],_avatarWalkList:[],_showTranslucenceView:false,isMorph:false,_isStandPosMount:false,sizeType:3,mountSonType:0,frameX:0,frameY:1,_mirror:1,_destPoint:{},contentBitmap:{},sizeMax:{1:{x:-89,y:-145},3:{x:-130,y:-205}},_bitmap:{graphics:{clear(){draws.length=0;},drawImage(texture,x,y){draws.push({part:texture,x,y});}}},getAvatarByPosition(position,sign,list){let part=list.find(p=>p.resourceInfo?.position===position);if(!part){part={visible:true,offsetX:0};list.push(part);}return part;},resetSizeType(){},updateDepth(){}});
 v.loaderCompleteHandler({extra},{url:'mount-url',preUrl:path,position:1,isMountPart:true});
 for(const list of [v._avatarStandList,v._avatarWalkList]){const mount=list.find(p=>p.resourceInfo.position===1);mount.tempBitmapData='mount';for(const [name,position]of [['body',2],['weapon',3]])list.push({visible:true,loadOver:true,sizeType:1,offsetX:0,offsetY:0,resourceInfo:{position,isMountPart:false},tempBitmapData:name,layouPara:{getCellByKey:()=>({x:20,y:30})}});}
 return {v,draws,draw(state,frame,direction,mirror=1){v.frameX=frame;v.frameY=direction;v._mirror=mirror;v[state==='walk'?'drawWalk':'drawStand']();return draws.map(x=>({...x}));}};
}

test('55 Sphynx saddle corrections are complete and keep original atlas placement and ground anchors intact',()=>{
 const data=atlas(),seat=data.extra.vaveylaSeat,cal=jsonFile('sphynx-seat-calibration.json');assert.equal(seat.kind,'sphynx_guardian_v1');assert.equal(Object.keys(seat.walk).length,40);assert.equal(Object.keys(seat.stand).length,15);
 assert.equal(cal.frames.length,55);for(const entry of cal.frames){const [action,frame,direction]=entry.frame.slice(0,-4).split('_'),offset=seat[action==='W'?'walk':'stand'][frame+'_'+direction];assert.deepEqual(offset,entry.rider_offset);for(const k of ['x','y'])assert.ok(Number.isSafeInteger(offset[k])&&Math.abs(offset[k])<=90);assert.ok(data.frames[entry.frame]);}
 assert.deepEqual(seat.stand['0_0'],{x:11,y:10});assert.deepEqual(seat.stand['0_1'],{x:11,y:3});assert.deepEqual(seat.walk['0_2'],{x:3,y:14});
});

test('real native loader and draw methods move all rider parts to per-frame saddle while mount and unrelated mounts remain unchanged',()=>{
 const data=atlas(),withSeat=native(data.extra),plainExtra={...data.extra};delete plainExtra.vaveylaSeat;const baseline=native(plainExtra),other=native(data.extra,'./swf/avatar/mount_horse_white/2/');
 for(const state of ['stand','walk'])for(let frame=0;frame<(state==='walk'?8:5);frame++)for(let direction=0;direction<5;direction++)for(const mirror of [1,-1]){
  const expected=data.extra.vaveylaSeat[state][frame+'_'+(state==='walk'?direction:baseline.v.getFrameY(direction))];
  const original=baseline.draw(state,frame,direction,mirror),corrected=withSeat.draw(state,frame,direction,mirror);assert.deepEqual(other.draw(state,frame,direction,mirror),original);
  for(const part of original){const actual=corrected.find(p=>p.part===part.part);assert.ok(actual);if(part.part==='mount')assert.deepEqual(actual,part);else{assert.equal(actual.x-part.x,expected.x);assert.equal(actual.y-part.y,expected.y);assert.equal(withSeat.v.contentBitmap.scaleX*(actual.x-part.x),mirror*expected.x);}}
 }
 // Loading a different mount into the reused parts must clear Sphynx metadata.
 withSeat.v.loaderCompleteHandler({extra:plainExtra},{url:'horse',preUrl:'./swf/avatar/mount_horse_white/2/',position:1,isMountPart:true});assert.equal(withSeat.v.getVaveylaSeat(),null);
 withSeat.v.isMorph=true;assert.equal(withSeat.v.getVaveylaSeat(),null);
});
