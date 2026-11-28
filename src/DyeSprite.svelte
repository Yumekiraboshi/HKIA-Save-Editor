<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import type {NativeDyePalette} from './native-dye-palettes';
 import {displayedDyeIconFidelity,isSourceColorwayUrl,isNamedOriginalItemUrl} from './item-icon-art';
 import {startOriginalArtRequest} from './original-art-view';

 let {sprite,exactArtUrl,originalArtUrl}:{
  sprite?:SpriteCell;palette?:NativeDyePalette;sourceKey?:string;
  exactArtUrl?:string;originalArtUrl?:string;
 }=$props();
 let displayedUrl=$state<string|null>(null);
 let imageSource=$state<'original'|'game-render'|'game-source-sprite'>('original');

 $effect(()=>{
  const exact=exactArtUrl,original=originalArtUrl;
  displayedUrl=null;
  imageSource='original';
  return startOriginalArtRequest(original,exact,import.meta.env.BASE_URL,url=>{
   displayedUrl=url;
   if(isSourceColorwayUrl(url)||isNamedOriginalItemUrl(url))imageSource='game-source-sprite';
   else imageSource='game-render';
  });
 });
</script>

{#if displayedUrl||sprite}
<span class="item-sprite"
 data-dye-rendered={displayedUrl!==null?'true':'false'}
 data-dye-source={imageSource}
 data-icon-fidelity={displayedDyeIconFidelity(imageSource)}
 style:background-image={'url("'+(displayedUrl??sprite?.url??'')+'")'}
 style:background-position={displayedUrl?'center':sprite?'-'+sprite.x+'px -'+sprite.y+'px':undefined}
 style:background-size={imageSource==='game-render'?'contain':displayedUrl?(isNamedOriginalItemUrl(displayedUrl)?'84px 84px':'96px 96px'):undefined}
 style:background-repeat={displayedUrl?'no-repeat':undefined}></span>
{:else}
 <span class="item-art-empty">✧</span>
{/if}
