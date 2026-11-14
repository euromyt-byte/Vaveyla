import path from 'node:path';
import {jsonFile,ROOT,need} from './util.js';
export const SPHYNX=Object.freeze(jsonFile('sphynx-mount.json'));
export function addCustomMount(rows){
 const existing=rows.get(SPHYNX.TemplateId);
 need(!existing||existing.AvatarPath===SPHYNX.AvatarPath,'mount_id_conflict','Özel binek kimliği özgün bir binek ile çakışıyor.');
 rows.set(SPHYNX.TemplateId,SPHYNX);return rows;
}
export function customMountAsset(name){
 const match=/^res\/animation\/(swf\/avatar|equip_show)\/mount_vaveyla_sphynx(?:_s)?\/2\/2\.(json|png)$/.exec(name);
 return match?path.join(ROOT,'data/custom-mount',name):null;
}
