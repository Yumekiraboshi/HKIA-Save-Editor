import type {IconPack} from './icon-packs';

/** Deduplicate in-flight group requests across all views. Three active group
 * loads at most; callers own the successfully loaded immutable packs. */
export function createIconPackRequests(load:(group:string)=>Promise<IconPack>){
 const requests=new Map<string,Promise<IconPack>>();
 const queue:Array<()=>void>=[];
 let active=0;
 function drain(){
  while(active<3&&queue.length){active++;queue.shift()!();}
 }
 function request(group:string):Promise<IconPack>{
  const current=requests.get(group);if(current)return current;
  const task=new Promise<IconPack>((resolve,reject)=>{
   queue.push(()=>{
    void Promise.resolve().then(()=>load(group)).then(
     pack=>{requests.delete(group);active--;drain();resolve(pack);},
     error=>{requests.delete(group);active--;drain();reject(error);}
    );
   });
  });
  requests.set(group,task);drain();return task;
 }
 return {request};
}
