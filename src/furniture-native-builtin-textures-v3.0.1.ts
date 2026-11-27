/** Original Steam 3.0.1 UnityPlayer-generated constant texture bytes.
 * Source: UnityPlayer.dll SHA-256 4c000ddb226524473c2415afeabb2543b8d5a169a6ae4097503851e676159735.
 * A diagnostic shader-space representation: the constant white samples are
 * identical in linear or sRGB formats. Sampling/filter state does not affect
 * these constant values. No fallback for missing referenced textures. */
import type {NativeTextureSource} from './native-texture-upload';
type BuiltinName='white'|'bump';
const definitions={
 white:{rgba:[255,255,255,255],sha256:'8667e718294e9e0df1d30600ba3eeb201f764aad2dad72748643e4a285e1d1f7'},
 bump:{rgba:[127,127,255,255],sha256:'33869922b91375cf2b77363e8858a3aee06bae988641ad07f99e817b272d2c35'}
} as const;
function make(name:BuiltinName):NativeTextureSource{
 const hash=definitions[name].sha256;
 return Object.freeze({width:4,height:4,format:4,colorSpace:0,sampler:Object.freeze([0,1,0,0,0,0]),bytes:64,sha256:hash,
  mips:Object.freeze([Object.freeze([4,4,0,64,hash] as const)])});
}
const white=make('white'),bump=make('bump');
/** The exact Furniture shader declares white Base/Combo and bump Normal.
 * A non-null source reference must always use the original source reader.
 * The exact Refractive shader also declares white Base and bump Normal.
 * CustomLit declares the same white Base/Combo and bump Normal defaults.
 * This helper is scoped to these exact verified shader objects. */
export function furnitureNativeBuiltinTexture(shaderObjectSha256:string,property:string):NativeTextureSource{
 const furniture=shaderObjectSha256==='cdb64e92e92cbc2b88b3ce48c8a3ed302a16972a23528c27e766b7a646d852d0';
 const glass=shaderObjectSha256==='39080ec3a7154ee8032ee36bab5f861630dfe745b3bd1e35ad275662b1c6e332';
 const custom=shaderObjectSha256==='7c32f4b3f7c0c0d580af1e22584952aa29d266dfbe98de3b916c3fecb7339931';
 if(!furniture&&!glass&&!custom)throw Error('FURNITURE_BUILTIN_SHADER');
 if(property==='_BaseMap'||(furniture||custom)&&property==='_MetallicGlossMap')return white;
 if(property==='_BumpMap')return bump;
 throw Error('FURNITURE_BUILTIN_PROPERTY');
}
/** Only descriptors issued by this module are generated locally. Never
 * recognize an untrusted pack texture by digest alone. */
export function furnitureNativeBuiltinBytes(source:NativeTextureSource):ArrayBuffer|undefined{
 const name=source===white?'white':source===bump?'bump':null;
 if(name===null)return;
 const bytes=new Uint8Array(64);
 for(let i=0;i<bytes.length;i+=4)bytes.set(definitions[name].rgba,i);
 return bytes.buffer;
}
