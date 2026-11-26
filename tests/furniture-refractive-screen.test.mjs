import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './src/furniture-refractive-screen-v3.0.1';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {refractiveScreenCoordinates,composeRefractiveScreen,NATIVE_REFRACTIVE_SCREEN_GLSL}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const near=(a,b)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-8,JSON.stringify({a,b})));};
test('native screen coordinates use independent RGB offsets and saturation',()=>{
 const delta=Math.fround(.025);
 const x=refractiveScreenCoordinates({screenUv:[.3,.4],viewDisplacement:[.2,-.2],facingFactor:.5,chromatism:1});
 near(x.red,[.4-delta,.3-delta]);near(x.green,[.4+delta,.3+delta]);near(x.blue,[.4,.3]);
 const y=refractiveScreenCoordinates({screenUv:[.99,.01],viewDisplacement:[.4,-.4],facingFactor:0,chromatism:1});
 for(const c of Object.values(y))near(c,[1,0]);
 const z=refractiveScreenCoordinates({screenUv:[.2,.8],viewDisplacement:[.4,-.4],facingFactor:1,chromatism:0});
 for(const c of Object.values(z))near(c,[.2,.8]);
});
test('native screen composition is additive, retains unclamped HDR and respects tint/intensity endpoints',()=>{
 const lit=[.1,.2,.3],samples=[.3,.4,.5],color=[.2,.4,.6];
 near(composeRefractiveScreen(lit,samples,color,.5,.5,2),[.28,.48,.7]);
 near(composeRefractiveScreen(lit,samples,color,1,0,10),lit);
 near(composeRefractiveScreen(lit,samples,color,0,1,10),[3.1,4.2,5.3]);
 assert.match(NATIVE_REFRACTIVE_SCREEN_GLSL,/texture\(opaqueCamera, redUV, mipBias\)\.r/);
 assert.match(NATIVE_REFRACTIVE_SCREEN_GLSL,/texture\(opaqueCamera, greenUV, mipBias\)\.g/);
 assert.match(NATIVE_REFRACTIVE_SCREEN_GLSL,/texture\(opaqueCamera, blueUV, mipBias\)\.b/);
});
