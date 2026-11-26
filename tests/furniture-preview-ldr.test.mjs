import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-preview-ldr-v3.0.1.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {nativeLdrLutCoordinates,nativeLdrLutSample,nativeLdrPost,nativeRequiresFinalPost,nativeSrgbToLinear,nativeLinearToSrgb}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const near=(a,b)=>{assert.equal(a.length,b.length);a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<1e-12,JSON.stringify({a,b})));};
test('native source 6 internal LUT coordinate and sample fixture',()=>{
 const input=[0.6781097914676465,0.7479221543236312,0.4743176080039956],p=[1/4096,1/64,63];
 const q=nativeLdrLutCoordinates(input,p);near(q.lower,[0.46367698165587445,0.7440483706623244]);near(q.upper,[0.47930198165587445,0.7440483706623244]);
 const a=[0.03132690843734742,0.7857695165365773,0.786100480789501],b=[0.9385675732200731,0.826147518395809,0.15478524770642577];let n=0;
 near(nativeLdrLutSample(input,p,()=>n++===0?a:b),[0.8315216159712279,0.8213832898635129,0.2292745712943849]);assert.equal(n,2);
 for(const z of [0,1])assert.equal(nativeLdrLutCoordinates([.5,.5,z],p).weight,0);
 assert.throws(()=>nativeLdrLutCoordinates([0,0,NaN],p),/INPUT/);
});
test('native program 8 complete arithmetic fixture: vignette, exposure, both LUTs, output conversion and alpha',()=>{
 const input={"color":[1.2902941751409949,0.28173257998288403,1.477512390097646,0.44618877552307534],"uv":[0.4019412123727868,0.7822532227325748],"vignetteColor":[0.731498252903128,0.48485722444621937,0.2923362664931497],"vignetteAspect":1.0813289290816703,"vignetteCenter":[0.3883437698237696,0.1855210452086654],"vignetteIntensity":0.3412523423975943,"vignetteSmoothness":1.7232767002958282,"exposureMultiplier":1.9453676857424933,"internalLut":[0.0009765625,0.03125,31],"output":"srgb"};
 const userSamples=[[0.4040261003189476,0.030204749182478174,0.9201088755461252],[0.294653273165962,0.718900322182618,0.8824292523863997]],internalSamples=[[0.07079477275564161,0.21609345937593982,0.9947028281582379],[0.10244230598366189,0.650429031182478,0.5013485987317433]];
 let a=0,b=0;const userLut={parameters:[1/256,1/16,15],weight:0.5832234930527436,sample:()=>userSamples[a++]};
 near(nativeLdrPost({...input,userLut},()=>internalSamples[b++]),[0.3188053135793838,0.6516524959518373,0.9093431249913645,0.44618877552307534]);assert.equal(a,2);assert.equal(b,2);
 const constant=()=>[.25,.36,.49];near(nativeLdrPost({...input,output:'linear'},constant),[.25,.36,.49,input.color[3]]);
 near(nativeLdrPost({...input,output:'gamma20'},constant),[.5,.6,.7,input.color[3]]);
 near(nativeLdrPost({...input,userLut:{...userLut,weight:0,sample:()=>{throw Error('unneeded LUT');}},output:'linear'},constant),[.25,.36,.49,input.color[3]]);
 near([nativeSrgbToLinear(0),nativeLinearToSrgb(0)],[0,0]);
});
test('native final-post selection: only a final camera with available enabled postprocessing and FXAA or non-linear upscaling',()=>{
 for(const resolveFinalTarget of [false,true])for(const anyPostProcessingEnabled of [false,true])for(const postDataAvailable of [false,true])
 for(const antialiasing of [0,1,2])for(const imageScalingMode of [0,1,2])for(const upscalingFilter of [0,1,2]){
  const expected=resolveFinalTarget&&anyPostProcessingEnabled&&postDataAvailable&&([1].includes(antialiasing)||imageScalingMode===1&&[1,2].includes(upscalingFilter));
  assert.equal(nativeRequiresFinalPost({resolveFinalTarget,anyPostProcessingEnabled,postDataAvailable,antialiasing,imageScalingMode,upscalingFilter}),expected);
 }
 assert.throws(()=>nativeRequiresFinalPost({resolveFinalTarget:true,anyPostProcessingEnabled:true,postDataAvailable:true,antialiasing:3,imageScalingMode:0,upscalingFilter:0}),/INPUT/);
});
