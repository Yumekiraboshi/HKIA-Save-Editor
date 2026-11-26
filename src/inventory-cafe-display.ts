/** Display-only exact native cafe tuples and source ingredient examples. */
export type CafeVariant=[number,number,number,number,number,number];
export type CafeRow={variant:CafeVariant;editable:boolean};
export type CafeWitness=[itemId:number,flavor:number,color:number];
export type CafeOption={variant:CafeVariant;ingredientId:number;slot:number};
export function isCafeVariantWire(v:unknown):v is CafeVariant{
 return Array.isArray(v)&&v.length===6&&v.every(n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647);
}
function words(v:DataView,at:number):CafeVariant{
 return Array.from({length:6},(_,i)=>v.getInt32(at+4*i,true)) as CafeVariant;
}
export function decodeCafeRows(bytes:Uint8Array,docIds:ReadonlySet<number>):{rows:Map<number,CafeRow>;witnesses:CafeWitness[]}{
 if(bytes.length<8)throw Error('CAFE_SNAPSHOT_INVALID');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(0,true);
 if(n>docIds.size||4+n*32+4>bytes.length)throw Error('CAFE_SNAPSHOT_INVALID');
 const rows=new Map<number,CafeRow>();
 for(let i=0;i<n;i++){
  const at=4+i*32,id=v.getUint32(at,true),editable=v.getUint32(at+4,true);
  if(!docIds.has(id)||rows.has(id)||editable>1)throw Error('CAFE_SNAPSHOT_INVALID');
  rows.set(id,{variant:words(v,at+8),editable:editable===1});
 }
 const start=4+n*32,m=v.getUint32(start,true);
 if(m>48||bytes.length!==start+4+m*12)throw Error('CAFE_SNAPSHOT_INVALID');
 const witnesses=Array.from({length:m},(_,i)=>Array.from({length:3},(_,j)=>v.getInt32(start+4+i*12+j*4,true)) as CafeWitness);
 return {rows,witnesses};
}
export function decodeCafeOptions(bytes:Uint8Array):CafeOption[]{
 if(bytes.length<4)throw Error('CAFE_OPTIONS_INVALID');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(0,true);
 if(n>147||bytes.length!==4+n*32)throw Error('CAFE_OPTIONS_INVALID');
 return Array.from({length:n},(_,i)=>{
  const at=4+i*32,ingredientId=v.getInt32(at+24,true),slot=v.getUint32(at+28,true);
  if(ingredientId<0||slot>2)throw Error('CAFE_OPTIONS_INVALID');
  return {variant:words(v,at),ingredientId,slot};
 });
}
export function cafeSlotLabel(variant:CafeVariant,slot:number,witnesses:readonly CafeWitness[],name:(id:number)=>string):string{
 const candidates=witnesses.filter(w=>w[1]===variant[slot]&&w[2]===variant[slot+3]);
 return candidates.map(w=>name(w[0])).filter(Boolean).join(' / ')||'—';
}
export function cafeVariantLabel(variant:CafeVariant,witnesses:readonly CafeWitness[],name:(id:number)=>string):string{
 return [0,1,2].filter(i=>variant[i]>0).map(i=>cafeSlotLabel(variant,i,witnesses,name)).join(' · ');
}
