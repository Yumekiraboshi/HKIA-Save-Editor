<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import {startInventorySpriteRequest} from './inventory-sheet-art';
 import {watchDynamicArtVisibility} from './dynamic-art-view';
 let {sprite,source,target}:{sprite:SpriteCell;source?:'native'|'native-result';target?:number}=$props();
 let near=$state(false);
 let verified=$state<{source:SpriteCell;cell:SpriteCell}|undefined>();
 const visible=$derived(sprite.nativeSheet?verified?.source===sprite?verified.cell:undefined:sprite);
 const setNear=(value:boolean)=>{near=value;};
 $effect(()=>{
  const current=sprite;
  if(!near||!current.nativeSheet)return;
  return startInventorySpriteRequest(current,cell=>{verified=cell?{source:current,cell}:undefined;});
 });
</script>
<span use:watchDynamicArtVisibility={setNear} class:item-sprite={!!visible} class:item-art-empty={!visible}
 data-inventory-art={visible?source:source==='native-result'?'native-result-unavailable':undefined}
 data-result-icon-target={target} data-native-sheet={visible?.nativeSheet?.file}
 style:background-image={visible?'url("'+visible.url+'")':undefined}
 style:background-position={visible?'-'+visible.x+'px -'+visible.y+'px':undefined}>{#if !visible}✧{/if}</span>
