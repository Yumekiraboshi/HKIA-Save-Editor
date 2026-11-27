<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import type {NativeDyePalette} from './native-dye-palettes';
 import {displayedDyeIconFidelity,isSourceColorwayUrl} from './item-icon-art';

 let {sprite,exactArtUrl,originalArtUrl}:{
  sprite?:SpriteCell;palette?:NativeDyePalette;sourceKey?:string;
  exactArtUrl?:string;originalArtUrl?:string;
 }=$props();
 let displayedUrl=$state<string|null>(null);
 let imageSource=$state<'original'|'game-render'|'game-source-sprite'>('original');

 $effect(()=>{
  const exact=exactArtUrl,original=originalArtUrl;
  let canceled=false;
  displayedUrl=null;
  imageSource='original';

  const showExact=(url:string,onFailure:()=>void)=>{
   if(canceled)return;
   const picture=new Image();
   picture.src=url;
   void picture.decode().then(()=>{
    if(canceled)return;
    displayedUrl=url;
    if(isSourceColorwayUrl(url))imageSource='game-source-sprite';
    else imageSource='game-render';
   }).catch(()=>{if(!canceled)onFailure();});
  };
  // Do not recolor or fit a substitute when the original file is unavailable.
  // The unchanged original shared UiIcon is only a reference, not a colorway.
  const showSharedReference=()=>{};
  const showReconstruction=()=>{
   if(exact&&exact!==original)showExact(exact,showSharedReference);
  };
  if(original)showExact(original,showReconstruction);
  else showReconstruction();
  return ()=>{canceled=true;};
 });
</script>

{#if displayedUrl||sprite}
<span class="item-sprite"
 data-dye-rendered={displayedUrl!==null?'true':'false'}
 data-dye-source={imageSource}
 data-icon-fidelity={displayedDyeIconFidelity(imageSource)}
 style:background-image={'url("'+(displayedUrl??sprite?.url??'')+'")'}
 style:background-position={displayedUrl?'center':sprite?'-'+sprite.x+'px -'+sprite.y+'px':undefined}
 style:background-size={imageSource==='game-render'?'contain':displayedUrl?'96px 96px':undefined}
 style:background-repeat={displayedUrl?'no-repeat':undefined}></span>
{:else}
 <span class="item-art-empty">✧</span>
{/if}
