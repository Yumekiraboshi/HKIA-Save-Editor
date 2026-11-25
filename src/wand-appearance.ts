import type {Rgba,TintSet} from './dynamic-sprite-color';
/** Native tag 9 appearance fields. The source-item overlay is a separate layer;
 * no save decoding, legality, or mutation is implemented here. */
export type WandBaseAppearance={magicCharacteristicId:number;fleckCharacteristicId:number};
export type WandColor={characteristicId:number;rgba:Rgba};
const WHITE:Rgba=[1,1,1,1];
export function resolveWandBaseTints(appearance:WandBaseAppearance,magic:ReadonlyMap<number,Rgba>,flecks:ReadonlyMap<number,Rgba>):TintSet|null{
 // Limit display to exact source mappings. Unknown IDs are not inferred.
 const first=magic.get(appearance.magicCharacteristicId);
 const second=flecks.get(appearance.fleckCharacteristicId);
 const valid=(v:Rgba|undefined):v is Rgba=>!!v&&v.length===4&&v.every(x=>Number.isFinite(x)&&x>=0&&x<=1);
 if(!valid(first)||!valid(second))return null;
 return [first,second,WHITE];
}
