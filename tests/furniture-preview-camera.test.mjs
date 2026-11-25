import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-preview-scale.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {fitFurniturePreviewScale}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
test('original furniture preview UI connects a 512px render target to its authored camera and rig',()=>{
 const raw=readFileSync(new URL('../data/furniture-preview-camera-v3.0.1.json',import.meta.url)),d=JSON.parse(raw);
 assert.equal(createHash('sha256').update(raw).digest('hex'),'0d1b5689d597aa7274a91fa8bc1fc285a74d7ce9bf1b37c504dfc09f705de11f');
 assert.equal(d.textureSize,512);assert.equal(d.autoResolve,true);assert.equal(d.camera.fov,30);assert.equal(d.camera.orthographic,false);assert.equal(d.camera.cullingMask,512);assert.equal(d.camera.hdr,true);assert.equal(d.camera.msaa,true);
 assert.equal(d.urp.postProcessing,true);assert.equal(d.urp.renderShadows,true);
 assert.equal(d.transformChain[0].name,'Camera');assert.equal(d.transformChain[1].name,'CameraAndPodium');assert.equal(d.transformChain[2].name,'Item3d');assert.equal(d.transformChain.at(-1).gameObjectPathId,d.screenPathId);
 for(let i=0;i<d.transformChain.length-1;i++)assert.equal(d.transformChain[i].parent,d.transformChain[i+1].pathId);
 assert.equal(d.mount.parent,d.transformChain[1].pathId);assert.equal(d.mountGuid,'74cb0bc75b5307147bc46d39ff3e6d7a');
 assert.deepEqual(d.rig,{rotationSensitivity:9,instantiationDelay:.5,maxObjectSize:2,moveToSameLayer:true,considerLossyScale:true});
 assert.equal(d.renderFidelity,'unverified');
});
test('native preview scale reduces only when displayed bounds diagonal exceeds max',()=>{
 assert.deepEqual(fitFurniturePreviewScale([.1,.2,.3],[1,1,1],[2,3,4],2,true),[2,3,4]);
 assert.deepEqual(fitFurniturePreviewScale([3,0,0],[1,1,1],[3,6,9],2,true),[1,2,3]);
 assert.deepEqual(fitFurniturePreviewScale([3,0,0],[3,1,1],[3,6,9],2,true),[3,6,9]);
 assert.deepEqual(fitFurniturePreviewScale([3,0,0],[3,1,1],[3,6,9],2,false),[1,2,3]);
 assert.throws(()=>fitFurniturePreviewScale([1,1,1],[0,1,1],[1,1,1],2,true),/FURNITURE_PREVIEW_SCALE/);
});
