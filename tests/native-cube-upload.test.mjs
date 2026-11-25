import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/native-cube-upload.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {nativeCubeMipRanges,verifyNativeCubePayload,validateNativeCubeOrientation,uploadNativeCube}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const cubes=Object.values(JSON.parse(readFileSync(new URL('../data/furniture-light-region-source-v3.0.1.json',import.meta.url))).cubemaps);
const sha=b=>createHash('sha256').update(b).digest('hex');
test('both original cube manifests cover precisely all 48 face-mip ranges',()=>{
 assert.equal(cubes.length,2);
 for(const s of cubes){
  const ranges=nativeCubeMipRanges(s).flat();
  assert.equal(ranges.length,48);assert.equal(s.bytes,65616);
  let end=0;for(const m of ranges){assert.equal(m.offset,end);end+=m.bytes;}
  assert.equal(end,s.bytes);
  assert.throws(()=>validateNativeCubeOrientation(s,undefined),/NATIVE_CUBE_ORIENTATION/);
  assert.throws(()=>nativeCubeMipRanges({...s,faceBytes:s.faceBytes-1}),/NATIVE_CUBE_LENGTH/);
  assert.throws(()=>nativeCubeMipRanges({...s,faceMipRanges:s.faceMipRanges.map((m,i)=>i===7?[1,m[1]-1,8]:m)}),/NATIVE_CUBE_MIP_RANGE/);
 }
});
function fixture(){
 const bytes=new Uint8Array(144);for(let i=0;i<18;i++)bytes.fill(i+1,i*8,(i+1)*8);
 const s={width:4,height:4,format:10,colorSpace:1,sampler:[1,2,0,1,1,1],mipCount:3,imageCount:6,faceBytes:24,faceMipRanges:[[4,0,8],[2,8,8],[1,16,8]],bytes:144,sha256:sha(bytes),faceOrder:'unverified'};
 const o={sourceSha256:s.sha256,sourceFaceForTarget:[5,4,3,2,1,0],texelOrientation:'native-webgl',evidence:'synthetic test only'};
 return {bytes,s,o};
}
test('payload digest and explicit orientation cannot be silently replaced',async()=>{
 const {s,bytes,o}=fixture();await verifyNativeCubePayload(s,bytes.buffer);
 const corrupt=bytes.slice();corrupt[100]^=1;await assert.rejects(verifyNativeCubePayload(s,corrupt.buffer),/NATIVE_CUBE_HASH/);
 for(const bad of [undefined,{...o,sourceSha256:'0'.repeat(64)},{...o,sourceFaceForTarget:[0,0,1,2,3,4]},{...o,sourceFaceForTarget:[0,1,2,3,4,6]},{...o,evidence:''},{...o,texelOrientation:'unknown'}])assert.throws(()=>validateNativeCubeOrientation(s,bad),/NATIVE_CUBE_ORIENTATION/);
});
function mock(fail=false){
 const calls=[],deleted=[],bindings=[],parameters=[];const prior={prior:true},texture={texture:true};let errorCalls=0;
 const gl={NO_ERROR:0,MAX_CUBE_MAP_TEXTURE_SIZE:1,PIXEL_UNPACK_BUFFER_BINDING:2,TEXTURE_BINDING_CUBE_MAP:3,TEXTURE_CUBE_MAP:4,TEXTURE_CUBE_MAP_POSITIVE_X:10,TEXTURE_WRAP_S:20,TEXTURE_WRAP_T:21,TEXTURE_WRAP_R:22,CLAMP_TO_EDGE:23,TEXTURE_MAG_FILTER:24,TEXTURE_MIN_FILTER:25,TEXTURE_BASE_LEVEL:26,TEXTURE_MAX_LEVEL:27,NEAREST:28,LINEAR:29,NEAREST_MIPMAP_NEAREST:30,LINEAR_MIPMAP_NEAREST:31,LINEAR_MIPMAP_LINEAR:32,
 getError(){return ++errorCalls===2&&fail?1:0;},getParameter(k){return k===1?128:k===2?null:k===3?prior:16;},getExtension(n){return n==='WEBGL_compressed_texture_s3tc_srgb'?{}:n==='EXT_texture_filter_anisotropic'?{MAX_TEXTURE_MAX_ANISOTROPY_EXT:40,TEXTURE_MAX_ANISOTROPY_EXT:41}:null;},
 createTexture(){return texture;},bindTexture(t,v){bindings.push([t,v]);},deleteTexture(v){deleted.push(v);},compressedTexImage2D(...a){calls.push(a);},texParameteri(...a){parameters.push(a);},texParameterf(...a){parameters.push(a);}};
 return {gl,calls,bindings,deleted,parameters,texture,prior};
}
test('cube uploader transports every mip to the explicitly selected face, restores binding and releases on failure',async()=>{
 const {s,bytes,o}=fixture(),m=mock();
 assert.equal(await uploadNativeCube(m.gl,s,bytes.buffer,o,'rgb'),m.texture);
 assert.equal(m.calls.length,18);
 for(let i=0;i<18;i++){
  const [dest,level,format,w,h,border,data]=m.calls[i];const face=Math.floor(i/3);
  assert.deepEqual([dest,level,format,w,h,border],[10+face,i%3,0x8c4c,4>>(i%3),4>>(i%3),0]);
  assert.deepEqual([...data],Array(8).fill((5-face)*3+(i%3)+1));
 }
 assert.deepEqual(m.bindings,[[4,m.texture],[4,m.prior]]);
 assert.equal(m.deleted.length,0);
 assert.ok(m.parameters.some(p=>p[1]===27&&p[2]===2));
 const failed=mock(true);await assert.rejects(uploadNativeCube(failed.gl,s,bytes.buffer,o,'rgb'),/NATIVE_CUBE_GPU_UPLOAD/);assert.deepEqual(failed.deleted,[failed.texture]);assert.deepEqual(failed.bindings.at(-1),[4,failed.prior]);
});
