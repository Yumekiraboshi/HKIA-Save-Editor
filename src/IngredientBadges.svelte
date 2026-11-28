<script lang="ts">
 import NativeItemArtwork from './NativeItemArtwork.svelte';
 import {useNativeArt} from './native-art-context';
 const getNativeSession=useNativeArt();
 const nativeSession=$derived(getNativeSession());
 import InventoryAtlasSprite from './InventoryAtlasSprite.svelte';
 import type {SpriteCell} from './icon-packs';
 import type {IngredientBadge} from './ingredient-badges';
 import {ingredientFlavorOnlyLabel} from './ingredient-identification';
 let {rows,spriteFor,nameFor,locale='en'}:{rows:IngredientBadge[];spriteFor:(id:number)=>SpriteCell|undefined;nameFor:(id:number)=>string;locale?:string}=$props();
 let laneWidth=$state(64);
 const size=$derived(Math.min(22,Math.max(1,Math.floor((laneWidth-(rows.length-1)*2)/Math.max(1,rows.length)))));
 const smallScale=$derived(size*.66/96);
</script>
{#if rows.length}
 <span class="ingredient-badges" data-ingredient-badges class:wide={rows.length>=4} bind:clientWidth={laneWidth} style:--ingredient-size={size+'px'} style:--ingredient-scale={size/96} style:--ingredient-candidate-scale={smallScale}>
  {#each rows as badge (badge.key)}
   {@const sprites=badge.itemIds.map(spriteFor)}
   {@const sprite=sprites.length===1?sprites[0]:undefined}
   {@const columns=Math.ceil(Math.sqrt(sprites.length))}
   {@const title=(badge.itemIds.map(nameFor).join(' / ')||'?')+(badge.count>1?' · '+badge.count:'')+(badge.flavorOnly?' · '+ingredientFlavorOnlyLabel(locale):'')}
   <span class="ingredient-badge" data-ingredient-candidates={badge.itemIds.join(',')} data-ingredient-count={badge.count} data-ingredient-key={badge.key} data-ingredient-match={badge.flavorOnly?'flavor':badge.itemIds.length?'exact':'unresolved'} data-ingredient-slots={badge.slots.join(',')} role="img" aria-label={title} {title}>
    <span class="ingredient-art" aria-hidden="true">
     {#if nativeSession&&badge.itemIds.length===1}
      <NativeItemArtwork domain="definition" itemId={badge.itemIds[0]}/>
     {:else if nativeSession&&badge.itemIds.length===2}
      {#each badge.itemIds as id,i}
       <span class="ingredient-candidate" class:second={i===1}><NativeItemArtwork domain="definition" itemId={id}/></span>
      {/each}
     {:else if nativeSession&&badge.itemIds.length>2}
      <span class="ingredient-candidate-grid" style:grid-template-columns={`repeat(${columns},minmax(0,1fr))`}>
       {#each badge.itemIds as id}<span class="ingredient-grid-cell"><NativeItemArtwork domain="definition" itemId={id}/></span>{/each}
      </span>
     {:else if sprite}<InventoryAtlasSprite {sprite}/>
     {:else if sprites.length===2&&sprites.some(Boolean)}
      {#each sprites as candidate,i}
       <span class="ingredient-candidate" class:second={i===1}>{#if candidate}<InventoryAtlasSprite sprite={candidate}/>{:else}<span class="ingredient-missing">✧</span>{/if}</span>
      {/each}
     {:else if sprites.length>2&&sprites.some(Boolean)}
      <span class="ingredient-candidate-grid" style:grid-template-columns={`repeat(${columns},minmax(0,1fr))`} style:--candidate-grid-scale={size/columns/96}>
       {#each sprites as candidate}
        <span class="ingredient-grid-cell">{#if candidate}<InventoryAtlasSprite sprite={candidate}/>{:else}<span class="ingredient-missing">✧</span>{/if}</span>
       {/each}
      </span>
     {:else}<span class="ingredient-unknown">{badge.itemIds.length===0?'?':'✧'}</span>{/if}
    </span>

    {#if badge.count>1}<span class="ingredient-count" aria-hidden="true">{badge.count}</span>{/if}
   </span>
  {/each}
 </span>
{/if}
<style>
 .ingredient-badges{position:absolute;z-index:1;top:0;left:50%;transform:translateX(-50%);display:flex;justify-content:center;align-items:center;gap:2px;height:22px;width:min(94px,calc(100% - 46px));direction:ltr}
 :global(.inventory-card:has(>.inventory-stack-delete)) .ingredient-badges.wide{width:min(94px,calc(100% - 30px));left:calc(50% - 10px)}
 :global(.inventory-card:has(>.inventory-batch-checkbox)) .ingredient-badges.wide{width:min(94px,calc(100% - 30px));left:calc(50% + 10px)}
 :global([dir="rtl"] .inventory-card:has(>.inventory-stack-delete)) .ingredient-badges.wide{left:calc(50% + 10px)}
 :global([dir="rtl"] .inventory-card:has(>.inventory-batch-checkbox)) .ingredient-badges.wide{left:calc(50% - 10px)}
 :global(.inventory-card:has(>.inventory-lock-button):has(>.inventory-stack-delete)) .ingredient-badges.wide,
 :global(.inventory-card:has(>.inventory-lock-button):has(>.inventory-batch-checkbox)) .ingredient-badges.wide{width:min(94px,calc(100% - 52px));left:50%}
 :global([dir="rtl"] .inventory-card:has(>.inventory-lock-button):has(>.inventory-stack-delete)) .ingredient-badges.wide,
 :global([dir="rtl"] .inventory-card:has(>.inventory-lock-button):has(>.inventory-batch-checkbox)) .ingredient-badges.wide{left:50%}
 :global(.inventory-flower-preview-frame) .ingredient-badges{width:min(94px,100%)}
 .ingredient-badge{position:relative;display:block;flex:none;width:var(--ingredient-size);height:var(--ingredient-size)}
 .ingredient-art{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden}
 .ingredient-art :global(.item-sprite){position:absolute;top:0;left:0;width:96px;height:96px;transform:scale(var(--ingredient-scale));transform-origin:top left}
 .ingredient-art :global(.item-art-empty),.ingredient-unknown{font-size:13px;color:var(--muted)}
 .ingredient-candidate{position:absolute;top:0;left:0;width:66%;height:66%;overflow:hidden}
 .ingredient-candidate.second{top:auto;left:auto;bottom:0;right:0}
 .ingredient-candidate :global(.item-sprite){transform:scale(var(--ingredient-candidate-scale))}
 .ingredient-candidate-grid{display:grid;width:100%;height:100%;align-content:center}
 .ingredient-grid-cell{position:relative;aspect-ratio:1;overflow:hidden}
 .ingredient-grid-cell :global(.item-sprite){transform:scale(var(--candidate-grid-scale))}
 .ingredient-missing{display:grid;place-items:center;width:100%;height:100%;font-size:8px;color:var(--muted)}
 .ingredient-count{position:absolute;bottom:0;right:0;min-width:10px;height:11px;border-radius:3px;background:var(--panel);color:var(--ink);font-size:9px;font-weight:700;line-height:11px;text-align:center;box-shadow:0 0 0 1px var(--line)}
</style>
