import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const palettes=JSON.parse(read('../public/native-dye-palettes.json')).records;
const names=JSON.parse(read('../public/source-names/en.json')).names;
const specs=[
 {group:'collection_group_citytown',sheet:1,cell:11,n:24,name:'Stylist Overalls',
  primary:[28,55],accent:[64,55],pairs:[[769710857,1428498043]]},
 {group:'collection_group_citytown',sheet:0,cell:65,n:20,name:'Tailor Top',
  primary:[28,45],accent:[54,45],pairs:[[216052092,1458977407]]},
 {group:'collection_group_citytown',sheet:1,cell:61,n:18,name:'Striped Jacket',
  primary:[28,45],accent:[55,45],pairs:[[993155990,1589261612]]},
 {group:'collections_group_events',sheet:0,cell:122,n:19,name:'School Beret',
  primary:[28,70],accent:[54,50],pairs:[[807057949,946224217]]},
 {group:'collections_group_events',sheet:1,cell:127,n:22,name:'Starfish Necklace',
  primary:[28,45],accent:[54,45],pairs:[[173288206,203998026]]}
];
function sourceIndex(group){
 const zip=readFileSync(new URL('../public/item-packs/'+group+'.zip',import.meta.url));
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 assert.equal(zip.readUInt16LE(8),0,'checked-in native index is stored losslessly');
 const len=zip.readUInt16LE(26),ext=zip.readUInt16LE(28);
 assert.equal(zip.toString('utf8',30,30+len),'index.json');
 const start=30+len+ext;
 const idx=JSON.parse(zip.subarray(start,start+zip.readUInt32LE(18)).toString('utf8'));
 assert.equal(idx.schema,'HKIA.SheetIcons.1');
 assert.equal(idx.group,group);
 assert.equal(idx.size,96);
 return idx;
}
async function tsModule(path){
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
}
const {sourceIconDyeRegions}=await tsModule('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await tsModule('../src/dye-recolor.ts');
function neutralSource(){
 const rgba=new Uint8ClampedArray(96*96*4);
 for(let y=18;y<=81;y++)for(let x=18;x<=81;x++){
  const at=(y*96+x)*4;rgba[at]=144;rgba[at+1]=142;rgba[at+2]=140;rgba[at+3]=255;
 }
 return rgba;
}
const at=([x,y])=>(y*96+x)*4;

test('103 genuine original item IDs resolve to precisely five source UiIcon families',()=>{
 let n=0;
 for(const spec of specs){
  const ids=sourceIndex(spec.group).records
   .filter(([,sh,cell])=>sh===spec.sheet&&cell===spec.cell)
   .map(([id])=>id);
  assert.equal(ids.length,spec.n,spec.name);
  assert.equal(new Set(ids).size,ids.length);
  const firstColor=new Map();
  for(const id of ids){
   assert.ok(names[id]?.endsWith(spec.name),String(id)+' '+names[id]);
   assert.ok(palettes[id]?.colors?.[0],'native original dye palette '+id);
   const first=palettes[id].colors[0],group=firstColor.get(first)??[];
   group.push(id);firstColor.set(first,group);
  }
  const pairs=[...firstColor.values()].filter(xs=>xs.length>1);
  assert.equal(pairs.length,1,spec.name+' must have exactly one original shared-primary pair');
  assert.equal(pairs[0].length,2);
  const [a,b]=spec.pairs[0];
  assert.ok(ids.includes(a)&&ids.includes(b));
  assert.deepEqual(new Set(pairs[0]),new Set([a,b]));
  assert.equal(palettes[a].colors[0],palettes[b].colors[0]);
  assert.notEqual(palettes[a].colors[1],palettes[b].colors[1]);
  n+=ids.length;
 }
 assert.equal(n,103);
});

test('five same-primary game pairs differ on actual image pixels using the original second dye only',()=>{
 const src=neutralSource(),key='item_c_dyeable_original_source',alpha=src.filter((_,i)=>i%4===3);
 for(const spec of specs){
  const origin={group:spec.group,sheet:spec.sheet,cell:spec.cell};
  const mask=sourceIconDyeRegions(key,src,96,96,origin);
  assert.ok(mask,'source mask '+spec.name);
  const primary=at(spec.primary),accent=at(spec.accent);
  assert.equal(mask[primary/4],1,spec.name+' native channel 1');
  assert.equal(mask[accent/4],2,spec.name+' native channel 2');
  assert.equal(mask[0],0,'transparent source pixels are unchanged');
  for(const [a,b] of spec.pairs){
   const A=recolorDyePixels(src,96,96,palettes[a],mask);
   const B=recolorDyePixels(src,96,96,palettes[b],mask);
   assert.ok(A&&B);
   assert.deepEqual([...A.pixels.slice(primary,primary+3)],
    [...B.pixels.slice(primary,primary+3)],'original primary dye unchanged');
   assert.notDeepEqual([...A.pixels.slice(accent,accent+3)],
    [...B.pixels.slice(accent,accent+3)],'actual icon secondary dye differs');
   for(let i=3;i<src.length;i+=4)
    assert.equal(A.pixels[i],src[i],spec.name+' alpha must be preserved');
  }
 }
});

test('unknown source cells, wrong game item keys and changed nonneutral source art fail closed',()=>{
 const px=neutralSource(),wrong=new Uint8ClampedArray(px);
 for(let i=0;i<wrong.length;i+=4)if(wrong[i+3]){
  wrong[i]=239;wrong[i+1]=12;wrong[i+2]=20;
 }
 for(const spec of specs){
  const origin={group:spec.group,sheet:spec.sheet,cell:spec.cell};
  assert.equal(sourceIconDyeRegions('unverified',px,96,96,origin),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_test',wrong,96,96,origin),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_test',px,96,96,{...origin,sheet:35}),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_test',px,96,96,{...origin,group:'unmapped'}),undefined);
 }
});
