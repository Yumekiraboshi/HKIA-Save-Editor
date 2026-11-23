import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const palettes=JSON.parse(read('../public/native-dye-palettes.json')).records;
const names=JSON.parse(read('../public/source-names/en.json')).names;
async function loadTS(path){
 const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
}
const {sourceIconDyeRegions}=await loadTS('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await loadTS('../src/dye-recolor.ts');

const specs=[
 {cell:24,name:'Night Cap',accent:[54,50],main:[28,70],pairs:[[788448044,1712522179],[1147953466,1839079495]]},
 {cell:44,name:'Striped Pajama Pants',accent:[64,55],main:[28,55],pairs:[[959015051,2014674632],[1041590123,2129648350]]},
 {cell:77,name:'Striped Pajama Shirt',accent:[54,45],main:[28,45],pairs:[[637419312,1283022495],[1373791466,1582027746]]}
];
const group='collections_group_clothing';
const zip=readFileSync(new URL('../public/item-packs/'+group+'.zip',import.meta.url));
assert.equal(zip.readUInt32LE(0),0x04034b50);
assert.equal(zip.readUInt16LE(8),0);
const len=zip.readUInt16LE(26),extra=zip.readUInt16LE(28);
assert.equal(zip.toString('utf8',30,30+len),'index.json');
const at=30+len+extra;
const index=JSON.parse(zip.subarray(at,at+zip.readUInt32LE(18)).toString('utf8'));
assert.equal(index.schema,'HKIA.SheetIcons.1');
assert.equal(index.group,group);
function neutral(){
 const src=new Uint8ClampedArray(96*96*4);
 for(let y=18;y<=81;y++)for(let x=18;x<=81;x++){
  const i=(y*96+x)*4;
  src[i]=143;src[i+1]=141;src[i+2]=139;src[i+3]=255;
 }
 return src;
}
const offset=([x,y])=>(y*96+x)*4;

test('all 66 original Night Cap/Pajama IDs, six real same-first-dye pairs and Babel names match the source ZIP',()=>{
 let total=0;
 for(const spec of specs){
  const ids=index.records.filter(([,sh,cell])=>sh===0&&cell===spec.cell).map(([id])=>id);
  assert.equal(ids.length,22,spec.name);
  assert.equal(new Set(ids).size,22);
  for(const id of ids){
   assert.ok(names[id]?.endsWith(spec.name),id+': '+names[id]);
   assert.ok(palettes[id]?.colors?.[0],String(id));
  }
  const first=new Map();
  for(const id of ids){
   const value=palettes[id].colors[0],arr=first.get(value)??[];
   arr.push(id);first.set(value,arr);
  }
  assert.equal([...first.values()].filter(arr=>arr.length>1).length,2,
   'two source game first-channel collision pairs');
  for(const [a,b] of spec.pairs){
   assert.ok(ids.includes(a)&&ids.includes(b));
   assert.equal(palettes[a].colors[0],palettes[b].colors[0]);
   assert.notEqual(palettes[a].colors[1],palettes[b].colors[1]);
  }
  total+=ids.length;
 }
 assert.equal(total,66);
});

test('six native pairs receive distinct actual 2D image colors while first-channel fabric and alpha stay invariant',()=>{
 const src=neutral(),key='item_c_dyeable_native_pajama_test';
 for(const spec of specs){
  const origin={group,sheet:0,cell:spec.cell};
  const mask=sourceIconDyeRegions(key,src,96,96,origin);
  assert.ok(mask,spec.name);
  const accent=offset(spec.accent),body=offset(spec.main);
  assert.equal(mask[accent/4],2,spec.name+' secondary source color region');
  assert.equal(mask[body/4],1,spec.name+' primary fabric');
  assert.equal(mask[0],0);
  for(const [a,b] of spec.pairs){
   const one=recolorDyePixels(src,96,96,palettes[a],mask);
   const two=recolorDyePixels(src,96,96,palettes[b],mask);
   assert.ok(one&&two);
   assert.deepEqual([...one.pixels.slice(body,body+3)],[...two.pixels.slice(body,body+3)]);
   assert.notDeepEqual([...one.pixels.slice(accent,accent+3)],
    [...two.pixels.slice(accent,accent+3)],'original second dye changes source pixels');
   for(let i=3;i<src.length;i+=4)assert.equal(one.pixels[i],src[i]);
  }
 }
});

test('non-source icons and unexpected original color/shape safely skip channel-2 approximations',()=>{
 const original=neutral(),altered=new Uint8ClampedArray(original);
 for(let i=0;i<altered.length;i+=4)if(altered[i+3]){
  altered[i]=241;altered[i+1]=13;altered[i+2]=19;
 }
 for(const spec of specs){
  const origin={group,sheet:0,cell:spec.cell};
  assert.equal(sourceIconDyeRegions('not_a_game_dye_item',original,96,96,origin),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_test',altered,96,96,origin),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_test',original,96,96,{...origin,sheet:6}),undefined);
  assert.equal(sourceIconDyeRegions('item_c_dyeable_test',original,96,96,{...origin,group:'different_group'}),undefined);
 }
});
