import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const palettes=JSON.parse(read('../public/native-dye-palettes.json')).records;
const names=JSON.parse(read('../public/source-names/en.json')).names;
const files=readFileSync(new URL('../public/item-packs/collections_group_events.zip',import.meta.url));
assert.equal(files.readUInt32LE(0),0x04034b50);
assert.equal(files.readUInt16LE(8),0);
const n=files.readUInt16LE(26),extra=files.readUInt16LE(28);
assert.equal(files.toString('utf8',30,30+n),'index.json');
const start=30+n+extra;
const index=JSON.parse(files.subarray(start,start+files.readUInt32LE(18)).toString('utf8'));
assert.equal(index.schema,'HKIA.SheetIcons.1');
assert.equal(index.group,'collections_group_events');
const specs=[
 {sheet:1,cell:19,name:'Gilded Mermaid Tail',
  pairs:[[484427129,665085209],[1745609775,1888342332]]},
 {sheet:5,cell:141,name:'Ornate Mermaid Tail',
  pairs:[[618853750,1132326826],[828065408,2115898047]]},
 {sheet:6,cell:136,name:'Mermaid Fish Tail',
  pairs:[[496234744,504485289],[694783156,2055020558]]},
 {sheet:6,cell:5,name:'Striped Mermaid Tail',
  pairs:[[231266381,1695480937],[385261404,1658439370]]}
];
async function compile(path){
 const b=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
}
const {sourceIconDyeRegions}=await compile('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await compile('../src/dye-recolor.ts');
function sourceNeutral(){
 const px=new Uint8ClampedArray(96*96*4);
 for(let y=18;y<=81;y++)for(let x=18;x<=81;x++){
  const at=(y*96+x)*4;px[at]=144;px[at+1]=142;px[at+2]=140;px[at+3]=255;
 }
 return px;
}
const at=(x,y)=>(y*96+x)*4;

test('84 original Mermaid item IDs, source Babel names, and eight distinct second dyes match native game assets',()=>{
 for(const family of specs){
  const ids=index.records.filter(([,sheet,cell])=>sheet===family.sheet&&cell===family.cell).map(([id])=>id);
  assert.equal(ids.length,21,family.name);
  assert.equal(new Set(ids).size,21);
  const groupedByPrimary=new Map();
  for(const id of ids){
   assert.ok(names[id]?.endsWith(family.name),id+' native source name '+names[id]);
   const palette=palettes[id];
   assert.ok(palette?.colors[0]);
   const xs=groupedByPrimary.get(palette.colors[0])??[];xs.push(id);
   groupedByPrimary.set(palette.colors[0],xs);
  }
  const samePrimary=[...groupedByPrimary.values()].filter(xs=>xs.length>1);
  assert.equal(samePrimary.length,2,family.name);
  assert.ok(samePrimary.every(xs=>xs.length===2),family.name);
  for(const [first,second] of family.pairs){
   assert.ok(ids.includes(first)&&ids.includes(second));
   assert.equal(palettes[first].colors[0],palettes[second].colors[0]);
   assert.notEqual(palettes[first].colors[1],palettes[second].colors[1]);
  }
 }
});

test('eight native Mermaid palette pairs color real pixels without altering original alpha or shared primary dye',()=>{
 const px=sourceNeutral();
 const base=at(28,55),accent=at(64,55),key='item_c_dyeable_game_mermaid_test';
 for(const family of specs){
  const origin={group:'collections_group_events',sheet:family.sheet,cell:family.cell};
  const mask=sourceIconDyeRegions(key,px,96,96,origin);
  assert.ok(mask,family.name);
  assert.equal(mask[base/4],1);
  assert.equal(mask[accent/4],2);
  assert.equal(mask[0],0);
  for(const [first,second] of family.pairs){
   const a=recolorDyePixels(px,96,96,palettes[first],mask);
   const b=recolorDyePixels(px,96,96,palettes[second],mask);
   assert.ok(a&&b);
   assert.deepEqual([...a.pixels.slice(base,base+3)],
    [...b.pixels.slice(base,base+3)],'same first-game color');
   assert.notDeepEqual([...a.pixels.slice(accent,accent+3)],
    [...b.pixels.slice(accent,accent+3)],'native second game dye recolors item icon');
   for(let j=3;j<px.length;j+=4)assert.equal(a.pixels[j],px[j]);
  }
 }
});

test('unknown game assets, wrong source cells and changed nonneutral artwork fall back safely',()=>{
 const px=sourceNeutral(),altered=new Uint8ClampedArray(px);
 for(let i=0;i<altered.length;i+=4)if(altered[i+3]){
  altered[i]=240;altered[i+1]=9;altered[i+2]=20;
 }
 const key='item_c_dyeable_source_test';
 for(const family of specs){
  const origin={group:'collections_group_events',sheet:family.sheet,cell:family.cell};
  assert.equal(sourceIconDyeRegions('unverified',px,96,96,origin),undefined);
  assert.equal(sourceIconDyeRegions(key,px,96,96,{...origin,cell:family.cell+1}),undefined);
  assert.equal(sourceIconDyeRegions(key,px,96,96,{...origin,group:'unverified'}),undefined);
  assert.equal(sourceIconDyeRegions(key,altered,96,96,origin),undefined);
 }
});
