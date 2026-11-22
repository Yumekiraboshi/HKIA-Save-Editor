import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

async function loadTs(path){
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+
  Buffer.from(outputFiles[0].text).toString('base64'));
}
const {sourceIconDyeRegions}=await loadTs('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await loadTs('../src/dye-recolor.ts');
const palettes=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8')).records;
const names=JSON.parse(readFileSync(new URL('../public/source-names/en.json',import.meta.url),'utf8')).names;
const group='collections_group_events';
const families=[
 {sheet:7,cell:56,name:'Marching Band Track Pants',accent:[64,55],base:[30,55]},
 {sheet:8,cell:56,name:'Marching Band Shako Cap',accent:[54,50],base:[30,70]},
 {sheet:7,cell:34,name:'Marching Band Two Toned Cap',accent:[54,50],base:[30,70]},
 {sheet:6,cell:72,name:'Marching Band Two Toned Skirt',accent:[64,55],base:[30,55]},
 {sheet:5,cell:93,name:'Marching Band Two Toned Shirt',accent:[54,45],base:[30,45]},
 {sheet:9,cell:33,name:'Marching Band Lined Skirt',accent:[64,55],base:[30,55]},
 {sheet:7,cell:11,name:'Marching Band Cape',accent:[64,55],base:[30,55]},
 {sheet:5,cell:91,name:'Marching Band Drum',accent:[54,50],base:[30,70]},
 {sheet:5,cell:40,name:'Marching Band Ornate Shirt',accent:[54,45],base:[30,45]},
 {sheet:7,cell:1,name:'Marching Band Lined Pants',accent:[64,55],base:[30,55]},
 {sheet:9,cell:122,name:'Marching Band Tall Feather Cap',accent:[54,45],base:[30,45]},
 {sheet:7,cell:130,name:'Marching Band Peaked Cap',accent:[54,50],base:[30,70]}
];
function gameIndex(){
 const zip=readFileSync(new URL('../public/item-packs/collections_group_events.zip',import.meta.url));
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 const l=zip.readUInt16LE(26),ex=zip.readUInt16LE(28);
 assert.equal(zip.toString('utf8',30,30+l),'index.json');
 const at=30+l+ex;
 return JSON.parse(zip.subarray(at,at+zip.readUInt32LE(18)).toString('utf8'));
}
const index=gameIndex();
function items(f){
 return index.records.filter(([,s,c])=>s===f.sheet&&c===f.cell)
  .map(([id])=>String(id));
}
function neutralSourceFixture(){
 const p=new Uint8ClampedArray(96*96*4);
 for(let y=18;y<=81;y++)for(let x=18;x<=81;x++){
  const i=(y*96+x)*4;
  p[i]=143;p[i+1]=140;p[i+2]=138;p[i+3]=255;
 }
 return p;
}
test('all remaining 12 families contain 156 original game IDs and correct exact names',()=>{
 let total=0;
 for(const f of families){
  const ids=items(f);total+=ids.length;
  assert.equal(ids.length,13,f.name);
  assert.equal(new Set(ids).size,13,f.name);
  for(const id of ids){
   assert.ok(names[id]?.endsWith(' '+f.name),'original game name '+id+' '+names[id]);
   assert.ok(palettes[id],'source-authored native dye for '+id);
  }
 }
 assert.equal(total,156);
});
test('each original marching item family has 13 different native second dyes but same first',()=>{
 for(const f of families){
  const colors=items(f).map(id=>palettes[id].colors);
  assert.deepEqual([...new Set(colors.map(c=>c[0]))],['#3a3840'],f.name);
  assert.equal(new Set(colors.map(c=>c[1])).size,13,f.name);
  assert.ok(colors.every(c=>/^#[0-9a-f]{6}$/i.test(c[1])),f.name);
 }
});
test('all new original source-cell masks recolor pixels with native dye 2 and keep original alpha',()=>{
 const input=neutralSourceFixture(),key='item_c_dyeable_original_marching';
 const at=(x,y)=>(y*96+x)*4;
 for(const f of families){
  const origin={group,sheet:f.sheet,cell:f.cell};
  const mask=sourceIconDyeRegions(key,input,96,96,origin);
  assert.ok(mask,'original 2D profile for '+f.name);
  assert.equal(mask[at(...f.accent)/4],2,f.name+' original second dye');
  assert.equal(mask[at(...f.base)/4],1,f.name+' first dye');
  assert.equal(mask[0],0);
  const ids=items(f),first=ids[0],second=ids[1];
  const a=recolorDyePixels(input,96,96,palettes[first],mask);
  const b=recolorDyePixels(input,96,96,palettes[second],mask);
  assert.ok(a&&b);
  assert.deepEqual([...a.pixels.slice(at(...f.base),at(...f.base)+4)],
   [...b.pixels.slice(at(...f.base),at(...f.base)+4)]);
  assert.notDeepEqual([...a.pixels.slice(at(...f.accent),at(...f.accent)+3)],
   [...b.pixels.slice(at(...f.accent),at(...f.accent)+3)]);
  for(let i=3;i<input.length;i+=4)assert.equal(a.pixels[i],input[i]);
  assert.equal(sourceIconDyeRegions('unverified_item',input,96,96,origin),undefined);
  assert.equal(sourceIconDyeRegions(key,input,96,96,{...origin,cell:f.cell+1}),undefined);
  const unexpected=new Uint8ClampedArray(input);
  for(let i=0;i<unexpected.length;i+=4)if(unexpected[i+3]){
   unexpected[i]=240;unexpected[i+1]=15;unexpected[i+2]=19;
  }
  assert.equal(sourceIconDyeRegions(key,unexpected,96,96,origin),undefined);
 }
 assert.equal(sourceIconDyeRegions(key,input,96,96),undefined);
});
