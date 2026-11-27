/** Original interleaved static mesh transport for display-only WebGL2 previews.
 * No save rules, synthetic vertex data, or inferred geometry. */
export type MeshRange=readonly [offset:number,bytes:number,sha256:string];
export type NativeSubmesh={firstByte:number;indexCount:number;firstVertex:number;vertexCount:number;bounds:readonly number[]};
export type NativeMeshSource={indexFormat?:0|1;submeshes?:readonly NativeSubmesh[];vertexCount:number;indexCount:number;stride:number;channels:readonly (readonly number[])[];vertexBytes:MeshRange;indexBytes:MeshRange;bounds:readonly (readonly number[])[]};
export type NativeGeometrySource={geometryBytes:number;geometrySha256:string;meshes:Readonly<Record<string,NativeMeshSource>>};
const int=(v:number,a:number,b:number)=>Number.isInteger(v)&&v>=a&&v<=b;
const hex=/^[a-f0-9]{64}$/;
const fail=(message:string):never=>{throw Error('NATIVE_MESH_'+message);};
const hash=async(b:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('');
/** Original Unity IndexFormat: absent/0 = UInt16, 1 = UInt32. */
function nativeIndexWidth(m:{indexFormat?:0|1}){if(m.indexFormat===undefined||m.indexFormat===0)return 2;if(m.indexFormat===1)return 4;return fail('INDEX_FORMAT');}
/** Source index ranges are ordered, nonoverlapping and cover the full original buffer. */
export function validateNativeSubmeshes(m:NativeMeshSource){
 const width=nativeIndexWidth(m);
 if(m.submeshes===undefined)return;
 if(!Array.isArray(m.submeshes)||!int(m.submeshes.length,2,64))fail('SUBMESH_COUNT');
 let end=0;
 for(const s of m.submeshes){
  if(!s||!int(s.firstByte,0,m.indexCount*width)||s.firstByte!==end||!int(s.indexCount,3,m.indexCount)||s.indexCount%3||
   !int(s.firstVertex,0,m.vertexCount-1)||!int(s.vertexCount,1,m.vertexCount-s.firstVertex)||
   !Array.isArray(s.bounds)||s.bounds.length!==6||!s.bounds.every(Number.isFinite)||s.bounds.slice(3).some((x:number)=>x<0))fail('SUBMESH_RANGE');
  end+=s.indexCount*width;if(end>m.indexCount*width)fail('SUBMESH_RANGE');
 }
 if(end!==m.indexCount*width)fail('SUBMESH_COVERAGE');
}
export function validateNativeGeometryLayout(source:NativeGeometrySource,allowSubmeshes=false){
 if(!int(source.geometryBytes,1,64*1024*1024)||!hex.test(source.geometrySha256))fail('HEADER');
 const meshes=Object.entries(source.meshes);if(!int(meshes.length,1,512))fail('COUNT');
 const ranges:MeshRange[]=[];
 for(const [pid,m] of meshes){
  // The offline extractor preserves ordered submeshes. Until the shader/material
  // renderer supports them, reject rather than flattening all triangles.
  if(Object.prototype.hasOwnProperty.call(m,'submeshes')&&!allowSubmeshes)fail('SUBMESH_UNSUPPORTED');
  const width=nativeIndexWidth(m);
  if(!/^-?[0-9]+$/.test(pid)||!int(m.vertexCount,1,width===2?65536:Math.floor(64*1024*1024/12))||!int(m.indexCount,3,6*1024*1024)||m.indexCount%3||!int(m.stride,12,64)||m.stride%4||m.channels.length!==14)fail('LAYOUT');
  if(m.bounds.length!==1||m.bounds[0].length!==6||!m.bounds[0].every(Number.isFinite)||m.bounds[0].slice(3).some(x=>x<0))fail('BOUNDS');
  validateNativeSubmeshes(m);
  const active:Array<[number,number]>=[];
  for(const [i,c] of m.channels.entries()){
   if(c.length!==4||!c.every(x=>int(x,0,255)))fail('CHANNEL');
   const [stream,offset,format,rawDim]=c,dim=rawDim&15;
   if(!dim)continue;
   if(stream!==0||!int(format,0,2)||dim>4||!(rawDim===dim||(i===1&&rawDim===52)))fail('CHANNEL');
   const size=[4,2,1][format];if(offset%size||offset+dim*size>m.stride)fail('CHANNEL_RANGE');
   active.push([offset,offset+dim*size]);
  }
  if(m.channels[0].join(',')!=='0,0,0,3'||!active.length||Math.max(...active.map(x=>x[1]))!==m.stride)fail('POSITION');
  active.sort((a,b)=>a[0]-b[0]);for(let i=1;i<active.length;i++)if(active[i-1][1]>active[i][0])fail('CHANNEL_OVERLAP');
  for(const [r,expected] of [[m.vertexBytes,m.vertexCount*m.stride],[m.indexBytes,m.indexCount*width]] as const){
   if(r.length!==3||!int(r[0],0,source.geometryBytes)||r[0]%4||r[1]!==expected||r[0]+r[1]>source.geometryBytes||!hex.test(r[2]))fail('RANGE');ranges.push(r);
  }
 }
 ranges.sort((a,b)=>a[0]-b[0]);let end=0;for(const r of ranges){if(r[0]!==Math.ceil(end/4)*4)fail('RANGE_COVERAGE');end=r[0]+r[1];}if(end!==source.geometryBytes)fail('RANGE_COVERAGE');
}
/** Validates all original bytes, per-stream hashes, index bounds and every
 * float/half-float attribute before permitting GPU upload. */
export async function verifyNativeGeometry(source:NativeGeometrySource,bytes:ArrayBuffer,allowSubmeshes=false){
 validateNativeGeometryLayout(source,allowSubmeshes);
 if(bytes.byteLength!==source.geometryBytes||await hash(bytes)!==source.geometrySha256)fail('HASH');
 const view=new DataView(bytes);
 for(const m of Object.values(source.meshes)){
  for(const [off,len,digest] of [m.vertexBytes,m.indexBytes])if(await hash(bytes.slice(off,off+len))!==digest)fail('STREAM_HASH');
  const width=nativeIndexWidth(m),indexAt=(p:number)=>width===2?view.getUint16(p,true):view.getUint32(p,true);
  for(let i=0;i<m.indexCount;i++){const index=indexAt(m.indexBytes[0]+width*i);if(index>=m.vertexCount||index===(width===2?65535:4294967295))fail('INDEX');}
  for(const s of m.submeshes??[])for(let i=0;i<s.indexCount;i++){
   const index=indexAt(m.indexBytes[0]+s.firstByte+width*i);
   if(index<s.firstVertex||index>=s.firstVertex+s.vertexCount)fail('SUBMESH_INDEX');
  }
  for(let i=0;i<m.vertexCount;i++)for(const [,off,fmt,rawDim] of m.channels){
   const dim=rawDim&15;for(let c=0;c<dim;c++){
    const p=m.vertexBytes[0]+i*m.stride+off+c*[4,2,1][fmt];
    if(fmt===0&&!Number.isFinite(view.getFloat32(p,true))||fmt===1&&(view.getUint16(p,true)&0x7c00)===0x7c00)fail('NONFINITE');
   }
  }
 }
}
export type MeshAttributeLocations=Readonly<Record<number,number>>;
export type UploadedNativeMesh={indexFormat?:0|1;vao:WebGLVertexArrayObject;indexCount:number;submeshes?:readonly Readonly<{firstByte:number;indexCount:number}>[]};
/** A multi-material mesh is never implicitly drawn as one material. */
export function nativeMeshDrawRange(mesh:UploadedNativeMesh,submeshIndex?:number){
 const width=nativeIndexWidth(mesh);
 if(!int(mesh.indexCount,3,6*1024*1024)||mesh.indexCount%3)fail('DRAW_RANGE');
 if(mesh.submeshes===undefined){if(submeshIndex!==undefined)fail('DRAW_RANGE');return {firstByte:0,indexCount:mesh.indexCount};}
 if(submeshIndex===undefined||!int(submeshIndex,0,mesh.submeshes.length-1)||!int(mesh.submeshes.length,2,64))throw Error('NATIVE_MESH_DRAW_SUBMESH');
 let end=0;
 for(const s of mesh.submeshes){
  if(!s||s.firstByte!==end||!int(s.indexCount,3,mesh.indexCount)||s.indexCount%3)fail('DRAW_RANGE');
  end+=s.indexCount*width;
 }
 if(end!==mesh.indexCount*width)fail('DRAW_RANGE');
 return mesh.submeshes[submeshIndex];
}
/** Steam 3.0.1 UnityPlayer RVA 0x4a6f10: the layout builder retains the
 * last nonzero UV descriptor and copies it for a requested missing UV.
 * Scope this alias to the verified original single-stream half2 layout. */
export function nativeMissingUv1AliasesUv0(m:NativeMeshSource){
 return m.stride===32&&m.channels[4]?.join(',')==='0,28,1,2'&&m.channels[5]?.join(',')==='0,0,0,0';
}
/** Caller maps verified shader semantic channels to attribute locations.
 * Only the explicit native UV1 alias opt-in can bind a missing attribute. */
export async function uploadNativeGeometry(gl:WebGL2RenderingContext,source:NativeGeometrySource,bytes:ArrayBuffer,locations:Readonly<Record<string,MeshAttributeLocations>>,allowSubmeshes=false,allowNativeUv1Alias=false):Promise<{meshes:ReadonlyMap<string,UploadedNativeMesh>;dispose:()=>void}>{
 await verifyNativeGeometry(source,bytes,allowSubmeshes);
 const max=gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;
 if(Object.keys(locations).length!==Object.keys(source.meshes).length)fail('ATTRIBUTES');
 for(const [pid,m] of Object.entries(source.meshes)){
  const loc=locations[pid];if(!loc||loc[0]===undefined)fail('ATTRIBUTES');
  const used=new Set<number>();for(const [channel,location] of Object.entries(loc)){const i=Number(channel);if(!int(i,0,13)||(!(m.channels[i][3]&15)&&!(allowNativeUv1Alias&&i===5&&loc[4]!==undefined&&nativeMissingUv1AliasesUv0(m)))||!int(location,0,max-1)||used.has(location))fail('ATTRIBUTES');used.add(location);}
 }
 if(gl.getError()!==gl.NO_ERROR)fail('GPU_DIRTY');
 const oldVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject|null,oldBuffer=gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer|null;
 const vaos:WebGLVertexArrayObject[]=[],buffers:WebGLBuffer[]=[];const uploaded=new Map<string,UploadedNativeMesh>();let disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;for(const v of vaos)gl.deleteVertexArray(v);for(const b of buffers)gl.deleteBuffer(b);uploaded.clear();};
 try{
  for(const [pid,m] of Object.entries(source.meshes)){
   const vao=gl.createVertexArray();if(!vao)throw Error('NATIVE_MESH_GPU_CREATE');vaos.push(vao);gl.bindVertexArray(vao);
   for(const [target,r] of [[gl.ARRAY_BUFFER,m.vertexBytes],[gl.ELEMENT_ARRAY_BUFFER,m.indexBytes]] as const){
    const b=gl.createBuffer();if(!b)throw Error('NATIVE_MESH_GPU_CREATE');buffers.push(b);gl.bindBuffer(target,b);gl.bufferData(target,new Uint8Array(bytes,r[0],r[1]),gl.STATIC_DRAW);
   }
   for(const [channel,location] of Object.entries(locations[pid])){const i=Number(channel);const [,off,fmt,rawDim]=m.channels[i===5&&allowNativeUv1Alias&&nativeMissingUv1AliasesUv0(m)?4:i];gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,rawDim&15,[gl.FLOAT,gl.HALF_FLOAT,gl.UNSIGNED_BYTE][fmt],fmt===2,m.stride,off);}
   if(gl.getError()!==gl.NO_ERROR)fail('GPU_UPLOAD');uploaded.set(pid,{vao,indexCount:m.indexCount,...(m.indexFormat===1?{indexFormat:1 as const}:{}),...(m.submeshes?{submeshes:Object.freeze(m.submeshes.map(s=>Object.freeze({firstByte:s.firstByte,indexCount:s.indexCount})))}:{})});
  }
  return {meshes:uploaded,dispose};
 }catch(e){dispose();throw e;}
 finally{gl.bindVertexArray(oldVAO);gl.bindBuffer(gl.ARRAY_BUFFER,oldBuffer);}
}
