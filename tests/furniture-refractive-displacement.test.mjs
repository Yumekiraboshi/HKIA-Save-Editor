import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './src/furniture-refractive-displacement-v3.0.1';export * from './src/furniture-refractive-screen-v3.0.1';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {refractiveNormalLod,refractiveNormal,refractiveNoiseUv,refractiveDisplacement,refractiveScreenCoordinates,NATIVE_REFRACTIVE_DISPLACEMENT_GLSL}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const near=(a,b)=>{assert.equal(a.length,b.length);a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-10,JSON.stringify({a,b})));};
const basis=[[1,0,0],[0,1,0],[0,0,1]];
test('refraction-only normal samples alpha-multiplied red at native LOD and smooths toward tangent Z',()=>{
 assert.equal(refractiveNormalLod(.4),2);
 near(refractiveNormal([.8,.5,0,.5],0,basis),[-.2,0,Math.sqrt(.96)]);
 near(refractiveNormal([.8,.5,0,.5],1,basis),[0,0,1]);
 near(refractiveNormal([.8,.5,0,.5],0,[[0,-1,0],[1,0,0],[0,0,1]]),[0,-.2,Math.sqrt(.96)]);
 near(refractiveNoiseUv([.1,.4],3),[.3,1.2]);
});
test('refraction discriminant, positive facing, noise and screen composition preserve original operation order',()=>{
 const u={refractionNormal:[0,0,1],view:[.6,0,.8],index:1.2,fresnel:2,noiseSample:[.75,.25],noisePower:.2,viewColumns:[[1,0],[0,1],[0,0]]};
 const d=refractiveDisplacement(u);
 near(d.viewDisplacement,[.82,-.1]);near([d.facingFactor],[.64]);assert.equal(d.totalInternalReflection,false);
 const out=refractiveScreenCoordinates({...d,screenUv:[.3,.5],chromatism:0});
 near(out.blue,[.5952,.464]);near(out.red,out.blue);near(out.green,out.blue);
 const z=refractiveDisplacement({...u,view:[.8,0,.6],index:2});
 assert.equal(z.totalInternalReflection,true);near(z.viewDisplacement,[.1,-.1]);near([z.facingFactor],[.36]);
 const rotated=refractiveDisplacement({...u,viewColumns:[[0,1],[1,0],[.5,.25]]});
 const depth=-Math.sqrt(1-1.44*(1-.64));
 near(rotated.viewDisplacement,[-.1+.5*depth,.82+.25*depth]);
 assert.throws(()=>refractiveDisplacement({...u,view:[0,0,-1]}),/REFRACTIVE_FACING_UNVERIFIED/);
 assert.match(NATIVE_REFRACTIVE_DISPLACEMENT_GLSL,/k >= 0\.0/);
});
