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
 // Counts are ITEMS (not pairs). "first different" is derived only from
 // source-native palette values of pixels that are STILL identical.
 const unresolvedByFirstDifferentChannel={1:0,2:0,3:0,4:0,5:0};
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
  const examples=[],unresolvedBitmapGroups=[];
  for(const group of byBitmap.values()){
   const distinct=[...new Map(group.map(x=>[x.signature,x])).values()];
   if(distinct.length<2)continue;
   // Derive the exact first differing *source* dye channel, never infer
   // where its color should be painted on the game 2D/3D artwork.
   const differing=new Set();
   let firstDifferent=6;
   for(let i=0;i<distinct.length;i++)for(let j=i+1;j<distinct.length;j++){
    for(let ch=0;ch<5;ch++){
     if(distinct[i].palette[ch]!==distinct[j].palette[ch]){
      differing.add(ch+1);
      firstDifferent=Math.min(firstDifferent,ch+1);
     }
    }
   }
   if(firstDifferent<1||firstDifferent>5)throw Error('DYE_COLLISION_AUDIT_PALETTE_MISMATCH');
   unresolvedByFirstDifferentChannel[firstDifferent]+=group.length;
   unresolvedBitmapGroups.push({
    pngSha256:group[0].pngSha256,
    itemIds:group.map(x=>x.id).sort((a,b)=>Number(a)-Number(b)),
    firstDifferentChannel:firstDifferent,
    differentNativeChannels:[...differing].sort((a,b)=>a-b),
    // This means a real game shader/material mask is needed, NOT that an
    // arbitrary 2D pixel patch is an acceptable substitute.
    maskStatus:firstDifferent>=3?'higher-channel-material-mask-unverified':
     'source-preview-channel-mask-incomplete'
   });
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
   unresolvedBitmapGroups,
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
   visuallyDifferentiatedItems:total-indistinguishableItems,
   unresolvedByFirstDifferentChannel,
   unverifiedHigherChannelItems:Object.entries(unresolvedByFirstDifferentChannel)
    .filter(([ch])=>Number(ch)>=3).reduce((sum,[,n])=>sum+n,0)
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
 console.log('HKIA_DYE_COLLISION_FIRST_DIFFERENT_CHANNEL '+JSON.stringify({
  byChannel:qa.totals.unresolvedByFirstDifferentChannel,
  materialMaskBlocked:qa.totals.unverifiedHigherChannelItems,
  lowerChannelIncomplete:qa.totals.indistinguishableItems-
   qa.totals.unverifiedHigherChannelItems
 }));
 // Exact original Item ID pairs needing at most channel 1/2 masks.
 // Printed only in CI developer logs (never in the end-user interface).
 // These are NOT invented masks or guesses about Unity materials.
 const lowerChannel=qa.priorities.flatMap(family=>
  family.unresolvedBitmapGroups.filter(group=>group.firstDifferentChannel<=2)
   .map(group=>({source:family.key,ids:group.itemIds,
    firstDifferentChannel:group.firstDifferentChannel})));
 console.log('HKIA_DYE_CHANNEL2_BACKLOG '+JSON.stringify(lowerChannel));
 console.log('HKIA_DYE_MASK_PRIORITIES '+JSON.stringify(qa.priorities.slice(0,10).map(x=>({
  source:x.key,colorways:x.colorways,unresolved:x.indistinguishableItems
 }))));
}
