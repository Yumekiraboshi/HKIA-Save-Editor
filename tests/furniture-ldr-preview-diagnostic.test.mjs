import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-ldr-preview-diagnostic.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {prepareDefaultFurnitureLdrDiagnostic,applyFurnitureLdrDiagnostic,compositeFurnitureLdrDiagnostic,renderFurnitureLdrDiagnostic}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const clear=[49,77,121,0],size=32;
const post={vignetteColor:[0,0,0],vignetteAspect:1,vignetteCenter:[.5,.5],vignetteIntensity:0,vignetteSmoothness:1,output:'linear',exposureMultiplier:1};
const atlas=()=>{
 const rgba=new Uint8Array(4*2*4);
 for(let y=0;y<2;y++)for(let x=0;x<4;x++)rgba.set([(x%2)*255,y*255,Math.floor(x/2)*255,255],(y*4+x)*4);
 return {width:4,height:2,rgba,parameters:[.25,.5,1],rowOrder:'bottom-up',fidelity:'diagnostic-only'};
};
const makeFrame=()=>{
 const rgba=new Uint8Array(size*size*4);for(let i=0;i<rgba.length;i+=4)rgba.set(clear,i);
 rgba.set([80,90,100,0,10,20,30,255,50,100,150,128],4);
 return {width:size,height:size,rgba,rowOrder:'bottom-up',clearRgba:clear,changedPixels:3,hiddenChangedPixels:1,
 visiblePixels:2,hiddenRgbPixels:1022,partialAlphaPixels:1,renderers:2,uniqueTextures:6,fidelity:'forward-diagnostic-only'};
};
test('forward framebuffer, LDR and UI composite preserve source alpha and distinguish nonblack clear',()=>{
 const frame=makeFrame(),original=frame.rgba.slice(),plan={atlas:atlas(),post};
 const graded=applyFurnitureLdrDiagnostic(frame,plan);
 assert.equal(graded.source,frame);assert.notEqual(graded.rgba,frame.rgba);assert.deepEqual(frame.rgba,original);
 assert.deepEqual(graded.rgba,original);assert.equal(graded.gradedChangedPixels,3);assert.equal(graded.gradedHiddenChangedPixels,1);
 assert.equal(graded.visiblePixels,2);assert.equal(graded.partialAlphaPixels,1);assert.equal(graded.fidelity,'ldr-uber-diagnostic-only');
 const ui={vertex:[1,1,1,1],sampleAdd:[0,0,0,0],backdrop:[1,1,1],storedToBlend:x=>x,blendToDisplay:x=>x};
 const composed=compositeFurnitureLdrDiagnostic(graded,ui);
 assert.deepEqual([...composed.rgba.slice(0,16)],[255,255,255,255,255,255,255,255,10,20,30,255,152,177,202,255]);
 assert.deepEqual(graded.rgba,original);assert.equal(composed.fidelity,'opaque-backdrop-diagnostic-only');
 assert.throws(()=>compositeFurnitureLdrDiagnostic(graded,{...ui,storedToBlend:()=>[NaN,0,0]}),/COMPOSITE_SPACE/);
});
test('spatially varying postprocessing uses the graded clear at the same pixel',()=>{
 const frame=makeFrame(),plan={atlas:atlas(),post:{...post,vignetteIntensity:1}};
 const graded=applyFurnitureLdrDiagnostic(frame,plan);
 assert.notDeepEqual(graded.rgba.slice(0,4),graded.rgba.slice(4*(16*32+16),4*(16*32+17)));
 assert.equal(graded.gradedChangedPixels,3);assert.equal(graded.gradedHiddenChangedPixels,1);
 for(let i=3;i<frame.rgba.length;i+=4)assert.equal(graded.rgba[i],frame.rgba[i]);
 assert.throws(()=>applyFurnitureLdrDiagnostic({...frame,rgba:new Uint8Array(4)},plan),/FRAME/);
 assert.throws(()=>applyFurnitureLdrDiagnostic(frame,{...plan,atlas:{...atlas(),parameters:[1,1,1]}}),/ATLAS/);
});
test('explicit serialized defaults build an actual bounded LUT; not an automatic camera fallback',()=>{
 const {atlas:a,post:p,source,curveFormat}=prepareDefaultFurnitureLdrDiagnostic(16,45,post);
 assert.equal(a.width,256);assert.equal(a.height,16);assert.equal(a.rgba.length,16384);
 assert.equal(source.sourceFidelity,'serialized-default-only');assert.equal(curveFormat,45);assert.equal(p.exposureMultiplier,1);
 assert.equal(a.rgba[3],255);assert.ok(a.rgba.some((v,i)=>i%4!==3&&v>0));
 const graded=applyFurnitureLdrDiagnostic(makeFrame(),{atlas:a,post:p});
 assert.equal(graded.visiblePixels,2);assert.equal(graded.partialAlphaPixels,1);
 assert.throws(()=>prepareDefaultFurnitureLdrDiagnostic(66,45,post),/SIZE/);
});
test('one integrated call runs common draw, reads both raw and graded channels and releases context',async()=>{
 const frame=makeFrame(),events=[];let reads=0;
 const gl=new Proxy({drawingBufferWidth:32,drawingBufferHeight:32,NO_ERROR:0,isContextLost:()=>false,getError:()=>0,
 readPixels(...a){events.push('read');const v=a[6];if(++reads===1){for(let i=0;i<v.length;i+=4)v.set(clear,i);}else v.set(frame.rgba);},
 getExtension:()=>({loseContext(){events.push('release');}})},
 {get(t,k){if(k in t)return t[k];if(typeof k==='string'&&k===k.toUpperCase())return 1;return ()=>{};}});
 const canvas={width:0,height:0,getContext:()=>gl,toBlob(){throw Error('diagnostic must not encode PNG');}};
 const sources={},request={},read=async()=>new ArrayBuffer(0);
 const result=await renderFurnitureLdrDiagnostic(sources,request,read,{atlas:atlas(),post},{size:32,clearRgb:[49/255,77/255,121/255]},()=>canvas,async(g,s,r,f)=>{
  assert.equal(g,gl);assert.equal(s,sources);assert.equal(r,request);assert.equal(f,read);events.push('draw');return {renderers:2,uniqueTextures:6,fidelity:'forward-diagnostic-only'};
 });
 assert.deepEqual(events,['read','draw','read','release']);
 assert.deepEqual(result.source.rgba,frame.rgba);assert.deepEqual(result.rgba,frame.rgba);assert.equal(result.gradedHiddenChangedPixels,1);
 assert.equal(canvas.width,0);assert.equal(canvas.height,0);
});
