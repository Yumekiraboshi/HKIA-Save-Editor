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
  !palette.every(c=>c.length===4&&c.every(Number.isFinite)&&c.slice(0,3).every(v=>v>=0&&v<=1)))return null;
 // The native Dynamic Sprite Color pixel program reads tint RGB only.
 // Canonicalize the display/cache identity, never the saved float words.
 return palette.every(c=>c[3]===1)?palette:palette.map(c=>[c[0],c[1],c[2],1] as Rgba) as unknown as TintSet;
}

/** Display identity uses the exact same validated shader inputs as the
 * runtime renderer. Invalid or absent appearances share the reference-only
 * identity; neither can reuse a previously colored image. */
export function paletteArtKey(itemId:number,palette:InventoryPalette|null|undefined):string{
 return JSON.stringify([itemId,palette?resolvePaletteTints(itemId,palette):null]);
}

/** Exact unsigned words for transport/history. Float conversion is display-only. */
export type PaletteVariant=number[];
export function isPaletteVariantWire(value:unknown):value is PaletteVariant{
 return Array.isArray(value)&&value.length===12&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=4294967295);
}
export function paletteVariantOf(unique:{tag:number;words:number[]}|undefined):PaletteVariant|null{
 return unique?.tag===6&&isPaletteVariantWire(unique.words)?[...unique.words]:null;
}
export function decodePaletteVariants(bytes:Uint8Array):PaletteVariant[]{
 if(bytes.length<4)throw Error('PALETTE_OPTIONS_INVALID');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(0,true);
 if(n>438||bytes.length!==4+n*48)throw Error('PALETTE_OPTIONS_INVALID');
 return Array.from({length:n},(_,i)=>Array.from({length:12},(_,j)=>v.getUint32(4+i*48+j*4,true)));
}
export function paletteFromWords(words:PaletteVariant):InventoryPalette{
 const v=new DataView(new ArrayBuffer(4));
 const color=(slot:number)=>Array.from({length:4},(_,i)=>{v.setUint32(0,words[4*slot+i],true);return v.getFloat32(0,true)}) as unknown as Rgba;
 return [color(0),color(1),color(2)];
}
export function paletteColorHex(words:PaletteVariant,slot:number):string{
 return '#'+paletteFromWords(words)[slot].slice(0,3).map(n=>Math.round(Math.max(0,Math.min(1,n))*255).toString(16).padStart(2,'0')).join('');
}

/** Display-only composition of user-selected native color options. No edit authorization. */
export function paletteSelectChannel(current:PaletteVariant,option:PaletteVariant,slot:number):PaletteVariant{
 if(!isPaletteVariantWire(current)||!isPaletteVariantWire(option)||!Number.isInteger(slot)||slot<0||slot>2)return [...current];
 return current.map((word,i)=>Math.floor(i/4)===slot?option[i]:word);
}
export function paletteChannelEqual(a:PaletteVariant,b:PaletteVariant,slot:number):boolean{
 return a.slice(slot*4,slot*4+4).every((word,i)=>word===b[slot*4+i]);
}
/** UI hint: each selected channel was offered for this same source. The native
 * full-tuple CAS independently decides eligibility, equality and collisions. */
export function paletteCreationSelection(before:PaletteVariant,target:PaletteVariant,options:readonly PaletteVariant[]):boolean{
 return options.length>0&&!before.every((word,i)=>word===target[i])&&[0,1,2].every(slot=>
  paletteChannelEqual(before,target,slot)||options.some(option=>paletteChannelEqual(option,target,slot)));
}

/** Presentation-only swatches for a saved palette in the removal confirmation. */
export function paletteRemovalSwatches(palette:InventoryPalette|undefined):string[]{
 if(!palette||palette.length!==3||!palette.every(c=>c.length===4&&c.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))return [];
 return palette.map(c=>'rgba('+c.slice(0,3).map(n=>Math.round(n*255)).join(',')+','+c[3]+')');
}
