import type {Rgba,TintSet} from './dynamic-sprite-color';
import {resolveNativeCharacteristicTint,MAGIC_MAPPED_IDS,FLECK_MAPPED_IDS} from './native-characteristic-tint';
/** Native tag 9 appearance fields. The source-item overlay is a separate layer;
 * no save decoding, legality, or mutation is implemented here. */
export type WandBaseAppearance={magicCharacteristicId:number;fleckCharacteristicId:number};
export type WandColor={characteristicId:number;rgba:Rgba};
const WHITE:Rgba=[1,1,1,1];
export function resolveWandBaseTints(appearance:WandBaseAppearance,magic:ReadonlyMap<number,Rgba>,flecks:ReadonlyMap<number,Rgba>,source?:{known:ReadonlySet<number>;magic:ReadonlySet<number>;flecks:ReadonlySet<number>}):TintSet|null{
 // Native absent-map paths leave the corresponding tint white.
 const first=resolveNativeCharacteristicTint(appearance.magicCharacteristicId,magic,source?.magic??MAGIC_MAPPED_IDS,source?.known);
 const second=resolveNativeCharacteristicTint(appearance.fleckCharacteristicId,flecks,source?.flecks??FLECK_MAPPED_IDS,source?.known);
 if(!first||!second)return null;
 return [first,second,WHITE];
}
