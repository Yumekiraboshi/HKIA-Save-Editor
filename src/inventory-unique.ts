/** Typed view of Rust-owned native unique-data snapshot; no save rules. */
export type InventoryUniqueInfo={uniqueId:number|null;tag:number;fieldCount:number;words:number[];flowerEditable:boolean;furnitureEditable?:boolean};
function validSimpleAppearanceWords(tag:number,words:readonly number[]):boolean{
 if(words.length===0)return true; // opaque, partial or absent
 return tag===3?words.length<=4&&words[0]===words.length-1:
  words.length===(tag===4?1:tag===6?12:tag===7?4:tag===8?3:0);
}
export function decodeInventoryUnique(bytes:Uint8Array,docIds:ReadonlySet<number>):Map<number,InventoryUniqueInfo>{
 if(bytes.length<4)throw Error('INVENTORY_UNIQUE_INVALID');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=0;
 const u=()=>{if(at+4>v.byteLength)throw Error('INVENTORY_UNIQUE_INVALID');const n=v.getUint32(at,true);at+=4;return n};
 const i=()=>u()|0;
 const count=u(),rows=new Map<number,InventoryUniqueInfo>();
 if(count!==docIds.size)throw Error('INVENTORY_UNIQUE_INVALID');
 for(let j=0;j<count;j++){
  const id=u(),present=u(),uid=i(),tag=i(),fieldCount=u(),n=u();
  if(!docIds.has(id)||rows.has(id)||present>1||(!present&&uid!==0)||tag< -2||tag>11||fieldCount>5||
   n>18)throw Error('INVENTORY_UNIQUE_INVALID');
  const words=Array.from({length:n},()=>u());
  if(tag===9&&n!==0){
   const sourceTag=words[4]|0,sourceCount=words[5];
   if(fieldCount!==5||n<6||sourceTag< -1||sourceTag>11||sourceCount!==n-6||sourceCount>12||
     !validSimpleAppearanceWords(sourceTag,words.slice(6)))throw Error('INVENTORY_UNIQUE_INVALID');
  }else if(!validSimpleAppearanceWords(tag,words)||(n!==0&&((tag===3&&fieldCount!==2)||(tag===4&&fieldCount!==5))))throw Error('INVENTORY_UNIQUE_INVALID');
  const editable=u();if(editable>2||(editable===1&&(tag!==7||n!==4))||(editable===2&&(tag!==8||n!==3)))throw Error('INVENTORY_UNIQUE_INVALID');
  rows.set(id,{uniqueId:present?uid:null,tag,fieldCount,words,flowerEditable:editable===1,...(editable===2?{furnitureEditable:true}:{})});
 }
 if(at!==v.byteLength)throw Error('INVENTORY_UNIQUE_INVALID');
 return rows;
}

/** Exact signed integer transport. Rust alone checks native choices. */
export type FlowerVariant=[number,number,number,number];
export function isFlowerVariantWire(v:unknown):v is FlowerVariant{
 return Array.isArray(v)&&v.length===4&&v.every(n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647);
}
export function flowerVariantOf(f:{growState:number;baseColor:number;pattern:number;patternColor:number}):FlowerVariant{
 return [f.growState,f.baseColor,f.pattern,f.patternColor];
}
export function decodeFlowerVariants(bytes:Uint8Array):FlowerVariant[]{
 if(bytes.length<4)throw Error('FLOWER_OPTIONS_INVALID');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(0,true);
 if(n>100||bytes.length!==4+n*16)throw Error('FLOWER_OPTIONS_INVALID');
 return Array.from({length:n},(_,i)=>[0,1,2,3].map(j=>v.getInt32(4+i*16+j*4,true)) as FlowerVariant);
}

export type FurnitureVariant=[number,number,number];
export function isFurnitureVariantWire(v:unknown):v is FurnitureVariant{
 return Array.isArray(v)&&v.length===3&&v.every(n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647);
}
export function furnitureVariantOf(info:InventoryUniqueInfo|undefined):FurnitureVariant|null{
 return info?.tag===8&&info.words.length===3?info.words.map(n=>n|0) as FurnitureVariant:null;
}
export function decodeFurnitureVariants(bytes:Uint8Array):FurnitureVariant[]{
 if(bytes.length<4)throw Error('INVENTORY_UNIQUE_INVALID');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(0,true);
 if(n>2634||bytes.length!==4+n*12)throw Error('INVENTORY_UNIQUE_INVALID');
 return Array.from({length:n},(_,i)=>[0,1,2].map(j=>v.getInt32(4+i*12+j*4,true)) as FurnitureVariant);
}
