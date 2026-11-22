import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

async function loadTs(file){
 const r=await build({
  entryPoints:[fileURLToPath(new URL(file,import.meta.url))],
  bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'
 });
 return import('data:text/javascript;base64,'+
  Buffer.from(r.outputFiles[0].text).toString('base64'));
}
const {sourceIconDyeRegions}=await loadTs('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await loadTs('../src/dye-recolor.ts');
const palettes=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8')).records;
const names=JSON.parse(readFileSync(new URL('../public/source-names/en.json',import.meta.url),'utf8')).names;
const source={group:'collections_group_clothing',sheet:0,cell:38};
const pairs=[
 ['84070359','833990488','White','White and Black'],
 ['426901455','747035598','Warm Pink','Warm Pink and Black'],
 ['1676813114','849273304','Blue','Blue and Black'],
 ['2051522529','744815526','Red','Red and Black'],
 ['1266418586','1590676460','Orange','Orange and Black'],
 ['1881281725','886333968','Cream','Cream and Black'],
 ['1944643209','1039676870','Black','Full Black']
];
function sourceItemIds(){
 const zip=readFileSync(new URL('../public/item-packs/collections_group_clothing.zip',import.meta.url));
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 const nameLen=zip.readUInt16LE(26),extraLen=zip.readUInt16LE(28);
 assert.equal(zip.toString('utf8',30,30+nameLen),'index.json');
 const at=30+nameLen+extraLen;
 const index=JSON.parse(zip.subarray(at,at+zip.readUInt32LE(18)).toString('utf8'));
 return index.records.filter(([,sheet,cell])=>sheet===0&&cell===38)
  .map(([id])=>String(id));
}
function neutralFixture(){
 const p=new Uint8ClampedArray(96*96*4);
 for(let y=20;y<78;y++)for(let x=17;x<=81;x++){
  const i=(y*96+x)*4;
  p[i]=142;p[i+1]=139;p[i+2]=137;p[i+3]=255;
 }
 return p;
}
test('all 34 original Triangle Shades map to the precise v3.0.1 native UiIcon source',()=>{
 const ids=sourceItemIds();
 assert.equal(ids.length,34);
 assert.equal(new Set(ids).size,34);
 for(const id of ids){
  assert.match(names[id],/ Triangle Shades$/);
  assert.ok(palettes[id],'original palette for '+id);
 }
 for(const [a,b,nameA,nameB] of pairs){
  assert.ok(ids.includes(a)&&ids.includes(b));
  assert.equal(names[a],nameA+' Triangle Shades');
  assert.equal(names[b],nameB+' Triangle Shades');
  assert.equal(palettes[a].colors[0],palettes[b].colors[0],
   'the collision is explained by identical native channel 1');
  assert.notEqual(palettes[a].colors[1],palettes[b].colors[1],
   'the original game distinguishes these variants with channel 2');
 }
});
test('both triangular lenses use native dye 2, bridge uses native dye 1 and alpha is preserved',()=>{
 const input=neutralFixture(),at=(x,y)=>(y*96+x)*4;
 const mask=sourceIconDyeRegions('item_c_dyeable_triangle_shades',input,96,96,source);
 assert.ok(mask,'exact source icon with neutral lenses supports native dye regions');
 assert.equal(mask[at(34,39)/4],2,'left lens receives game dye 2');
 assert.equal(mask[at(64,39)/4],2,'right lens receives game dye 2');
 assert.equal(mask[at(49,39)/4],1,'bridge retains game dye 1');
 assert.equal(mask[0],0,'outside remains transparent');
 for(const [a,b] of pairs){
  const first=recolorDyePixels(input,96,96,palettes[a],mask);
  const second=recolorDyePixels(input,96,96,palettes[b],mask);
  assert.ok(first&&second);
  assert.deepEqual([...first.pixels.slice(at(49,39),at(49,39)+4)],
   [...second.pixels.slice(at(49,39),at(49,39)+4)],
   'unchanged primary dye has identical frame');
  assert.notDeepEqual([...first.pixels.slice(at(34,39),at(34,39)+3)],
   [...second.pixels.slice(at(34,39),at(34,39)+3)],
   'different native second dye changes original icon image pixels');
  assert.notDeepEqual([...first.pixels.slice(at(64,39),at(64,39)+3)],
   [...second.pixels.slice(at(64,39),at(64,39)+3)]);
  for(let i=3;i<input.length;i+=4)assert.equal(first.pixels[i],input[i]);
 }
 assert.equal(input[at(34,39)],142,'source icon cannot be mutated');
});
test('replaced, unmatched, incorrectly located or non-dyeable source art never receives this mask',()=>{
 const pixels=neutralFixture(),key='item_c_dyeable_triangle_shades';
 assert.equal(sourceIconDyeRegions(key,pixels,96,96),undefined);
 assert.equal(sourceIconDyeRegions('not_dyeable',pixels,96,96,source),undefined);
 // Cell 39 is now a verified original Browline Glasses source, so test
 // rejection against truly unrelated, still-unsupported source cell 37.
 for(const wrong of [
  {...source,cell:37},{...source,sheet:1},
  {...source,group:'collection_group_teagarden'}
 ])assert.equal(sourceIconDyeRegions(key,pixels,96,96,wrong),undefined);
 const recoloredArt=new Uint8ClampedArray(pixels);
 for(let i=0;i<recoloredArt.length;i+=4)if(recoloredArt[i+3]){
  recoloredArt[i]=241;recoloredArt[i+1]=21;recoloredArt[i+2]=24;
 }
 assert.equal(sourceIconDyeRegions(key,recoloredArt,96,96,source),undefined);
});
