import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const {outputFiles}=await build({
 entryPoints:[fileURLToPath(new URL('../src/dye-recolor.ts',import.meta.url))],
 bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'
});
const {recolorDyePixels}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const raw=JSON.parse(readFileSync(new URL('../public/native-dye-palettes.json',import.meta.url),'utf8'));
const ice=raw.records['704486536'],orange=raw.records['585726126'];

function neutralImage(width=12,height=12){
 const pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const index=(y*width+x)*4;
  const lum=120+Math.floor((x+y)*2);
  pixels[index]=lum;pixels[index+1]=lum;pixels[index+2]=lum;pixels[index+3]=255;
 }
 return pixels;
}
function average(pixels){
 let r=0,g=0,b=0,a=0;
 for(let i=0;i<pixels.length;i+=4){
  if(pixels[i+3]<128)continue;
  r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];a++;
 }
 return [r/a,g/a,b/a];
}
test('two dye IDs sharing one source icon produce different recolored image pixels',()=>{
 const original=neutralImage();
 const pink=recolorDyePixels(original,12,12,ice);
 const yellow=recolorDyePixels(original,12,12,orange);
 assert.ok(pink&&yellow);
 assert.ok(pink.changed>100&&yellow.changed>100);
 const p=average(pink.pixels),y=average(yellow.pixels);
 assert.ok(p[0]>p[1]+25,'ice cream primary channel should tint fabric toward pink');
 assert.ok(y[1]>y[2]+10,'orange primary channel should tint fabric toward yellow');
 assert.notDeepEqual([...pink.pixels],[...yellow.pixels]);
 assert.equal(original[0],120,'source art must never be mutated');
});
test('original alpha, black seams and already colored decals are preserved',()=>{
 const pixels=neutralImage();
 pixels.set([0,0,0,255],0);             // opaque black seam
 pixels.set([255,0,0,255],4);           // red printed decal
 pixels.set([255,255,255,255],8);       // white highlight
 pixels.set([120,120,120,0],12);       // transparent backdrop
 const result=recolorDyePixels(pixels,12,12,ice);
 assert.ok(result);
 for(const i of [0,4,8,12])assert.deepEqual([...result.pixels.slice(i,i+4)],[...pixels.slice(i,i+4)]);
 for(let i=3;i<pixels.length;i+=4)assert.equal(result.pixels[i],pixels[i]);
});
test('a verified five-channel material mask applies each real dye channel to the right pixel',()=>{
 const source=neutralImage();
 const mask=new Uint8Array(144);
 for(let i=0;i<144;i++)mask[i]=1+(i%5);
 mask[0]=0;
 const result=recolorDyePixels(source,12,12,ice,mask);
 assert.ok(result);
 assert.deepEqual([...result.pixels.slice(0,4)],[...source.slice(0,4)],'channel 0 remains unpainted');
 const distinct=[];
 for(let x=1;x<=5;x++)distinct.push(result.pixels.slice(x*4,x*4+3).join(','));
 assert.ok(new Set(distinct).size>=3,'native palette channels are kept distinct');
 const two={dye:1,colors:['#ff0000',null,'#00ff00',null,'#0000ff']};
 const missing=recolorDyePixels(source,12,12,two,mask);
 assert.ok(missing);
 assert.deepEqual([...missing.pixels.slice(4,8)],[...source.slice(4,8)],'unused channel 2 is not fabricated');
});
test('dimension mismatch or no neutral texture never introduces a fake recolor',()=>{
 const pixels=neutralImage();
 assert.throws(()=>recolorDyePixels(pixels,12,11,ice),/DYE_IMAGE_DIMENSIONS/);
 assert.throws(()=>recolorDyePixels(pixels,12,12,ice,new Uint8Array(32)),/DYE_IMAGE_DIMENSIONS/);
 const colorful=neutralImage();
 for(let i=0;i<colorful.length;i+=4){colorful[i]=240;colorful[i+1]=20;colorful[i+2]=30;}
 assert.equal(recolorDyePixels(colorful,12,12,ice),null);
});
test('5,383 source-color variants are wired into all three image views without ring/chips',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 const sprite=readFileSync(new URL('../src/DyeSprite.svelte',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 assert.equal(Object.keys(raw.records).length,5383);
 assert.match(app,/loadNativeDyePalettes\(import\.meta\.env\.BASE_URL\)/);
 assert.match(app,/import DyeSprite from '\.\/DyeSprite\.svelte'/);
 assert.equal((app.match(/<DyeSprite /g)||[]).length,3);
 assert.equal((app.match(/sourceKey=\{/g)||[]).length,3);
 assert.match(app,/palette=\{nativeDyePalettes\[String\(item\[0\]\)\]\}/);
 assert.match(app,/palette=\{nativeDyePalettes\[String\(sub\.previewId\)\]\}/);
 assert.match(app,/palette=\{nativeDyePalettes\[String\(dateDialogItem\[0\]\)\]\}/);
 assert.match(sprite,/data-dye-rendered=/);
 assert.match(sprite,/URL\.revokeObjectURL\(createdUrl\)/);
 for(const disallowed of [/native-dye-ring/,/native-dye-swatch/,/native-dye-preview/,/sharedDyeableIcon/]){
  assert.doesNotMatch(app,disallowed);assert.doesNotMatch(css,disallowed);
 }
});

test('Archer Costume source artwork identifies tunic, belt and buckle without guessing on other garments',async()=>{
 const regionModule=await build({
  entryPoints:[fileURLToPath(new URL('../src/dye-icon-regions.ts',import.meta.url))],
  bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'
 });
 const {sourceIconDyeRegions}=await import('data:text/javascript;base64,'+
  Buffer.from(regionModule.outputFiles[0].text).toString('base64'));
 const width=96,height=96;
 const pixels=new Uint8ClampedArray(width*height*4);
 const paint=(x,y,r,g,b)=>{
  const idx=(y*width+x)*4;
  pixels[idx]=r;pixels[idx+1]=g;pixels[idx+2]=b;pixels[idx+3]=255;
 };
 for(let y=15;y<83;y++)for(let x=10;x<76;x++)paint(x,y,144,141,139);
 for(let y=27;y<39;y++)for(let x=20;x<70;x++)paint(x,y,174,120,75);
 for(let y=40;y<51;y++)for(let x=36;x<46;x++)paint(x,y,222,174,61);
 const source='item_c_dyeable_icarcheroutfit_icecream';
 const mask=sourceIconDyeRegions(source,pixels,width,height);
 assert.ok(mask,'source icon color geometry must match all three regions');
 const id=(x,y)=>y*width+x;
 assert.equal(mask[id(15,20)],1,'neutral fabric uses native channel 1');
 assert.equal(mask[id(21,30)],2,'source ochre strap uses native channel 2');
 assert.equal(mask[id(40,45)],3,'source yellow buckle uses native channel 3');
 assert.equal(mask[id(0,0)],0,'transparent pixels are never dyed');
 assert.equal(sourceIconDyeRegions('item_c_dyeable_icarcherhat_icecream',pixels,width,height),undefined);
 const altered=new Uint8ClampedArray(pixels);
 for(let j=0;j<altered.length;j+=4)if(altered[j+3]>0){
  altered[j]=10;altered[j+1]=210;altered[j+2]=220;
 }
 assert.equal(sourceIconDyeRegions(source,altered,width,height),undefined,
  'replaced 3D artwork fails closed if native icon regions no longer match');
 const icePaint=recolorDyePixels(pixels,width,height,ice,mask);
 const orangePaint=recolorDyePixels(pixels,width,height,orange,mask);
 assert.ok(icePaint&&orangePaint);
 const iceStrap=[...icePaint.pixels.slice(id(21,30)*4,id(21,30)*4+3)];
 const orangeStrap=[...orangePaint.pixels.slice(id(21,30)*4,id(21,30)*4+3)];
 assert.ok(iceStrap[2]>iceStrap[0]+20,'Ice Cream fabric band becomes cyan');
 assert.ok(orangeStrap[0]>orangeStrap[2]+70,'Orange band becomes orange');
 assert.notDeepEqual(iceStrap,orangeStrap);
 const iceBuckle=[...icePaint.pixels.slice(id(40,45)*4,id(40,45)*4+3)];
 const orangeBuckle=[...orangePaint.pixels.slice(id(40,45)*4,id(40,45)*4+3)];
 assert.ok(iceBuckle[2]>iceBuckle[0]*.80,'Ice Cream buckle becomes white');
 assert.ok(orangeBuckle[0]>orangeBuckle[2]+50,'Orange buckle becomes gold');
 for(let i=3;i<pixels.length;i+=4)assert.equal(icePaint.pixels[i],pixels[i]);
});
