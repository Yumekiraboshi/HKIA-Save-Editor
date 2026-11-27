import type {InventoryUniqueInfo} from './inventory-unique';
import type {ChefAppearance} from './chef-appearance';
import {nativeIconRoute} from './native-icon-route';
/** Source-bound main-icon route even when no individual appearance is available. */
export function hasNativeChefArt(itemId:number):boolean{const route=nativeIconRoute(itemId);return route==='cafe'||route==='boba';}
/** Display-only projection of the typed Rust snapshot, not a save parser. */
export function inventoryChefAppearance(itemId:number,unique:InventoryUniqueInfo|undefined):ChefAppearance|null{
 if(!unique)return null;
 const {tag,fieldCount,words}=unique;
 if(tag===3&&nativeIconRoute(itemId)==='cafe'&&fieldCount===2&&words.length>=1&&words.length<=4&&words[0]===words.length-1)
  return {kind:'cafe',colors:words.slice(1).map(w=>w|0)};
 if(tag===4&&nativeIconRoute(itemId)==='boba'&&fieldCount===5&&words.length===1)
  return {kind:'boba',colorId:words[0]|0};
 return null;
}
