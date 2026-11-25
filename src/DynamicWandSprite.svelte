<script lang="ts">
 import DynamicArtSprite from './DynamicArtSprite.svelte';
 import {renderWandMagicArt} from './wand-runtime-art';
 import type {WandInventoryAppearance} from './inventory-wand-display';
 import type {SpriteCell} from './icon-packs';
 let {itemId,appearance,fallback}:{itemId:number;appearance:WandInventoryAppearance;fallback?:SpriteCell}=$props();
 let render=$derived.by(()=>{const id=itemId,a=appearance;return ()=>renderWandMagicArt(id,a);});
</script>
<DynamicArtSprite {render} source="native-wand" {fallback}/>
