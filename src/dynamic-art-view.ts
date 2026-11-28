/** Shared viewport lifecycle for locally generated item artwork.
 * No native save rules or asset inference are performed here. */
type VisibilityHandler=(near:boolean)=>void;
const listeners=new Map<Element,VisibilityHandler>();
let observer:IntersectionObserver|undefined;
export function watchDynamicArtVisibility(node:HTMLElement,onVisibility:VisibilityHandler){
 if(typeof IntersectionObserver==='undefined'){
  onVisibility(true);
  return {destroy(){}};
 }
 if(!observer)observer=new IntersectionObserver(entries=>{
  for(const entry of entries)listeners.get(entry.target)?.(entry.isIntersecting);
 },{rootMargin:'384px'});
 listeners.set(node,onVisibility);
 observer.observe(node);
 return {destroy(){
  listeners.delete(node);
  observer?.unobserve(node);
  if(!listeners.size){observer?.disconnect();observer=undefined;}
 }};
}
// A large inventory can expose many dynamic cards at once. Limit complete
// render requests (including source loads and partial fallback) rather than
// starting every visible card's canvas work simultaneously.
const MAX_ACTIVE_ART_REQUESTS=4;
type ArtJob=()=>Promise<void>;
const pending=new Set<ArtJob>();
let active=0;
function drainArtQueue(){
 while(active<MAX_ACTIVE_ART_REQUESTS&&pending.size){
  const job=pending.values().next().value!;
  pending.delete(job);active++;
  void job().finally(()=>{active--;drainArtQueue();});
 }
}
/** A completed old request must never replace a newer appearance or create
 * an object URL after the card leaves the viewport or is destroyed.
 * Canceled waiting jobs never load assets or run the renderer; started jobs
 * keep their slot until completion, even if their output is no longer needed. */
// All failed/partial visible cards share one browser recovery listener.
const recoverable=new Set<()=>void>();
function retryUnavailableArt(){
 for(const retry of [...recoverable])retry();
}
export function trackUnavailableArt(retry:()=>void){
 if(recoverable.size===0&&typeof window!=='undefined')window.addEventListener('online',retryUnavailableArt);
 recoverable.add(retry);
}
export function untrackUnavailableArt(retry:()=>void){
 recoverable.delete(retry);
 if(recoverable.size===0&&typeof window!=='undefined')window.removeEventListener('online',retryUnavailableArt);
}
export function startDynamicArtRequest(render:()=>Promise<Blob|null>,show:(url:string|null,partial?:boolean)=>void,renderPartial?:()=>Promise<Blob|null>,renderIntermediate?:()=>Promise<Blob|null>):()=>void{
 let canceled=false,created:string|null=null,scheduled=false,best=Infinity;
 show(null);
 function retry(){
  if(canceled||scheduled)return;
  untrackUnavailableArt(retry);
  scheduled=true;pending.add(job);drainArtQueue();
 }
 const job=async()=>{
  try{
   if(canceled)return;
   // Full image, verified tinted base, original untinted base. A successful
   // lower tier stays visible until a strictly better tier is available.
   const tiers=[render,renderIntermediate,renderPartial];
   for(let rank=0;rank<best&&rank<tiers.length;rank++){
    const load=tiers[rank];if(!load)continue;
    let blob:Blob|null=null;
    try{blob=await load();}catch{/* Independent lower tiers remain available. */}
    if(canceled)return;
    if(!blob)continue;
    const next=URL.createObjectURL(blob),previous=created;
    created=next;best=rank;show(next,rank!==0);
    if(previous!==null)URL.revokeObjectURL(previous);
    if(rank===0)return;
    break;
   }
   trackUnavailableArt(retry);
  }catch{
   if(!canceled)trackUnavailableArt(retry);
  }finally{scheduled=false;}
 };
 retry();
 return ()=>{
  canceled=true;
  untrackUnavailableArt(retry);
  pending.delete(job);
  if(created!==null){URL.revokeObjectURL(created);created=null;}
 };
}
