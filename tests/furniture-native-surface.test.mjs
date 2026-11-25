import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-surface-v3.0.1.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {furnitureSurface,furnitureTextureCoordinates,furnitureTangentNormal}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const read=p=>readFileSync(new URL('../data/'+p,import.meta.url));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('native shader pass table binds all 145 program blobs and the original uniform and sampler names',()=>{
 const raw=read('furniture-shader-bindings-v3.0.1.json'),d=JSON.parse(raw);
 assert.equal(sha(raw),'7f52b0ea9b319fe69ee13e68729462a9fd036a6e4fd7d6031266207d16b16b32');
 assert.deepEqual(d.passes.map(p=>[p.name,p.stages.vertex.variants.length,p.stages.pixel.variants.length]),[['ForwardLit',18,120],['ShadowCaster',1,1],['DepthOnly',1,1],['DepthNormals',2,2]]);
 const variants=d.passes.flatMap(p=>Object.values(p.stages).flatMap(s=>s.variants));
 assert.equal(new Set(variants.map(v=>v.blobIndex)).size,145);
 assert.equal(d.uniqueProgramBlobs,145);assert.equal(d.renderFidelity,'unverified');
 for(const v of variants){assert.match(v.sha256,/^[a-f0-9]{64}$/);assert.ok(v.segment>=1&&v.segment<=3);assert.ok(v.offset>=0&&v.bytes>=32);assert.ok(v.keywords.every(k=>d.keywordNames.includes(k)));}
 const f=d.passes[0].stages;
 assert.deepEqual(f.pixel.commonTextures,[['_BaseMap',0,0,2],['_MetallicGlossMap',1,1,2],['_BumpMap',2,2,2],['_PatternMap',3,3,2]]);
 const material=f.pixel.commonBuffers.find(b=>b.name==='UnityPerMaterial');
 assert.equal(material.size,224);
 assert.deepEqual(Object.fromEntries(material.members.map(x=>[x[0],x[1]])),{_BaseColor:16,_Smoothness_Shift:32,_Metallic_Shift:36,_OcclusionStrength:40,_EmissionColor:48,_ReflectionStrength:60,_Smoothness_Shift_Pattern:80,_Metallic_Shift_Pattern:84,_Pattern_WorldUV:176,_PatternTint:192,_BaseMap_Mask_Toggle:208});
 assert.equal(f.vertex.variants[0].sha256,'0f0cfe2d9f8aaa4f7902f6715426fa2d76a5cff1f8aca8a16693725b7f901d7a');
 assert.equal(f.pixel.variants[0].sha256,'cde2be6de0bbdfa6c9b3219fa302a61c5812a1efb6cbaf1e17868dd760b3e0e4');
});
test('224 independent native token block fixtures reproduce surface, UV and tangent normal math',()=>{
 const raw=read('furniture-surface-vectors-v3.0.1.json'),d=JSON.parse(raw);assert.equal(sha(raw),'705fda3cad772c69d251967c801b4a78bbce954e4081c0192a33b9b152d36963');
 assert.deepEqual([d.cases.length,d.uv.length,d.normal.length],[128,64,32]);
 const near=(a,b)=>{if(typeof b==='number'){assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-6,JSON.stringify({a,b}));}else for(const k of Object.keys(b))near(a[k],b[k]);};
 for(const x of d.cases)near(furnitureSurface(x.base,x.pattern,x.combo,x.u),x.expected);
 for(const x of d.uv)near(furnitureTextureCoordinates(...x.args),x.expected);
 for(const x of d.normal)near(furnitureTangentNormal(...x.args),x.expected);
 assert.throws(()=>furnitureTangentNormal([NaN,0,0,1],true),/FURNITURE_SURFACE_NONFINITE/);
});
