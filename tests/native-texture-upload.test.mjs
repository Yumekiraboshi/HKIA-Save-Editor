import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/native-texture-upload.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {validateNativeTextureLayout,verifyNativeTexturePayload,uploadNativeTexture}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url)));
const sha=b=>createHash('sha256').update(b).digest('hex');
const rgba=Uint8Array.from({length:20},(_,i)=>i);
function source(){return {width:2,height:2,format:4,colorSpace:1,sampler:[1,2,0,0,0,0],bytes:20,sha256:sha(rgba),mips:[[2,2,0,16,sha(rgba.slice(0,16))],[1,1,16,4,sha(rgba.slice(16))]]};}
test('all extracted native base and rug pattern layouts are accepted',()=>{
 const textures=Object.values(read('furniture-base-material-source-v3.0.1.json').textures);
 // The pattern sample is committed by the independent material-source PR.
 const patterns=read('furniture-pattern-texture-sample-v3.0.1.json').rows;
 const rows=[...textures,...patterns];assert.equal(rows.length,19);assert.equal(rows.reduce((n,s)=>n+s.mips.length,0),182);
 for(const s of rows)validateNativeTextureLayout(s);
});
test('native byte, mip, format and sampler integrity rejects invalid input',async()=>{
 const s=source();await verifyNativeTexturePayload(s,rgba.buffer);
 for(const bad of [{...s,width:0},{...s,format:99},{...s,colorSpace:2},{...s,sampler:[1,2,0,0,0,9]},{...s,mips:[s.mips[0], [1,1,15,4,s.mips[1][4]]]},{...s,bytes:19}])assert.throws(()=>validateNativeTextureLayout(bad),/NATIVE_TEXTURE_/);
 const corrupt=rgba.slice();corrupt[0]^=1;await assert.rejects(verifyNativeTexturePayload(s,corrupt.buffer),/NATIVE_TEXTURE_HASH/);
 await assert.rejects(verifyNativeTexturePayload({...s,mips:[[...s.mips[0].slice(0,4),'0'.repeat(64)],s.mips[1]]},rgba.buffer),/NATIVE_TEXTURE_MIP_HASH/);
});
test('GPU preflight refuses BC1 without explicit alpha semantics and unsupported sampler modes before allocation',async()=>{
 const data=Uint8Array.of(0,0,0,0,0,0,0,0),s={width:4,height:4,format:10,colorSpace:1,sampler:[1,1,0,0,0,0],bytes:8,sha256:sha(data),mips:[[4,4,0,8,sha(data)]]};
 await assert.rejects(uploadNativeTexture({},s,data.buffer),/NATIVE_TEXTURE_BC1_MODE/);
 await assert.rejects(uploadNativeTexture({}, {...s,sampler:[1,1,0,3,0,0]},data.buffer,'rgb'),/NATIVE_TEXTURE_SAMPLER_UNSUPPORTED/);
 await assert.rejects(uploadNativeTexture({}, {...s,sampler:[1,1,.5,0,0,0]},data.buffer,'rgb'),/NATIVE_TEXTURE_SAMPLER_UNSUPPORTED/);
});
