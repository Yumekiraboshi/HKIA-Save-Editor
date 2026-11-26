import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-preview-output-v3.0.1.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {nativePreviewTextureSize,nativePreviewPostOutput,nativePreviewUiPixel,nativePreviewUiBlend,NATIVE_PREVIEW_UI_GLSL}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-12,JSON.stringify({a,b})));
test('native texture provider size boundaries',()=>{
 for(const [a,b] of [[1,64],[64,64],[65,128],[128,128],[129,256],[256,256],[257,512],[512,512],[513,1024],[1024,1024],[2048,1024]])assert.equal(nativePreviewTextureSize(a),b);
 for(const bad of [0,-1,1.5,NaN,Infinity,2147483648])assert.throws(()=>nativePreviewTextureSize(bad),/SIZE/);
});
test('alpha output depends on the actual post shader; no automatic repair',()=>{
 for(const a of [0,.25,1]){
  assert.deepEqual(nativePreviewPostOutput([.8,.4,.3],a,'uber'),[.8,.4,.3,a]);
  assert.deepEqual(nativePreviewPostOutput([.8,.4,.3],a,'final'),[.8,.4,.3,1]);
 }
 assert.throws(()=>nativePreviewPostOutput([1,2,3],0,'unknown'),/STAGE/);
});
test('UI/Default source alpha rounding, additive sample and premultiplied blend',()=>{
 const c=[.3,.6,.9,.4],v=[.8,.5,.7,2.5/255],add=[.01,-.02,.03,.05];
 const a=2*Math.fround(1/255)*.45;
 near(nativePreviewUiPixel(c,v,add),[.31*.8*a,.58*.5*a,.93*.7*a,a]);
 near(nativePreviewUiPixel(c,[...v.slice(0,3),3.5/255],add),[.31*.8*a*2,.58*.5*a*2,.93*.7*a*2,a*2]);
 const bg=[.11,.22,.33,1];
 const hidden=nativePreviewUiPixel([.9,.6,.3,0],[1,1,1,1],[0,0,0,0]);
 near(hidden,[0,0,0,0]);near(nativePreviewUiBlend(hidden,bg),bg);
 const final=nativePreviewUiPixel(nativePreviewPostOutput([.9,.6,.3],0,'final'),[1,1,1,1],[0,0,0,0]);
 near(final,[.9,.6,.3,1].map(x=>x*255*Math.fround(1/255)));
 near(nativePreviewUiBlend([.2,.1,.05,.5],bg),[.255,.21,.215,1]);
 assert.throws(()=>nativePreviewUiPixel([1,NaN,0,1],v,add),/VALUE/);
 assert.match(NATIVE_PREVIEW_UI_GLSL,/roundEven/);
});
