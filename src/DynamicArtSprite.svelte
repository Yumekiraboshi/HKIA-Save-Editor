<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import {watchDynamicArtVisibility,startDynamicArtRequest} from './dynamic-art-view';
 let {render,source,fallback,renderPartial}:{render:()=>Promise<Blob|null>;renderPartial?:()=>Promise<Blob|null>;source:'native-flower'|'native-palette'|'native-chef'|'native-wand';fallback?:SpriteCell}=$props();
 let near=$state(false);
 let url=$state<string|null>(null);
 let partial=$state(false);
 const setNear=(value:boolean)=>{near=value;};
 $effect(()=>{
  if(!near){url=null;partial=false;return;}
  return startDynamicArtRequest(render,(value,isPartial)=>{url=value;partial=!!isPartial;},renderPartial);
 });
</script>
<span use:watchDynamicArtVisibility={setNear}
 class:item-sprite={!!url||!!fallback} class:item-art-empty={!url&&!fallback}
 data-dynamic-art-source={url?source:undefined}
 data-icon-fidelity={url?(partial?'source-derived-base-only':source==='native-wand'?'source-derived-composite-unverified':'source-derived-runtime'):fallback?'species-fallback':undefined}
 style:background-image={url?'url("'+url+'")':fallback?'url("'+fallback.url+'")':undefined}
 style:background-position={url?'center':fallback?'-'+fallback.x+'px -'+fallback.y+'px':undefined}
 style:background-size={url?'96px 96px':undefined}
 style:background-repeat={url?'no-repeat':undefined}>{#if !url&&!fallback}✧{/if}</span>
