<script lang="ts">
 import {useNativeArt,inventoryArtworkAppearance} from './native-art-context';
 import NativeItemArtwork from './NativeItemArtwork.svelte';
 const getNativeSession=useNativeArt();
 const nativeSession=$derived(getNativeSession());
 import type {SpriteCell} from './icon-packs';
 import {paletteArtKey,type InventoryPalette} from './inventory-palette-display';
 import {renderPaletteArt,renderPaletteBaseArt} from './palette-runtime-art';
 import DynamicArtSprite from './DynamicArtSprite.svelte';
 let {itemId,palette,fallback}:{itemId:number;palette?:InventoryPalette|null;fallback?:SpriteCell}=$props();
 const renderKey=$derived(paletteArtKey(itemId,palette));
 let render=$derived.by(()=>{
  const id=itemId;if(!palette)return async()=>null;
  const colors=palette.map(c=>[...c]) as unknown as InventoryPalette;
  return ()=>renderPaletteArt(id,colors);
 });
 let renderPartial=$derived.by(()=>{const id=itemId;return ()=>renderPaletteBaseArt(id);});
</script>
{#if nativeSession}
 <NativeItemArtwork {itemId} appearance={inventoryArtworkAppearance(undefined,undefined,undefined,palette)}/>
{:else}
 <DynamicArtSprite {renderKey} {render} {renderPartial} source="native-palette" {fallback}/>
{/if}
