import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

async function loadTs(file){
 const r=await build({entryPoints:[fileURLToPath(new URL(file,import.meta.url))],
  bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+
  Buffer.from(r.outputFiles[0].text).toString('base64'));
}
const {sourceIconDyeRegions}=await loadTs('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await loadTs('../src/dye-recolor.ts');
const colors=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8')).records;
const names=JSON.parse(readFileSync(new URL('../public/source-names/en.json',import.meta.url),'utf8')).names;
const source={group:'collection_group_teagarden',sheet:0,cell:4};
const variants=[
 ['1265055643','White and Yellow High Tea Frilled Bonnet','#fede49'],
 ['1046324850','White and Sky High Tea Frilled Bonnet','#bbf2ef'],
 ['1893329026','White and Green High Tea Frilled Bonnet','#78d244'],
 ['535112962','White and Periwinkle High Tea Frilled Bonnet','#afb4fd']
];
function originalIds(){
 const bytes=readFileSync(new URL('../public/item-packs/collection_group_teagarden.zip',import.meta.url));
 assert.equal(bytes.readUInt32LE(0),0x04034b50);
 const nameLength=bytes.readUInt16LE(26),extraLength=bytes.readUInt16LE(28);
 assert.equal(bytes.toString('utf8',30,30+nameLength),'index.json');
 const offset=30+nameLength+extraLength;
 const index=JSON.parse(bytes.subarray(offset,offset+bytes.readUInt32LE(18)).toString('utf8'));
 return index.records.filter(([,sheet,cell])=>sheet===0&&cell===4)
  .map(([id])=>String(id));
}
function neutralFixture(){
 const input=new Uint8ClampedArray(96*96*4);
 for(let y=17;y<=80;y++)for(let x=18;x<=78;x++){
  const p=(y*96+x)*4;
  input[p]=136;input[p+1]=135;input[p+2]=134;input[p+3]=255;
 }
 return input;
}
test('original game atlas 000/004 maps exactly 41 verified Frilled Bonnet colors',()=>{
 const ids=originalIds();
 assert.equal(ids.length,41);
 assert.equal(new Set(ids).size,41);
 for(const id of ids){
  assert.match(names[id],/ High Tea Frilled Bonnet$/);
  assert.ok(colors[id],'original native palette exists for '+id);
 }
 for(const [id,name,channel2] of variants){
  assert.ok(ids.includes(id));
  assert.equal(names[id],name);
  assert.equal(colors[id].colors[0],'#fdf7e6');
  assert.equal(colors[id].colors[1],channel2);
 }
});
test('native ribbon channel 2 alters bitmap pixels while crown and original alpha are preserved',()=>{
 const pixels=neutralFixture(),at=(x,y)=>(y*96+x)*4;
 const mask=sourceIconDyeRegions('item_c_dyeable_frilledbonnet',pixels,96,96,source);
 assert.ok(mask);
 assert.equal(mask[at(30,45)/4],1,'surrounding neutral bonnet uses channel 1');
 assert.equal(mask[at(46,45)/4],2,'central ribbon uses original second dye');
 assert.equal(mask[0],0,'transparent exterior is unchanged');
 const baseline=recolorDyePixels(pixels,96,96,colors[variants[0][0]],mask);
 assert.ok(baseline);
 for(const [id] of variants.slice(1)){
  const candidate=recolorDyePixels(pixels,96,96,colors[id],mask);
  assert.ok(candidate);
  assert.deepEqual([...baseline.pixels.slice(at(30,45),at(30,45)+4)],
   [...candidate.pixels.slice(at(30,45),at(30,45)+4)]);
  assert.notDeepEqual([...baseline.pixels.slice(at(46,45),at(46,45)+3)],
   [...candidate.pixels.slice(at(46,45),at(46,45)+3)]);
  for(let p=3;p<pixels.length;p+=4)assert.equal(candidate.pixels[p],pixels[p]);
 }
 assert.equal(pixels[at(46,45)],136,'original pixels are not mutated');
});
test('incompatible source or changed image fails closed to generic original icon handling',()=>{
 const pixels=neutralFixture(),key='item_c_dyeable_frilledbonnet';
 assert.equal(sourceIconDyeRegions(key,pixels,96,96),undefined);
 assert.equal(sourceIconDyeRegions('item_unknown',pixels,96,96,source),undefined);
 for(const wrong of [{...source,cell:5},{...source,sheet:1},
  {...source,group:'collections_group_clothing'}]){
  assert.equal(sourceIconDyeRegions(key,pixels,96,96,wrong),undefined);
 }
 const altered=new Uint8ClampedArray(pixels);
 for(let p=0;p<altered.length;p+=4)if(altered[p+3]){
  altered[p]=235;altered[p+1]=19;altered[p+2]=24;
 }
 assert.equal(sourceIconDyeRegions(key,altered,96,96,source),undefined);
});
