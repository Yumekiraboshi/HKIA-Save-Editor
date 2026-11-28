import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/inventory-sheet-art.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {createInventorySheetLoader,startInventorySpriteRequest,resolveVerifiedInventorySprite}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const asset={root:'/inventory-art/',file:'sheet-008.webp',sha256:'a'.repeat(64),bytes:12};
const cell={url:'/inventory-art/sheet-008.webp',x:672,y:672,nativeSheet:asset};
test('shared sheet requests retry failure and retain a single decoded sheet',async()=>{
 let calls=0;
 const load=createInventorySheetLoader(async()=>{calls++;if(calls===1)throw Error('offline');return {url:'blob:verified',height:1152};});
 const first=load(asset);assert.equal(load(asset),first);await assert.rejects(first);
 const next=load(asset);assert.equal(load(asset),next);assert.deepEqual(await next,{url:'blob:verified',height:1152});assert.equal(load(asset),next);assert.equal(calls,2);
 await assert.rejects(load({...asset,file:'../x.webp'}));
});
test('visible failed cells recover, canceled cells do not install stale artwork',async()=>{
 const previous=globalThis.window,events=new EventTarget();globalThis.window=events;
 const seen=[],stale=[];let available=false,calls=0,stop=()=>{},cancel=()=>{};
 const load=createInventorySheetLoader(async()=>{calls++;if(!available)throw Error('offline');return {url:'blob:verified',height:1152};});
 try{
  stop=startInventorySpriteRequest(cell,v=>seen.push(v),load);
  cancel=startInventorySpriteRequest(cell,v=>stale.push(v),load);
  await new Promise(setImmediate);assert.equal(calls,1);assert.deepEqual(seen,[undefined]);cancel();
  available=true;events.dispatchEvent(new Event('online'));await new Promise(setImmediate);
  assert.deepEqual(seen,[undefined,{...cell,url:'blob:verified'}]);assert.deepEqual(stale,[undefined]);assert.equal(calls,2);
  events.dispatchEvent(new Event('online'));await new Promise(setImmediate);assert.equal(calls,2);
  const ordinary={url:'blob:zip',x:0,y:0},pass=[];startInventorySpriteRequest(ordinary,v=>pass.push(v),load)();assert.deepEqual(pass,[ordinary]);
 }finally{stop();cancel();if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});

test('canvas and CSS share the same verified cell; absent descriptors and out-of-bounds cells reject',async()=>{
 let calls=0;const load=createInventorySheetLoader(async()=>{calls++;return {url:'blob:verified',height:1152};});
 const [a,b]=await Promise.all([resolveVerifiedInventorySprite(cell,load),resolveVerifiedInventorySprite({...cell,x:0,y:0},load)]);
 assert.equal(calls,1);assert.equal(a.url,b.url);assert.equal(a.x,672);assert.equal(b.x,0);
 await assert.rejects(resolveVerifiedInventorySprite({...cell,nativeSheet:undefined},load),/DESCRIPTOR/);
 await assert.rejects(resolveVerifiedInventorySprite({...cell,x:1152},load),/CELL/);
 await assert.rejects(resolveVerifiedInventorySprite({...cell,y:NaN},load),/CELL/);
});
