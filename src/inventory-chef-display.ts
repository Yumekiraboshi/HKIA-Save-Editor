import type {InventoryUniqueInfo} from './inventory-unique';
import type {ChefAppearance} from './chef-appearance';
import type {CafeRow,CafeVariant} from './inventory-cafe-display';
import type {InventoryBoba,BobaVariant} from './inventory-boba-display';
import {nativeIconRoute} from './native-icon-route';
/** Source-bound main-icon route even when no individual appearance is available. */
export function hasNativeChefArt(itemId:number):boolean{const route=nativeIconRoute(itemId);return route==='cafe'||route==='boba';}
/** Translate a Rust-issued draft/default tuple to the actual display inputs.
 * Cafe uses ordered slots with zero suffix padding; never shift a later
 * color into an absent earlier slot. No new appearance or edit permission. */
export function chefDraftAppearance(itemId:number,variant:CafeVariant|BobaVariant):ChefAppearance|null{
 const route=nativeIconRoute(itemId);
 if(route==='boba'&&variant.length===5&&Number.isInteger(variant[0])&&variant[0]>0)
  return {kind:'boba',colorId:variant[0]};
 if(route!=='cafe'||variant.length!==6)return null;
 const colors:number[]=[];
 let ended=false;
 for(let i=0;i<3;i++){
  const flavor=variant[i],color=variant[i+3];
  if(flavor===0&&color===0){ended=true;continue;}
  if(ended||!Number.isInteger(flavor)||flavor<=0||!Number.isInteger(color)||color<=0)return null;
  colors.push(color);
 }
 return colors.length?{kind:'cafe',colors}:null;
}
/** Display-only projection of the typed Rust snapshot, not a save parser.
 * Absent Add rows have no unique payload but can carry a Rust-issued starter. */
export function inventoryChefAppearance(itemId:number,unique:InventoryUniqueInfo|undefined,cafe?:CafeRow,boba?:InventoryBoba):ChefAppearance|null{
 if(!unique){
  const candidate=cafe?.creationOnly?cafe.variant:boba?.creationOnly?boba.variant:undefined;
  return candidate?chefDraftAppearance(itemId,candidate):null;
 }
 const {tag,fieldCount,words}=unique;
 if(tag===3&&nativeIconRoute(itemId)==='cafe'&&fieldCount===2&&words.length>=1&&words.length<=4&&words[0]===words.length-1)
  return {kind:'cafe',colors:words.slice(1).map(w=>w|0)};
 if(tag===4&&nativeIconRoute(itemId)==='boba'&&fieldCount===5&&words.length===1)
  return {kind:'boba',colorId:words[0]|0};
 return null;
}
