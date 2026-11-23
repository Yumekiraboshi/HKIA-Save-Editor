import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const palettes=JSON.parse(read('../public/native-dye-palettes.json')).records;
const names=JSON.parse(read('../public/source-names/en.json')).names;
const C='collection_group_citytown',K='collections_group_clothing',E='collections_group_events';
const rows=[
 // Original game ZIP group/sheet/cell/Item ID names and verified native
 // same-primary, different-secondary palette IDs. No wiki or fake artwork.
 [C,2,76,18,'Striped Bucket Hat',209669345,1933687001,'hat'],
 [C,2,94,18,'Striped Shorts',1202012923,1358652702,'trouser'],
 [C,0,126,15,'Loose City Shirt',1047757136,1457953522,'chest'],
 [C,1,67,15,'City Headphones',1799790079,1982549048,'hat'],
 [K,0,104,17,'Cardigan Outfit',45067343,1416863883,'chest'],
 [K,1,28,13,'Sidekick Costume',511428343,784726278,'skirt'],
 [K,0,19,12,'Crossbody Bag',1348698799,1799709289,'sash'],
 [E,6,98,12,'Wizard Robe',146148926,2126639310,'skirt'],
 [E,0,104,11,'Pleated Gown',176174660,545858784,'skirt'],
 [E,10,10,11,'Pleated Pants',1214894659,1767390799,'trouser'],
 [E,2,108,11,'Pleated Bow',42521342,2136770916,'plume'],
 [E,2,59,11,'Archer Hat',1556742564,2035102287,'hat']
];
const regions={
 hat:{primary:[28,70],second:[54,50]},
 trouser:{primary:[28,55],second:[64,55]},
 chest:{primary:[28,45],second:[54,45]},
 skirt:{primary:[28,55],second:[64,55]},
 sash:{primary:[28,45],second:[55,45]},
 plume:{primary:[28,45],second:[54,45]}
};
function zipIndex(group){
 const zip=readFileSync(new URL('../public/item-packs/'+group+'.zip',import.meta.url));
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 assert.equal(zip.readUInt16LE(8),0,'the original UiIcon index must be stored losslessly');
 const n=zip.readUInt16LE(26),ext=zip.readUInt16LE(28);
 assert.equal(zip.toString('utf8',30,30+n),'index.json');
 const p=30+n+ext;
 const ix=JSON.parse(zip.subarray(p,p+zip.readUInt32LE(18)).toString('utf8'));
 assert.equal(ix.schema,'HKIA.SheetIcons.1');
 assert.equal(ix.group,group);
 return ix;
}
const byGroup=new Map([C,K,E].map(g=>[g,zipIndex(g)]));
async function compiled(path){
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
}
const {sourceIconDyeRegions}=await compiled('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await compiled('../src/dye-recolor.ts');
function neutral(){
 const pixels=new Uint8ClampedArray(96*96*4);
 for(let y=18;y<=81;y++)for(let x=18;x<=81;x++){
  const i=(y*96+x)*4;pixels[i]=145;pixels[i+1]=143;pixels[i+2]=141;pixels[i+3]=255;
 }
 return pixels;
}
const pxAt=([x,y])=>(y*96+x)*4;

test('12 source-icon families map exact original game names, sizes and 24 native dye IDs',()=>{
 let total=0;
 for(const [group,sheet,cell,count,title,a,b] of rows){
  const ids=byGroup.get(group).records.filter(([,s,c])=>s===sheet&&c===cell)
   .map(([id])=>id);
  assert.equal(ids.length,count,title);
  assert.equal(new Set(ids).size,count,title);
  const primary=new Map();
  for(const id of ids){
   assert.ok(names[id]?.endsWith(title),id+': '+names[id]);
   assert.ok(palettes[id]?.colors?.[0],id+' source palette');
   const first=palettes[id].colors[0],group=primary.get(first)??[];
   group.push(id);primary.set(first,group);
  }
  const pairs=[...primary.values()].filter(xs=>xs.length>1);
  assert.equal(pairs.length,1,title);
  assert.equal(pairs[0].length,2,title);
  assert.deepEqual(new Set(pairs[0]),new Set([a,b]),title);
  assert.equal(palettes[a].colors[0],palettes[b].colors[0]);
  assert.notEqual(palettes[a].colors[1],palettes[b].colors[1]);
  total+=count;
 }
 assert.equal(total,164);
});

test('every game-native second channel modifies the actual neutral source pixels without disturbing source alpha',()=>{
 const src=neutral(),key='item_c_dyeable_original_source';
 for(const [group,sheet,cell,,title,a,b,part] of rows){
  const origin={group,sheet,cell},mask=sourceIconDyeRegions(key,src,96,96,origin);
  assert.ok(mask,title+' original cell');
  const primary=pxAt(regions[part].primary),second=pxAt(regions[part].second);
  assert.equal(mask[primary/4],1,title+' source first dye');
  assert.equal(mask[second/4],2,title+' source second dye');
  assert.equal(mask[0],0,'transparent background unchanged');
  const A=recolorDyePixels(src,96,96,palettes[a],mask);
  const B=recolorDyePixels(src,96,96,palettes[b],mask);
  assert.ok(A&&B,title);
  assert.deepEqual([...A.pixels.slice(primary,primary+3)],
   [...B.pixels.slice(primary,primary+3)],title+' game primary color');
  assert.notDeepEqual([...A.pixels.slice(second,second+3)],
   [...B.pixels.slice(second,second+3)],title+' different original second color');
  for(let i=3;i<src.length;i+=4)
   assert.equal(A.pixels[i],src[i],title+' original sprite alpha');
 }
});

test('updated source region profiles cannot color unknown source or replaced artwork',()=>{
 const src=neutral(),wrong=new Uint8ClampedArray(src);
 for(let i=0;i<wrong.length;i+=4)if(wrong[i+3]){
  wrong[i]=238;wrong[i+1]=13;wrong[i+2]=23;
 }
 for(const [group,sheet,cell] of rows){
  const origin={group,sheet,cell};
  assert.equal(sourceIconDyeRegions('not_native',src,96,96,origin),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_original',wrong,96,96,origin),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_original',src,96,96,{...origin,group:'unmapped'}),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_original',src,96,96,{...origin,sheet:99}),undefined);
 }
});
