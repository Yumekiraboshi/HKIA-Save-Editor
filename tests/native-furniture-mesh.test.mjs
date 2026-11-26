import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/native-furniture-mesh.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {validateNativeGeometryLayout,verifyNativeGeometry,uploadNativeGeometry}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const sha=b=>createHash('sha256').update(new Uint8Array(b)).digest('hex');
function fixture(){
 const bytes=new ArrayBuffer(42),v=new DataView(bytes);v.setFloat32(12,1,true);v.setFloat32(28,1,true);v.setUint16(38,1,true);v.setUint16(40,2,true);
 const s={geometryBytes:42,geometrySha256:sha(bytes),meshes:{'1':{vertexCount:3,indexCount:3,stride:12,channels:[[0,0,0,3],...Array.from({length:13},()=>[0,0,0,0])],vertexBytes:[0,36,sha(bytes.slice(0,36))],indexBytes:[36,6,sha(bytes.slice(36))],bounds:[[.5,.5,0,.5,.5,0]]}}};
 return {s,bytes};
}
test('all 11 original static mesh layouts preserve source streams, channels and signed PathIDs',()=>{
 const d=JSON.parse(readFileSync(new URL('../data/furniture-mesh-source-sample-v3.0.1.json',import.meta.url)));
 let total=0;for(const row of d.rows){validateNativeGeometryLayout(row);total+=Object.keys(row.meshes).length;}assert.equal(total,11);
});
test('native geometry refuses corrupted bytes, mismatched hashes, invalid indices, nonfinite coordinates and overlapping channels',async()=>{
 const {s,bytes}=fixture();await verifyNativeGeometry(s,bytes);
 let corrupt=bytes.slice(0);new DataView(corrupt).setUint16(40,3,true);
 await assert.rejects(verifyNativeGeometry(s,corrupt),/NATIVE_MESH_HASH/);
 let t=structuredClone(s);t.geometrySha256=sha(corrupt);await assert.rejects(verifyNativeGeometry(t,corrupt),/NATIVE_MESH_STREAM_HASH/);
 t.meshes['1'].indexBytes[2]=sha(corrupt.slice(36));await assert.rejects(verifyNativeGeometry(t,corrupt),/NATIVE_MESH_INDEX/);
 corrupt=bytes.slice(0);new DataView(corrupt).setFloat32(0,NaN,true);t=structuredClone(s);t.geometrySha256=sha(corrupt);t.meshes['1'].vertexBytes[2]=sha(corrupt.slice(0,36));await assert.rejects(verifyNativeGeometry(t,corrupt),/NATIVE_MESH_NONFINITE/);
 t=structuredClone(s);t.meshes['1'].channels[1]=[0,0,1,52];assert.throws(()=>validateNativeGeometryLayout(t),/NATIVE_MESH_CHANNEL_OVERLAP/);
 t=structuredClone(s);t.meshes['1'].indexBytes[0]=32;assert.throws(()=>validateNativeGeometryLayout(t),/NATIVE_MESH_RANGE_COVERAGE/);
 await assert.rejects(uploadNativeGeometry({getParameter:()=>16},s,bytes,{'1':{0:0,5:1}}),/NATIVE_MESH_ATTRIBUTES/);
});
test('upload binds exact source buffers and releases all resources on failure or disposal',async()=>{
 const {s,bytes}=fixture();
 function fake(failure=false){
  const oldVAO={},oldBuffer={},state={vao:oldVAO,buffer:oldBuffer,created:[],deleted:[],data:[],attrs:[]};let calls=0;
  const gl={MAX_VERTEX_ATTRIBS:1,VERTEX_ARRAY_BINDING:2,ARRAY_BUFFER_BINDING:3,ARRAY_BUFFER:4,ELEMENT_ARRAY_BUFFER:5,STATIC_DRAW:6,FLOAT:7,HALF_FLOAT:8,UNSIGNED_BYTE:9,NO_ERROR:0,
  getParameter(k){return k===1?16:k===2?state.vao:state.buffer},getError(){return failure&&calls++>0?1282:0},
  createVertexArray(){const x={kind:'vao'};state.created.push(x);return x},createBuffer(){const x={kind:'buffer'};state.created.push(x);return x},
  bindVertexArray(x){state.vao=x},bindBuffer(target,x){if(target===4)state.buffer=x},
  bufferData(target,b){state.data.push([target,[...b]])},enableVertexAttribArray(){},vertexAttribPointer(...args){state.attrs.push(args)},
  deleteVertexArray(x){state.deleted.push(x)},deleteBuffer(x){state.deleted.push(x)}};
  return {gl,state,oldVAO,oldBuffer};
 }
 let f=fake();let h=await uploadNativeGeometry(f.gl,s,bytes,{'1':{0:2}});
 assert.equal(h.meshes.get('1').indexCount,3);assert.deepEqual(f.state.data,[[4,[...new Uint8Array(bytes,0,36)]],[5,[...new Uint8Array(bytes,36,6)]]]);assert.deepEqual(f.state.attrs,[[2,3,7,false,12,0]]);assert.equal(f.state.vao,f.oldVAO);assert.equal(f.state.buffer,f.oldBuffer);h.dispose();h.dispose();assert.deepEqual(f.state.deleted,f.state.created);assert.equal(h.meshes.size,0);
 f=fake(true);await assert.rejects(uploadNativeGeometry(f.gl,s,bytes,{'1':{0:0}}),/NATIVE_MESH_GPU_UPLOAD/);assert.deepEqual(f.state.deleted,f.state.created);assert.equal(f.state.vao,f.oldVAO);assert.equal(f.state.buffer,f.oldBuffer);
});

test('multi-submesh source cannot be flattened by the single-material GPU path',()=>{
 const {s}=fixture();s.meshes['1'].submeshes=[{firstByte:0,indexCount:3,firstVertex:0,vertexCount:3,bounds:[0,0,0,1,1,1]}];
 assert.throws(()=>validateNativeGeometryLayout(s),/NATIVE_MESH_SUBMESH_UNSUPPORTED/);
});
