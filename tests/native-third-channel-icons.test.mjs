import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const importTs=async(path)=>{
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
};
const {sourceIconDyeRegions}=await importTs('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await importTs('../src/dye-recolor.ts');
const palette=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8')).records;

/** The game's packaged image-index JSON is ZIP STORED (method 0). */
function originalIndex(group){
 const file=group==='collection_group_teagarden'?
  '../public/item-packs/collection_group_teagarden.zip':
  '../public/item-packs/collections_group_events.zip';
 const bytes=readFileSync(new URL(file,import.meta.url));
 assert.equal(bytes.readUInt32LE(0),0x04034b50);
 assert.equal(bytes.readUInt16LE(8),0,'source image index is stored, not transformed');
 const size=bytes.readUInt32LE(18),nameSize=bytes.readUInt16LE(26),extra=bytes.readUInt16LE(28);
 assert.equal(bytes.toString('utf8',30,30+nameSize),'index.json');
 return JSON.parse(bytes.toString('utf8',30+nameSize+extra,30+nameSize+extra+size));
}

// Original game-image cell, and two actual saved Item IDs whose *source*
// palettes first differ in channel 3. No hand-authored Item IDs or dyes.
const families=[
 {group:'collection_group_teagarden',sheet:0,cell:52,ids:[1455741581,1652402208]},
 {group:'collection_group_teagarden',sheet:0,cell:63,ids:[805349350,2118564646]},
 {group:'collection_group_teagarden',sheet:0,cell:74,ids:[2023553236,2049159837]},
 {group:'collection_group_teagarden',sheet:0,cell:95,ids:[244061916,263053499]},
 {group:'collection_group_teagarden',sheet:0,cell:105,ids:[450304938,769139215]},
 {group:'collections_group_events',sheet:2,cell:81,ids:[795400755,1501547067]}
];
const byGroup=new Map([
 ['collection_group_teagarden',originalIndex('collection_group_teagarden')],
 ['collections_group_events',originalIndex('collections_group_events')]
]);

function neutralSource(){
 const pixels=new Uint8ClampedArray(96*96*4);
 for(let y=15;y<=85;y++)for(let x=18;x<=82;x++){
  const j=(y*96+x)*4;
  pixels[j]=pixels[j+1]=pixels[j+2]=155;
  pixels[j+3]=255;
 }
 return pixels;
}

test('all six remaining pairs map to the original Steam v3.0.1 sprite and native palette-3 difference',()=>{
 for(const family of families){
  const pack=byGroup.get(family.group);
  assert.equal(pack.schema,'HKIA.SheetIcons.1');
  assert.equal(pack.group,family.group);
  for(const id of family.ids){
   assert.ok(pack.records.some(([item,sheet,cell])=>item===id&&sheet===family.sheet&&cell===family.cell),
    family.group+':'+id+' is not on the original icon');
   assert.ok(palette[String(id)],'verified native dye missing '+id);
  }
  const [a,b]=family.ids.map(id=>palette[String(id)].colors);
  assert.deepEqual(a.slice(0,2),b.slice(0,2));
  assert.notEqual(a[2],b[2],family.group+':'+family.cell);
  assert.ok(a[2]&&b[2]);
 }
 assert.equal(families.length*2,12);
});

test('source-cell-gated 2D original pixels receive native third dye, never a CSS swatch',()=>{
 for(const family of families){
  const input=neutralSource();
  const origin={group:family.group,sheet:family.sheet,cell:family.cell,url:'unused',x:0,y:0};
  const mask=sourceIconDyeRegions('item_c_dyeable_original',input,96,96,origin);
  assert.ok(mask,'no source regions for '+family.group+':'+family.cell);
  for(const channel of [1,2,3])assert.ok(mask.includes(channel),'missing channel '+channel);
  const third=[...mask].filter(x=>x===3).length;
  assert.ok(third>=28&&third<=1050,'source-cell region out of bounds: '+third);

  const [a,b]=family.ids.map(id=>recolorDyePixels(input,96,96,palette[String(id)],mask));
  assert.ok(a&&b,'actual source palette recoloring failed');
  let different=0;
  for(let i=0;i<mask.length;i++){
   const j=i*4;
   assert.equal(a.pixels[j+3],input[j+3],'alpha changed');
   assert.equal(b.pixels[j+3],input[j+3],'alpha changed');
   const rgbDiff=[0,1,2].some(ch=>a.pixels[j+ch]!==b.pixels[j+ch]);
   if(mask[i]===3&&rgbDiff)different++;
   if(mask[i]!==3)assert.equal(rgbDiff,false,'palette 1/2 differ unexpectedly');
  }
  assert.ok(different>=28,'native third dye not visible on source image');
 }
});

test('modified/unverified source shapes never acquire a synthetic third color mask',()=>{
 const blank=new Uint8ClampedArray(96*96*4);
 const neutral=neutralSource();
 for(const family of families){
  const origin={group:family.group,sheet:family.sheet,cell:family.cell,url:'unused',x:0,y:0};
  assert.equal(sourceIconDyeRegions('item_c_dyeable_original',blank,96,96,origin),undefined);
  assert.equal(sourceIconDyeRegions('item_unverified',neutral,96,96,origin),undefined);
 }
 const notTarget={group:'collection_group_teagarden',sheet:0,cell:98,url:'unused',x:0,y:0};
 const unrelated=sourceIconDyeRegions('item_c_dyeable_original',neutral,96,96,notTarget);
 assert.ok(!unrelated||!unrelated.includes(3),'unverified icon inherited a third palette');
});
