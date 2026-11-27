import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/native-furniture-mesh.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {validateNativeGeometryLayout,verifyNativeGeometry,uploadNativeGeometry,nativeMeshDrawRange,nativeMissingUv1AliasesUv0}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
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

test('opt-in original submesh ranges validate every vertex window and refuse implicit draw',async()=>{
 const bytes=new ArrayBuffer(84),v=new DataView(bytes);
 for(let i=0;i<6;i++)v.setUint16(72+2*i,i,true);
 const m={vertexCount:6,indexCount:6,stride:12,channels:[[0,0,0,3],...Array.from({length:13},()=>[0,0,0,0])],vertexBytes:[0,72,sha(bytes.slice(0,72))],indexBytes:[72,12,sha(bytes.slice(72))],bounds:[[0,0,0,1,1,1]],submeshes:[{firstByte:0,indexCount:3,firstVertex:0,vertexCount:3,bounds:[0,0,0,1,1,1]},{firstByte:6,indexCount:3,firstVertex:3,vertexCount:3,bounds:[0,0,0,1,1,1]}]};
 const s={geometryBytes:84,geometrySha256:sha(bytes),meshes:{'1':m}};
 assert.throws(()=>validateNativeGeometryLayout(s),/SUBMESH_UNSUPPORTED/);
 await verifyNativeGeometry(s,bytes,true);
 for(const changed of [{firstByte:4},{indexCount:6},{firstVertex:5},{bounds:[0,0,0,-1,1,1]}]){
  const x=structuredClone(s);Object.assign(x.meshes['1'].submeshes[1],changed);assert.throws(()=>validateNativeGeometryLayout(x,true),/SUBMESH_/);
 }
 const corrupt=bytes.slice(0);new DataView(corrupt).setUint16(78,2,true);
 const x=structuredClone(s);x.geometrySha256=sha(corrupt);x.meshes['1'].indexBytes[2]=sha(corrupt.slice(72));
 await assert.rejects(verifyNativeGeometry(x,corrupt,true),/SUBMESH_INDEX/);
 const mesh={vao:{},indexCount:6,submeshes:m.submeshes};
 assert.throws(()=>nativeMeshDrawRange(mesh),/DRAW_SUBMESH/);
 assert.throws(()=>nativeMeshDrawRange(mesh,2),/DRAW_SUBMESH/);
 assert.equal(nativeMeshDrawRange(mesh,1).firstByte,6);
 assert.equal(nativeMeshDrawRange(mesh,1).indexCount,3);
});

test('verified missing UV1 binds the exact same original half2 buffer range as UV0, only on opt-in',async()=>{
 const bytes=new ArrayBuffer(102),view=new DataView(bytes);
 view.setUint16(98,1,true);view.setUint16(100,2,true);
 const mesh={vertexCount:3,indexCount:3,stride:32,channels:Array.from({length:14},()=>[0,0,0,0]),vertexBytes:[0,96,sha(bytes.slice(0,96))],indexBytes:[96,6,sha(bytes.slice(96))],bounds:[[0,0,0,1,1,1]]};
 mesh.channels[0]=[0,0,0,3];mesh.channels[1]=[0,12,1,52];mesh.channels[2]=[0,20,1,4];mesh.channels[4]=[0,28,1,2];
 const source={geometryBytes:102,geometrySha256:sha(bytes),meshes:{'1':mesh}};
 assert.equal(nativeMissingUv1AliasesUv0(mesh),true);
 const loc={'1':{0:0,1:1,2:2,4:4,5:5}},calls=[];
 const gl={MAX_VERTEX_ATTRIBS:1,VERTEX_ARRAY_BINDING:2,ARRAY_BUFFER_BINDING:3,ARRAY_BUFFER:4,ELEMENT_ARRAY_BUFFER:5,STATIC_DRAW:6,FLOAT:7,HALF_FLOAT:8,UNSIGNED_BYTE:9,NO_ERROR:0,
 getParameter:k=>k===1?16:null,getError:()=>0,createVertexArray:()=>({}),createBuffer:()=>({}),bindVertexArray(){},bindBuffer(){},bufferData(){},enableVertexAttribArray(){},vertexAttribPointer(...a){calls.push(a)},deleteVertexArray(){},deleteBuffer(){}};
 await assert.rejects(uploadNativeGeometry(gl,source,bytes,loc,true),/ATTRIBUTES/);
 const h=await uploadNativeGeometry(gl,source,bytes,loc,true,true);
 assert.deepEqual(calls.filter(x=>x[0]===4||x[0]===5),[[4,2,8,false,32,28],[5,2,8,false,32,28]]);
 assert.deepEqual(mesh.channels[5],[0,0,0,0]);h.dispose();
 await assert.rejects(uploadNativeGeometry(gl,source,bytes,{'1':{0:0,5:5}},true,true),/ATTRIBUTES/);
 const wrong=structuredClone(mesh);wrong.channels[5]=[0,0,0,16];assert.equal(nativeMissingUv1AliasesUv0(wrong),false);
 wrong.channels[5]=[0,0,0,0];wrong.stride=36;assert.equal(nativeMissingUv1AliasesUv0(wrong),false);
});

test('UInt32 original index bytes retain high vertex indices, submesh byte offsets and exact upload',async()=>{
 const nv=65538,off=nv*12,bytes=new ArrayBuffer(off+24),v=new DataView(bytes);
 [0,1,2,65535,65536,65537].forEach((n,i)=>v.setUint32(off+4*i,n,true));
 const bounds=[0,0,0,1,1,1],m={indexFormat:1,vertexCount:nv,indexCount:6,stride:12,channels:[[0,0,0,3],...Array.from({length:13},()=>[0,0,0,0])],vertexBytes:[0,off,sha(bytes.slice(0,off))],indexBytes:[off,24,sha(bytes.slice(off))],bounds:[bounds],submeshes:[{firstByte:0,indexCount:3,firstVertex:0,vertexCount:3,bounds},{firstByte:12,indexCount:3,firstVertex:65535,vertexCount:3,bounds}]};
 const s={geometryBytes:bytes.byteLength,geometrySha256:sha(bytes),meshes:{'1':m}};
 await verifyNativeGeometry(s,bytes,true);
 const calls=[],gl={MAX_VERTEX_ATTRIBS:1,VERTEX_ARRAY_BINDING:2,ARRAY_BUFFER_BINDING:3,ARRAY_BUFFER:4,ELEMENT_ARRAY_BUFFER:5,STATIC_DRAW:6,FLOAT:7,HALF_FLOAT:8,UNSIGNED_BYTE:9,NO_ERROR:0,getParameter:k=>k===1?16:null,getError:()=>0,createVertexArray:()=>({}),createBuffer:()=>({}),bindVertexArray(){},bindBuffer(){},bufferData(target,b){if(target===5)calls.push([...b])},enableVertexAttribArray(){},vertexAttribPointer(){},deleteVertexArray(){},deleteBuffer(){}};
 const uploaded=await uploadNativeGeometry(gl,s,bytes,{'1':{0:0}},true);
 const mesh=uploaded.meshes.get('1');assert.equal(mesh.indexFormat,1);assert.deepEqual(nativeMeshDrawRange(mesh,1),{firstByte:12,indexCount:3});assert.deepEqual(calls,[[...new Uint8Array(bytes,off,24)]]);uploaded.dispose();
 for(const [value,error] of [[65538,/NATIVE_MESH_INDEX/],[4294967295,/NATIVE_MESH_INDEX/],[0,/NATIVE_MESH_SUBMESH_INDEX/]]){
  const bad=bytes.slice(0);new DataView(bad).setUint32(off+12,value,true);const x=structuredClone(s);x.geometrySha256=sha(bad);x.meshes['1'].indexBytes[2]=sha(bad.slice(off));await assert.rejects(verifyNativeGeometry(x,bad,true),error);
 }
 for(const format of [0,2,null]){const x=structuredClone(s);x.meshes['1'].indexFormat=format;assert.throws(()=>validateNativeGeometryLayout(x,true),/NATIVE_MESH_/);}
 const x=structuredClone(s);x.meshes['1'].submeshes[1].firstByte=6;assert.throws(()=>validateNativeGeometryLayout(x,true),/SUBMESH_RANGE/);
});
