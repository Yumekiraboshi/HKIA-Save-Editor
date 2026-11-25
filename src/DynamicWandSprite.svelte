<script lang="ts">
 import DynamicArtSprite from './DynamicArtSprite.svelte';
 import {renderWandArt,renderWandBaseArt} from './wand-runtime-art';
 import type {WandInventoryAppearance} from './inventory-wand-display';
 import type {SpriteCell} from './icon-packs';
 let {itemId,appearance,fallback}:{itemId:number;appearance:WandInventoryAppearance;fallback?:SpriteCell}=$props();
 let render=$derived.by(()=>{const id=itemId,a=appearance;return ()=>renderWandArt(id,a);});
 let renderPartial=$derived.by(()=>{const id=itemId,a=appearance;return ()=>renderWandBaseArt(id,a);});
</script>
<DynamicArtSprite {render} {renderPartial} source="native-wand" {fallback}/>
