import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/dynamic-art-view.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {watchDynamicArtVisibility,startDynamicArtRequest}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

test('all dynamic cards share viewport observer; destroyed cards stop receiving callbacks',()=>{
 const previous=globalThis.IntersectionObserver;
 const observers=[];
 class FakeObserver{
  constructor(cb,opts){this.cb=cb;this.opts=opts;this.targets=new Set();observers.push(this);}
  observe(n){this.targets.add(n);}
  unobserve(n){this.targets.delete(n);}
  disconnect(){this.targets.clear();this.disconnected=true;}
 }
 globalThis.IntersectionObserver=FakeObserver;
 try{
  const a={},b={},seen=[];
  const x=watchDynamicArtVisibility(a,v=>seen.push(['a',v]));
  const y=watchDynamicArtVisibility(b,v=>seen.push(['b',v]));
  assert.equal(observers.length,1);
  assert.equal(observers[0].opts.rootMargin,'384px');
  assert.equal(observers[0].targets.size,2);
  assert.deepEqual(seen,[]);
  observers[0].cb([{target:a,isIntersecting:true},{target:b,isIntersecting:false}]);
  x.destroy();
  observers[0].cb([{target:a,isIntersecting:false},{target:b,isIntersecting:true}]);
  assert.deepEqual(seen,[['a',true],['b',false],['b',true]]);
  y.destroy();
  assert.equal(observers[0].disconnected,true);
 }finally{if(previous===undefined)delete globalThis.IntersectionObserver;else globalThis.IntersectionObserver=previous;}
});
test('without IntersectionObserver the renderer remains available',()=>{
 const previous=globalThis.IntersectionObserver;delete globalThis.IntersectionObserver;
 try{let visible=false;const action=watchDynamicArtVisibility({},v=>{visible=v});assert.equal(visible,true);action.destroy();}
 finally{if(previous!==undefined)globalThis.IntersectionObserver=previous;}
});
test('old asynchronous render cannot replace current appearance; URLs are revoked on release',async()=>{
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL,created=[],revoked=[],seen=[];
 URL.createObjectURL=blob=>{created.push(blob);return 'blob:test-'+created.length;};
 URL.revokeObjectURL=url=>revoked.push(url);
 try{
  let finishOld,finishNew;
  const old=new Promise(resolve=>{finishOld=resolve});
  const next=new Promise(resolve=>{finishNew=resolve});
  const stopOld=startDynamicArtRequest(()=>old,v=>seen.push(v));stopOld();
  const stopNew=startDynamicArtRequest(()=>next,v=>seen.push(v));
  const newBlob=new Blob(['new']),oldBlob=new Blob(['old']);
  finishNew(newBlob);await next;await Promise.resolve();
  finishOld(oldBlob);await old;await Promise.resolve();
  assert.deepEqual(created,[newBlob]);
  assert.deepEqual(seen,[null,null,'blob:test-1']);
  stopNew();assert.deepEqual(revoked,['blob:test-1']);
  const stopMissing=startDynamicArtRequest(async()=>null,v=>seen.push(v));await Promise.resolve();stopMissing();
  assert.equal(seen.at(-1),null);
 }finally{URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});

test('partial artwork is used only when complete artwork is missing, never after cancellation',async()=>{
 const full=new Blob(['full']),part=new Blob(['part']);
 const seen=[];let partialCalls=0;
 const partial=async()=>{partialCalls++;return part};
 const result=await new Promise(resolve=>{
  const stop=startDynamicArtRequest(async()=>full,(url,isPartial)=>{if(url){seen.push(isPartial);resolve(stop);}},partial);
 });result();
 assert.equal(partialCalls,0);
 const fallback=await new Promise(resolve=>{
  const stop=startDynamicArtRequest(async()=>null,(url,isPartial)=>{if(url){seen.push(isPartial);resolve(stop);}},partial);
 });fallback();
 assert.equal(partialCalls,1);assert.deepEqual(seen,[false,true]);
 let release;const pending=new Promise(resolve=>{release=resolve});
 const canceled=startDynamicArtRequest(()=>pending,()=>{},partial);canceled();release(null);await pending;await Promise.resolve();
 assert.equal(partialCalls,1);
});

test('large inventory bounds active generation and cancels queued cards before asset loading',async()=>{
 const started=[],finished=[],seen=[],releases=new Map();
 const make=i=>startDynamicArtRequest(()=>new Promise(resolve=>{
  started.push(i);releases.set(i,()=>{finished.push(i);resolve(null);});
 }),v=>seen.push([i,v]));
 const stops=Array.from({length:8},(_,i)=>make(i));
 try{
  assert.deepEqual(started,[0,1,2,3]);
  assert.equal(seen.length,8);
  stops[5]();stops[6]();
  // A running cancellation must not allow an extra concurrent GPU/canvas job.
  stops[0]();
  assert.deepEqual(started,[0,1,2,3]);
  releases.get(1)();await new Promise(setImmediate);
  assert.deepEqual(started,[0,1,2,3,4]);
  releases.get(0)();await new Promise(setImmediate);
  assert.deepEqual(started,[0,1,2,3,4,7]);
  assert.equal(started.length-finished.length,4);
  for(const i of [2,3,4,7])releases.get(i)();
  await new Promise(setImmediate);
  assert.equal(started.length,finished.length);
  assert.ok(seen.every(([,url])=>url===null));
 }finally{
  for(const stop of stops)stop();
  for(const release of releases.values())release();
  await new Promise(setImmediate);
 }
});
test('a failed render releases its slot for the next queued appearance',async()=>{
 const started=[],failures=[];
 const stops=Array.from({length:5},(_,i)=>startDynamicArtRequest(()=>{
  started.push(i);
  if(i===4)return Promise.resolve(null);
  return new Promise((_,reject)=>failures.push(reject));
 },()=>{}));
 try{
  assert.deepEqual(started,[0,1,2,3]);
  failures[0](Error('missing source'));
  await new Promise(setImmediate);
  assert.deepEqual(started,[0,1,2,3,4]);
 }finally{
  for(const stop of stops)stop();
  for(const reject of failures)reject(Error('cleanup'));
  await new Promise(setImmediate);
 }
});

test('rejected complete artwork still shows independent base and respects cancellation',async()=>{
 const base=new Blob(['verified base']);
 let partialCalls=0;
 const partial=async()=>{partialCalls++;return base;};
 for(const render of [()=>{throw Error('sync unavailable');},async()=>{throw Error('async unavailable');}]){
  const shown=[];
  const stop=startDynamicArtRequest(render,(url,isPartial)=>shown.push([url,isPartial]),partial);
  await new Promise(setImmediate);
  assert.equal(shown.length,2);
  assert.ok(shown[1][0]?.startsWith('blob:'));
  assert.equal(shown[1][1],true);
  stop();
 }
 assert.equal(partialCalls,2);
 let reject;
 const pending=new Promise((_,r)=>{reject=r;});
 const stop=startDynamicArtRequest(()=>pending,()=>{},partial);
 stop();reject(Error('canceled'));
 await new Promise(setImmediate);
 assert.equal(partialCalls,2);
});

test('network recovery upgrades partial artwork without discarding it or retrying complete or canceled cards',async()=>{
 const previous=globalThis.window;
 const events=new EventTarget();
 globalThis.window=events;
 const full=new Blob(['full']),base=new Blob(['base']);
 let online=false,calls=0,partialCalls=0,completeCalls=0,canceledCalls=0;
 const seen=[];
 const stop=startDynamicArtRequest(async()=>{calls++;return online?full:null;},(url,partial)=>seen.push([url,partial]),async()=>{partialCalls++;return base;});
 const done=startDynamicArtRequest(async()=>{completeCalls++;return full;},()=>{});
 const gone=startDynamicArtRequest(async()=>{canceledCalls++;return null;},()=>{});
 try{
  await new Promise(setImmediate);
  assert.equal(calls,1);assert.equal(partialCalls,1);
  assert.equal(seen.length,2);assert.equal(seen[1][1],true);
  gone();
  events.dispatchEvent(new Event('online'));
  events.dispatchEvent(new Event('online'));
  await new Promise(setImmediate);
  assert.equal(calls,2);assert.equal(partialCalls,1);assert.equal(seen.length,2);
  online=true;events.dispatchEvent(new Event('online'));
  await new Promise(setImmediate);
  assert.equal(calls,3);assert.equal(seen.length,3);assert.equal(seen[2][1],false);
  assert.notEqual(seen[1][0],seen[2][0]);
  events.dispatchEvent(new Event('online'));
  await new Promise(setImmediate);
  assert.equal(calls,3);assert.equal(completeCalls,1);assert.equal(canceledCalls,1);
 }finally{
  stop();done();gone();
  if(previous===undefined)delete globalThis.window;else globalThis.window=previous;
 }
});
test('network recovery also restores a missing image with no partial source',async()=>{
 const previous=globalThis.window;
 const events=new EventTarget();globalThis.window=events;
 let online=false,calls=0;const seen=[];
 const stop=startDynamicArtRequest(async()=>{calls++;if(!online)throw Error('offline');return new Blob(['restored']);},url=>seen.push(url));
 try{
  await new Promise(setImmediate);
  assert.deepEqual(seen,[null]);
  online=true;events.dispatchEvent(new Event('online'));
  await new Promise(setImmediate);
  assert.equal(calls,2);assert.equal(seen.length,2);assert.ok(seen[1].startsWith('blob:'));
 }finally{
  stop();
  if(previous===undefined)delete globalThis.window;else globalThis.window=previous;
 }
});

test('three-stage artwork recovery upgrades an original base to tinted base and complete image without downgrades',async()=>{
 const previous=globalThis.window,events=new EventTarget();globalThis.window=events;
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL,blobs=[],revoked=[],seen=[];
 URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:tier-'+blobs.length;};
 URL.revokeObjectURL=url=>revoked.push(url);
 const original=new Blob(['original']),tinted=new Blob(['tinted']),complete=new Blob(['complete']);
 let stage=0,fullCalls=0,intermediateCalls=0,partialCalls=0;
 const stop=startDynamicArtRequest(async()=>{fullCalls++;return stage===3?complete:null;},(url,partial)=>seen.push([url,partial]),
  async()=>{partialCalls++;return original;},async()=>{intermediateCalls++;if(stage===0)throw Error('mask missing');return stage===1?tinted:null;});
 const recover=async()=>{events.dispatchEvent(new Event('online'));events.dispatchEvent(new Event('online'));await new Promise(setImmediate);};
 try{
  await new Promise(setImmediate);
  assert.deepEqual(blobs,[original]);assert.deepEqual(seen,[[null,undefined],['blob:tier-1',true]]);
  stage=1;await recover();
  assert.deepEqual(blobs,[original,tinted]);assert.deepEqual(revoked,['blob:tier-1']);
  stage=2;await recover();
  assert.deepEqual(blobs,[original,tinted]);assert.equal(partialCalls,1);assert.equal(intermediateCalls,2);
  stage=3;await recover();
  assert.deepEqual(blobs,[original,tinted,complete]);assert.deepEqual(seen.at(-1),['blob:tier-3',false]);
  assert.deepEqual(revoked,['blob:tier-1','blob:tier-2']);
  await recover();assert.equal(fullCalls,4);
  stop();assert.deepEqual(revoked,['blob:tier-1','blob:tier-2','blob:tier-3']);
 }finally{
  stop();URL.createObjectURL=create;URL.revokeObjectURL=revoke;
  if(previous===undefined)delete globalThis.window;else globalThis.window=previous;
 }
});

test('same cached appearance shares the live object URL until the last consumer releases it',async()=>{
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL,created=[],revoked=[];
 URL.createObjectURL=blob=>{created.push(blob);return 'blob:shared-'+created.length;};
 URL.revokeObjectURL=url=>revoked.push(url);
 const shared=new Blob(['appearance']),other=new Blob(['appearance']);
 const seen=[[],[],[],[]],stops=[];
 const start=(blob,i)=>startDynamicArtRequest(async()=>blob,url=>seen[i].push(url));
 try{
  stops.push(start(shared,0),start(shared,1),start(other,2));
  await new Promise(setImmediate);
  assert.deepEqual(created,[shared,other]);assert.equal(seen[0][1],seen[1][1]);
  assert.notEqual(seen[0][1],seen[2][1]);
  stops[0]();stops[0]();assert.deepEqual(revoked,[]);
  stops[1]();assert.deepEqual(revoked,['blob:shared-1']);
  stops.push(start(shared,3));await new Promise(setImmediate);
  assert.equal(seen[3][1],'blob:shared-3');
  stops[2]();stops[3]();assert.deepEqual(revoked,['blob:shared-1','blob:shared-2','blob:shared-3']);
 }finally{stops.forEach(stop=>stop());URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
});
test('recovering one dynamic card does not revoke a shared base used by another card',async()=>{
 const previous=globalThis.window,events=new EventTarget();globalThis.window=events;
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL,created=[],revoked=[];
 URL.createObjectURL=blob=>{created.push(blob);return 'blob:upgrade-'+created.length;};
 URL.revokeObjectURL=url=>revoked.push(url);
 const base=new Blob(['base']),full=new Blob(['full']);let ready=false;
 const a=[],b=[];
 const stopA=startDynamicArtRequest(async()=>ready?full:null,url=>a.push(url),async()=>base);
 const stopB=startDynamicArtRequest(async()=>base,url=>b.push(url));
 try{
  await new Promise(setImmediate);
  assert.equal(a[1],b[1]);assert.deepEqual(created,[base]);
  ready=true;events.dispatchEvent(new Event('online'));await new Promise(setImmediate);
  assert.equal(a.at(-1),'blob:upgrade-2');assert.deepEqual(revoked,[]);
  stopA();assert.deepEqual(revoked,['blob:upgrade-2']);
  stopB();assert.deepEqual(revoked,['blob:upgrade-2','blob:upgrade-1']);
 }finally{stopA();stopB();URL.createObjectURL=create;URL.revokeObjectURL=revoke;if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
