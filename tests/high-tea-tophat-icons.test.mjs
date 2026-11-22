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
const palettes=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8')).records;
const names=JSON.parse(readFileSync(new URL('../public/source-names/en.json',import.meta.url),'utf8')).names;
const source={group:'collection_group_teagarden',sheet:0,cell:98};
const yellow='1542238429',sky='643288523';
function nativeSourceIds(){
 const zip=readFileSync(new URL('../public/item-packs/collection_group_teagarden.zip',import.meta.url));
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 const nameLength=zip.readUInt16LE(26),extraLength=zip.readUInt16LE(28);
 assert.equal(zip.toString('utf8',30,30+nameLength),'index.json');
 const start=30+nameLength+extraLength;
 const index=JSON.parse(zip.subarray(start,start+zip.readUInt32LE(18)).toString('utf8'));
 return index.records.filter(([,sheet,cell])=>sheet===0&&cell===98).map(([id])=>id);
}
function neutralHatFixture(){
 const pixels=new Uint8ClampedArray(96*96*4);
 for(let y=18;y<77;y++)for(let x=21;x<76;x++){
  const at=(y*96+x)*4;
  pixels[at]=137;pixels[at+1]=134;pixels[at+2]=132;pixels[at+3]=255;
 }
 return pixels;
}
test('all 47 shared original High Tea Tophat IDs have native game name and palette',()=>{
 const ids=nativeSourceIds();
 assert.equal(ids.length,47);
 for(const id of ids){
  assert.match(names[String(id)],/ High Tea Tophat$/);
  assert.ok(palettes[String(id)]);
 }
 assert.ok(ids.includes(Number(yellow))&&ids.includes(Number(sky)));
 assert.equal(names[yellow],'White and Yellow High Tea Tophat');
 assert.equal(names[sky],'White and Sky High Tea Tophat');
 assert.equal(palettes[yellow].colors[0],'#fdf7e6');
 assert.equal(palettes[sky].colors[0],palettes[yellow].colors[0]);
 assert.equal(palettes[yellow].colors[1],'#fede49');
 assert.equal(palettes[sky].colors[1],'#bbf2ef');
});
test('original 2D hat band uses channel two, crown remains same-primary, alpha unchanged',()=>{
 const input=neutralHatFixture(),at=(x,y)=>(y*96+x)*4;
 const mask=sourceIconDyeRegions('item_c_dyeable_highteahat',input,96,96,source);
 assert.ok(mask);
 assert.equal(mask[at(47,27)/4],1,'upper source crown is native dye channel 1');
 assert.equal(mask[at(47,53)/4],2,'lower crown band is native dye channel 2');
 assert.equal(mask[0],0,'transparent pixels are not colored');
 const y=recolorDyePixels(input,96,96,palettes[yellow],mask);
 const s=recolorDyePixels(input,96,96,palettes[sky],mask);
 assert.ok(y&&s);
 assert.deepEqual([...y.pixels.slice(at(47,27),at(47,27)+4)],
  [...s.pixels.slice(at(47,27),at(47,27)+4)],'same primary dye keeps crown identical');
 assert.notDeepEqual([...y.pixels.slice(at(47,53),at(47,53)+3)],
  [...s.pixels.slice(at(47,53),at(47,53)+3)],'native second dye changes image pixels');
 for(let i=3;i<input.length;i+=4)assert.equal(y.pixels[i],input[i]);
 assert.equal(input[at(47,53)],137,'the input icon is never mutated');
});
test('only the original game cell and neutral art qualify for the 2D mask',()=>{
 const input=neutralHatFixture(),key='item_c_dyeable_highteahat';
 assert.equal(sourceIconDyeRegions(key,input,96,96),undefined);
 assert.equal(sourceIconDyeRegions('not_a_dyeable_item',input,96,96,source),undefined);
 for(const wrong of [{...source,cell:97},{...source,sheet:1},
  {...source,group:'collection_group_wheatflourwonderland'}]){
  assert.equal(sourceIconDyeRegions(key,input,96,96,wrong),undefined);
 }
 const changed=new Uint8ClampedArray(input);
 for(let i=0;i<changed.length;i+=4)if(changed[i+3]){
  changed[i]=240;changed[i+1]=15;changed[i+2]=19;
 }
 assert.equal(sourceIconDyeRegions(key,changed,96,96,source),undefined);
});
