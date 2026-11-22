import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

async function loadTs(path){
 const {outputFiles}=await build({
  entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+
  Buffer.from(outputFiles[0].text).toString('base64'));
}
const {sourceIconDyeRegions}=await loadTs('../src/dye-icon-regions.ts');
const {recolorDyePixels}=await loadTs('../src/dye-recolor.ts');
const source={group:'collection_group_teagarden',sheet:0,cell:31};
const pal=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8')).records;
const names=JSON.parse(readFileSync(new URL('../public/source-names/en.json',import.meta.url),'utf8')).names;
const variants=[
 ['77149467','White and Green High Tea Elegant Hat','#78d244'],
 ['370872413','White and Sky High Tea Elegant Hat','#bbf2ef'],
 ['2022277447','White and Periwinkle High Tea Elegant Hat','#afb4fd']
];
function familyIds(){
 const zip=readFileSync(new URL('../public/item-packs/collection_group_teagarden.zip',import.meta.url));
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 const l=zip.readUInt16LE(26),e=zip.readUInt16LE(28);
 assert.equal(zip.toString('utf8',30,30+l),'index.json');
 const at=30+l+e;
 const index=JSON.parse(zip.subarray(at,at+zip.readUInt32LE(18)).toString('utf8'));
 return index.records.filter(([,sheet,cell])=>sheet===0&&cell===31)
  .map(([id])=>String(id));
}
function neutralIconFixture(){
 const pixels=new Uint8ClampedArray(96*96*4);
 for(let y=19;y<80;y++)for(let x=20;x<78;x++){
  const i=(y*96+x)*4;
  pixels[i]=141;pixels[i+1]=139;pixels[i+2]=137;pixels[i+3]=255;
 }
 return pixels;
}
test('all 44 Elegant Hat item IDs are mapped to the game-original 000/031 icon',()=>{
 const ids=familyIds();
 assert.equal(ids.length,44);
 assert.equal(new Set(ids).size,44);
 for(const id of ids){
  assert.match(names[id],/ High Tea Elegant Hat$/);
  assert.ok(pal[id],'native palette exists for Item ID '+id);
 }
 for(const [id,name,second] of variants){
  assert.ok(ids.includes(id));
  assert.equal(names[id],name);
  assert.equal(pal[id].colors[0],'#fdf7e6');
  assert.equal(pal[id].colors[1],second);
 }
});
test('original second-channel colors differentiate ribbon pixels without altering alpha',()=>{
 const input=neutralIconFixture(),at=(x,y)=>(y*96+x)*4;
 const key='item_c_dyeable_highteaeleganthat';
 const mask=sourceIconDyeRegions(key,input,96,96,source);
 assert.ok(mask,'original neutral icon family is eligible');
 assert.equal(mask[at(35,33)/4],1,'neutral hat body is game channel 1');
 assert.equal(mask[at(48,49)/4],2,'ribbon receives game channel 2');
 assert.equal(mask[0],0,'transparent pixels do not receive invented overlay');
 const baseline=recolorDyePixels(input,96,96,pal[variants[0][0]],mask);
 assert.ok(baseline);
 for(const [id] of variants.slice(1)){
  const output=recolorDyePixels(input,96,96,pal[id],mask);
  assert.ok(output);
  assert.deepEqual([...baseline.pixels.slice(at(35,33),at(35,33)+4)],
   [...output.pixels.slice(at(35,33),at(35,33)+4)]);
  assert.notDeepEqual([...baseline.pixels.slice(at(48,49),at(48,49)+3)],
   [...output.pixels.slice(at(48,49),at(48,49)+3)]);
  for(let i=3;i<input.length;i+=4)assert.equal(output.pixels[i],input[i],
   'original icon alpha is immutable');
 }
 assert.equal(input[at(48,49)],141,'original pixel array remains unchanged');
});
test('unsupported source, changed artwork and non-dyeable keys reject the custom mask',()=>{
 const image=neutralIconFixture(),key='item_c_dyeable_highteaeleganthat';
 assert.equal(sourceIconDyeRegions(key,image,96,96),undefined);
 assert.equal(sourceIconDyeRegions('unverified',image,96,96,source),undefined);
 for(const wrong of [
  {...source,cell:30},{...source,sheet:1},
  {...source,group:'collections_group_clothing'}
 ])assert.equal(sourceIconDyeRegions(key,image,96,96,wrong),undefined);
 const changed=new Uint8ClampedArray(image);
 for(let i=0;i<changed.length;i+=4)if(changed[i+3]){
  changed[i]=239;changed[i+1]=17;changed[i+2]=21;
 }
 assert.equal(sourceIconDyeRegions(key,changed,96,96,source),undefined);
});
