/** Source-bound flower display inputs. This is not a save rule planner.
 * The native plucked-state branch chooses a pattern-specific mask, then
 * the original null-pattern mask. Unknown inputs remain unsupported.
 */
import {hasNativeFlowerArt,flowerUsesDefinitionIcon,type InventoryFlower,type FlowerDisplayDefinitions} from './inventory-flower-display';
import type {Rgba,TintSet} from './dynamic-sprite-color';
export type FlowerMaskItem={itemId:number;baseSpritePathId:string;patterns:ReadonlyArray<{patternIndex:number;maskGuid:string}>};
export type FlowerMaskIndex={items:ReadonlyArray<FlowerMaskItem>;masks:Readonly<Record<string,unknown>>};
export type FlowerAppearance={maskGuid:string;baseSpritePathId:string;tints:TintSet;cacheKey:string};
const WHITE:Rgba=[1,1,1,1];
function flowerTintInputs(flower:InventoryFlower,defs:FlowerDisplayDefinitions):TintSet|null{
 if(flower.growState!==6)return null;
 const primary=defs.colors[String(flower.baseColor)]?.rgba;
 const valid=(c:Rgba|undefined):c is Rgba=>!!c&&c.length===4&&c.every(v=>Number.isFinite(v)&&v>=0&&v<=1);
 if(!valid(primary))return null;
 // Native TryGetFlowerVisualModel resolves every non-null GUID before
 // choosing the plain/patterned tint branch. Even an unused accent must
 // resolve; do not render an invented exact appearance for unknown values.
 if(flower.patternColor!==0&&!valid(defs.colors[String(flower.patternColor)]?.rgba))return null;
 // Null native pattern has index zero in the mask manifest. An unrecognized
 // nonzero pattern is not silently treated as null.
 if(flower.pattern!==0&&!Object.hasOwn(defs.patterns,String(flower.pattern)))return null;
 const secondary=flower.pattern===0?primary:(defs.colors[String(flower.patternColor)]?.rgba??(flower.patternColor===0?WHITE:undefined));
 if(!valid(secondary))return null;
 return [primary,secondary,primary];
}
/** Stable presentation identity: native untinted definition states all use
 * the same art. Valid plain flowers ignore the unused accent, but unresolved
 * references cannot retain a previously complete colored image. */
export function flowerArtKey(itemId:number,flower:InventoryFlower|undefined,defs:FlowerDisplayDefinitions|null):string{
 if(flower&&flower.growState!==6&&flowerUsesDefinitionIcon(itemId,flower))return JSON.stringify([itemId,'definition']);
 const tints=flower&&defs&&hasNativeFlowerArt(itemId)?flowerTintInputs(flower,defs):null;
 return JSON.stringify(tints&&flower?[itemId,'plucked',flower.pattern,tints]:[itemId,'reference']);
}
export function resolveFlowerAppearance(itemId:number,flower:InventoryFlower,defs:FlowerDisplayDefinitions,index:FlowerMaskIndex):FlowerAppearance|null{
 const tints=flowerTintInputs(flower,defs);
 if(!tints)return null;
 const item=index.items.find(i=>i.itemId===itemId);
 if(!item)return null;
 // Native Refresh searches the resolved pattern first, then the null/default pattern.
 // This changes only artwork selection, not flower validity or edit eligibility.
 const chosen=item.patterns.find(p=>p.patternIndex===flower.pattern)??item.patterns.find(p=>p.patternIndex===0);
 if(!chosen||!Object.hasOwn(index.masks,chosen.maskGuid))return null;
 return {maskGuid:chosen.maskGuid,baseSpritePathId:item.baseSpritePathId,tints,
  cacheKey:JSON.stringify(['3.0.1','dynamic-sprite-color-1',itemId,item.baseSpritePathId,chosen.maskGuid,tints])};
}
