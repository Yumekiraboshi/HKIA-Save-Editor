/** Verified original pattern texture transport for 3D diagnostic rendering.
 * A GUID is not interchangeable with the texture payload digest: two original
 * BlankPattern objects share bytes but have distinct sampler/color settings.
 * No inference about native treatment, entitlement or override precedence.
 */
import {uploadNativeTexture,validateNativeTextureLayout,type NativeTextureSource,type Bc1Mode} from './native-texture-upload';
export const FLOWER_PATTERN_RUNTIME_SHA='59f314c74097c9b227d86ee670ab5d8fce8b00dabc3f5343f4ba585d7e4d8323';
const guid=/^[a-f0-9]{32}$/;
export async function loadFlowerPatternTextureManifest(bytes:ArrayBuffer):Promise<ReadonlyMap<string,NativeTextureSource>>{
 if(bytes.byteLength!==79838)throw Error('FLOWER_PATTERN_MANIFEST_SIZE');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 if(hash!==FLOWER_PATTERN_RUNTIME_SHA)throw Error('FLOWER_PATTERN_MANIFEST_HASH');
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as Record<string,NativeTextureSource>;
 const rows=Object.entries(data);
 if(rows.length!==77)throw Error('FLOWER_PATTERN_MANIFEST_COUNT');
 for(const [key,s] of rows){
  if(!guid.test(key))throw Error('FLOWER_PATTERN_GUID');
  validateNativeTextureLayout(s);
 }
 return new Map(rows);
}
export function resolveFlowerPatternTexture(manifest:ReadonlyMap<string,NativeTextureSource>,key:string):NativeTextureSource{
 if(!guid.test(key))throw Error('FLOWER_PATTERN_GUID');
 const s=manifest.get(key);
 if(!s)throw Error('FLOWER_PATTERN_TEXTURE_MISSING');
 validateNativeTextureLayout(s);
 return s;
}
export async function uploadFlowerPatternTexture(gl:WebGL2RenderingContext,manifest:ReadonlyMap<string,NativeTextureSource>,key:string,read:(digest:string,bytes:number)=>Promise<ArrayBuffer>,bc1Mode?:Bc1Mode){
 const source=resolveFlowerPatternTexture(manifest,key);
 return uploadNativeTexture(gl,source,await read(source.sha256,source.bytes),bc1Mode);
}
