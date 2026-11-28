<script lang="ts">
 import InventoryAtlasSprite from './InventoryAtlasSprite.svelte';
 import type {SpriteCell} from './icon-packs';
 import type {IngredientBadge} from './ingredient-badges';
 let {rows,spriteFor,nameFor}:{rows:IngredientBadge[];spriteFor:(id:number)=>SpriteCell|undefined;nameFor:(id:number)=>string}=$props();
 const size=$derived(rows.length<=2?22:Math.min(20,Math.floor((64-(rows.length-1)*2)/rows.length)));
</script>
{#if rows.length}
 <span class="ingredient-badges" data-ingredient-badges style:--ingredient-size={size+'px'} style:--ingredient-scale={size/96}>
  {#each rows as badge (badge.key)}
   {@const sprite=badge.itemIds.length===1?spriteFor(badge.itemIds[0]):undefined}
   {@const title=(badge.itemIds.map(nameFor).join(' / ')||'?')+' · '+badge.slots.join(', ')}
   <span class="ingredient-badge" data-ingredient-candidates={badge.itemIds.join(',')} data-ingredient-count={badge.count} data-ingredient-slots={badge.slots.join(',')} role="img" aria-label={title} {title}>
    <span class="ingredient-art" aria-hidden="true">
     {#if sprite}<InventoryAtlasSprite {sprite}/>{:else}<span class="ingredient-unknown">?</span>{/if}
    </span>
    {#if badge.count>1}<span class="ingredient-count" aria-hidden="true">{badge.count}</span>{/if}
   </span>
  {/each}
 </span>
{/if}
<style>
 .ingredient-badges{position:absolute;z-index:1;top:0;left:50%;transform:translateX(-50%);display:flex;justify-content:center;align-items:center;gap:2px;height:22px;width:64px}
 .ingredient-badge{position:relative;display:block;flex:none;width:var(--ingredient-size);height:var(--ingredient-size)}
 .ingredient-art{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden}
 .ingredient-art :global(.item-sprite){position:absolute;top:0;left:0;width:96px;height:96px;transform:scale(var(--ingredient-scale));transform-origin:top left}
 .ingredient-art :global(.item-art-empty),.ingredient-unknown{font-size:13px;color:var(--muted)}
 .ingredient-count{position:absolute;bottom:0;right:0;min-width:10px;height:11px;border-radius:3px;background:var(--panel);color:var(--ink);font-size:9px;font-weight:700;line-height:11px;text-align:center;box-shadow:0 0 0 1px var(--line)}
</style>
