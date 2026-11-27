import {loadSourceColorwayIndex} from './variant-art';

// Only a source-index-registered image for the same item may replace an
// unavailable dynamic original. Never manufacture a path for absent art.
function dynamicItemId(url:string,base:string):string|undefined{
 if(!base.startsWith('/')||!base.endsWith('/')||base.includes('..')||base.includes('\\')||base.includes('//')||!url.startsWith(base))return;
 const match=/^dynamic-colorways\/([1-9][0-9]{0,9})\.webp\?v=[a-f0-9]{64}$/.exec(url.slice(base.length));
 return match&&Number(match[1])<=0x7fffffff?match[1]:undefined;
}
export function resolveRegisteredColorwayFallback(url:string,base:string,registered:Readonly<Record<string,string>>):string|undefined{
 const id=dynamicItemId(url,base);
 if(!id||!Object.hasOwn(registered,id))return;
 const exact=base+'source-colorways/'+id+'.webp';
 return registered[id]===exact?exact:undefined;
}
let cached:{base:string;promise:Promise<Record<string,string>>}|undefined;
export async function loadRegisteredColorwayFallback(url:string,base:string):Promise<string|undefined>{
 if(!dynamicItemId(url,base))return;
 if(cached?.base!==base){
  const promise=loadSourceColorwayIndex(base).catch(e=>{if(cached?.promise===promise)cached=undefined;throw e;});
  cached={base,promise};
 }
 return resolveRegisteredColorwayFallback(url,base,await cached.promise);
}
