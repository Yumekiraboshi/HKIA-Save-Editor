import type {Rgba,TintSet} from './dynamic-sprite-color';
import {resolveNativeCharacteristicTint,CHEF_MAPPED_IDS} from './native-characteristic-tint';
/** Display input only. Tag 3 uses the ordered Colors list (not Flavors);
 * tag 4 uses ColorCharacteristicId (not the other four characteristics).
 * Source save decoding and mutation remain Rust-owned. */
export type ChefAppearance={kind:'cafe';colors:readonly number[]}|{kind:'boba';colorId:number};
export type ChefColor={characteristicId:number;swatchId:number;rgba:Rgba};
export type ChefArtBinding={itemId:number;kind:ChefAppearance['kind']};
const WHITE:Rgba=[1,1,1,1];
export function resolveChefTints(binding:ChefArtBinding,appearance:ChefAppearance,colors:ReadonlyMap<number,Rgba>):TintSet|null{
 if(binding.kind!==appearance.kind)return null;
 const ids=appearance.kind==='boba'?[appearance.colorId]:appearance.colors.slice(0,3);
 // Native missing-map tints are white for known characteristics.
 // Unknown IDs and missing required swatches remain withheld.
 const out:Rgba[]=[WHITE,WHITE,WHITE];
 for(let i=0;i<ids.length;i++){
  const rgba=resolveNativeCharacteristicTint(ids[i],colors,CHEF_MAPPED_IDS);if(!rgba)return null;
  out[i]=rgba;
 }
 return [out[0],out[1],out[2]];
}
