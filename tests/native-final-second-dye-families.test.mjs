import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const palettes=JSON.parse(read('../public/native-dye-palettes.json')).records;
const names=JSON.parse(read('../public/source-names/en.json')).names;
const packed=readFileSync(new URL('../public/item-packs/collections_group_events.zip',import.meta.url));
assert.equal(packed.readUInt32LE(0),0x04034b50);
assert.equal(packed.readUInt16LE(8),0,'original index is losslessly stored');
const nameLength=packed.readUInt16LE(26),extra=packed.readUInt16LE(28);
assert.equal(packed.toString('utf8',30,30+nameLength),'index.json');
const ptr=30+nameLength+extra;
const source=JSON.parse(packed.subarray(ptr,ptr+packed.readUInt32LE(18)).toString('utf8'));
assert.equal(source.schema,'HKIA.SheetIcons.1');
assert.equal(source.group,'collections_group_events');

const specs=[
 [4,139,15,'Starfish Mermaid Top',1166912765,1523336708,'chest'],
 [10,4,14,'Cowrie Shell Necklace',326683373,2099688284,'chest'],
 [2,84,11,'Jester Costume',748395031,1380373076,'skirt'],
 [1,61,10,'Vaporwave Neon Palm Hat',727041016,1435159003,'hat'],
 [1,119,8,'Shell Hair Piece',119904430,1228221677,'plume'],
 [10,6,8,'Koi Tail',74256827,1830738185,'skirt'],
 [5,32,8,'Clamshell Backpack',1246652707,1798631547,'chest'],
 [5,78,8,'Gudetama Zip Hoodie',632565144,1422660359,'chest'],
 [6,103,8,'Mermaid Vest',1664389439,1694368373,'chest'],
 [10,52,7,'Bat Bow',1233524997,1771854651,'plume']
];
const sample={
 chest:{body:[28,45],secondary:[54,45]},
 skirt:{body:[28,55],secondary:[64,55]},
 hat:{body:[28,70],secondary:[54,50]},
 plume:{body:[28,45],secondary:[54,45]}
};
const at=([x,y])=>(y*96+x)*4;
async function compiled(path){
 const out=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  platform:'node',format:'esm',bundle:true,write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'));
}
const {sourceIconDyeRegions}=await compiled('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await compiled('../src/dye-recolor.ts');
function originalNeutralLike(){
 const a=new Uint8ClampedArray(96*96*4);
 for(let y=18;y<=81;y++)for(let x=18;x<=81;x++){
  const i=(y*96+x)*4;a[i]=145;a[i+1]=143;a[i+2]=141;a[i+3]=255;
 }
 return a;
}

test('all 97 original source game Item IDs, Babel names and 10 real native channel2 pairs',()=>{
 let total=0;
 for(const [sheet,cell,n,title,a,b] of specs){
  const ids=source.records.filter(([,sh,c])=>sh===sheet&&c===cell).map(([id])=>id);
  assert.equal(ids.length,n,title+' source original item count');
  assert.equal(new Set(ids).size,n);
  for(const id of ids){
   assert.ok(names[id]?.endsWith(title),id+': '+names[id]);
   assert.ok(palettes[id]?.colors?.[0],'native game source palette '+id);
  }
  assert.ok(ids.includes(a)&&ids.includes(b),title);
  const p=palettes[a].colors,q=palettes[b].colors;
  assert.equal(p[0],q[0],title+' source first channel');
  assert.notEqual(p[1],q[1],title+' source second channel');
  total+=ids.length;
 }
 assert.equal(total,97);
});

test('all 10 native second dye pairs color game-source image pixels with preserved first channel and alpha',()=>{
 const px=originalNeutralLike(),itemKey='item_c_dyeable_original_game';
 for(const [sheet,cell,,title,a,b,type] of specs){
  const origin={group:'collections_group_events',sheet,cell};
  const mask=sourceIconDyeRegions(itemKey,px,96,96,origin);
  assert.ok(mask,title);
  const body=at(sample[type].body),accent=at(sample[type].secondary);
  assert.equal(mask[body/4],1,title+' original first dye');
  assert.equal(mask[accent/4],2,title+' original second dye');
  assert.equal(mask[0],0,'source alpha');
  const first=recolorDyePixels(px,96,96,palettes[a],mask);
  const second=recolorDyePixels(px,96,96,palettes[b],mask);
  assert.ok(first&&second,title);
  assert.deepEqual([...first.pixels.slice(body,body+3)],
   [...second.pixels.slice(body,body+3)],title+' same primary');
  assert.notDeepEqual([...first.pixels.slice(accent,accent+3)],
   [...second.pixels.slice(accent,accent+3)],title+' distinct game original second dye');
  for(let i=3;i<px.length;i+=4)
   assert.equal(first.pixels[i],px[i],title+' original alpha');
 }
});

test('unknown or replaced source artwork cannot trigger speculative 2D segmentation',()=>{
 const px=originalNeutralLike(),broken=new Uint8ClampedArray(px);
 for(let i=0;i<broken.length;i+=4)if(broken[i+3]){
  broken[i]=239;broken[i+1]=12;broken[i+2]=15;
 }
 for(const [sheet,cell] of specs){
  const src={group:'collections_group_events',sheet,cell};
  assert.equal(sourceIconDyeRegions('unverified',px,96,96,src),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_original',broken,96,96,src),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_original',px,96,96,{...src,group:'unknown'}),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_original',px,96,96,{...src,sheet:11}),undefined);
 }
});
