<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import {createVerifiedSpriteView} from './verified-sprite-view.svelte';
 import {watchDynamicArtVisibility} from './dynamic-art-view';
 let {sprite,source,target}:{sprite:SpriteCell;source?:'native'|'native-result';target?:number}=$props();
 let near=$state(false);
 const view=createVerifiedSpriteView(()=>sprite,()=>near);
 const visible=$derived(view.cell);
 const setNear=(value:boolean)=>{near=value;};
</script>
<span use:watchDynamicArtVisibility={setNear} class:item-sprite={!!visible} class:item-art-empty={!visible}
 data-inventory-art={visible?source:source==='native-result'?'native-result-unavailable':undefined}
 data-result-icon-target={target} data-native-sheet={visible?.nativeSheet?.file}
 style:background-image={visible?'url("'+visible.url+'")':undefined}
 style:background-position={visible?'-'+visible.x+'px -'+visible.y+'px':undefined}>{#if !visible}✧{/if}</span>
