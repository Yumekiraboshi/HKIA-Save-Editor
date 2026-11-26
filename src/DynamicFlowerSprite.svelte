<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import type {InventoryFlower,FlowerDisplayDefinitions} from './inventory-flower-display';
 import {renderFlowerArt} from './flower-runtime-art';
 import {isStaticFlowerCreationIcon} from './flower-icon-route';
 import DynamicArtSprite from './DynamicArtSprite.svelte';
 let {itemId,flower,definitions,fallback}:{itemId:number;flower:InventoryFlower;definitions:FlowerDisplayDefinitions;fallback?:SpriteCell}=$props();
 let render=$derived.by(()=>{
  const id=itemId,defs=definitions,fields={growState:flower.growState,baseColor:flower.baseColor,pattern:flower.pattern,patternColor:flower.patternColor};
  return ()=>renderFlowerArt(id,fields,defs);
 });
</script>
{#if isStaticFlowerCreationIcon(itemId)}
 <span class:item-sprite={!!fallback} class:item-art-empty={!fallback} data-inventory-art="native-static-route" style:background-image={fallback?'url("'+fallback.url+'")':undefined} style:background-position={fallback?'-'+fallback.x+'px -'+fallback.y+'px':undefined}>{#if !fallback}✧{/if}</span>
{:else}
 <DynamicArtSprite {render} source="native-flower" {fallback}/>
{/if}
