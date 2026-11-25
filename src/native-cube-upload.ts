/** Transport of original BC1 reflection cube data. This does NOT infer Unity
 * serialized face order or face orientation from the image content. */
import type {Bc1Mode} from './native-texture-upload';

export type NativeCubeSource={
 width:number;height:number;format:number;colorSpace:number;sampler:readonly number[];
 mipCount:number;imageCount:number;faceBytes:number;
 faceMipRanges:readonly (readonly [number,number,number])[];
 bytes:number;sha256:string;faceOrder:string;
};
/** Destination order is WebGL +X,-X,+Y,-Y,+Z,-Z. Each value is the source face
 * index; direct upload is only valid when axes and texel orientation agree. */
export type NativeCubeOrientation={sourceSha256:string;sourceFaceForTarget:readonly number[];texelOrientation:'native-webgl';evidence:string};
const hex=/^[0-9a-f]{64}$/;
export function nativeCubeMipRanges(s:NativeCubeSource){
 if(!Number.isInteger(s.width)||s.width<1||s.width>2048||(s.width&(s.width-1))!==0||s.width!==s.height||s.format!==10||![0,1].includes(s.colorSpace)||s.imageCount!==6||s.mipCount!==1+Math.log2(s.width)||s.faceMipRanges.length!==s.mipCount||!hex.test(s.sha256))throw Error('NATIVE_CUBE_HEADER');
 if(s.sampler.length!==6||!Number.isInteger(s.sampler[0])||s.sampler[0]<0||s.sampler[0]>2||!Number.isInteger(s.sampler[1])||s.sampler[1]<0||s.sampler[1]>16||s.sampler[2]!==0||s.sampler.slice(3).some(n=>n!==1))throw Error('NATIVE_CUBE_SAMPLER');
 let offset=0;
 for(let i=0;i<s.mipCount;i++){
  const n=Math.max(1,s.width>>i),len=Math.ceil(n/4)**2*8;
  const [w,start,bytes]=s.faceMipRanges[i];
  if(w!==n||start!==offset||bytes!==len)throw Error('NATIVE_CUBE_MIP_RANGE');
  offset+=len;
 }
 if(offset!==s.faceBytes||s.bytes!==6*offset)throw Error('NATIVE_CUBE_LENGTH');
 return Array.from({length:6},(_,face)=>s.faceMipRanges.map(([size,start,bytes],level)=>({face,level,size,offset:face*s.faceBytes+start,bytes})));
}
export async function verifyNativeCubePayload(s:NativeCubeSource,bytes:ArrayBuffer){
 const ranges=nativeCubeMipRanges(s);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 if(bytes.byteLength!==s.bytes||digest!==s.sha256)throw Error('NATIVE_CUBE_HASH');
 return ranges;
}
export function validateNativeCubeOrientation(s:NativeCubeSource,o:NativeCubeOrientation|undefined){
 if(!o||o.sourceSha256!==s.sha256||o.texelOrientation!=='native-webgl'||typeof o.evidence!=='string'||!o.evidence.trim()||o.sourceFaceForTarget.length!==6||new Set(o.sourceFaceForTarget).size!==6||o.sourceFaceForTarget.some(n=>!Number.isInteger(n)||n<0||n>5))throw Error('NATIVE_CUBE_ORIENTATION');
 // An explicit caller-supplied orientation is required even if the manifest
 // claims a face order. This module cannot authenticate evidence by itself.
 return o.sourceFaceForTarget;
}
/** For an isolated rendering context; caller owns the returned texture.
 * A diagnostic orientation is not authorization to publish native icon art. */
export async function uploadNativeCube(gl:WebGL2RenderingContext,s:NativeCubeSource,bytes:ArrayBuffer,orientation:NativeCubeOrientation|undefined,bc1Mode:Bc1Mode){
 const order=validateNativeCubeOrientation(s,orientation);
 const ranges=await verifyNativeCubePayload(s,bytes);
 if(bc1Mode!=='rgb'&&bc1Mode!=='rgba')throw Error('NATIVE_CUBE_BC1_MODE');
 if(gl.getError()!==gl.NO_ERROR)throw Error('NATIVE_CUBE_GPU_DIRTY');
 if(s.width>gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE))throw Error('NATIVE_CUBE_GPU_SIZE');
 if(gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING)!==null)throw Error('NATIVE_CUBE_GPU_UNPACK_BUFFER');
 if(!gl.getExtension(s.colorSpace===1?'WEBGL_compressed_texture_s3tc_srgb':'WEBGL_compressed_texture_s3tc'))throw Error('NATIVE_CUBE_GPU_FORMAT');
 const [filter,aniso]=s.sampler;
 const ext=aniso>1?gl.getExtension('EXT_texture_filter_anisotropic'):null;
 if(aniso>1&&(!ext||gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)<aniso))throw Error('NATIVE_CUBE_GPU_ANISO');
 const format=s.colorSpace===1?(bc1Mode==='rgba'?0x8c4d:0x8c4c):(bc1Mode==='rgba'?0x83f1:0x83f0);
 const old=gl.getParameter(gl.TEXTURE_BINDING_CUBE_MAP) as WebGLTexture|null;
 const texture=gl.createTexture();if(!texture)throw Error('NATIVE_CUBE_GPU_CREATE');
 const target=gl.TEXTURE_CUBE_MAP;
 try{
  gl.bindTexture(target,texture);
  for(let dest=0;dest<6;dest++)for(const m of ranges[order[dest]]){
   gl.compressedTexImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+dest,m.level,format,m.size,m.size,0,new Uint8Array(bytes,m.offset,m.bytes));
  }
  for(const wrap of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(target,wrap,gl.CLAMP_TO_EDGE);
  gl.texParameteri(target,gl.TEXTURE_MAG_FILTER,filter===0?gl.NEAREST:gl.LINEAR);
  gl.texParameteri(target,gl.TEXTURE_MIN_FILTER,[gl.NEAREST_MIPMAP_NEAREST,gl.LINEAR_MIPMAP_NEAREST,gl.LINEAR_MIPMAP_LINEAR][filter]);
  gl.texParameteri(target,gl.TEXTURE_BASE_LEVEL,0);
  gl.texParameteri(target,gl.TEXTURE_MAX_LEVEL,s.mipCount-1);
  if(ext)gl.texParameterf(target,ext.TEXTURE_MAX_ANISOTROPY_EXT,aniso);
  if(gl.getError()!==gl.NO_ERROR)throw Error('NATIVE_CUBE_GPU_UPLOAD');
  return texture;
 }catch(error){gl.deleteTexture(texture);throw error;}
 finally{gl.bindTexture(target,old);}
}
