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
