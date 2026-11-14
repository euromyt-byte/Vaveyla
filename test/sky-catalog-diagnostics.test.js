import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {Assets} from '../src/assets.js';
import {runtimeCatalog} from '../src/runtime-catalog.js';
import {jsonFile} from '../src/util.js';
import {validateDiagnostics} from '../src/http.js';

test('phone t_s_mapnode envelope unwraps indexed records; source names and row identity validation remain strict',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'vaveyla-sky-envelope-'));try{
 fs.mkdirSync(root+'/xml');const file=root+'/xml/t_s_mapnode.json',assets=new Assets(root);
 for(const rows of [[{Id:41,MapId:10000,PosX:140,PosY:120}],{'0':{Id:41,MapId:10000,PosX:140,PosY:120}}]){
  fs.writeFileSync(file,JSON.stringify({t_s_mapnode:rows}));const nodes=runtimeCatalog(assets,'mapnode');assert.equal(nodes.size,1);assert.equal(nodes.get(41).PosX,140);
 }
 for(const raw of [{t_s_mapnode:[{Id:'41',MapId:10000}]},{t_s_mapnode:[{Id:41},{Id:41}]},{t_s_other:[{Id:41}]},{t_s_mapnode:null},{t_s_mapnode:[{Id:41}],extra:1}]){
  fs.writeFileSync(file,JSON.stringify(raw));assert.throws(()=>runtimeCatalog(assets,'mapnode'),e=>e.code==='invalid_source_catalog');
 }
 fs.writeFileSync(root+'/xml/t_s_mounttemplate.json',JSON.stringify({t_s_mounttemplate:[{TemplateId:123,NeedItemId_O:2180001}]}));assert.equal(runtimeCatalog(assets,'mounttemplate').get(123).NeedItemId_O,2180001);
 }finally{fs.rmSync(root,{recursive:true});}
});

const report=()=>({schema:1,state:{cmd_present:false,read_failed:false,node10_present:null,node10_trigger:null,node10_skip:null,node10_finish:null,common_conditions:null,scene_entered:null,main_node:null,sub_node:null,sub_node_index:null},page_errors:[],resource_errors:[],battle:null});
test('Sky City diagnostics read actual scene state without changing scene, positions or player data',()=>{
 const patch=jsonFile('client-patches.json').patches.find(([a])=>a==='__createSpaceHandler(t){let e=t.readBody(oF);');assert.ok(patch);
 const injected=patch[1].slice('__createSpaceHandler(t){'.length,-'let e=t.readBody(oF);'.length);
 const ctx=vm.createContext({s6:{Instance:{currentType:'SPACE_SCENE',nextScene:null,currentScene:{visible:true,active:true,isEnterOver:false},_sceneSwitchAnimation:{alpha:0.5}}},YU:{Instance:{model:{mapId:10000,mapNodesData:[{}],mapTielsData:{'140_120':1},selfArmy:{}},mapView:{x:-2200,y:-1800,_bgLayer:{numChildren:18}}}}});vm.runInContext(injected,ctx);
 const sky=JSON.parse(JSON.stringify(ctx.VAVEYLA_SKY_DIAGNOSTICS()));assert.equal(sky.map_id,10000);assert.equal(sky.scene,'SPACE_SCENE');assert.equal(sky.transition_alpha,0.5);assert.equal(sky.tiles_ready,true);assert.equal(sky.view_x,-2200);assert.equal(sky.tile_views,18);
 const v=report();v.sky=sky;assert.deepEqual(validateDiagnostics(v),v);
 assert.ok(validateDiagnostics(report()));
 for(const bad of [{phase:'create',token:'secret'},{phase:'create',view_x:Infinity},{phase:'create',transition_alpha:2},{phase:'create',scene:'arbitrary account name'}])assert.throws(()=>validateDiagnostics({...report(),sky:bad}));
 delete ctx.YU;assert.deepEqual(JSON.parse(JSON.stringify(ctx.VAVEYLA_SKY_DIAGNOSTICS())),{phase:'read_failed'});
});
