#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {parseArgs} from 'node:util';
import {Assets} from '../src/assets.js';
import {game} from '../src/catalog.js';
const {values}=parseArgs({options:{client:{type:'string'},'asset-root':{type:'string'},report:{type:'string'}}});
const client=values.client??process.env.VAVEYLA_CLIENT_DIR??path.join(os.homedir(),'vaveyla-v0.8/vaveyla-client-local-v0.8');
const original=values['asset-root']??process.env.VAVEYLA_ASSET_DIR??'/storage/emulated/0/DCIM/webroot_web';
const roots={client:fs.existsSync(client),original:fs.existsSync(original)};
const assets=new Assets(roots.client?client:null,roots.original?original:null);
const icons=[...new Set(game.itemtemplate.filter(t=>typeof t.Icon==='string'&&t.Icon).map(t=>'res/animation/icon'+t.Icon.toLowerCase()))];
const names={1:'warrior',2:'hunter',3:'wizard'};
const figures=game.herotemplate.filter(t=>t.TemplateId>=1&&t.TemplateId<=6).flatMap(t=>['_body/','_arms/','_hair/front/','_hair/back/','_body_cloak/front/','_body_cloak/back/'].map(part=>`res/animation/equip_show/${names[t.Job]}_default${part}${t.Sexs}/${t.Sexs}.json`));
function check(paths){const missing=[];let found=0;for(const p of paths){try{if(assets.locate(p)){found++;continue;}}catch{}missing.push(p);}return {total:paths.length,found,missing_count:missing.length,missing:missing.slice(0,30)};}
const report={roots,icons:check(icons),character_parts:check(figures),note:'Bu kontrol dosya varlığını doğrular; tarayıcı çizimi veya JSON içindeki atlas bağımlılıklarını doğrulamaz.'};
if(values.report){fs.writeFileSync(values.report,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
