#!/usr/bin/env node
// Read-only: checks the same roots/version aliases as the HTTP asset server.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Assets,resolve} from '../src/assets.js';
import {runtimeCatalog} from '../src/runtime-catalog.js';
const client=process.env.VAVEYLA_CLIENT_DIR??path.join(os.homedir(),'vaveyla-v0.8/vaveyla-client-local-v0.8');
const source=process.env.VAVEYLA_ASSET_DIR??'/storage/emulated/0/DCIM/webroot_web';
const assets=new Assets(fs.existsSync(client)?client:null,fs.existsSync(source)?source:null);
for(const name of ['res/animation/maps/10000/10000.dat','res/animation/maps/10000/10000.bin']){
 let found;try{for(const root of [assets.clientRoot,assets.assetRoot].filter(Boolean)){const file=resolve(root,name);if(file){found=file;break;}}console.log(name+': '+(found??'BULUNAMADI; özgün harita dosyası gerekli.'));}catch(e){console.log(name+': '+e.message);}
}
try{const nodes=[...runtimeCatalog(assets,'mapnode').values()].filter(n=>n.MapId===10000);console.log('Gökyüzü Şehri harita noktaları: '+nodes.length);}catch(e){console.log('Harita noktaları: '+e.message);}
