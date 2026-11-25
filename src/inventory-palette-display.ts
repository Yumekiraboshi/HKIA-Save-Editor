import type {TintSet,Rgba} from './dynamic-sprite-color';
/** Typed display-only copy of native PaletteUniqueData (3 × Color). */
export type InventoryPalette=TintSet;
export const CUSTOM_PALETTE_ITEM_ID=1835273963;
export function decodeInventoryPalettes(bytes:Uint8Array,docIds:ReadonlySet<number>):Map<number,InventoryPalette>{
 if(bytes.length<4)throw Error('PALETTE_SNAPSHOT_INVALID');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(0,true);
 if(n>docIds.size||bytes.length!==4+n*52)throw Error('PALETTE_SNAPSHOT_INVALID');
 const rows=new Map<number,InventoryPalette>();
 for(let i=0;i<n;i++){
  const at=4+i*52,id=v.getUint32(at,true);
  if(!docIds.has(id)||rows.has(id))throw Error('PALETTE_SNAPSHOT_INVALID');
  const color=(offset:number):Rgba=>[0,4,8,12].map(d=>v.getFloat32(at+offset+d,true)) as unknown as Rgba;
  rows.set(id,[color(4),color(20),color(36)]);
 }
 return rows;
}
export function resolvePaletteTints(itemId:number,palette:InventoryPalette):TintSet|null{
 // The exact v3.0.1 dynamic-color definition is the customized avatar
 // palette. Do not infer that arbitrary clothing uses this icon.
 if(itemId!==CUSTOM_PALETTE_ITEM_ID||palette.length!==3||
  !palette.every(c=>c.length===4&&c.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))return null;
 return palette;
}
