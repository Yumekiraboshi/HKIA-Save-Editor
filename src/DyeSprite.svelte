<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import type {NativeDyePalette} from './native-dye-palettes';
 import {displayedDyeIconFidelity,isSourceColorwayUrl,isNamedOriginalItemUrl} from './item-icon-art';
 import {startOriginalArtRequest} from './original-art-view';
 import {watchDynamicArtVisibility} from './dynamic-art-view';
 import {createVerifiedSpriteView} from './verified-sprite-view.svelte';

 let {sprite,exactArtUrl,originalArtUrl}:{
  sprite?:SpriteCell;palette?:NativeDyePalette;sourceKey?:string;
  exactArtUrl?:string;originalArtUrl?:string;
 }=$props();
 let near=$state(false);
 const setNear=(value:boolean)=>{near=value;};
 const identity=$derived(JSON.stringify([originalArtUrl,exactArtUrl]));
 let displayed=$state.raw<{identity:string;url:string;source:'game-render'|'game-source-sprite'}|null>(null);
 const current=$derived(near&&displayed?.identity===identity?displayed:null);
 const displayedUrl=$derived(current?.url??null);
 const imageSource=$derived(current?.source??'original');
 const fallbackView=createVerifiedSpriteView(()=>sprite,()=>near&&!displayedUrl);
 const visible=$derived(near?fallbackView.cell:undefined);

 $effect(()=>{
  const exact=exactArtUrl,original=originalArtUrl,key=identity;
  if(!near){displayed=null;return;}
  return startOriginalArtRequest(original,exact,import.meta.env.BASE_URL,url=>{
   let imageSource:'game-render'|'game-source-sprite';
   if(isSourceColorwayUrl(url)||isNamedOriginalItemUrl(url))imageSource='game-source-sprite';
   else imageSource='game-render';
   displayed={identity:key,url,source:imageSource};
  });
 });
</script>

<span use:watchDynamicArtVisibility={setNear} class:item-sprite={!!displayedUrl||!!visible} class:item-art-empty={!displayedUrl&&!visible}
 data-dye-rendered={displayedUrl||visible?displayedUrl!==null?'true':'false':undefined}
 data-dye-source={displayedUrl||visible?imageSource:undefined}
 data-icon-fidelity={displayedUrl||visible?displayedDyeIconFidelity(imageSource):undefined}
 style:background-image={displayedUrl||visible?'url("'+(displayedUrl??visible?.url??'')+'")':undefined}
 style:background-position={displayedUrl?'center':visible?'-'+visible.x+'px -'+visible.y+'px':undefined}
 style:background-size={imageSource==='game-render'?'contain':displayedUrl?(isNamedOriginalItemUrl(displayedUrl)?'84px 84px':'96px 96px'):undefined}
 style:background-repeat={displayedUrl?'no-repeat':undefined}>{#if !displayedUrl&&!visible}✧{/if}</span>
