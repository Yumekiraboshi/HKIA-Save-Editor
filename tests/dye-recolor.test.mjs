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
 assert.match(app,/palette=\{nativeDyePalettes\[String\(item\[0\]\)\]\}/);
 assert.match(app,/palette=\{nativeDyePalettes\[String\(sub\.previewId\)\]\}/);
 assert.match(app,/palette=\{nativeDyePalettes\[String\(dateDialogItem\[0\]\)\]\}/);
 assert.match(sprite,/data-dye-rendered=/);
 assert.match(sprite,/URL\.revokeObjectURL\(createdUrl\)/);
 for(const disallowed of [/native-dye-ring/,/native-dye-swatch/,/native-dye-preview/,/sharedDyeableIcon/]){
  assert.doesNotMatch(app,disallowed);assert.doesNotMatch(css,disallowed);
 }
});
