import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {Assets} from '../src/assets.js';
import {catalogSource,runtimeCatalog} from '../src/runtime-catalog.js';
const client=process.env.VAVEYLA_CLIENT_DIR??path.join(os.homedir(),'vaveyla-v0.8/vaveyla-client-local-v0.8'),source=process.env.VAVEYLA_ASSET_DIR??'/storage/emulated/0/DCIM/webroot_web';
const a=new Assets(fs.existsSync(client)?client:null,fs.existsSync(source)?source:null);
for(const name of ['compose','transformtemplate','upgradetemplate'])try{const where=catalogSource(a,name),rows=runtimeCatalog(a,name);console.log('t_s_'+name+': '+rows.size+' kayıt; '+path.relative(where.root,where.file));}catch(e){console.log('t_s_'+name+': '+e.message+' Malzemeler korunur.');}
