import {trackUnavailableArt,untrackUnavailableArt} from './dynamic-art-view';
import {loadRegisteredColorwayFallback} from './colorway-fallback';

async function decodeImage(url:string){
 const picture=new Image();picture.src=url;
 await picture.decode();
}
/** Prefer the completed original. Keep any already displayed registered
 * fallback during recovery and never downgrade it on a second failure. */
export function startOriginalArtRequest(original:string|undefined,exact:string|undefined,base:string,show:(url:string)=>void,
 decode=decodeImage,registered=loadRegisteredColorwayFallback):()=>void{
 let canceled=false,pending=false,best=Infinity;
 const primary=original??exact;
 async function attempt(url:string|undefined,rank:number){
  if(canceled||!url||rank>=best)return false;
  try{await decode(url);}catch{return false;}
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
