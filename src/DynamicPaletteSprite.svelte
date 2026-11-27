<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import type {InventoryPalette} from './inventory-palette-display';
 import {renderPaletteArt} from './palette-runtime-art';
 import DynamicArtSprite from './DynamicArtSprite.svelte';
 let {itemId,palette,fallback}:{itemId:number;palette:InventoryPalette;fallback?:SpriteCell}=$props();
 let render=$derived.by(()=>{
  const id=itemId,colors=palette.map(c=>[...c]) as unknown as InventoryPalette;
  return ()=>renderPaletteArt(id,colors);
 });
</script>
<DynamicArtSprite {render} source="native-palette" {fallback}/>
