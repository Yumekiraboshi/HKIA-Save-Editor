<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import type {NativeDyePalette} from './native-dye-palettes';
 import {renderDyeSprite} from './dye-recolor';
 import {displayedDyeIconFidelity,isSourceColorwayUrl,isSourceFitUrl} from './item-icon-art';

 let {sprite,palette,sourceKey='',exactArtUrl,originalArtUrl,previewUrl}:{
  sprite?:SpriteCell;palette?:NativeDyePalette;sourceKey?:string;
  exactArtUrl?:string;originalArtUrl?:string;previewUrl?:string;
 }=$props();
 let displayedUrl=$state<string|null>(null);
 let imageSource=$state<'original'|'approximation'|'native-icon'|'game-render'|'game-source-sprite'|'source-fit'>('original');

 $effect(()=>{
  const cell=sprite,colors=palette,key=sourceKey,exact=exactArtUrl,original=originalArtUrl,preview=previewUrl;
  let canceled=false;
  let createdUrl:string|null=null;
  displayedUrl=null;
  imageSource='original';

  const renderApproximation=()=>{
   if(canceled||!cell||!colors)return;
   void renderDyeSprite(cell,colors,key).then(blob=>{
    if(canceled||!blob)return;
    createdUrl=URL.createObjectURL(blob);
    displayedUrl=createdUrl;
    imageSource='approximation';
   });
  };
  const showNativeIcon=()=>{
   if(canceled)return;
   if(!preview){renderApproximation();return;}
   const originalIcon=new Image();
   originalIcon.src=preview;
   void originalIcon.decode().then(()=>{
    if(canceled)return;
    displayedUrl=preview;
    if(isSourceFitUrl(preview))imageSource='source-fit';
    else imageSource='native-icon';
   }).catch(renderApproximation);
  };
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
  // A finished source sprite always outranks a reconstructed image.
  const showReconstruction=()=>{
   if(exact&&exact!==original)showExact(exact,showNativeIcon);
   else showNativeIcon();
  };
  if(original)showExact(original,showReconstruction);
  else showReconstruction();

  return ()=>{
   canceled=true;
   if(createdUrl)URL.revokeObjectURL(createdUrl);
  };
 });
</script>

<!-- Original named colorway sprites outrank approximate recolors. They are
     not classified as verified runtime renders. -->
{#if displayedUrl||sprite}
<span class="item-sprite"
 data-dye-rendered={displayedUrl!==null?'true':'false'}
 data-dye-source={imageSource}
 data-icon-fidelity={displayedDyeIconFidelity(imageSource)}
 style:background-image={'url("'+(displayedUrl??sprite?.url??'')+'")'}
 style:background-position={imageSource==='game-render'||imageSource==='game-source-sprite'||imageSource==='native-icon'||imageSource==='source-fit'?'center':displayedUrl?'0px 0px':sprite?'-'+sprite.x+'px -'+sprite.y+'px':undefined}
 style:background-size={imageSource==='game-render'?'contain':displayedUrl?'96px 96px':undefined}
 style:background-repeat={imageSource==='game-render'||imageSource==='game-source-sprite'||imageSource==='native-icon'||imageSource==='source-fit'?'no-repeat':undefined}></span>

{:else}
 <span class="item-art-empty">✧</span>
{/if}
