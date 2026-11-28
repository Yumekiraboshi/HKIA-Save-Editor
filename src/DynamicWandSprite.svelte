<script lang="ts">
 import DynamicArtSprite from './DynamicArtSprite.svelte';
 import {renderWandArt,renderWandBaseArt,renderWandOriginalBaseArt} from './wand-runtime-art';
 import type {WandInventoryAppearance} from './inventory-wand-display';
 import type {SpriteCell} from './icon-packs';
 import type {WandOriginalCell} from './wand-original-subicon';
 let {itemId,appearance,fallback,originalCell}:{itemId:number;appearance?:WandInventoryAppearance|null;fallback?:SpriteCell;originalCell?:WandOriginalCell}=$props();
 let render=$derived.by(()=>{const id=itemId,a=appearance,source=originalCell;return ()=>a?renderWandArt(id,a,source):Promise.resolve(null);});
 let renderIntermediate=$derived.by(()=>{const id=itemId,a=appearance;return ()=>a?renderWandBaseArt(id,a):Promise.resolve(null);});
 let renderPartial=$derived.by(()=>{const id=itemId;return ()=>renderWandOriginalBaseArt(id);});
</script>
<DynamicArtSprite {render} {renderPartial} {renderIntermediate} source="native-wand" {fallback}/>
