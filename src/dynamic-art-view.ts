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
export function startDynamicArtRequest(render:()=>Promise<Blob|null>,show:(url:string|null,partial?:boolean)=>void,renderPartial?:()=>Promise<Blob|null>):()=>void{
 let canceled=false,created:string|null=null;
 show(null);
 const job=async()=>{
  try{
   if(canceled)return;
   let blob:Blob|null=null,partial=false;
   try{blob=await render();}catch{/* The independently verified base may remain available. */}
   if(canceled)return;
   if(!blob&&renderPartial){blob=await renderPartial();partial=true;}
   if(canceled||!blob)return;
   created=URL.createObjectURL(blob);
   show(created,partial);
  }catch{/* An unavailable asset retains the explicitly marked fallback. */}
 };
 pending.add(job);drainArtQueue();
 return ()=>{
  canceled=true;
  pending.delete(job);
  if(created!==null){URL.revokeObjectURL(created);created=null;}
 };
}
