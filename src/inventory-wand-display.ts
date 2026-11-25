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
