import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

async function loadTs(path){
 const {outputFiles}=await build({
  entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+
  Buffer.from(outputFiles[0].text).toString('base64'));
}
const {sourceIconDyeRegions}=await loadTs('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await loadTs('../src/dye-recolor.ts');
const names=JSON.parse(readFileSync(new URL('../public/source-names/en.json',import.meta.url),'utf8')).names;
const pal=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8')).records;
const group='collections_group_events';
const families=[
 {sh:1,cell:48,n:20,end:'Sports Shorts',accent:[64,55],base:[30,55]},
 {sh:4,cell:39,n:23,end:'Vaporwave Wireframe Hat',accent:[54,50],base:[30,70]},
 {sh:10,cell:18,n:23,end:'Vaporwave Wireframe Pants',accent:[64,55],base:[30,55]},
 {sh:7,cell:48,n:22,end:'Vaporwave Sunset Backpack',accent:[54,45],base:[30,45]},
 {sh:4,cell:45,n:23,end:'Vaporwave Wireframe Glasses',accent:[54,50],base:[30,70]},
 {sh:8,cell:137,n:23,end:'Vaporwave Wireframe Shirt',accent:[54,45],base:[30,45]},
 {sh:7,cell:139,n:18,end:'Basketball Jersey',accent:[54,45],base:[30,45]},
 {sh:6,cell:58,n:18,end:'Feathered Wings',accent:[54,45],base:[30,45]},
 {sh:8,cell:59,n:11,end:'Parade Dress',accent:[64,55],base:[30,55]},
 {sh:10,cell:63,n:11,end:'Origami Armor',accent:[54,45],base:[30,45]},
 {sh:5,cell:10,n:17,end:'Lolita Mini Hat',accent:[54,50],base:[30,70]},
 {sh:6,cell:21,n:16,end:'Gothic Lolita Dress',accent:[64,55],base:[30,55]},
 {sh:10,cell:89,n:20,end:'Tube Top',accent:[54,45],base:[30,45]},
 {sh:4,cell:110,n:20,end:'Tropical Shirt',accent:[54,45],base:[30,45]},
 {sh:3,cell:19,n:17,end:'Spooky Lolita Dress',accent:[64,55],base:[30,55]},
 {sh:10,cell:69,n:18,end:'Lolita Lace Bows',accent:[54,50],base:[30,70]},
 {sh:9,cell:116,n:17,end:'Gothic Lolita Suit',accent:[54,45],base:[30,45]}
];
function nativeIndex(){
 const zip=readFileSync(new URL('../public/item-packs/collections_group_events.zip',import.meta.url));
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 const l=zip.readUInt16LE(26),extra=zip.readUInt16LE(28);
 assert.equal(zip.toString('utf8',30,30+l),'index.json');
 const at=30+l+extra;
 return JSON.parse(zip.subarray(at,at+zip.readUInt32LE(18)).toString('utf8'));
}
const index=nativeIndex();
function ids(f){
 return index.records.filter(([,sh,cell])=>sh===f.sh&&cell===f.cell)
  .map(([id])=>String(id));
}
function paired(f){
 const by=new Map();
 for(const id of ids(f)){
  const k=pal[id].colors[0],arr=by.get(k)||[];arr.push(id);by.set(k,arr);
 }
 for(const entries of by.values())for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)
  if(pal[entries[i]].colors[1]!==pal[entries[j]].colors[1])
   return [entries[i],entries[j]];
 return null;
}
function fixture(){
 const px=new Uint8ClampedArray(96*96*4);
 for(let y=18;y<=81;y++)for(let x=18;x<=81;x++){
  const i=(y*96+x)*4;px[i]=141;px[i+1]=139;px[i+2]=137;px[i+3]=255;
 }
 return px;
}
test('317 item IDs match the 17 exact original source UiIcon cells and native palettes',()=>{
 let total=0;
 for(const f of families){
  const itemIds=ids(f);total+=itemIds.length;
  assert.equal(itemIds.length,f.n,f.end);
  assert.equal(new Set(itemIds).size,f.n);
  for(const id of itemIds){
   assert.ok(names[id]?.endsWith(f.end),'native name '+id+': '+names[id]);
   assert.ok(pal[id]?.colors?.[0],'game native dye palette '+id);
  }
  assert.ok(paired(f),'verified same-first distinct-second colorways '+f.end);
 }
 assert.equal(total,317);
});
test('original game dye 2 changes pixels but no source alpha or first-dye pixels',()=>{
 const input=fixture(),key='item_c_dyeable_game_original',at=(x,y)=>(y*96+x)*4;
 for(const f of families){
  const origin={group,sheet:f.sh,cell:f.cell};
  const mask=sourceIconDyeRegions(key,input,96,96,origin);
  assert.ok(mask,'source only region for '+f.end);
  assert.equal(mask[at(...f.accent)/4],2,'source second dye in '+f.end);
  assert.equal(mask[at(...f.base)/4],1,'first dye elsewhere for '+f.end);
  assert.equal(mask[0],0);
  const [first,second]=paired(f);
  const a=recolorDyePixels(input,96,96,pal[first],mask);
  const b=recolorDyePixels(input,96,96,pal[second],mask);
  assert.ok(a&&b);
  assert.deepEqual([...a.pixels.slice(at(...f.base),at(...f.base)+4)],
   [...b.pixels.slice(at(...f.base),at(...f.base)+4)]);
  assert.notDeepEqual([...a.pixels.slice(at(...f.accent),at(...f.accent)+3)],
   [...b.pixels.slice(at(...f.accent),at(...f.accent)+3)]);
  for(let i=3;i<input.length;i+=4)assert.equal(a.pixels[i],input[i]);
  assert.equal(sourceIconDyeRegions('unknown',input,96,96,origin),undefined);
  assert.equal(sourceIconDyeRegions(key,input,96,96,{...origin,group:'unmapped'}),undefined);
 }
});
test('nonneutral changed original icons reject the unverified 2D region',()=>{
 const pixels=fixture(),key='item_c_dyeable_game_original';
 const altered=new Uint8ClampedArray(pixels);
 for(let i=0;i<altered.length;i+=4)if(altered[i+3]){
  altered[i]=239;altered[i+1]=12;altered[i+2]=25;
 }
 for(const f of families)assert.equal(
  sourceIconDyeRegions(key,altered,96,96,{group,sheet:f.sh,cell:f.cell}),
  undefined,f.end);
 assert.equal(sourceIconDyeRegions(key,pixels,96,96),undefined);
});
