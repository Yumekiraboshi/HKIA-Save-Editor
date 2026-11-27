import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/colorway-fallback.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {resolveRegisteredColorwayFallback,loadRegisteredColorwayFallback}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const source=read('public/source-colorways/index.json');
const override=read('data/native-icon-override-source-v3.0.1.json');
const base='/HKIA-Save-Editor/';
const url=id=>base+'dynamic-colorways/'+id+'.webp?v='+'a'.repeat(64);
const registered=Object.fromEntries(Object.keys(source.records).map(id=>[id,base+'source-colorways/'+id+'.webp']));
test('all 323 original dynamic overlaps retain only their registered same-item atlas fallback',()=>{
 const overlap=override.rows.filter(r=>r[2]>0&&Object.hasOwn(source.records,String(r[0])));
 assert.equal(overlap.length,323);
 for(const [id] of overlap)assert.equal(resolveRegisteredColorwayFallback(url(id),base,registered),registered[id]);
 for(const [id] of override.rows.filter(r=>r[2]>0&&!Object.hasOwn(source.records,String(r[0]))))assert.equal(resolveRegisteredColorwayFallback(url(id),base,registered),undefined);
});
test('fallback cannot cross items or origins or accept unregistered paths',()=>{
 const id=315822;
 for(const bad of ['https://example.org/'+url(id),url(id).replace('dynamic-colorways','source-colorways'),url(id)+'x',base+'dynamic-colorways/../315822.webp?v='+'a'.repeat(64)])
  assert.equal(resolveRegisteredColorwayFallback(bad,base,registered),undefined);
 assert.equal(resolveRegisteredColorwayFallback(url(id),base,{[id]:base+'source-colorways/3969624.webp'}),undefined);
 assert.equal(resolveRegisteredColorwayFallback(url(id),base,Object.create({[id]:registered[id]})),undefined);
});
test('concurrent missing originals share the validated source index request',async()=>{
 const old=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async u=>{calls++;assert.equal(u,base+'source-colorways/index.json');return {ok:true,json:async()=>source}};
  assert.equal(await loadRegisteredColorwayFallback(base+'variant-art/315822.png',base),undefined);
  assert.equal(calls,0);
  assert.deepEqual(await Promise.all([loadRegisteredColorwayFallback(url(315822),base),loadRegisteredColorwayFallback(url(3969624),base)]),[registered[315822],registered[3969624]]);
  assert.equal(calls,1);
 }finally{globalThis.fetch=old;}
});
