import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/original-art-view.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {startOriginalArtRequest}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const flush=()=>new Promise(setImmediate);
test('registered same-item original remains visible until the preferred native override recovers',async()=>{
 const old=globalThis.window,events=new EventTarget();globalThis.window=events;
 let online=false,attempts=[],seen=[],fallbackCalls=0;
 const stop=startOriginalArtRequest('primary','reconstruction','/',url=>seen.push(url),async url=>{attempts.push(url);if(url==='primary'&&!online)throw Error('offline');},async()=>{fallbackCalls++;return 'registered';});
 try{
  await flush();assert.deepEqual(seen,['registered']);assert.deepEqual(attempts,['primary','registered']);
  events.dispatchEvent(new Event('online'));events.dispatchEvent(new Event('online'));
  await flush();assert.deepEqual(seen,['registered']);assert.deepEqual(attempts,['primary','registered','primary']);assert.equal(fallbackCalls,1);
  online=true;events.dispatchEvent(new Event('online'));await flush();
  assert.deepEqual(seen,['registered','primary']);assert.equal(attempts.length,4);
  events.dispatchEvent(new Event('online'));await flush();assert.equal(attempts.length,4);
 }finally{stop();if(old===undefined)delete globalThis.window;else globalThis.window=old;}
});
test('unavailable completed art retries from the original route, cancels obsolete cards and preserves reconstruction fallback',async()=>{
 const old=globalThis.window,events=new EventTarget();globalThis.window=events;
 let online=false;const seen=[],missing=[],canceled=[];
 const decode=async url=>{if(url!=='reconstruction'&&!online)throw Error('offline');};
 const stops=[
  startOriginalArtRequest('primary','reconstruction','/',url=>seen.push(url),decode,async()=>undefined),
  startOriginalArtRequest(undefined,'only','/',url=>missing.push(url),decode),
  startOriginalArtRequest('obsolete',undefined,'/',url=>canceled.push(url),decode,async()=>undefined)
 ];
 try{
  await flush();assert.deepEqual(seen,['reconstruction']);assert.deepEqual(missing,[]);
  stops[2]();online=true;events.dispatchEvent(new Event('online'));await flush();
  assert.deepEqual(seen,['reconstruction','primary']);assert.deepEqual(missing,['only']);assert.deepEqual(canceled,[]);
 }finally{stops.forEach(stop=>stop());if(old===undefined)delete globalThis.window;else globalThis.window=old;}
});
