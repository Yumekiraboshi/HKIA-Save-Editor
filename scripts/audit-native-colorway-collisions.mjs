#!/usr/bin/env node
/**
 * Identify source-game dye colorways that STILL have indistinguishable icon
 * previews because the original source UiIcon lacks verified 2..5 masks.
 * This is diagnostic; never auto-invents colored regions to hide collisions.
 *
 * node scripts/audit-native-colorway-collisions.mjs dist/native-colorways
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ID=/^[1-9][0-9]{0,9}$/;
export function auditNativeColorwayCollisions(manifest,nativeRecords){
 if(manifest?.schema!=='HKIA.NativeColorwayIcons.1'||
  !manifest.records||!nativeRecords||typeof nativeRecords!=='object')
  throw Error('DYE_COLLISION_AUDIT_INPUT_INVALID');
 const families=new Map();
 let total=0;
 for(const [id,record] of Object.entries(manifest.records)){
  if(!ID.test(id)||!record||!nativeRecords[id]||
   !Array.isArray(nativeRecords[id].colors)||nativeRecords[id].colors.length!==5)
   throw Error('DYE_COLLISION_AUDIT_ITEM_INVALID');
  const key=record.group+':'+record.sheet+':'+record.cell;
  if(!families.has(key))families.set(key,{key,group:record.group,sheet:record.sheet,
   cell:record.cell,items:[]});
  families.get(key).items.push({
   id,pngSha256:record.sha256,
   dye:nativeRecords[id].dye,
   palette:nativeRecords[id].colors,
   signature:JSON.stringify(nativeRecords[id].colors)
  });
  total++;
 }
 let indistinguishableItems=0,indistinguishableFamilies=0;
 const ranked=[];
 for(const family of families.values()){
  const byBitmap=new Map();
  const allPalettes=new Set();
  for(const item of family.items){
   allPalettes.add(item.signature);
   if(!byBitmap.has(item.pngSha256))byBitmap.set(item.pngSha256,[]);
   byBitmap.get(item.pngSha256).push(item);
  }
  let collisions=0;
  const examples=[];
  for(const group of byBitmap.values()){
   const signatures=new Set(group.map(x=>x.signature));
   if(signatures.size<2)continue;
   collisions+=group.length;
   if(examples.length<3){
    const sample=[];
    const picked=new Set();
    for(const item of group){
     if(picked.has(item.signature))continue;
     sample.push({id:item.id,dye:item.dye,colors:item.palette});
     picked.add(item.signature);
     if(sample.length===3)break;
    }
    examples.push(sample);
   }
  }
  indistinguishableItems+=collisions;
  if(collisions>0)indistinguishableFamilies++;
  ranked.push({
   key:family.key,
   group:family.group,sheet:family.sheet,cell:family.cell,
   colorways:family.items.length,
   uniqueGamePalettes:allPalettes.size,
   uniquePreviewImages:byBitmap.size,
   indistinguishableItems:collisions,
   examples
  });
 }
 ranked.sort((a,b)=>b.indistinguishableItems-a.indistinguishableItems||
  b.colorways-a.colorways||a.key.localeCompare(b.key));
 return {
  schema:'HKIA.NativeColorwayQA.1',
  version:'3.0.1',
  note:'Identical generated 2D UiIcon pixels with different native dye palettes; does not imply game assets are missing.',
  totals:{
   sourceUiIconFamilies:families.size,
   generatedColorways:total,
   indistinguishableItems,
   indistinguishableFamilies,
   visuallyDifferentiatedItems:total-indistinguishableItems
  },
  priorities:ranked.filter(x=>x.indistinguishableItems>0).slice(0,60)
 };
}
const called=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(called){
 const dir=resolve(process.argv[2]??'dist/native-colorways');
 const manifest=JSON.parse(readFileSync(join(dir,'index.json'),'utf8'));
 const native=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8')).records;
 const qa=auditNativeColorwayCollisions(manifest,native);
 writeFileSync(join(dir,'qa.json'),JSON.stringify(qa,null,2)+'\n');
 console.log('HKIA_NATIVE_COLORWAY_COLLISIONS '+JSON.stringify(qa.totals));
 console.log('HKIA_DYE_MASK_PRIORITIES '+JSON.stringify(qa.priorities.slice(0,10).map(x=>({
  source:x.key,colorways:x.colorways,unresolved:x.indistinguishableItems
 }))));
}
