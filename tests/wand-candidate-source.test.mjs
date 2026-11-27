import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './wand-candidate-source';export * from './dynamic-sprite-raster';",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,define:{'import.meta.env.BASE_URL':JSON.stringify('/')},logLevel:'silent'});
const {decodeWandCandidateSource,candidateWandSprite,sampledWandOverlay,overlayPlacement,rasterizeDynamicSprite,WAND_CANDIDATE_SOURCE_SHA}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const read=p=>readFileSync(new URL('../'+p,import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex');
const dir='public/dynamic-wand-art/candidate-source/';
const bytes=read(dir+'index.json'),manifest=JSON.parse(bytes),binding=decodeWandCandidateSource(manifest);
const transform={scale:Math.fround(.4),offsetPercent:[-.25,.25],rotation:0};
test('native candidate source coverage matches all 8601 ordinary item-wand candidates and original source IDs',()=>{
 assert.equal(sha(bytes),WAND_CANDIDATE_SOURCE_SHA);
 const rule=read('core/src/inventory_source_data.rs').toString().split('pub(super) const RULES:')[1].split('];')[0];
 const ids=[...rule.matchAll(/\((\d+),(\d+)\)/g)].map(x=>Number(x[1]));
 const raw=read('core/src/inventory_wand_ingredient_data.rs').toString().split('=&[')[1].split('];')[0];
 const bits=Buffer.from([...raw.matchAll(/0x([0-9a-f]{2})/g)].map(x=>parseInt(x[1],16)));
 assert.equal(sha(bits),manifest.ingredientBitsetSha256);
 const candidates=ids.filter((id,i)=>bits[i>>3]&(1<<(i&7)));
 assert.deepEqual(Object.keys(manifest.items).map(Number).sort((a,b)=>a-b),candidates);
 assert.equal(binding.rows.size,3150);
 assert.equal(candidateWandSprite(binding,315822,transform)[0],'3532305198544866776');
 for(const id of [608452994,750862373,42715431,1026094637,587092528,1787941842,33246451,1678725721,90977533])assert.equal(candidateWandSprite(binding,id,transform)[5],1);
 assert.equal(candidateWandSprite(binding,315823,transform),undefined);
 assert.equal(candidateWandSprite(binding,315822,{...transform,rotation:1}),undefined);
 for(const t of manifest.textures){const b=read(dir+t.file);assert.equal(b.length,t.bytes);assert.equal(sha(b),t.sha256);assert.equal(b.toString('ascii',8,16),'WEBPVP8L');}
});
test('original sample placement hits the exact 34x34 output pixel centers and no neighboring sheet cell',()=>{
 const row=manifest.sprites[0];
 const texture={width:816,height:1632,rgba:new Uint8ClampedArray(816*1632*4)};
 const overlay=sampledWandOverlay(texture,row);
 assert.deepEqual(overlayPlacement(84,84,overlay),{width:34,height:34,cx:21,cy:21,radians:0});
 assert.deepEqual(overlay.sampleRect,[0,0,34,34]);assert.deepEqual(overlay.sampleClamp,[.5,.5,33.5,33.5]);
 for(let y=0;y<34;y++)for(let x=0;x<34;x++){
  const i=(y*816+x)*4,j=((y+816)*816+x)*4;
  texture.rgba.set([x*7,y*7,100,255],i);texture.rgba.set([255,255,255,255],j);
 }
 const base={width:1,height:2,rgba:new Uint8ClampedArray(8)},mask={width:1,height:1,rgba:new Uint8ClampedArray(4)};
 const out=rasterizeDynamicSprite({base,mask,baseRect:[0,0,1,1],maskRect:[0,0,1,1],trim:[0,0,1,1],alphaOffsetY:1,logicalSize:1,tints:[[1,1,1,1],[1,1,1,1],[1,1,1,1]],overlay});
 for(let y=0;y<34;y++)for(let x=0;x<34;x++){const i=((y+10)*96+x+10)*4;assert.deepEqual([...out.slice(i,i+4)],[x*7,y*7,100,255]);}
 for(const [x,y] of [[9,10],[44,10],[10,9],[10,44]])assert.equal(out[(y*96+x)*4+3],0);
});
test('malformed route cannot bind to a different source cell',()=>{
 const m=structuredClone(manifest);m.sprites[1][2]=0;
 assert.throws(()=>decodeWandCandidateSource(m),/WAND_CANDIDATE_ROW/);
});

test('all 206 extra original definition aliases share their exact sampled Sprite and never grant candidate eligibility',()=>{
 const source=JSON.parse(read('data/wand-original-sprite-aliases-v3.0.1.json'));
 const native=JSON.parse(read('public/inventory-art/index.json'));
 const originalRows=new Map(native.records.map(r=>[r[0],r[3]]));
 const spriteIndexes=new Map(manifest.sprites.map((r,i)=>[r[0],i]));
 const b=Buffer.alloc(source.rows.length*6);
 assert.equal(source.rows.length,206);assert.equal(binding.aliasRows.size,206);
 assert.equal(new Set(source.rows.map(r=>r[1])).size,179);
 assert.equal(source.rows.filter(r=>originalRows.has(r[0])).length,183);
 for(const [i,[id,pid]] of source.rows.entries()){
  assert.ok(!Object.hasOwn(manifest.items,String(id)));
  assert.equal(candidateWandSprite(binding,id,transform),binding.rows.get(pid));
  assert.equal(candidateWandSprite(binding,id,{...transform,rotation:1}),undefined);
  if(originalRows.has(id))assert.equal(originalRows.get(id),pid);
  b.writeUInt32LE(id,i*6);b.writeUInt16LE(spriteIndexes.get(pid),i*6+4);
 }
 assert.equal(sha(b),source.indexRowsSha256);
 assert.equal(source.indexRowsSha256,'b616fa26ecf162dcd8172ed57c0f108de905b81f0389ffd2e11ed97075e186c9');
 assert.deepEqual(native.records.filter(r=>!Object.hasOwn(manifest.items,String(r[0]))&&binding.rows.has(r[3])).map(r=>r[0]).sort((a,b)=>a-b),source.rows.filter(r=>originalRows.has(r[0])).map(r=>r[0]));
});
