/** Typed view of Rust-owned native unique-data snapshot; no save rules. */
export type InventoryUniqueInfo={uniqueId:number|null;tag:number;fieldCount:number;words:number[];flowerColors:number[]};
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
   (n!==0&&n!==(tag===6?12:tag===7?4:tag===8?3:0)))throw Error('INVENTORY_UNIQUE_INVALID');
  const words=Array.from({length:n},()=>u());
  const m=u();if(m>30||(m>0&&(tag!==7||n!==4)))throw Error('INVENTORY_UNIQUE_INVALID');
  const flowerColors=Array.from({length:m},()=>i());
  if(new Set(flowerColors).size!==m||flowerColors.some(x=>x<1||x>30))throw Error('INVENTORY_UNIQUE_INVALID');
  rows.set(id,{uniqueId:present?uid:null,tag,fieldCount,words,flowerColors});
 }
 if(at!==v.byteLength)throw Error('INVENTORY_UNIQUE_INVALID');
 return rows;
}
