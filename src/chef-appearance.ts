import type {Rgba,TintSet} from './dynamic-sprite-color';
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
 // Unresolved characteristics are deliberately not shown as exact colors.
 // Native GetColor returns white when no mapped swatch exists; unknown save
 // IDs are outside our verified display coverage. Missing list entries are white.
 const out:Rgba[]=[WHITE,WHITE,WHITE];
 for(let i=0;i<ids.length;i++){
  const id=ids[i];if(!Number.isInteger(id))return null;
  const rgba=colors.get(id);if(!rgba||rgba.length!==4||!rgba.every(v=>Number.isFinite(v)&&v>=0&&v<=1))return null;
  out[i]=rgba;
 }
 return [out[0],out[1],out[2]];
}
