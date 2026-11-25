import type {InventoryUniqueInfo} from './inventory-unique';
import type {ChefAppearance} from './chef-appearance';
// Exact Item ID/kind binding from chef-runtime-source-v3.0.1.json.
const CAFE_IDS=new Set([203331651,406277059,905853141,973085470,1053426049,1061947263,1237708874,1338995084,1932639321]);
const BOBA_ID=1798633565;
/** Display-only projection of the typed Rust snapshot, not a save parser. */
export function inventoryChefAppearance(itemId:number,unique:InventoryUniqueInfo|undefined):ChefAppearance|null{
 if(!unique)return null;
 const {tag,fieldCount,words}=unique;
 if(tag===3&&CAFE_IDS.has(itemId)&&fieldCount===2&&words.length>=1&&words.length<=4&&words[0]===words.length-1)
  return {kind:'cafe',colors:words.slice(1).map(w=>w|0)};
 if(tag===4&&itemId===BOBA_ID&&fieldCount===5&&words.length===1)
  return {kind:'boba',colorId:words[0]|0};
 return null;
}
