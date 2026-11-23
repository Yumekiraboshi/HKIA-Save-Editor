import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const load=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const palettes=JSON.parse(load('../public/native-dye-palettes.json')).records;
const names=JSON.parse(load('../public/source-names/en.json')).names;
const zip=readFileSync(new URL('../public/item-packs/collections_group_events.zip',import.meta.url));
assert.equal(zip.readUInt32LE(0),0x04034b50);
assert.equal(zip.readUInt16LE(8),0);
const n=zip.readUInt16LE(26),ext=zip.readUInt16LE(28);
assert.equal(zip.toString('utf8',30,30+n),'index.json');
const begin=30+n+ext;
const index=JSON.parse(zip.subarray(begin,begin+zip.readUInt32LE(18)).toString('utf8'));
assert.equal(index.schema,'HKIA.SheetIcons.1');
assert.equal(index.group,'collections_group_events');

async function compileTs(path){
 const b=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  platform:'node',format:'esm',bundle:true,write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
}
const {sourceIconDyeRegions}=await compileTs('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await compileTs('../src/dye-recolor.ts');

const specs=[
 {sh:1,cell:103,n:11,name:'Paper Bow Dress',part:[64,55],body:[28,55],
  pairs:[[327056606,2053853545],[462118030,916092757]]},
 {sh:3,cell:107,n:11,name:'Glasses',part:[54,50],body:[28,70],
  pairs:[[638590317,2092132649],[1183779248,1318835557]]},
 {sh:0,cell:6,n:8,name:'Leafy Mermaid Top',part:[54,45],body:[28,45],
  pairs:[[283357024,620546797],[384474884,1242190286]]},
 {sh:8,cell:91,n:8,name:'Mermaid Shell Armor',part:[54,45],body:[28,45],
  pairs:[[654265990,1076520735],[1419499421,1517359792]]}
];

function sourceNeutral(){
 const px=new Uint8ClampedArray(96*96*4);
 for(let y=18;y<=81;y++)for(let x=18;x<=81;x++){
  const i=(y*96+x)*4;px[i]=144;px[i+1]=142;px[i+2]=140;px[i+3]=255;
 }
 return px;
}
const offset=([x,y])=>(y*96+x)*4;

test('38 original game Item IDs and 8 native dye pairs have verified source art and names',()=>{
 let total=0;
 for(const spec of specs){
  const ids=index.records.filter(([,sh,cell])=>sh===spec.sh&&cell===spec.cell).map(([id])=>id);
  assert.equal(ids.length,spec.n,spec.name);
  assert.equal(new Set(ids).size,ids.length);
  const primary=new Map();
  for(const id of ids){
   assert.ok(names[id]?.endsWith(spec.name),id+': '+names[id]);
   const p=palettes[id];assert.ok(p?.colors[0]);
   const arr=primary.get(p.colors[0])??[];arr.push(id);primary.set(p.colors[0],arr);
  }
  const duplicates=[...primary.values()].filter(xs=>xs.length>1);
  assert.equal(duplicates.length,2,spec.name);
  assert.ok(duplicates.every(xs=>xs.length===2));
  for(const [a,b] of spec.pairs){
   assert.ok(ids.includes(a)&&ids.includes(b));
   assert.equal(palettes[a].colors[0],palettes[b].colors[0]);
   assert.notEqual(palettes[a].colors[1],palettes[b].colors[1]);
  }
  total+=ids.length;
 }
 assert.equal(total,38);
});

test('source-native second dye changes image RGB while preserving source alpha, first dye and original pixels outside the icon',()=>{
 const raw=sourceNeutral(),key='item_c_dyeable_game_source_test';
 for(const spec of specs){
  const origin={group:'collections_group_events',sheet:spec.sh,cell:spec.cell};
  const mask=sourceIconDyeRegions(key,raw,96,96,origin);
  assert.ok(mask,spec.name);
  const body=offset(spec.body),accent=offset(spec.part);
  assert.equal(mask[body/4],1);
  assert.equal(mask[accent/4],2);
  assert.equal(mask[0],0);
  for(const [a,b] of spec.pairs){
   const x=recolorDyePixels(raw,96,96,palettes[a],mask);
   const y=recolorDyePixels(raw,96,96,palettes[b],mask);
   assert.ok(x&&y);
   assert.deepEqual([...x.pixels.slice(body,body+3)],[...y.pixels.slice(body,body+3)]);
   assert.notDeepEqual([...x.pixels.slice(accent,accent+3)],
    [...y.pixels.slice(accent,accent+3)]);
   for(let i=3;i<raw.length;i+=4)assert.equal(x.pixels[i],raw[i]);
  }
 }
});

test('source mismatch, unknown item keys and replaced pixels fail safely',()=>{
 const raw=sourceNeutral(),altered=new Uint8ClampedArray(raw);
 for(let i=0;i<altered.length;i+=4)if(altered[i+3]){
  altered[i]=239;altered[i+1]=12;altered[i+2]=24;
 }
 for(const spec of specs){
  const origin={group:'collections_group_events',sheet:spec.sh,cell:spec.cell};
  assert.equal(sourceIconDyeRegions('not_item',raw,96,96,origin),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_test',altered,96,96,origin),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_test',raw,96,96,{...origin,group:'unknown'}),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_test',raw,96,96,{...origin,sheet:11}),undefined);
 }
});
