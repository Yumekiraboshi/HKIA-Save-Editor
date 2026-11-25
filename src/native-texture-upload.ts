/** Original texture payload transport for future dynamic 3D art. No save or
 * shader logic, no implicit replacement texture, no framebuffer claim. */
export type NativeMip=readonly [width:number,height:number,offset:number,bytes:number,sha256:string];
export type NativeTextureSource={width:number;height:number;format:number;colorSpace:number;sampler:readonly number[];bytes:number;sha256:string;mips:readonly NativeMip[]};
export type Bc1Mode='rgb'|'rgba';
const hex=/^[0-9a-f]{64}$/;
const integer=(n:number,min:number,max:number)=>Number.isInteger(n)&&n>=min&&n<=max;
const hash=async(b:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('');
/** Reject invalid metadata before reading or allocating a texture. */
export function validateNativeTextureLayout(s:NativeTextureSource){
 if(!integer(s.width,1,8192)||!integer(s.height,1,8192)||![4,10,12].includes(s.format)||![0,1].includes(s.colorSpace)||!integer(s.bytes,1,96*1024*1024)||!hex.test(s.sha256))throw Error('NATIVE_TEXTURE_HEADER');
 if(s.sampler.length!==6||!integer(s.sampler[0],0,2)||!integer(s.sampler[1],0,16)||!Number.isFinite(s.sampler[2])||!s.sampler.slice(3).every(v=>integer(v,0,3)))throw Error('NATIVE_TEXTURE_SAMPLER');
 if(!integer(s.mips.length,1,1+Math.floor(Math.log2(Math.max(s.width,s.height)))))throw Error('NATIVE_TEXTURE_MIPS');
 let cursor=0;
 for(const [i,m] of s.mips.entries()){
  const [w,h,offset,len,digest]=m;
  const ew=Math.max(1,s.width>>i),eh=Math.max(1,s.height>>i);
  const size=s.format===4?ew*eh*4:Math.ceil(ew/4)*Math.ceil(eh/4)*(s.format===10?8:16);
  if(w!==ew||h!==eh||offset!==cursor||len!==size||!hex.test(digest))throw Error('NATIVE_TEXTURE_MIP_RANGE');
  cursor+=size;
 }
 if(cursor!==s.bytes)throw Error('NATIVE_TEXTURE_LENGTH');
}
export async function verifyNativeTexturePayload(s:NativeTextureSource,bytes:ArrayBuffer){
 validateNativeTextureLayout(s);
 if(bytes.byteLength!==s.bytes||await hash(bytes)!==s.sha256)throw Error('NATIVE_TEXTURE_HASH');
 for(const [, ,offset,len,digest] of s.mips)if(await hash(bytes.slice(offset,offset+len))!==digest)throw Error('NATIVE_TEXTURE_MIP_HASH');
}
type Aniso={TEXTURE_MAX_ANISOTROPY_EXT:number;MAX_TEXTURE_MAX_ANISOTROPY_EXT:number};
/** Upload the original mip bytes with native sRGB/linear interpretation.
 * Caller must own an isolated WebGL2 context and specify BC1 alpha semantics
 * from the verified shader path. Unsupported sampler/GPU features refuse;
 * the caller must not substitute a guessed appearance. Caller owns deletion. */
export async function uploadNativeTexture(gl:WebGL2RenderingContext,s:NativeTextureSource,bytes:ArrayBuffer,bc1Mode?:Bc1Mode):Promise<WebGLTexture>{
 await verifyNativeTexturePayload(s,bytes);
 if(s.format===10&&bc1Mode!=='rgb'&&bc1Mode!=='rgba')throw Error('NATIVE_TEXTURE_BC1_MODE');
 const [filter,aniso,bias,wu,wv]=s.sampler;
 if(bias!==0||wu===3||wv===3)throw Error('NATIVE_TEXTURE_SAMPLER_UNSUPPORTED');
 if(Math.max(s.width,s.height)>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw Error('NATIVE_TEXTURE_GPU_SIZE');
 const ext=s.format===4?null:gl.getExtension(s.colorSpace===1?'WEBGL_compressed_texture_s3tc_srgb':'WEBGL_compressed_texture_s3tc');
 if(s.format!==4&&!ext)throw Error('NATIVE_TEXTURE_GPU_FORMAT');
 const anisoExt=aniso>1?gl.getExtension('EXT_texture_filter_anisotropic') as Aniso|null:null;
 if(aniso>1&&(!anisoExt||gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT)<aniso))throw Error('NATIVE_TEXTURE_GPU_ANISO');
 // WebGL extension enumerants (KHR/EXT S3TC). The extension must be present.
 const internal=s.format===4?(s.colorSpace===1?gl.SRGB8_ALPHA8:gl.RGBA8):s.colorSpace===1?(s.format===12?0x8c4f:bc1Mode==='rgba'?0x8c4d:0x8c4c):(s.format===12?0x83f3:bc1Mode==='rgba'?0x83f1:0x83f0);
 const texture=gl.createTexture();if(!texture)throw Error('NATIVE_TEXTURE_GPU_CREATE');
 const old=gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture|null;
 const unpackKeys=[gl.UNPACK_ALIGNMENT,gl.UNPACK_FLIP_Y_WEBGL,gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.UNPACK_ROW_LENGTH,gl.UNPACK_SKIP_ROWS,gl.UNPACK_SKIP_PIXELS];
 const saved=unpackKeys.map(k=>gl.getParameter(k) as number);
 try{
  if(gl.getError()!==gl.NO_ERROR)throw Error('NATIVE_TEXTURE_GPU_DIRTY');
  gl.bindTexture(gl.TEXTURE_2D,texture);
  [1,0,0,gl.NONE,0,0,0].forEach((v,i)=>gl.pixelStorei(unpackKeys[i],v));
  for(const [level,[w,h,off,len]] of s.mips.entries()){
   const data=new Uint8Array(bytes,off,len);
   if(s.format===4)gl.texImage2D(gl.TEXTURE_2D,level,internal,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
   else gl.compressedTexImage2D(gl.TEXTURE_2D,level,internal,w,h,0,data);
  }
  const wrap=[gl.REPEAT,gl.CLAMP_TO_EDGE,gl.MIRRORED_REPEAT];
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap[wu]);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrap[wv]);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter===0?gl.NEAREST:gl.LINEAR);
  const min=s.mips.length===1?(filter===0?gl.NEAREST:gl.LINEAR):[gl.NEAREST_MIPMAP_NEAREST,gl.LINEAR_MIPMAP_NEAREST,gl.LINEAR_MIPMAP_LINEAR][filter];
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,min);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_BASE_LEVEL,0);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAX_LEVEL,s.mips.length-1);
  if(anisoExt)gl.texParameterf(gl.TEXTURE_2D,anisoExt.TEXTURE_MAX_ANISOTROPY_EXT,aniso);
  if(gl.getError()!==gl.NO_ERROR)throw Error('NATIVE_TEXTURE_GPU_UPLOAD');
  return texture;
 }catch(error){gl.deleteTexture(texture);throw error;}
 finally{saved.forEach((v,i)=>gl.pixelStorei(unpackKeys[i],v));gl.bindTexture(gl.TEXTURE_2D,old);}
}
