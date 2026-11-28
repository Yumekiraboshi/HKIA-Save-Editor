import {trackUnavailableArt,untrackUnavailableArt} from './dynamic-art-view';
import {loadRegisteredColorwayFallback} from './colorway-fallback';

async function decodeBrowserImage(url:string){
 const picture=new Image();picture.src=url;
 await picture.decode();
}
type OriginalDecodeJob={url:string;consumers:Array<()=>boolean>;promise:Promise<void>;resolve:()=>void;reject:(error:unknown)=>void};
/** All completed original artwork uses the same bounded decode pool.
 * Identical URL requests share the active job; a waiting job with no
 * remaining live card is discarded before loading any image. Successful
 * bytes remain in the normal browser cache, not an unbounded JS cache. */
export function createOriginalImageDecoder(load=decodeBrowserImage){
 const jobs=new Map<string,OriginalDecodeJob>(),queue:OriginalDecodeJob[]=[];
 let active=0;
 function finish(job:OriginalDecodeJob){
  if(jobs.get(job.url)===job)jobs.delete(job.url);
 }
 function drain(){
  while(active<6&&queue.length){
   const job=queue.shift()!;
   if(!job.consumers.some(isLive=>isLive())){
    finish(job);job.reject(Error('ORIGINAL_ART_CANCELED'));continue;
   }
   active++;
   void Promise.resolve().then(()=>load(job.url)).then(()=>{
    finish(job);job.resolve();
   },error=>{
    finish(job);job.reject(error);
   }).finally(()=>{active--;drain();});
  }
 }
 return (url:string,isLive:()=>boolean=()=>true):Promise<void>=>{
  if(!isLive())return Promise.reject(Error('ORIGINAL_ART_CANCELED'));
  const existing=jobs.get(url);
  if(existing){existing.consumers.push(isLive);return existing.promise;}
  let resolve!:()=>void,reject!:(error:unknown)=>void;
  const promise=new Promise<void>((ok,fail)=>{resolve=ok;reject=fail;});
  const job={url,consumers:[isLive],promise,resolve,reject};
  jobs.set(url,job);queue.push(job);drain();return promise;
 };
}
const decodeImage=createOriginalImageDecoder();
/** Prefer the completed original. Keep any already displayed registered
 * fallback during recovery and never downgrade it on a second failure. */
export function startOriginalArtRequest(original:string|undefined,exact:string|undefined,base:string,show:(url:string)=>void,
 decode=decodeImage,registered=loadRegisteredColorwayFallback):()=>void{
 let canceled=false,pending=false,best=Infinity;
 const primary=original??exact;
 async function attempt(url:string|undefined,rank:number){
  if(canceled||!url||rank>=best)return false;
  try{await decode(url,()=>!canceled);}catch{return false;}
  if(canceled)return false;
  best=rank;show(url);return true;
 }
 async function retry(){
  if(canceled||pending||!primary||best===0)return;
  untrackUnavailableArt(retry);
  pending=true;
  try{
   if(await attempt(primary,0)||canceled)return;
   if(original&&best>1){
    let fallback:string|undefined;
    try{fallback=await registered(original,base);}catch{}
    if(fallback!==primary&&await attempt(fallback,1))return;
   }
   if(original&&exact!==primary)await attempt(exact,2);
  }finally{
   pending=false;
   if(!canceled&&best!==0)trackUnavailableArt(retry);
  }
 }
 void retry();
 return ()=>{canceled=true;untrackUnavailableArt(retry);};
}
