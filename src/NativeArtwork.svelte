<script lang="ts">
 import {untrack} from 'svelte';
 import {watchDynamicArtVisibility,startDynamicArtRequest} from './dynamic-art-view';
 let {render,renderKey,renderPartial,source,empty=true}:{render:()=>Promise<Blob|null>;renderKey:string;renderPartial?:()=>Promise<Blob|null>;source:string;empty?:boolean}=$props();
 let near=$state(false);
 let displayed=$state.raw<{key:string;url:string;partial:boolean}|null>(null);
 const current=$derived(near&&displayed?.key===renderKey?displayed:null);
 $effect(()=>{
  const key=renderKey;
  if(!near){displayed=null;return;}
  const [full,partial]=untrack(()=>[render,renderPartial] as const);
  return startDynamicArtRequest(full,(url,isPartial)=>{displayed=url?{key,url,partial:!!isPartial}:null;},partial);
 });
</script>
<span class="native-raster-frame" use:watchDynamicArtVisibility={(value)=>{near=value;}} data-native-art={current?source:undefined} data-icon-fidelity={current?.partial?'original-base-only':undefined}>
 {#if current}<img src={current.url} alt="" draggable="false" decoding="async"/>
 {:else if empty}<span class="item-art-empty">✧</span>{/if}
</span>
<style>
 .native-raster-frame{display:grid;place-items:center;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden}
 img{display:block;width:100%;height:100%;object-fit:contain}
 :global(.inventory-item-art)>.native-raster-frame{transform:scale(var(--inventory-icon-scale,1));}
 :global(.inventory-flower-preview-frame)>.native-raster-frame{width:96px;height:96px}
</style>
