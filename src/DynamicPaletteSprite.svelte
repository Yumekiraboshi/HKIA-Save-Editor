<script lang="ts">
 import type {InventoryPalette} from './inventory-palette-display';
 import {renderPaletteArt} from './palette-runtime-art';
 let {itemId,palette}:{itemId:number;palette:InventoryPalette}=$props();
 let url=$state<string|null>(null);
 $effect(()=>{
  const id=itemId,colors=palette.map(c=>[...c]) as unknown as InventoryPalette;
  let canceled=false;let created:string|null=null;url=null;
  void renderPaletteArt(id,colors).then(blob=>{
   if(canceled||!blob)return;
   created=URL.createObjectURL(blob);url=created;
  });
  return ()=>{canceled=true;if(created)URL.revokeObjectURL(created);};
 });
</script>
{#if url}
 <span class="item-sprite" data-dynamic-art-source="native-palette" data-icon-fidelity="source-derived-runtime"
  style:background-image={'url("'+url+'")'} style:background-position="center" style:background-size="96px 96px" style:background-repeat="no-repeat"></span>
{:else}
 <span class="item-art-empty">✧</span>
{/if}
