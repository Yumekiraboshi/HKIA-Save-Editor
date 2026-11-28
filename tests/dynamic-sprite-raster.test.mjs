import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/dynamic-sprite-raster.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {rasterizeDynamicSprite,sampleLinearRgb,srgbToLinear,linearToSrgb}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const image=(width,height,values)=>({width,height,rgba:new Uint8ClampedArray(values)});
test('sRGB decode precedes bilinear interpolation',()=>{
 const p=image(2,1,[0,0,0,255,255,255,255,255]);
 assert.deepEqual(sampleLinearRgb(p,1,.5),[.5,.5,.5,1]);
 assert.ok(Math.abs(linearToSrgb(srgbToLinear(.5))-.5)<1e-12);
});
test('native tint, separate linear alpha plane, transparent padding and trim',()=>{
 const base=image(1,2,[255,255,255,255,128,128,128,255]);
 const mask=image(1,1,[255,0,0,255]);
 const input={base,mask,baseRect:[0,0,1,1],maskRect:[0,0,1,1],trim:[0,0,1,1],alphaOffsetY:1,logicalSize:1,tints:[[.5,0,0,1],[0,1,0,1],[0,0,1,1]]};
 // One-texel synthetic source needs duplicated guard pixels for actual sampling;
 // evaluate at the centre, allowing one byte of quantization on the tiny fixture.
 const a=rasterizeDynamicSprite(input);assert.deepEqual([...a.slice(0,4)],[0,0,0,0]);
 const p=(47*96+47)*4;assert.ok(Math.abs(a[p]-128)<=2);assert.equal(a[p+1],0);assert.equal(a[p+2],0);assert.ok(Math.abs(a[p+3]-128)<=2);
 const b=rasterizeDynamicSprite({...input,tints:[[0,0,1,1],input.tints[1],input.tints[2]]});
 assert.equal(b[p],0);assert.ok(b[p+2]>240);assert.deepEqual(a,rasterizeDynamicSprite(input));
});
test('all native flower base bindings and lossless runtime assets are pinned',()=>{
 const dir=new URL('../public/inventory-flower-art/',import.meta.url),read=n=>readFileSync(new URL(n,dir)),sha=b=>createHash('sha256').update(b).digest('hex');
 const raw=read('flower-runtime-source-v3.0.1.json'),m=JSON.parse(raw),index=JSON.parse(read('index.json'));
 assert.equal(sha(raw),'0cefd2977c3e25157023e3c47a180e7ebe4e8ab850dfdbe5bd481ae38d0b5020');
 assert.equal(m.rows.length,25);assert.equal(new Set(m.rows.map(r=>r.itemId)).size,25);
 assert.equal(m.source.colorSpace,1);assert.equal(m.source.filterMode,1);assert.equal(m.source.mipCount,1);
 for(const a of [m.base,m.mask]){const b=read(a.file);assert.equal(b.length,a.bytes);assert.equal(sha(b),a.sha256);}
 for(const item of index.items){const row=m.rows.find(r=>r.itemId===item.itemId);assert.equal(row.baseSpritePathId,item.baseSpritePathId);
  const [x,y,w,h]=row.baseSampleRect,[gx,gy,gw,gh]=row.guardRect;
  assert.ok(x-gx>=.5&&y-gy>=.5&&gx+gw-x-w>=.5&&gy+gh-y-h>=.5);
  assert.ok(gx+gw<=m.base.width&&gy+gh<=m.alphaOffsetY);
 }
});

test('all 171 flower and chef atlas mask GUIDs, Sprite identities and fractional rectangles match original source projection',()=>{
 const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
 const flower=read('../public/inventory-flower-art/index.json');
 const chef=read('../public/dynamic-chef-art/chef-runtime-source-v3.0.1.json');
 const rows=[...Object.entries(flower.masks).map(([guid,x])=>[guid,x.spritePathId,...['x','y','width','height'].map(k=>x.textureRect[k])]),...chef.rows.map(x=>[x.maskGuid,x.mask.spritePathId,...x.mask.sourceRect])].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
 assert.equal(rows.length,171);assert.equal(new Set(rows.map(x=>x[0])).size,171);
 const hash=createHash('sha256');
 for(const [guid,pathId,...rect] of rows){
  assert.match(guid,/^[0-9a-f]{32}$/);assert.equal(rect.length,4);
  const buf=Buffer.alloc(24);buf.writeBigInt64LE(BigInt(pathId));
  rect.forEach((v,i)=>buf.writeFloatLE(v,8+i*4));
  hash.update(guid,'ascii');hash.update(buf);
 }
 assert.equal(hash.digest('hex'),'20a83e7aeffea161e16516ade047baff4689cba1710892e154eb5a891bb2282a');
});
