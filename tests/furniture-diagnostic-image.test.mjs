import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-diagnostic-image.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {renderFurnitureDiagnosticImage}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
function mock({empty=false,png=true,lost=false,readError=false}={}){
 const events=[];let read=false;
 const gl=new Proxy({drawingBufferWidth:32,drawingBufferHeight:32,NO_ERROR:0,isContextLost:()=>lost,getError:()=>read&&readError?1282:0,
  readPixels(...args){events.push('read');read=true;if(!empty)args[6][3]=255;},
  getExtension:()=>({loseContext(){events.push('release');}})},
  {get(t,k){if(k in t)return t[k];if(typeof k==='string'&&k===k.toUpperCase())return 1;return (...args)=>events.push([k,...args]);}});
 const canvas={width:0,height:0,getContext(type,options){events.push([type,options]);return gl;},toBlob(cb,type){events.push('encode');cb(png?new Blob(['test'],{type}):null);}};
 return {events,canvas,gl};
}
const result={renderers:3,uniqueTextures:6,fidelity:'forward-diagnostic-only'};
test('isolated framebuffer exports only complete nonempty diagnostic PNG and releases context',async()=>{
 const {events,canvas,gl}=mock(),read=async()=>new ArrayBuffer(0),s={},r={};
 const img=await renderFurnitureDiagnosticImage(s,r,read,32,()=>canvas,async(g,ss,rr,fetch)=>{assert.equal(g,gl);assert.equal(ss,s);assert.equal(rr,r);assert.equal(fetch,read);events.push('draw');return result;});
 assert.equal(img.visiblePixels,1);assert.equal(img.renderers,3);assert.equal(img.blob.type,'image/png');assert.equal(img.fidelity,'forward-diagnostic-only');
 assert.deepEqual(events.filter(x=>typeof x==='string'),['draw','read','encode','release']);
 assert.equal(canvas.width,0);assert.equal(canvas.height,0);assert.equal(events[0][1].premultipliedAlpha,false);
});
test('failed, empty, corrupt or lost-context draw cannot publish a PNG',async()=>{
 for(const [opts,error] of [[{empty:true},/EMPTY/],[{png:false},/PNG/],[{readError:true},/READ/],[{lost:true},/CONTEXT/]]){
  const {events,canvas}=mock(opts);
  await assert.rejects(renderFurnitureDiagnosticImage({}, {},async()=>new ArrayBuffer(0),32,()=>canvas,async()=>result),error);
  assert.equal(events.at(-1),'release');assert.equal(canvas.width,0);assert.equal(canvas.height,0);
 }
 const {events,canvas}=mock();const original=Error('SOURCE_FAILURE');
 await assert.rejects(renderFurnitureDiagnosticImage({}, {},async()=>new ArrayBuffer(0),32,()=>canvas,async()=>{throw original;}),e=>e===original);
 assert.ok(!events.includes('encode'));assert.equal(events.at(-1),'release');
 await assert.rejects(renderFurnitureDiagnosticImage({}, {},async()=>new ArrayBuffer(0),1024,()=>{throw Error('unexpected allocation');}),/SIZE/);
});
