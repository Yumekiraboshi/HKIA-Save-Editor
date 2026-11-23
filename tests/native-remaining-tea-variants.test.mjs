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
const native=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8')).records;
const names=JSON.parse(readFileSync(new URL('../public/source-names/en.json',import.meta.url),'utf8')).names;
const TEA='collection_group_teagarden',CLOTH='collections_group_clothing',EV='collections_group_events';
const sources=[
 {group:TEA,sheet:0,cell:28,n:42,end:'High Tea Waistcoat',accent:[54,45],base:[30,45]},
 {group:TEA,sheet:0,cell:25,n:40,end:'High Tea Flower Bonnet',accent:[54,45],base:[30,45]},
 {group:TEA,sheet:0,cell:63,n:40,end:'High Tea Open Tailcoat',accent:[53,50],base:[26,50]},
 {group:TEA,sheet:0,cell:95,n:40,end:'High Tea Patterned Tailcoat',accent:[54,45],base:[30,60]},
 {group:TEA,sheet:0,cell:107,n:38,end:'High Tea Elegant Dress',accent:[64,55],base:[30,55]},
 {group:TEA,sheet:0,cell:106,n:38,end:'High Tea Dress',accent:[64,55],base:[30,55]},
 {group:TEA,sheet:0,cell:52,n:36,end:'High Tea Long Sleeved Dress',accent:[64,55],base:[30,55]},
 {group:TEA,sheet:0,cell:105,n:34,end:'High Tea Great Coat',accent:[53,50],base:[30,50]},
 {group:CLOTH,sheet:0,cell:39,n:12,end:'Browline Glasses',accent:[54,50],base:[30,70]},
 {group:EV,sheet:2,cell:81,n:18,end:'Soccer Jersey',accent:[54,45],base:[30,60]},
 {group:EV,sheet:4,cell:109,n:12,end:'Grass Skirt',accent:[64,55],base:[30,55]},
 {group:EV,sheet:5,cell:74,n:11,end:'Floral Beachcomber Hat',accent:[54,50],base:[30,70]},
 {group:EV,sheet:7,cell:121,n:22,end:'Vaporwave Eclectic Outfit',accent:[54,45],base:[30,45]}
];
const indexes=new Map();
function indexFor(group){
 if(indexes.has(group))return indexes.get(group);
 const bytes=readFileSync(new URL('../public/item-packs/'+group+'.zip',import.meta.url));
 assert.equal(bytes.readUInt32LE(0),0x04034b50);
 const len=bytes.readUInt16LE(26),extra=bytes.readUInt16LE(28);
 assert.equal(bytes.toString('utf8',30,30+len),'index.json');
 const at=30+len+extra;
 const index=JSON.parse(bytes.subarray(at,at+bytes.readUInt32LE(18)).toString('utf8'));
 indexes.set(group,index);
 return index;
}
function itemIds(f){
 return indexFor(f.group).records.filter(([,sheet,cell])=>
  sheet===f.sheet&&cell===f.cell).map(([id])=>String(id));
}
function sourceNeutralFixture(){
 const pixels=new Uint8ClampedArray(96*96*4);
 for(let y=18;y<=81;y++)for(let x=18;x<=81;x++){
  const i=(y*96+x)*4;
  pixels[i]=142;pixels[i+1]=140;pixels[i+2]=138;pixels[i+3]=255;
 }
 return pixels;
}
function verifiedSourcePair(f){
 const ids=itemIds(f),byPrimary=new Map();
 for(const id of ids){
  const first=native[id].colors[0],a=byPrimary.get(first)||[];
  a.push(id);byPrimary.set(first,a);
 }
 for(const entries of byPrimary.values()){
  for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
   if(native[entries[i]].colors[1]!==native[entries[j]].colors[1])
    return [entries[i],entries[j]];
  }
 }
 return null;
}
test('383 Item IDs from 13 native UiIcon cells are actual game-mapped colorway names',()=>{
 let total=0;
 for(const f of sources){
  const ids=itemIds(f);total+=ids.length;
  assert.equal(ids.length,f.n,f.end);
  assert.equal(new Set(ids).size,f.n,f.end);
  for(const id of ids){
   assert.ok(names[id]?.endsWith(f.end),'native family name for '+id+' '+names[id]);
   assert.ok(native[id]?.colors?.[0],'game-original dye palette required for '+id);
  }
  assert.ok(verifiedSourcePair(f),'same-primary, different-secondary source game pair: '+f.end);
 }
 assert.equal(total,383);
});
test('all 13 source-icon regions recolor real bitmap pixels with native channel 2',()=>{
 const px=sourceNeutralFixture(),key='item_c_dyeable_original_variant',at=(x,y)=>(y*96+x)*4;
 for(const f of sources){
  const origin={group:f.group,sheet:f.sheet,cell:f.cell};
  const mask=sourceIconDyeRegions(key,px,96,96,origin);
  assert.ok(mask,'original UiIcon family '+f.end);
  assert.equal(mask[at(...f.accent)/4],2,f.end+' second dye source region');
  assert.equal(mask[at(...f.base)/4],1,f.end+' first dye region');
  assert.equal(mask[0],0);
  const [one,two]=verifiedSourcePair(f);
  const a=recolorDyePixels(px,96,96,native[one],mask);
  const b=recolorDyePixels(px,96,96,native[two],mask);
  assert.ok(a&&b);
  assert.deepEqual([...a.pixels.slice(at(...f.base),at(...f.base)+4)],
   [...b.pixels.slice(at(...f.base),at(...f.base)+4)]);
  assert.notDeepEqual([...a.pixels.slice(at(...f.accent),at(...f.accent)+3)],
   [...b.pixels.slice(at(...f.accent),at(...f.accent)+3)]);
  for(let i=3;i<px.length;i+=4)assert.equal(a.pixels[i],px[i]);
  assert.equal(sourceIconDyeRegions('unknown_item',px,96,96,origin),undefined);
  assert.equal(sourceIconDyeRegions(key,px,96,96,
   {...origin,group:'not_original_game_source'}),undefined);
 }
});
test('source image replacement fails closed without alternate artwork',()=>{
 const original=sourceNeutralFixture(),key='item_c_dyeable_original_variant';
 const changed=new Uint8ClampedArray(original);
 for(let i=0;i<changed.length;i+=4)if(changed[i+3]){
  changed[i]=238;changed[i+1]=14;changed[i+2]=24;
 }
 for(const f of sources){
  assert.equal(sourceIconDyeRegions(key,changed,96,96,{
   group:f.group,sheet:f.sheet,cell:f.cell
  }),undefined,f.end);
 }
 assert.equal(sourceIconDyeRegions(key,original,96,96),undefined);
});
