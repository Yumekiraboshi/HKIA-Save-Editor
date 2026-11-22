import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

async function loadTs(path){
 const {outputFiles}=await build({
  entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'
 });
 return import('data:text/javascript;base64,'+
  Buffer.from(outputFiles[0].text).toString('base64'));
}
const {sourceIconDyeRegions}=await loadTs('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await loadTs('../src/dye-recolor.ts');
const native=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8')).records;
const names=JSON.parse(readFileSync(new URL('../public/source-names/en.json',import.meta.url),'utf8')).names;
const source={group:'collection_group_teagarden',sheet:0,cell:101};
const yellow='290453986',sky='808145972',green='911692875',periwinkle='1473720360';
const variants=[yellow,sky,green,periwinkle];

function originalItemIds(){
 const zip=readFileSync(new URL('../public/item-packs/collection_group_teagarden.zip',import.meta.url));
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 const nameLen=zip.readUInt16LE(26),extraLen=zip.readUInt16LE(28);
 assert.equal(zip.toString('utf8',30,30+nameLen),'index.json');
 const at=30+nameLen+extraLen;
 const index=JSON.parse(zip.subarray(at,at+zip.readUInt32LE(18)).toString('utf8'));
 return index.records.filter(([,sheet,cell])=>sheet===source.sheet&&cell===source.cell)
  .map(([id])=>String(id));
}
function originalShapedNeutralFixture(){
 const pixels=new Uint8ClampedArray(96*96*4);
 for(let y=20;y<=78;y++)for(let x=20;x<=81;x++){
  const i=(y*96+x)*4;
  pixels[i]=139;pixels[i+1]=137;pixels[i+2]=135;pixels[i+3]=255;
 }
 return pixels;
}
test('all 45 original game High Tea Flower Clip variants are source-mapped, not invented',()=>{
 const ids=originalItemIds();
 assert.equal(ids.length,45);
 assert.equal(new Set(ids).size,45);
 for(const id of ids){
  assert.match(names[id],/ High Tea Flower Clip$/);
  assert.ok(native[id],'source native five-channel dye metadata required: '+id);
 }
 const expected={
  [yellow]:['White and Yellow High Tea Flower Clip','#fede49'],
  [sky]:['White and Sky High Tea Flower Clip','#bbf2ef'],
  [green]:['White and Green High Tea Flower Clip','#78d244'],
  [periwinkle]:['White and Periwinkle High Tea Flower Clip','#afb4fd']
 };
 for(const id of variants){
  assert.ok(ids.includes(id));
  assert.equal(names[id],expected[id][0]);
  assert.equal(native[id].colors[0],'#fdf7e6');
  assert.equal(native[id].colors[1],expected[id][1]);
 }
});
test('distinct second native dye colors alter real petal pixels while crown/alpha remain unchanged',()=>{
 const input=originalShapedNeutralFixture(),at=(x,y)=>(y*96+x)*4;
 const mask=sourceIconDyeRegions('item_c_dyeable_highteaflowerclip',input,96,96,source);
 assert.ok(mask,'source-cell-gated native 2D flower region exists');
 assert.equal(mask[at(38,52)/4],1,'left petals keep original first dye channel');
 assert.equal(mask[at(64,52)/4],2,'right petals receive original second dye channel');
 assert.equal(mask[0],0,'transparent image pixels are not dyed');
 const baseline=recolorDyePixels(input,96,96,native[yellow],mask);
 assert.ok(baseline);
 for(const id of variants.slice(1)){
  const other=recolorDyePixels(input,96,96,native[id],mask);
  assert.ok(other);
  assert.deepEqual([...baseline.pixels.slice(at(38,52),at(38,52)+4)],
   [...other.pixels.slice(at(38,52),at(38,52)+4)],
   'identical first game dye remains visually identical');
  assert.notDeepEqual([...baseline.pixels.slice(at(64,52),at(64,52)+3)],
   [...other.pixels.slice(at(64,52),at(64,52)+3)],
   'different native second game dye changes actual icon bitmap');
  for(let p=3;p<input.length;p+=4)assert.equal(other.pixels[p],input[p],
   'no added alpha or silhouette changes');
 }
 assert.equal(input[at(64,52)],139,'source icon is immutable');
});
test('changed art, unsupported source cell or non-dyeable item fails closed',()=>{
 const pixels=originalShapedNeutralFixture(),key='item_c_dyeable_highteaflowerclip';
 assert.equal(sourceIconDyeRegions(key,pixels,96,96),undefined);
 assert.equal(sourceIconDyeRegions('unverified_flower',pixels,96,96,source),undefined);
 for(const wrong of [
  {...source,sheet:1},{...source,cell:100},
  {...source,group:'collections_group_clothing'}
 ])assert.equal(sourceIconDyeRegions(key,pixels,96,96,wrong),undefined);
 const replaced=new Uint8ClampedArray(pixels);
 for(let p=0;p<replaced.length;p+=4)if(replaced[p+3]){
  replaced[p]=242;replaced[p+1]=14;replaced[p+2]=23;
 }
 assert.equal(sourceIconDyeRegions(key,replaced,96,96,source),undefined);
});
