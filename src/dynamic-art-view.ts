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
/** A completed old request must never replace a newer appearance or create
 * an object URL after the card leaves the viewport or is destroyed. */
export function startDynamicArtRequest(render:()=>Promise<Blob|null>,show:(url:string|null)=>void):()=>void{
 let canceled=false,created:string|null=null;
 show(null);
 void (async()=>{
  try{
   const blob=await render();
   if(canceled||!blob)return;
   created=URL.createObjectURL(blob);
   show(created);
  }catch{/* An unavailable asset retains the explicitly marked fallback. */}
 })();
 return ()=>{
  canceled=true;
  if(created!==null)URL.revokeObjectURL(created);
 };
}
