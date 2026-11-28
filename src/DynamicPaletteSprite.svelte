<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import type {InventoryPalette} from './inventory-palette-display';
 import {renderPaletteArt,renderPaletteBaseArt} from './palette-runtime-art';
 import DynamicArtSprite from './DynamicArtSprite.svelte';
 let {itemId,palette,fallback}:{itemId:number;palette?:InventoryPalette|null;fallback?:SpriteCell}=$props();
 const renderKey=$derived(JSON.stringify([itemId,palette??null],(_key,value)=>typeof value==='number'&&!Number.isFinite(value)?String(value):value));
 let render=$derived.by(()=>{
  const id=itemId;if(!palette)return async()=>null;
  const colors=palette.map(c=>[...c]) as unknown as InventoryPalette;
  return ()=>renderPaletteArt(id,colors);
 });
 let renderPartial=$derived.by(()=>{const id=itemId;return ()=>renderPaletteBaseArt(id);});
</script>
<DynamicArtSprite {renderKey} {render} {renderPartial} source="native-palette" {fallback}/>
