import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/original-art-view.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {startOriginalArtRequest,createOriginalImageDecoder}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
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

test('completed original images share a bounded decoder; obsolete waiting URLs never load',async()=>{
 const started=[],releases=new Map();let active=0,peak=0;
 const decode=createOriginalImageDecoder(url=>new Promise((resolve,reject)=>{
  started.push(url);active++;peak=Math.max(active,peak);
  releases.set(url,(fail=false)=>{active--;fail?reject(Error('offline')):resolve();});
 }));
 let stale=true;
 const requests=Array.from({length:6},(_,i)=>decode('original-'+i));
 const same=decode('original-0');
 assert.equal(same,requests[0]);
 const queued=decode('queued-stale',()=>stale);
 const caught=assert.rejects(queued,/ORIGINAL_ART_CANCELED/);
 const next=decode('next');
 const nextAgain=decode('next');
 assert.equal(next,nextAgain);
 await flush();assert.deepEqual(started,Array.from({length:6},(_,i)=>'original-'+i));
 stale=false;releases.get('original-2')();
 await flush();await caught;
 assert.ok(!started.includes('queued-stale'));assert.equal(started.at(-1),'next');assert.equal(peak,6);
 for(const i of [0,1,3,4,5])releases.get('original-'+i)();
 releases.get('next')();await Promise.all([...requests,same,next,nextAgain]);await flush();
 const failure=decode('retry'),checked=assert.rejects(failure,/offline/);
 await flush();releases.get('retry')(true);await checked;
 const recovered=decode('retry');await flush();releases.get('retry')();await recovered;
 assert.equal(started.filter(x=>x==='retry').length,2);assert.equal(active,0);
});
test('shared waiting image remains available if one requesting card stays live',async()=>{
 let visible=true;const releases=[],started=[];
 const decode=createOriginalImageDecoder(url=>new Promise(resolve=>{started.push(url);releases.push(resolve);}));
 const pending=Array.from({length:6},(_,i)=>decode('busy-'+i));
 const a=decode('shared',()=>visible),b=decode('shared',()=>true);
 assert.equal(a,b);visible=false;
 await flush();releases[0]();await flush();
 assert.equal(started.at(-1),'shared');
 for(const release of releases)release();
 await Promise.all([...pending,a,b]);
});
