import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

async function loadTs(path){
 const result=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+
  Buffer.from(result.outputFiles[0].text).toString('base64'));
}
const {sourceIconDyeRegions}=await loadTs('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await loadTs('../src/dye-recolor.ts');
const pal=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8')).records;
const names=JSON.parse(readFileSync(new URL('../public/source-names/en.json',import.meta.url),'utf8')).names;
const nativeSources=[
 {group:'collection_group_teagarden',sheet:0,cell:74,count:38,
  family:'High Tea Empire Waist Dress',accent:[64,55],base:[34,55]},
 {group:'collections_group_events',sheet:0,cell:38,count:13,
  family:'Marching Band Two Toned Feather Cap',accent:[54,45],base:[30,45]},
 {group:'collections_group_events',sheet:1,cell:29,count:13,
  family:'Marching Band Peaked Feather Cap',accent:[54,45],base:[30,45]},
 {group:'collections_group_events',sheet:1,cell:92,count:13,
  family:'Marching Band Buttoned Pants',accent:[64,55],base:[30,55]},
 {group:'collections_group_events',sheet:2,cell:118,count:13,
  family:'Marching Band Shako Feather Cap',accent:[54,45],base:[30,45]},
 {group:'collections_group_events',sheet:2,cell:64,count:13,
  family:'Marching Band Badged Shirt',accent:[54,45],base:[30,45]},
 {group:'collections_group_events',sheet:3,cell:47,count:13,
  family:'Marching Band Sashed Shirt',accent:[53,50],base:[30,50]},
 {group:'collections_group_events',sheet:4,cell:111,count:13,
  family:'Marching Band Tall Cap',accent:[54,50],base:[30,70]},
 {group:'collections_group_events',sheet:5,cell:120,count:13,
  family:'Marching Band Two Toned Pants',accent:[34,55],base:[66,55]},
 {group:'collections_group_events',sheet:5,cell:34,count:13,
  family:'Marching Band Buttoned Skirt',accent:[64,55],base:[34,55]}
];
function zipIndex(group){
 const file=readFileSync(new URL('../public/item-packs/'+group+'.zip',import.meta.url));
 assert.equal(file.readUInt32LE(0),0x04034b50);
 const len=file.readUInt16LE(26),extra=file.readUInt16LE(28);
 assert.equal(file.toString('utf8',30,30+len),'index.json');
 const pos=30+len+extra;
 return JSON.parse(file.subarray(pos,pos+file.readUInt32LE(18)).toString('utf8'));
}
const indexes=new Map();
function ids(family){
 if(!indexes.has(family.group))indexes.set(family.group,zipIndex(family.group));
 return indexes.get(family.group).records
  .filter(([,sheet,cell])=>sheet===family.sheet&&cell===family.cell)
  .map(([id])=>String(id));
}
function sourceNeutralPixels(){
 const data=new Uint8ClampedArray(96*96*4);
 for(let y=18;y<=81;y++)for(let x=18;x<=81;x++){
  const p=(y*96+x)*4;data[p]=140;data[p+1]=139;data[p+2]=137;data[p+3]=255;
 }
 return data;
}
test('all 155 original-game Item IDs belong to their exact native source UiIcon cells',()=>{
 let total=0;
 for(const source of nativeSources){
  const entries=ids(source);total+=entries.length;
  assert.equal(entries.length,source.count,source.family);
  assert.equal(new Set(entries).size,source.count);
  for(const id of entries){
   assert.ok(names[id]?.endsWith(' '+source.family),
    'correct native item name for '+source.family+' '+id+': '+names[id]);
   assert.ok(pal[id],'native game palette for '+id);
  }
 }
 assert.equal(total,155); // 38 tea dress + 9 sets of 13
});
test('nine Marching Band families have exact same native first dye and 13 distinct second dyes',()=>{
 for(const family of nativeSources.slice(1)){
  const entries=ids(family),colors=entries.map(id=>pal[id].colors);
  assert.deepEqual([...new Set(colors.map(x=>x[0]))],['#3a3840'],family.family);
  assert.equal(new Set(colors.map(x=>x[1])).size,13,family.family);
  assert.ok(colors.every(x=>/^#[0-9a-f]{6}$/i.test(x[1])),family.family);
 }
});
test('High Tea Empire Waist Dress includes native same-primary distinct-secondary pairs',()=>{
 const family=nativeSources[0],entries=ids(family);
 const itemNameToId=new Map(entries.map(id=>[names[id],id]));
 for(const [a,b] of [
  ['White and Sky','White and Green'],
  ['White and Sky','White and Yellow'],
  ['Blue','Blue and Tan'],
  ['Teal','Teal and Tan']
 ]){
  const ia=itemNameToId.get(a+' '+family.family);
  const ib=itemNameToId.get(b+' '+family.family);
  assert.ok(ia&&ib,a+'/'+b);
  assert.equal(pal[ia].colors[0],pal[ib].colors[0]);
  assert.notEqual(pal[ia].colors[1],pal[ib].colors[1]);
 }
});
test('each exact game source uses original second dye on icon pixels, not overlays',()=>{
 const px=sourceNeutralPixels(),key='item_c_dyeable_original_two_tone';
 const at=(x,y)=>(y*96+x)*4;
 for(const f of nativeSources){
  const mask=sourceIconDyeRegions(key,px,96,96,f);
  assert.ok(mask,'source 2D mask for '+f.family);
  assert.equal(mask[at(...f.accent)/4],2,f.family+' native dye 2');
  assert.equal(mask[at(...f.base)/4],1,f.family+' original base dye');
  assert.equal(mask[0],0,'alpha outside original image stays untouched');
  const entries=ids(f);
  const first=entries[0],second=entries.find(id=>
   pal[id].colors[0]===pal[first].colors[0]&&
   pal[id].colors[1]!==pal[first].colors[1]);
  assert.ok(second,'same first color but different source dye 2: '+f.family);
  const one=recolorDyePixels(px,96,96,pal[first],mask);
  const two=recolorDyePixels(px,96,96,pal[second],mask);
  assert.ok(one&&two);
  assert.deepEqual([...one.pixels.slice(at(...f.base),at(...f.base)+4)],
   [...two.pixels.slice(at(...f.base),at(...f.base)+4)]);
  assert.notDeepEqual([...one.pixels.slice(at(...f.accent),at(...f.accent)+3)],
   [...two.pixels.slice(at(...f.accent),at(...f.accent)+3)]);
  for(let i=3;i<px.length;i+=4)assert.equal(one.pixels[i],px[i]);
  assert.equal(sourceIconDyeRegions('unknown_asset',px,96,96,f),undefined);
  assert.equal(sourceIconDyeRegions(key,px,96,96,
   {...f,cell:f.cell+1}),undefined);
  const replaced=new Uint8ClampedArray(px);
  for(let i=0;i<replaced.length;i+=4)if(replaced[i+3]){
   replaced[i]=230;replaced[i+1]=22;replaced[i+2]=29;
  }
  assert.equal(sourceIconDyeRegions(key,replaced,96,96,f),undefined);
 }
 assert.equal(sourceIconDyeRegions(key,px,96,96),undefined);
});
