import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const native=JSON.parse(read('../public/native-dye-palettes.json')).records;
const names=JSON.parse(read('../public/source-names/en.json')).names;
const zip=readFileSync(new URL('../public/item-packs/collections_group_events.zip',import.meta.url));
assert.equal(zip.readUInt32LE(0),0x04034b50);
assert.equal(zip.readUInt16LE(8),0);
const n=zip.readUInt16LE(26),extra=zip.readUInt16LE(28);
assert.equal(zip.toString('utf8',30,30+n),'index.json');
const p=30+n+extra;
const source=JSON.parse(zip.subarray(p,p+zip.readUInt32LE(18)).toString('utf8'));
assert.equal(source.schema,'HKIA.SheetIcons.1');
assert.equal(source.group,'collections_group_events');
const specs=[
 [3,122,'Pleated Sunhat',396662105,1489796472,'hat'],
 [3,54,'Parade Vest',338766542,617418026,'chest'],
 [3,75,'Parade Pants',1135255084,1901485186,'trouser'],
 [4,105,'Pleated Vest',154129480,287498049,'chest'],
 [4,142,'Pinwheel',1702864135,1813459616,'plume'],
 [4,81,'Pleated Cap',1151419029,1777099251,'hat'],
 [5,139,'Origami Helm',192184155,906281449,'hat'],
 [5,3,'Paper Bow',887328788,1747719266,'plume'],
 [5,96,'Wings',1003429865,2131787180,'plume'],
 [6,67,'Pleated Dress',804838622,1790899510,'skirt'],
 [7,117,'Origami Crane Hat',1657093524,2142987605,'hat'],
 [7,28,'Pleated Tophat',265036265,633643914,'hat']
];
const areas={
 hat:{base:[28,70],accent:[54,50]},
 chest:{base:[28,45],accent:[54,45]},
 trouser:{base:[28,55],accent:[64,55]},
 plume:{base:[28,45],accent:[54,45]},
 skirt:{base:[28,55],accent:[64,55]}
};
const at=([x,y])=>(y*96+x)*4;
async function ts(path){
 const r=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
}
const {sourceIconDyeRegions}=await ts('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await ts('../src/dye-recolor.ts');
function neutral(){
 const rgba=new Uint8ClampedArray(96*96*4);
 for(let y=18;y<=81;y++)for(let x=18;x<=81;x++){
  const i=(y*96+x)*4;
  rgba[i]=145;rgba[i+1]=143;rgba[i+2]=141;rgba[i+3]=255;
 }
 return rgba;
}

test('all 132 original source-game Bee Item IDs match source UI icons, names and native palettes',()=>{
 let items=0;
 for(const [sheet,cell,title,pink,purple] of specs){
  const ids=source.records.filter(([,sh,c])=>sh===sheet&&c===cell).map(([id])=>id);
  assert.equal(ids.length,11,title);
  assert.equal(new Set(ids).size,11,title);
  const pair=[pink,purple];
  for(const id of ids){
   assert.ok(names[id]?.endsWith(title),id+': '+names[id]);
   assert.ok(native[id]?.colors[0],id+' must have original native palette');
  }
  assert.ok(pair.every(id=>ids.includes(id)),title+' source IDs');
  assert.equal(native[pink].colors[0],native[purple].colors[0]);
  assert.equal(native[pink].colors[0],'#3a3840');
  assert.deepEqual(new Set([native[pink].colors[1],native[purple].colors[1]]),
   new Set(['#fd8de0','#a66fbe']));
  const byFirst=new Map();
  for(const id of ids){
   const first=native[id].colors[0],recorded=byFirst.get(first)??[];
   recorded.push(id);byFirst.set(first,recorded);
  }
  const collisions=[...byFirst.values()].filter(ids=>ids.length>1);
  assert.equal(collisions.length,1,title);
  assert.deepEqual(new Set(collisions[0]),new Set(pair),title+' exact source pair');
  items+=ids.length;
 }
 assert.equal(items,132);
});

test('pink/purple native channel 2 modifies actual source pixels but preserves shared primary fabric and alpha',()=>{
 const rgba=neutral(),sourceKey='item_c_dyeable_verified_bee_mock';
 for(const [sheet,cell,title,a,b,area] of specs){
  const origin={group:'collections_group_events',sheet,cell};
  const mask=sourceIconDyeRegions(sourceKey,rgba,96,96,origin);
  assert.ok(mask,title);
  const base=at(areas[area].base),accent=at(areas[area].accent);
  assert.equal(mask[base/4],1,title+' channel 1');
  assert.equal(mask[accent/4],2,title+' channel 2');
  assert.equal(mask[0],0,'source alpha outside sprite');
  const p=recolorDyePixels(rgba,96,96,native[a],mask);
  const q=recolorDyePixels(rgba,96,96,native[b],mask);
  assert.ok(p&&q,title);
  assert.deepEqual([...p.pixels.slice(base,base+3)],[...q.pixels.slice(base,base+3)]);
  assert.notDeepEqual([...p.pixels.slice(accent,accent+3)],
   [...q.pixels.slice(accent,accent+3)],'original native channel 2 differentiates '+title);
  for(let i=3;i<rgba.length;i+=4)
   assert.equal(p.pixels[i],rgba[i],'source alpha unchanged '+title);
 }
});

test('wrong source and changed native image refuse speculative region geometry',()=>{
 const rgba=neutral(),replaced=new Uint8ClampedArray(rgba);
 for(let i=0;i<replaced.length;i+=4)if(replaced[i+3]){
  replaced[i]=240;replaced[i+1]=13;replaced[i+2]=25;
 }
 const key='item_c_dyeable_verified_bee_mock';
 for(const [sheet,cell] of specs){
  const src={group:'collections_group_events',sheet,cell};
  assert.equal(sourceIconDyeRegions('unverified',rgba,96,96,src),undefined);
  assert.equal(sourceIconDyeRegions(key,replaced,96,96,src),undefined);
  assert.equal(sourceIconDyeRegions(key,rgba,96,96,{...src,group:'unknown'}),undefined);
  assert.equal(sourceIconDyeRegions(key,rgba,96,96,{...src,sheet:12}),undefined);
 }
});
