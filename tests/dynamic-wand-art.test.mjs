import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './wand-appearance'; export * from './dynamic-sprite-raster';",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {resolveWandBaseTints,rasterizeDynamicSprite,overlayPlacement,sourceOver}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const dir=new URL('../public/dynamic-wand-art/',import.meta.url),read=n=>readFileSync(new URL(n,dir)),sha=b=>createHash('sha256').update(b).digest('hex');
const raw=read('wand-runtime-source-v3.0.1.json'),m=JSON.parse(raw);
const magic=new Map(m.magic.map(r=>[r.characteristicId,r.rgba])),flecks=new Map(m.flecks.map(r=>[r.characteristicId,r.rgba]));
test('original wand Refresh maps magic to Tint0, flecks to Tint1, leaves Tint2 white',()=>{
 assert.equal(sha(raw),'5d4d42d95417c8e6222747433b784a32ee9aaebb91216366a70645a33085f0bb');
 assert.deepEqual([...magic.keys()],[104,105,106,107,108,109,110,111,112,113,114,115,132]);
 assert.deepEqual([...flecks.keys()],[127,126,125]);
 for(const [mid,c0] of magic)for(const [fid,c1] of flecks)assert.deepEqual(resolveWandBaseTints({magicCharacteristicId:mid,fleckCharacteristicId:fid},magic,flecks),[c0,c1,[1,1,1,1]]);
 assert.equal(resolveWandBaseTints({magicCharacteristicId:9999,fleckCharacteristicId:125},magic,flecks),null);
 assert.equal(resolveWandBaseTints({magicCharacteristicId:104,fleckCharacteristicId:9999},magic,flecks),null);
});
test('nine dynamic wand base Sprite and standalone mask GUIDs resolve exactly',()=>{
 const audit=JSON.parse(readFileSync(new URL('../data/unityfs-audit/dynamic-uiicons.v3.0.1.json',import.meta.url),'utf8'));
 const rows=audit.rows.filter(r=>r.key.startsWith('item_wandcreation_'));
 assert.equal(rows.length,9);assert.equal(m.rows.length,9);assert.equal(new Set(m.rows.map(r=>r.itemId)).size,9);
 assert.equal(new Set(m.rows.map(r=>r.mask.spritePathId)).size,9);
 for(const row of m.rows){
  const a=rows.find(r=>r.itemId===row.itemId);assert.ok(a);
  assert.equal(row.definitionPathId,a.definitionPathId);assert.equal(row.base.spritePathId,a.baseSpritePathId);
  assert.equal(row.maskGuid,a.maskGuid);assert.match(row.maskBundle,/^l_shared_wand_/);
  assert.match(row.maskBundleSha256,/^[0-9a-f]{64}$/);assert.equal(row.mask.colorSpace,0);assert.equal(row.mask.filterMode,2);
  assert.equal(row.mask.settingsRaw,64);assert.equal(row.mask.mipCount,1);
  const [x,y,w,h]=row.base.sampleRect,[gx,gy,gw,gh]=row.base.guardRect;
  assert.ok(x-gx>=.5&&y-gy>=.5&&gx+gw-x-w>=.5&&gy+gh-y-h>=.5);
  assert.ok(gx+gw<=m.base.width&&gy+gh<=m.alphaOffsetY);
  const [mx,my,mw,mh]=row.mask.sampleRect;assert.ok(mx>=1&&my>=1&&mx+mw<=m.mask.width-1&&my+mh<=m.mask.height-1);
 }
 for(const a of [m.base,m.mask]){const b=read(a.file);assert.equal(b.length,a.bytes);assert.equal(sha(b),a.sha256);assert.equal(b.toString('ascii',8,16),'WEBPVP8L');}
});
test('linear-data mask is sampled without sRGB decoding, existing sRGB path is unchanged',()=>{
 const px=(width,height,rgba)=>({width,height,rgba:new Uint8ClampedArray(rgba)});
 // Two opaque source planes: white base color and full alpha.
 const base=px(1,2,[255,255,255,255,255,255,255,255]);
 const mask=px(1,1,[128,0,0,255]);
 const input={base,mask,baseRect:[0,0,1,1],maskRect:[0,0,1,1],trim:[0,0,1,1],alphaOffsetY:1,logicalSize:1,tints:[[0,0,0,1],[1,1,1,1],[1,1,1,1]]};
 const a=rasterizeDynamicSprite(input),b=rasterizeDynamicSprite({...input,maskColorSpace:'linear'});
 const p=(47*96+47)*4;
 assert.deepEqual(a,rasterizeDynamicSprite({...input,maskColorSpace:'srgb'}));
 assert.ok(a[p]>b[p]);assert.ok(Math.abs(b[p]-187)<=1);assert.equal(a[p+3],255);assert.equal(b[p+3],255);
});

test('native magic icon source map and all nine item transforms use exact original source',()=>{
 const bytes=read('wand-subicon-source-v3.0.1.json'),sub=JSON.parse(bytes);
 assert.equal(sha(bytes),'e69a97ec439e0574a024aaf9ec4379cb83d6946adc460cc2d7c53ab7b617d1a6');
 assert.deepEqual(sub.magic.map(x=>x.characteristicId),[...magic.keys()]);
 assert.equal(new Set(sub.magic.map(x=>x.spritePathId)).size,13);
 assert.equal(sub.wands.length,9);
 for(const w of sub.wands){
  assert.equal(w.definitionPathId,m.rows.find(x=>x.itemId===w.itemId).definitionPathId);
  assert.equal(w.scale,Math.fround(.4));assert.deepEqual(w.offsetPercent,[-.25,.25]);assert.equal(w.rotation,0);
 }
 const data=read(sub.texture.file);assert.equal(data.length,sub.texture.bytes);assert.equal(sha(data),sub.texture.sha256);
 assert.deepEqual(overlayPlacement(84,84,{logicalWidth:256,logicalHeight:128,scale:.4,offsetPercent:[-.25,.25],rotation:0}),{width:33.6,height:16.8,cx:21,cy:21,radians:0});
 assert.deepEqual(sourceOver([0,0,1,1],[1,0,0,.5]),[.5,0,.5,1]);
 assert.deepEqual(sourceOver([0,0,0,0],[1,0,0,.5]),[1,0,0,.5]);
});

test('item-derived overlays bind exact source definition and Sprite identities, without nested recoloring',()=>{
 const bytes=read('wand-item-subicon-source-v3.0.1.json'),source=JSON.parse(bytes);
 assert.equal(sha(bytes),'c5dce47482496e6ddda8b82bebfa845b519a37449228c4a88e894bad2c65e5f3');
 assert.equal(source.rows.length,25);
 assert.equal(new Set(source.rows.map(r=>r.itemId)).size,25);
 assert.equal(source.rows.filter(r=>r.spriteName.startsWith('icon_item_critter_')).length,24);
 assert.equal(source.rows.find(r=>r.itemId===1185152302).spriteName,'icon_item_gen_stick');
 for(const row of source.rows){
  assert.match(row.definitionPathId,/^-?\d+$/);assert.match(row.spritePathId,/^-?\d+$/);
  const a=source.textures[row.pack];assert.ok(a);
  const [l,t,r,b]=row.sampleClamp,[x,y,w,h]=row.sampleRect;
  assert.ok(x>=l-.5&&y>=t-.5&&x+w<=r+.5&&y+h<=b+.5);
  assert.ok(r<a.width&&b<source.alphaOffsetY);
 }
 for(const a of source.textures){const data=read(a.file);assert.equal(data.length,a.bytes);assert.equal(sha(data),a.sha256);}
});
