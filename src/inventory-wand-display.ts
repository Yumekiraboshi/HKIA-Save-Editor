import type {InventoryUniqueInfo} from './inventory-unique';
import type {WandBaseAppearance} from './wand-appearance';
// Exact native v3.0.1 definition bindings from the pinned wand manifest.
const WAND_IDS=new Set([39246601,384749651,671373939,1020402601,1233735197,1304219546,1429161083,1853305820,2096979038]);
export type WandInventoryAppearance=WandBaseAppearance&{
 sourceItemId:number;styleCharacteristicId:number;
 sourceUnique:{tag:number;words:readonly number[]}|null;
};
/** Display-only projection of Rust's one-level snapshot. No recursive parse,
 * no source ID inference, no mutation, and no claim of final composite art. */
export function inventoryWandAppearance(itemId:number,unique:InventoryUniqueInfo|undefined):WandInventoryAppearance|null{
 if(!WAND_IDS.has(itemId)||unique?.tag!==9||unique.fieldCount!==5)return null;
 const w=unique.words;
 if(w.length<6||w.length>18||w[5]!==w.length-6)return null;
 const sourceItemId=w[0]|0,tag=w[4]|0;
 if(sourceItemId<0||tag< -1||tag>11||(tag===-1&&w[5]!==0))return null;
 return {sourceItemId,magicCharacteristicId:w[1]|0,fleckCharacteristicId:w[2]|0,styleCharacteristicId:w[3]|0,
  sourceUnique:tag===-1?null:{tag,words:w.slice(6)}};
}

export type WandVariant=[number,number];
export function isWandVariantWire(v:unknown):v is WandVariant{
 return Array.isArray(v)&&v.length===2&&v.every(n=>Number.isInteger(n)&&n>=-2147483648&&n<=2147483647);
}
export function wandVariantOf(info:InventoryUniqueInfo|undefined):WandVariant|null{
 return info?.tag===9&&info.fieldCount===5&&info.words.length===6&&info.words[4]===4294967295&&info.words[5]===0?[info.words[1]|0,info.words[2]|0]:null;
}
export function decodeWandVariants(bytes:Uint8Array):WandVariant[]{
 if(bytes.length<4)throw Error('WAND_OPTIONS_INVALID');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(0,true);
 if(n>36||bytes.length!==4+n*8)throw Error('WAND_OPTIONS_INVALID');
 return Array.from({length:n},(_,i)=>[v.getInt32(4+i*8,true),v.getInt32(8+i*8,true)]);
}
// Source ingredient Item ID witnesses for presentation only. Rust supplies
// all eligible variants and validates every edit, not this label map.
const materialIds=new Map<number,number>([
 [104,1500751315],[105,1878586865],[106,28996718],[107,216828669],
 [108,167866479],[109,1944158148],[110,1549110704],[111,698751747],
 [112,1864047568],[113,1334678426],[114,558340471],[115,392876538],
 [125,494126928],[126,119953162],[127,1435772717],
]);
export function wandVariantLabel(v:WandVariant,name:(item:number)=>string):string{
 return v.map(n=>materialIds.has(n)?name(materialIds.get(n)!):'—').join(' · ');
}

export type WandIdentity=[number,number,number];
export function isWandIdentityWire(v:unknown):v is WandIdentity{
 return Array.isArray(v)&&v.length===3&&v.every(n=>Number.isInteger(n)&&n>=0&&n<=2147483647);
}
export function wandIdentityOf(info:InventoryUniqueInfo|undefined):WandIdentity|null{
 const pair=wandVariantOf(info);return pair&&info?[info.words[0]|0,...pair]:null;
}
