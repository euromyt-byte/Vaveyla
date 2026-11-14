#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Assets} from '../src/assets.js';
import {runtimeCatalog,catalogSource} from '../src/runtime-catalog.js';
const client=process.env.VAVEYLA_CLIENT_DIR??path.join(os.homedir(),'vaveyla-v0.8/vaveyla-client-local-v0.8');
const source=process.env.VAVEYLA_ASSET_DIR??'/storage/emulated/0/DCIM/webroot_web';
const assets=new Assets(fs.existsSync(client)?client:null,fs.existsSync(source)?source:null);
for(const [name,label]of [['mounttemplate','Binek'],['runetemplate','Sembol']])try{const selected=catalogSource(assets,name);console.log(label+' kataloğu: '+runtimeCatalog(assets,name).size+' kayıt bulundu. Kaynak: '+path.relative(selected.root,selected.file)+' ('+selected.via+').');}catch(error){console.log(label+' kataloğu: '+error.message);}
