import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const palettes=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8')).records;
const nativeNames=JSON.parse(readFileSync(new URL('../public/source-names/en.json',import.meta.url),'utf8')).names;
async function compileTs(path){
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+
  Buffer.from(outputFiles[0].text).toString('base64'));
}
const {sourceIconDyeRegions}=await compileTs('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await compileTs('../src/dye-recolor.ts');
const specs=[
 {group:'collection_group_citytown',sheet:2,cell:65,total:22,name:'Sleek City Outfit',
  pairs:[[2053611817,2115654145],[483663954,938457668],[407649469,1252452934]]},
 {group:'collections_group_clothing',sheet:1,cell:36,total:15,name:'Overalls',
  pairs:[[74299247,582861271],[86532470,221072553],[997345487,1449310436]]}
];

/** Decode the actual original game UiIcon index inside the checked-in stored ZIP,
 * not an external/wiki icon or a hard-coded assumed list of game item IDs.
 */
function sourceIconIndex(group){
 const zip=readFileSync(new URL('../public/item-packs/'+group+'.zip',import.meta.url));
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 assert.equal(zip.readUInt16LE(8),0,'native packed index must remain lossless/stored');
 const nameSize=zip.readUInt16LE(26),extra=zip.readUInt16LE(28);
 assert.equal(zip.toString('utf8',30,30+nameSize),'index.json');
 const at=30+nameSize+extra;
 const idx=JSON.parse(zip.subarray(at,at+zip.readUInt32LE(18)).toString('utf8'));
 assert.equal(idx.schema,'HKIA.SheetIcons.1');
 assert.equal(idx.group,group);
 assert.equal(idx.size,96);
 return idx;
}
function neutralIcon(){
 const pixels=new Uint8ClampedArray(96*96*4);
 for(let y=18;y<=81;y++)for(let x=18;x<=81;x++){
  const at=(y*96+x)*4;
  pixels[at]=145;pixels[at+1]=143;pixels[at+2]=141;pixels[at+3]=255;
 }
 return pixels;
}
const pixel=(x,y)=>(y*96+x)*4;

test('the exact two game-original UiIcon cells contain all 37 genuine palette-backed variants',()=>{
 let count=0;
 for(const spec of specs){
  const idx=sourceIconIndex(spec.group);
  const ids=idx.records.filter(([,sheet,cell])=>sheet===spec.sheet&&cell===spec.cell).map(([id])=>id);
  assert.equal(ids.length,spec.total,spec.group);
  assert.equal(new Set(ids).size,ids.length);
  for(const id of ids){
   assert.ok(palettes[id]?.colors[0],String(id));
   assert.ok(nativeNames[id]?.endsWith(spec.name),'exact source Babel name '+id+': '+nativeNames[id]);
  }
  const groups=new Map();
  for(const id of ids){
   const first=palettes[id].colors[0];
   const old=groups.get(first)??[];
   old.push(id);
   groups.set(first,old);
  }
  const actualPairs=[...groups.values()].filter(xs=>xs.length>1);
  assert.equal(actualPairs.length,3,'exactly three source first-dye collisions per cell');
  assert.ok(actualPairs.every(xs=>xs.length===2));
  for(const [a,b] of spec.pairs){
   assert.ok(ids.includes(a)&&ids.includes(b));
   assert.equal(palettes[a].colors[0],palettes[b].colors[0]);
   assert.notEqual(palettes[a].colors[1],palettes[b].colors[1]);
  }
  count+=ids.length;
 }
 assert.equal(count,37);
});

test('game-original second dye colors change *icon pixels*, not rings, overlays or primary fabric',()=>{
 const src=neutralIcon(),key='item_c_dyeable_source_verified',accent=pixel(54,45),main=pixel(28,45);
 for(const spec of specs){
  const origin={group:spec.group,sheet:spec.sheet,cell:spec.cell};
  const mask=sourceIconDyeRegions(key,src,96,96,origin);
  assert.ok(mask,spec.group);
  assert.equal(mask[accent/4],2,'source 2D chest accent');
  assert.equal(mask[main/4],1,'source body remains first dye channel');
  assert.equal(mask[0],0,'source alpha outside silhouette');
  for(const [a,b] of spec.pairs){
   const beforeA=palettes[a],beforeB=palettes[b];
   const recolorA=recolorDyePixels(src,96,96,beforeA,mask);
   const recolorB=recolorDyePixels(src,96,96,beforeB,mask);
   assert.ok(recolorA&&recolorB);
   assert.ok(recolorA.changed>500&&recolorB.changed>500);
   assert.deepEqual([...recolorA.pixels.slice(main,main+3)],
    [...recolorB.pixels.slice(main,main+3)],'same native primary color');
   assert.notDeepEqual([...recolorA.pixels.slice(accent,accent+3)],
    [...recolorB.pixels.slice(accent,accent+3)],'native second dye changes icon artwork');
   for(let i=3;i<src.length;i+=4)
    assert.equal(recolorA.pixels[i],src[i],'original alpha preserved');
  }
 }
});

test('unknown source cells, replaced source art and non-game items cannot inherit new geometry',()=>{
 const src=neutralIcon(),key='item_c_dyeable_source_verified';
 const red=new Uint8ClampedArray(src);
 for(let i=0;i<red.length;i+=4)if(red[i+3]){
  red[i]=240;red[i+1]=12;red[i+2]=15;
 }
 for(const spec of specs){
  const origin={group:spec.group,sheet:spec.sheet,cell:spec.cell};
  assert.equal(sourceIconDyeRegions('unverified_source',src,96,96,origin),undefined);
  assert.equal(sourceIconDyeRegions(key,src,96,96,{...origin,cell:100}),undefined);
  assert.equal(sourceIconDyeRegions(key,src,96,96,{...origin,sheet:20}),undefined);
  assert.equal(sourceIconDyeRegions(key,red,96,96,origin),undefined);
  assert.equal(sourceIconDyeRegions(key,src,95,96,origin),undefined);
 }
 assert.equal(sourceIconDyeRegions(key,src,96,96),undefined);
});
