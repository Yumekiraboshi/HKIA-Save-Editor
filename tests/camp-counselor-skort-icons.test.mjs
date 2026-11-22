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
const source={group:'collections_group_events',sheet:1,cell:21};
const pairs=[
 {plain:'1645062322',mixed:'114494397',name:'White / White and Black'},
 {plain:'1962363087',mixed:'2051283646',name:'Green / Green and Brown'},
 {plain:'60984945',mixed:'1976756152',name:'Khaki / Khaki and Brown'},
 {plain:'1516271219',mixed:'2089088060',name:'Light Gray / Light and Dark Gray'}
];
function sourceIds(){
 const zip=readFileSync(new URL('../public/item-packs/collections_group_events.zip',import.meta.url));
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 const nameLen=zip.readUInt16LE(26),extraLen=zip.readUInt16LE(28);
 assert.equal(zip.toString('utf8',30,30+nameLen),'index.json');
 const pos=30+nameLen+extraLen;
 const pack=JSON.parse(zip.subarray(pos,pos+zip.readUInt32LE(18)).toString('utf8'));
 return pack.records.filter(([,sheet,cell])=>sheet===source.sheet&&cell===source.cell)
  .map(([id])=>String(id));
}
function neutralSkort(){
 const pixels=new Uint8ClampedArray(96*96*4);
 for(let y=18;y<84;y++)for(let x=22;x<80;x++){
  const i=(y*96+x)*4;
  pixels[i]=142;pixels[i+1]=140;pixels[i+2]=138;pixels[i+3]=255;
 }
 return pixels;
}
test('all 22 native source-cell IDs are original Camp Counselor Skort colorways',()=>{
 const ids=sourceIds();
 assert.equal(ids.length,22);
 assert.equal(new Set(ids).size,22);
 for(const id of ids){
  assert.match(names[id],/ Camp Counselor Skort$/);
  assert.ok(native[id],'native dye palette required for original Item ID '+id);
 }
 for(const {plain,mixed} of pairs){
  assert.ok(ids.includes(plain)&&ids.includes(mixed));
  assert.equal(native[plain].colors[0],native[mixed].colors[0]);
  assert.notEqual(native[plain].colors[1],native[mixed].colors[1]);
 }
});
test('game palette second channel recolors skort fabric, not CSS; original alpha and first channel remain',()=>{
 const input=neutralSkort(),at=(x,y)=>(y*96+x)*4;
 const mask=sourceIconDyeRegions('item_c_dyeable_counselor_source',input,96,96,source);
 assert.ok(mask);
 assert.equal(mask[at(33,43)/4],1,'left cloth retains source primary dye');
 assert.equal(mask[at(65,58)/4],2,'right pleated cloth receives source second dye');
 assert.equal(mask[0],0,'outside transparency is untouched');
 for(const {plain,mixed,name} of pairs){
  const a=recolorDyePixels(input,96,96,native[plain],mask);
  const b=recolorDyePixels(input,96,96,native[mixed],mask);
  assert.ok(a&&b,name);
  assert.deepEqual([...a.pixels.slice(at(33,43),at(33,43)+4)],
   [...b.pixels.slice(at(33,43),at(33,43)+4)],name+' primary cloth remains identical');
  assert.notDeepEqual([...a.pixels.slice(at(65,58),at(65,58)+3)],
   [...b.pixels.slice(at(65,58),at(65,58)+3)],name+' native secondary dye changes image pixels');
  for(let i=3;i<input.length;i+=4)assert.equal(a.pixels[i],input[i]);
 }
 assert.equal(input[at(65,58)],142,'input is immutable');
});
test('non-native, changed, or unproven source icons reject second-channel skort mask',()=>{
 const original=neutralSkort();
 const key='item_c_dyeable_counselor_source';
 assert.equal(sourceIconDyeRegions(key,original,96,96),undefined);
 assert.equal(sourceIconDyeRegions('item_not_dyeable',original,96,96,source),undefined);
 for(const wrong of [
  {...source,cell:20},{...source,sheet:0},
  {...source,group:'collections_group_clothing'}
 ]){
  assert.equal(sourceIconDyeRegions(key,original,96,96,wrong),undefined);
 }
 const replaced=new Uint8ClampedArray(original);
 for(let i=0;i<replaced.length;i+=4)if(replaced[i+3]){
  replaced[i]=219;replaced[i+1]=21;replaced[i+2]=28;
 }
 assert.equal(sourceIconDyeRegions(key,replaced,96,96,source),undefined);
});
