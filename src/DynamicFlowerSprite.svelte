<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import type {InventoryFlower,FlowerDisplayDefinitions} from './inventory-flower-display';
 import {renderFlowerArt} from './flower-runtime-art';
 import DynamicArtSprite from './DynamicArtSprite.svelte';
 let {itemId,flower,definitions,fallback}:{itemId:number;flower:InventoryFlower;definitions:FlowerDisplayDefinitions;fallback?:SpriteCell}=$props();
 let render=$derived.by(()=>{
  const id=itemId,defs=definitions,fields={growState:flower.growState,baseColor:flower.baseColor,pattern:flower.pattern,patternColor:flower.patternColor};
  return ()=>renderFlowerArt(id,fields,defs);
 });
</script>
<DynamicArtSprite {render} source="native-flower" {fallback}/>
