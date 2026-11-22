import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

async function loadModule(path){
 const r=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
}
const {recolorDyePixels}=await loadModule('../src/dye-recolor.ts');
const {sourceIconDyeRegions}=await loadModule('../src/dye-icon-regions.ts');
const native=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8')).records;
const names=JSON.parse(readFileSync(new URL('../public/source-names/en.json',import.meta.url),'utf8')).names;
const families=[
 {group:'collection_group_teagarden',sheet:0,cell:18,total:48,
  name:/ High Tea Banded Tophat$/,a:'522640238',b:'571486471'},
 {group:'collections_group_clothing',sheet:0,cell:53,total:45,
  name:/ Banded Mini Tophat$/,a:'396678160',b:'984341911'}
];
function sourceIds(group,sheet,cell){
 const zip=readFileSync(new URL('../public/item-packs/'+group+'.zip',import.meta.url));
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 const nameLen=zip.readUInt16LE(26),extraLen=zip.readUInt16LE(28);
 assert.equal(zip.toString('utf8',30,30+nameLen),'index.json');
 const at=30+nameLen+extraLen;
 const index=JSON.parse(zip.subarray(at,at+zip.readUInt32LE(18)).toString('utf8'));
 return index.records.filter(([,s,c])=>s===sheet&&c===cell).map(([id])=>id);
}
function fixture(){
 const px=new Uint8ClampedArray(96*96*4);
 for(let y=18;y<82;y++)for(let x=22;x<77;x++){
  const p=(y*96+x)*4;px[p]=143;px[p+1]=141;px[p+2]=139;px[p+3]=255;
 }
 return px;
}
test('both Banded Tophat sources map exclusively to original named dyeable Item IDs',()=>{
 for(const f of families){
  const ids=sourceIds(f.group,f.sheet,f.cell);
  assert.equal(ids.length,f.total);
  for(const id of ids){
   assert.match(names[String(id)],f.name);
   assert.ok(native[String(id)]);
  }
  assert.ok(ids.includes(Number(f.a))&&ids.includes(Number(f.b)));
  assert.equal(native[f.a].colors[0],native[f.b].colors[0]);
  assert.equal(native[f.a].colors[0],'#fdf7e6');
  assert.equal(native[f.a].colors[1],'#fede49');
  assert.equal(native[f.b].colors[1],'#bbf2ef');
 }
});
test('band uses original channel 2, crown channel 1; original alpha and fail-closed gates remain',()=>{
 const pixels=fixture(),at=(x,y)=>(y*96+x)*4;
 for(const f of families){
  const mask=sourceIconDyeRegions('item_c_dyeable_hat_source',pixels,96,96,f);
  assert.ok(mask,'verified atlas cell accepts neutral source art');
  assert.equal(mask[at(47,30)/4],1);
  assert.equal(mask[at(47,60)/4],2);
  assert.equal(mask[0],0);
  const one=recolorDyePixels(pixels,96,96,native[f.a],mask);
  const two=recolorDyePixels(pixels,96,96,native[f.b],mask);
  assert.ok(one&&two);
  assert.deepEqual([...one.pixels.slice(at(47,30),at(47,30)+4)],
   [...two.pixels.slice(at(47,30),at(47,30)+4)]);
  assert.notDeepEqual([...one.pixels.slice(at(47,60),at(47,60)+3)],
   [...two.pixels.slice(at(47,60),at(47,60)+3)]);
  for(let i=3;i<pixels.length;i+=4)assert.equal(one.pixels[i],pixels[i]);
  assert.equal(sourceIconDyeRegions('not_an_item',pixels,96,96,f),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_hat_source',pixels,96,96,
   {...f,cell:f.cell+1}),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_hat_source',pixels,96,96,
   {...f,group:'collections_group_weather'}),undefined);
 }
 assert.equal(sourceIconDyeRegions('item_c_dyeable_hat_source',pixels,96,96),undefined);
 const replaced=fixture();
 for(let i=0;i<replaced.length;i+=4)if(replaced[i+3]){
  replaced[i]=230;replaced[i+1]=25;replaced[i+2]=27;
 }
 for(const f of families){
  assert.equal(sourceIconDyeRegions('item_c_dyeable_hat_source',replaced,96,96,f),undefined);
 }
});
