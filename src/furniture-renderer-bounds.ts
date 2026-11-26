/** World-space bounds of explicitly selected, original static mesh renderers.
 * Unity's native preview collects renderer bounds and encapsulates them.
 * This helper neither selects engine components nor guesses dynamic bounds.
 * Caller supplies actual model transforms and original local Mesh AABBs. */
import {transformPoint} from './furniture-authored-transforms';
import type {Vec3} from './furniture-surface-v3.0.1';
export type StaticBoundsInput={model:readonly number[];localBounds:readonly number[]};
export function mergeStaticRendererBounds(rows:readonly StaticBoundsInput[]):{center:Vec3;extents:Vec3}{
 if(!rows.length||rows.length>512)throw Error('FURNITURE_STATIC_BOUNDS');
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const {model,localBounds:b} of rows){
  if(b.length!==6||!b.every(Number.isFinite)||b.slice(3).some(x=>x<0)||
   model.length!==16||!model.every(Number.isFinite)||model[3]!==0||model[7]!==0||model[11]!==0||model[15]!==1)throw Error('FURNITURE_STATIC_BOUNDS');
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
   const p=transformPoint(model,[b[0]+x*b[3],b[1]+y*b[4],b[2]+z*b[5]]);
   if(!p.every(Number.isFinite))throw Error('FURNITURE_STATIC_BOUNDS');
   for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
  }
 }
 const center:Vec3=[0,1,2].map(i=>(max[i]+min[i])/2) as unknown as Vec3;
 const extents:Vec3=[0,1,2].map(i=>(max[i]-min[i])/2) as unknown as Vec3;
 if(![...center,...extents].every(Number.isFinite))throw Error('FURNITURE_STATIC_BOUNDS');
 return {center,extents};
}
