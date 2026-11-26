import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/flower-surface-gpu.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {FLOWER_SURFACE_VERTEX,FLOWER_SURFACE_FRAGMENT,validateFlowerSurfaceDraw,drawFlowerSurfaceDiagnostic}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const digest=s=>createHash('sha256').update(s).digest('hex');
const valid={clipFromObject:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],baseST:[1,1,0,0],patternST:[1,1,0,0],surface:{baseColor:[1,1,1,1],patternColor1:[1,0,0],patternColor2:[0,0,1],smoothnessShift:0,metallicShift:0,patternSmoothnessShift:0,patternMetallicShift:0,occlusionStrength:1,surfaceEffect:0},mipBias:0,output:'albedo'};
test('shader source matches actual 75-draw EGL diagnostic',()=>{
 assert.equal(digest(FLOWER_SURFACE_VERTEX),'4dbe26be0c7c9601ef62553b79498afe719ef553cc6a00cbb47f20b537067199');
 assert.equal(digest(FLOWER_SURFACE_FRAGMENT),'76b68c071bae75a97457a214b3d35c1ded6849d42196874b1b43389e8ddbc9a6');
});
test('refuse invalid draws and unresolved effect semantics',()=>{
 validateFlowerSurfaceDraw(valid);
 for(const d of [{...valid,output:'thumbnail'},{...valid,clipFromObject:[1]},{...valid,mipBias:NaN},{...valid,surface:{...valid.surface,surfaceEffect:1}},{...valid,patternST:[1,1,Infinity,0]}])assert.throws(()=>validateFlowerSurfaceDraw(d),/INPUT/);
});
test('missing native UV1 rejects before any GPU upload or payload read',async()=>{
 const channels=Array.from({length:14},()=>[0,0,0,0]);channels[0]=[0,0,0,3];channels[4]=[0,12,0,2];
 let read=false;
 await assert.rejects(drawFlowerSurfaceDiagnostic({}, {geometry:{meshes:{'1':{channels}}},meshId:'1',textures:{}}, [valid], async()=>{read=true;throw Error('unexpected read');},{},()=>{},()=>{}),/MESH_UV/);
 assert.equal(read,false);
});
