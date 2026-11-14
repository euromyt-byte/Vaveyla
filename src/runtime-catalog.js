import {addCustomMount} from "./custom-mount.js";
import fs from 'node:fs';
import path from 'node:path';
import {manifest,resolve} from './assets.js';
import {need,hash} from './util.js';
// Full multilingual skill catalogs exceed 16 MiB on the original Android client.
const MAX_CATALOG_BYTES=64*1024*1024;
const allowed=new Set(['mounttemplate','runetemplate','mapnode','giftpackage','compose','transformtemplate','upgradetemplate','config','skilltemplate','skillpropertytemplate','talenteffecttemplate','skillbuffertemplate','activity','activityschedule']);
// Match the active client's version mapping before considering old copies.
// The browser requests published URLs from version.zip, not every copy on disk.
export function catalogSource(assets,name){
 need(allowed.has(name),'unknown_runtime_catalog');
 const stem='t_s_'+name,re=new RegExp('^'+stem+'(?:-[a-f0-9]{10})?\\.json$','i');
 const logical=['xml/','res/config/','res/config/xml/','res/release/config/',''].map(p=>p+stem+'.json');
 for(const root of [...new Set([assets?.clientRoot,assets?.assetRoot].filter(Boolean))]){
  const m=manifest(root);
  // Prefer the exact logical URL used by the normal XML loader.
  for(const key of logical)if(m&&Object.hasOwn(m.mapping,key)){
   const file=resolve(root,m.mapping[key]);
   need(file,'source_catalog_missing',key+' için aktif sürüm dosyası bulunamadı.');
   return {file,root,via:'manifest',logical:key};
  }
  // Alternate layouts are supported only when their mapped content agrees.
  const mapped=new Set();
  if(m)for(const [key,value]of Object.entries(m.mapping))if(re.test(path.basename(key))||re.test(path.basename(value))){
   const file=resolve(root,value);if(file)mapped.add(file);
  }
  if(mapped.size){
   const contents=new Map();for(const file of mapped){need(fs.statSync(file).size<=MAX_CATALOG_BYTES,'catalog_too_large');contents.set(hash(fs.readFileSync(file)),file);}
   need(contents.size===1,'source_catalog_ambiguous',stem+'.json için aynı aktif sürümde belirsiz eşlemeler var.');
   return {file:[...contents.values()][0],root,via:'manifest',logical:null};
  }
  // No manifest declaration: use the same resolver as HTTP, one canonical
  // path at a time. A populated client root wins over the original asset root.
  for(const key of logical){const file=resolve(root,key);if(file)return {file,root,via:'logical',logical:key};}
 }
 need(false,'source_catalog_missing',stem+'.json özgün oyun klasöründe bulunamadı.');
}
export function runtimeCatalog(assets,name){
 const {file}=catalogSource(assets,name);
 need(fs.statSync(file).size<=MAX_CATALOG_BYTES,'catalog_too_large');
 const content=fs.readFileSync(file);
 let raw;try{raw=JSON.parse(content.toString('utf8').replace(/^\ufeff/,''));}catch{need(false,'invalid_source_catalog',name+': katalog JSON dosyası okunamadı.');}
 need(raw&&typeof raw==='object','invalid_source_catalog',name+': katalog nesnesi eksik.');
 // Original phone XML JSON uses a named table envelope (not a row).
 const envelope='t_s_'+name;
 if(!Array.isArray(raw)&&Object.hasOwn(raw,envelope)){
  need(Object.keys(raw).length===1&&raw[envelope]&&typeof raw[envelope]==='object','invalid_source_catalog',name+': tablo zarfı uyumsuz.');
  raw=raw[envelope];
 }
 if(!Array.isArray(raw))for(const k of ['rows','data','RECORDS'])if(Array.isArray(raw[k])){raw=raw[k];break;}
 const rows=Array.isArray(raw)?raw:Object.values(raw);need(rows.length>0&&rows.length<100000,'invalid_source_catalog',name+': kayıt sayısı uyumsuz ('+rows.length+').');
 const key=name==='activity'?'ActiveId':['mapnode','giftpackage','compose','activityschedule','skillbuffertemplate'].includes(name)?'Id':'TemplateId';
 const numericFields=new Set([...(['skilltemplate','skillpropertytemplate','skillbuffertemplate','talenteffecttemplate'].includes(name)?['Id','TemplateId']:[]),...(name==='skilltemplate'?['MasterType','SonType','Index','Grades','NextTemplateId','NeedPlayerGrade','UseWay','Parameter1','Parameter2','Cost','CoolDown','CastTime','AcceptObject','IsDelphic']:[]),...(name==='skillpropertytemplate'?['AddType']:[])]);
 const out=new Map();for(const input of rows){const row={...input};for(const field of numericFields)if(typeof row[field]==='string'&&/^-?\d+$/.test(row[field])&&Number.isSafeInteger(Number(row[field])))row[field]=Number(row[field]);const id=name==='upgradetemplate'?(Number.isSafeInteger(row?.Id)&&row.Id>0?'Id:'+row.Id:String(row?.Types)+':'+String(row?.TemplateId??0)+':'+String(row?.Grades)):name==='config'?row?.ConfigName:name==='transformtemplate'?(row?.TransformId??row?.TemplateId??row?.Id):row?.[key];need((name==='upgradetemplate'?Number.isSafeInteger(row?.Types)&&Number.isSafeInteger(row?.Grades):name==='config'?typeof id==='string'&&id.length>0:Number.isSafeInteger(id)&&(id>0||['skilltemplate','skillpropertytemplate','skillbuffertemplate','talenteffecttemplate'].includes(name))),'invalid_source_catalog',name+': kayıt anahtarı geçersiz ('+String(id)+').');// The native parseConfigToDic assigns n[h]=s in source order: the last property/skill row wins.
  need(!out.has(id)||['skilltemplate','skillpropertytemplate','skillbuffertemplate','talenteffecttemplate'].includes(name),'invalid_source_catalog',name+': yinelenen kayıt anahtarı ('+String(id)+').');out.set(id,Object.freeze({...row}));}return name==='mounttemplate'?addCustomMount(out):out;
}
