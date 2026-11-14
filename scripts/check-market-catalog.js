#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Assets} from '../src/assets.js';
import {runtimeCatalog,catalogSource} from '../src/runtime-catalog.js';
const client=process.env.VAVEYLA_CLIENT_DIR??path.join(os.homedir(),'vaveyla-v0.8/vaveyla-client-local-v0.8'),source=process.env.VAVEYLA_ASSET_DIR??'/storage/emulated/0/DCIM/webroot_web';
try{
 const assets=new Assets(fs.existsSync(client)?client:null,fs.existsSync(source)?source:null),selected=catalogSource(assets,'giftpackage'),rows=[...runtimeCatalog(assets,'giftpackage').values()];
 console.log('Market paket kataloğu: '+rows.length+' kayıt. Kaynak: '+path.relative(selected.root,selected.file));
 console.log('Dönemlik normal paket: '+rows.filter(r=>[1,2,3].includes(r.Type)&&typeof r.Item==='string'&&r.Item.length>0).length);
}catch(e){console.log('Market paket kataloğu okunamadı: '+e.message+'. Özgün t_s_giftpackage.json dosyası gerekli.');}
