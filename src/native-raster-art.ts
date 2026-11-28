/** Shared native-resolution raster transport. Original source extraction
 * verifies decoded pixels; the browser checks the exact reviewed bytes,
 * codec and dimensions, without retaining decoded RGBA pages. */
import {loadVerifiedArtAsset} from './dynamic-art-assets';
export const NATIVE_RASTER_POLICY='native-resolution-lossless-webp-v1';
const SHA=/^[a-f0-9]{64}$/;
const MAX_FILE=100*1024*1024;
export type NativeRasterAsset=Readonly<{file:string;sha256:string;bytes:number;width:number;height:number;mode:'RGB'|'RGBA';pixelSha256:string;conversion:typeof NATIVE_RASTER_POLICY}>;
function check(v:unknown):asserts v{if(!v)throw Error('NATIVE_RASTER_INVALID');}
function obj(v:unknown):Record<string,unknown>{check(v!==null&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;}
function int(v:unknown,min:number,max:number):number{check(typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max);return v;}
export function decodeNativeRasterAsset(value:unknown):NativeRasterAsset{
 const a=obj(value);
 check(typeof a.sha256==='string'&&SHA.test(a.sha256)&&a.file===a.sha256+'.webp'&&
  typeof a.pixelSha256==='string'&&SHA.test(a.pixelSha256)&&a.conversion===NATIVE_RASTER_POLICY&&
  (a.mode==='RGB'||a.mode==='RGBA'));
 return {file:a.file as string,sha256:a.sha256,bytes:int(a.bytes,25,MAX_FILE),width:int(a.width,1,16383),
  height:int(a.height,1,16383),mode:a.mode,pixelSha256:a.pixelSha256,conversion:NATIVE_RASTER_POLICY};
}
export function verifyNativeWebPHeader(data:ArrayBuffer,a:NativeRasterAsset){
 const b=new Uint8Array(data),v=new DataView(data);
 const str=(i:number,n:number)=>String.fromCharCode(...b.subarray(i,i+n));
 check(b.length===a.bytes&&b.length>=25&&str(0,4)==='RIFF'&&str(8,4)==='WEBP'&&v.getUint32(4,true)+8===b.length);
 let found=false,p=12;
 while(p<b.length){
  check(p+8<=b.length);
  const kind=str(p,4),n=v.getUint32(p+4,true),start=p+8;
  check(start+n<=b.length&&!['VP8 ','ANIM','ANMF','ALPH'].includes(kind));
  if(kind==='VP8L'){
   check(!found&&n>=5&&b[start]===0x2f);found=true;
   const dim=v.getUint32(start+1,true);
   check((dim&0x3fff)+1===a.width&&((dim>>>14)&0x3fff)+1===a.height&&(dim>>>29)===0);
  }
  p=start+n+(n&1);
 }
 check(found&&p===b.length);
}
export function createNativeRasterLoader(root:string,load=loadVerifiedArtAsset){
 check(root.startsWith('/')&&root.endsWith('/')&&!root.includes('..')&&!root.includes('//')&&!root.includes('\\')&&!/[?#%]/.test(root));
 const pending=new Map<string,Promise<Blob>>(),ready=new Map<string,Blob>();
 let retained=0,disposed=false;
 return {
  async image(raw:NativeRasterAsset):Promise<Blob>{
   check(!disposed);
   const a=decodeNativeRasterAsset(raw),key=JSON.stringify(a);
   const old=ready.get(key);if(old){ready.delete(key);ready.set(key,old);return old;}
   const running=pending.get(key);if(running)return running;
   const task=(async()=>{
    const data=await load(root,a.file,a.sha256,MAX_FILE,a.bytes);
    verifyNativeWebPHeader(data,a);check(!disposed);
    const blob=new Blob([data],{type:'image/webp'});
    if(blob.size<=32*1024*1024){
     ready.set(key,blob);retained+=blob.size;
     while(ready.size>192||retained>32*1024*1024){
      const k=ready.keys().next().value!;retained-=ready.get(k)!.size;ready.delete(k);
     }
    }
    return blob;
   })().finally(()=>pending.delete(key));
   pending.set(key,task);return task;
  },
  dispose(){disposed=true;ready.clear();retained=0;}
 };
}
