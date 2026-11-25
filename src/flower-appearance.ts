/** Source-bound flower display inputs. This is not a save rule planner.
 * Only the known plucked-state branch and explicitly mapped masks are
 * resolved here. Unsupported inputs retain the existing UI fallback.
 */
import type {InventoryFlower,FlowerDisplayDefinitions} from './inventory-flower-display';
import type {Rgba,TintSet} from './dynamic-sprite-color';
export type FlowerMaskItem={itemId:number;baseSpritePathId:string;patterns:ReadonlyArray<{patternIndex:number;maskGuid:string}>};
export type FlowerMaskIndex={items:ReadonlyArray<FlowerMaskItem>;masks:Readonly<Record<string,unknown>>};
export type FlowerAppearance={maskGuid:string;baseSpritePathId:string;tints:TintSet;cacheKey:string};
const WHITE:Rgba=[1,1,1,1];
export function resolveFlowerAppearance(itemId:number,flower:InventoryFlower,defs:FlowerDisplayDefinitions,index:FlowerMaskIndex):FlowerAppearance|null{
 if(flower.growState!==6)return null;
 const item=index.items.find(i=>i.itemId===itemId);
 if(!item)return null;
 const primary=defs.colors[String(flower.baseColor)]?.rgba;
 const valid=(c:Rgba|undefined):c is Rgba=>!!c&&c.length===4&&c.every(v=>Number.isFinite(v)&&v>=0&&v<=1);
 if(!valid(primary))return null;
 // Null native pattern has index zero in the mask manifest. An unrecognized
 // nonzero pattern is not silently treated as null.
 if(flower.pattern!==0&&!Object.hasOwn(defs.patterns,String(flower.pattern)))return null;
 const chosen=item.patterns.find(p=>p.patternIndex===flower.pattern);
 if(!chosen||!Object.hasOwn(index.masks,chosen.maskGuid))return null;
 const secondary=flower.pattern===0?primary:(defs.colors[String(flower.patternColor)]?.rgba??(flower.patternColor===0?WHITE:undefined));
 if(!valid(secondary))return null;
 const tints:TintSet=[primary,secondary,primary];
 return {maskGuid:chosen.maskGuid,baseSpritePathId:item.baseSpritePathId,tints,
  cacheKey:JSON.stringify(['3.0.1','dynamic-sprite-color-1',itemId,item.baseSpritePathId,chosen.maskGuid,tints])};
}
