<script lang="ts">
 import {untrack} from 'svelte';
 import type {SpriteCell} from './icon-packs';
 import {watchDynamicArtVisibility,startDynamicArtRequest} from './dynamic-art-view';
 let {render,source,fallback,renderPartial,renderIntermediate,renderKey}:{renderKey?:string;render:()=>Promise<Blob|null>;renderPartial?:()=>Promise<Blob|null>;renderIntermediate?:()=>Promise<Blob|null>;source:'native-flower'|'native-palette'|'native-chef'|'native-wand'|'native-placeholder';fallback?:SpriteCell}=$props();
 let near=$state(false);
 // Primitive appearance keys survive snapshot recreation and quantity-only
 // edits. A changed appearance hides the preceding URL before an effect runs.
 const identity=$derived(renderKey??render);
 let displayed=$state.raw<{identity:string|(()=>Promise<Blob|null>);url:string;partial:boolean}|null>(null);
 const current=$derived(near&&displayed?.identity===identity?displayed:null);
 const url=$derived(current?.url??null);
 const partial=$derived(current?.partial??false);
 const setNear=(value:boolean)=>{near=value;};
 $effect(()=>{
  const key=identity;
  if(!near){displayed=null;return;}
  const [full,base,intermediate]=untrack(()=>[render,renderPartial,renderIntermediate] as const);
  return startDynamicArtRequest(full,(value,isPartial)=>{displayed=value?{identity:key,url:value,partial:!!isPartial}:null;},base,intermediate);
 });
</script>
<span use:watchDynamicArtVisibility={setNear}
 class:item-sprite={!!url||!!fallback} class:item-art-empty={!url&&!fallback}
 data-dynamic-art-source={url?source:undefined}
 data-icon-fidelity={url?(partial?'source-derived-base-only':source==='native-placeholder'?'game-original-placeholder':source==='native-wand'?'source-derived-composite-unverified':'source-derived-runtime'):fallback?(source==='native-flower'?'species-fallback':'original-template-fallback'):undefined}
 style:background-image={url?'url("'+url+'")':fallback?'url("'+fallback.url+'")':undefined}
 style:background-position={url?'center':fallback?'-'+fallback.x+'px -'+fallback.y+'px':undefined}
 style:background-size={url?'96px 96px':undefined}
 style:background-repeat={url?'no-repeat':undefined}>{#if !url&&!fallback}✧{/if}</span>
