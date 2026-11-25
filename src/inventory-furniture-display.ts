/** Display-only verified original material names and UI colors. Rust supplies all edit choices. */
type Material={sourceName:string;rgba:number[]};
export type FurnitureDisplay={materials:Map<number,Material>;defaults:Map<number,Map<number,number>>};
const SHA='3b7dafc47b8b59046030494297d59c3f41fb327b5f537db6bb9e2788f24c43bf';
export async function loadFurnitureDisplay():Promise<FurnitureDisplay>{
 const res=await fetch(import.meta.env.BASE_URL+'inventory-ui/furniture-customization-v3.0.1.json');
 if(!res.ok)throw Error('INVENTORY_UNIQUE_INVALID');
 const b=await res.arrayBuffer();
 if(b.byteLength!==290670)throw Error('INVENTORY_UNIQUE_INVALID');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==SHA)throw Error('INVENTORY_UNIQUE_INVALID');
 const d=JSON.parse(new TextDecoder().decode(b)) as {materials:Array<[number,string,string,string,number|null,number[],string|null,boolean]>;items:Array<[number,string,string,number,Array<[number,string,number,string[]]>]>};
 return {materials:new Map(d.materials.map(v=>[v[0],{sourceName:v[2],rgba:v[5]}])),defaults:new Map(d.items.map(v=>[v[0],new Map(v[4].map(s=>[s[0],s[2]]))]))};
}
export function materialLabel(display:FurnitureDisplay|null,index:number,defaultLabel:string):string{
 return index===0?defaultLabel:display?.materials.get(index)?.sourceName.replaceAll('_',' ')??'—';
}
export function materialSwatch(display:FurnitureDisplay|null,itemId:number,slot:number,index:number):string{
 const c=display?.materials.get(index===0?(display.defaults.get(itemId)?.get(slot)??0):index)?.rgba;
 if(!c||c.length!==4||c.some(n=>!Number.isFinite(n)||n<0||n>1))return 'transparent';
 return 'rgba('+c.slice(0,3).map(n=>Math.round(n*255)).join(',')+','+c[3]+')';
}
