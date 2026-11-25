<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import type {InventoryFlower,FlowerDisplayDefinitions} from './inventory-flower-display';
 import {renderFlowerArt} from './flower-runtime-art';
 let {itemId,flower,definitions,fallback}:{itemId:number;flower:InventoryFlower;definitions:FlowerDisplayDefinitions;fallback?:SpriteCell}=$props();
 let url=$state<string|null>(null);
 $effect(()=>{
  const id=itemId,defs=definitions,fields={growState:flower.growState,baseColor:flower.baseColor,pattern:flower.pattern,patternColor:flower.patternColor};
  let canceled=false;let created:string|null=null;url=null;
  void renderFlowerArt(id,fields,defs).then(blob=>{
   if(canceled||!blob)return;
   created=URL.createObjectURL(blob);url=created;
  });
  return ()=>{canceled=true;if(created)URL.revokeObjectURL(created);};
 });
</script>
{#if url}
 <span class="item-sprite" data-dynamic-art-source="native-flower" data-icon-fidelity="source-derived-runtime"
  style:background-image={'url("'+url+'")'} style:background-position="center" style:background-size="96px 96px" style:background-repeat="no-repeat"></span>
{:else if fallback}
 <span class="item-sprite" data-icon-fidelity="species-fallback" style:background-image={'url("'+fallback.url+'")'}
  style:background-position={'-'+fallback.x+'px -'+fallback.y+'px'}></span>
{:else}
 <span class="item-art-empty">✧</span>
{/if}
