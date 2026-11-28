import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
const dir='public/dynamic-wand-art/remaining-source/';
const raw=read(dir+'index.json'),manifest=JSON.parse(raw);
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/wand-remaining-source.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
const {decodeWandRemainingSource,remainingWandSprite,WAND_REMAINING_SOURCE_SHA}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const transform={scale:Math.fround(.4),offsetPercent:[-.25,.25],rotation:0};
test('remaining source pack binds all 1816 single-mip sprites and 3152 exact definitions',()=>{
 assert.equal(sha(raw),WAND_REMAINING_SOURCE_SHA);
 const b=decodeWandRemainingSource(manifest),original=JSON.parse(read('public/dynamic-wand-art/candidate-source/index.json'));
 assert.equal(b.rows.size,1816);assert.equal(Object.keys(manifest.items).length,3152);
 const pids=new Set(original.sprites.map(r=>r[0]));
 const used=new Set();
 for(const [id,pid] of Object.entries(manifest.items)){
  assert.ok(!Object.hasOwn(original.items,id));assert.ok(!pids.has(pid));
  assert.equal(remainingWandSprite(b,Number(id),transform),b.rows.get(pid));used.add(pid);
  assert.equal(remainingWandSprite(b,Number(id),{...transform,rotation:1}),undefined);
 }
 assert.equal(used.size,1816);
 for(const [id,pid] of manifest.mipmappedExcluded){assert.ok(!pids.has(pid));assert.equal(remainingWandSprite(b,id,transform),undefined);}
 assert.equal(manifest.mipmappedExcluded.length,47);
 const inventory=JSON.parse(read('public/inventory-art/index.json'));
 for(const [id,,,pid] of inventory.records)if(Object.hasOwn(manifest.items,String(id)))assert.equal(manifest.items[id],pid);
 for(const t of manifest.textures){const bytes=read(dir+t.file);assert.equal(bytes.length,t.bytes);assert.equal(sha(bytes),t.sha256);assert.equal(bytes.toString('ascii',8,16),'WEBPVP8L');}
 assert.equal(remainingWandSprite(b,427689,transform)[0],'-5683819646199230669');
 assert.equal(remainingWandSprite(b,315823,transform),undefined);
});
test('malformed remaining sources fail closed',()=>{
 for(const mutate of [m=>m.sprites[1][2]=0,m=>m.items['427689']='unknown',m=>m.mipmappedExcluded[0][0]=427689,m=>m.textures[0].width=1]){
  const m=structuredClone(manifest);mutate(m);assert.throws(()=>decodeWandRemainingSource(m));
 }
});
