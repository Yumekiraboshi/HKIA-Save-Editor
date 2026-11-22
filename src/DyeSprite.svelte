<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import type {NativeDyePalette} from './native-dye-palettes';
 import {renderDyeSprite} from './dye-recolor';

 let {sprite,palette,sourceKey='',exactArtUrl,previewUrl}:{
  sprite:SpriteCell;palette:NativeDyePalette;sourceKey?:string;
  exactArtUrl?:string;previewUrl?:string;
 }=$props();
 let displayedUrl=$state<string|null>(null);
 let imageSource=$state<'original'|'approximation'|'native-icon'|'game-render'>('original');

 $effect(()=>{
  const cell=sprite,colors=palette,key=sourceKey,exact=exactArtUrl,preview=previewUrl;
  let canceled=false;
  let createdUrl:string|null=null;
  displayedUrl=null;
  imageSource='original';

  const renderApproximation=()=>{
   if(canceled)return;
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
    imageSource='native-icon';
   }).catch(renderApproximation);
  };
  if(exact){
   // A source-validated item icon may outrank an approximate 2D recolor.
   // An alternate 3D pose is not a replacement for the game's UiIcon.
   const picture=new Image();
   picture.src=exact;
   void picture.decode().then(()=>{
    if(canceled)return;
    displayedUrl=exact;
    imageSource='game-render';
   }).catch(showNativeIcon);
  }else showNativeIcon();

  return ()=>{
   canceled=true;
   if(createdUrl)URL.revokeObjectURL(createdUrl);
  };
 });
</script>

<!-- Always retain the actual HKIA UiIcon silhouette.
     The game-original atlas is used until recoloring becomes available. -->
<span class="item-sprite"
 data-dye-rendered={displayedUrl!==null?'true':'false'}
 data-dye-source={imageSource}
 style:background-image={'url("'+(displayedUrl??sprite.url)+'")'}
 style:background-position={imageSource==='game-render'||imageSource==='native-icon'?'center':displayedUrl?'0px 0px':'-'+sprite.x+'px -'+sprite.y+'px'}
 style:background-size={imageSource==='game-render'?'contain':displayedUrl?'96px 96px':undefined}
 style:background-repeat={imageSource==='game-render'||imageSource==='native-icon'?'no-repeat':undefined}></span>
