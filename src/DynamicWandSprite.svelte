<script lang="ts">
 import {useNativeArt,inventoryArtworkAppearance} from './native-art-context';
 import NativeItemArtwork from './NativeItemArtwork.svelte';
 const getNativeSession=useNativeArt();
 const nativeSession=$derived(getNativeSession());
 import DynamicArtSprite from './DynamicArtSprite.svelte';
 import {renderWandArt,renderWandBaseArt,renderWandOriginalBaseArt} from './wand-runtime-art';
 import type {WandInventoryAppearance} from './inventory-wand-display';
 import type {SpriteCell} from './icon-packs';
 import {originalWandCellKey,type WandOriginalCell} from './wand-original-subicon';
 let {itemId,appearance,fallback,originalCell}:{itemId:number;appearance?:WandInventoryAppearance|null;fallback?:SpriteCell;originalCell?:WandOriginalCell}=$props();
 const renderKey=$derived(JSON.stringify([itemId,appearance?.sourceItemId,appearance?.magicCharacteristicId,appearance?.fleckCharacteristicId,originalCell?originalWandCellKey(originalCell):null]));
 let render=$derived.by(()=>{const id=itemId,a=appearance?{sourceItemId:appearance.sourceItemId,magicCharacteristicId:appearance.magicCharacteristicId,fleckCharacteristicId:appearance.fleckCharacteristicId}:null,source=originalCell;return ()=>a?renderWandArt(id,a,source):Promise.resolve(null);});
 let renderIntermediate=$derived.by(()=>{const id=itemId,a=appearance?{magicCharacteristicId:appearance.magicCharacteristicId,fleckCharacteristicId:appearance.fleckCharacteristicId}:null;return ()=>a?renderWandBaseArt(id,a):Promise.resolve(null);});
 let renderPartial=$derived.by(()=>{const id=itemId;return ()=>renderWandOriginalBaseArt(id);});
</script>
{#if nativeSession}
 <NativeItemArtwork {itemId} appearance={inventoryArtworkAppearance(undefined,undefined,appearance)}/>
{:else}
 <DynamicArtSprite {renderKey} {render} {renderPartial} {renderIntermediate} source="native-wand" {fallback}/>
{/if}
