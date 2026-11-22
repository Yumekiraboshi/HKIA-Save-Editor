<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import type {NativeDyePalette} from './native-dye-palettes';
 import {renderDyeSprite} from './dye-recolor';

 let {sprite,palette,sourceKey='',exactArtUrl}:{
  sprite:SpriteCell;palette:NativeDyePalette;sourceKey?:string;exactArtUrl?:string
 }=$props();
 let displayedUrl=$state<string|null>(null);
 let imageSource=$state<'original'|'approximation'|'game-capture'>('original');

 $effect(()=>{
  const cell=sprite,colors=palette,key=sourceKey,exact=exactArtUrl;
  let canceled=false;
  let createdUrl:string|null=null;
  displayedUrl=null;
  imageSource='original';

  const renderApproximation=()=>{
   void renderDyeSprite(cell,colors,key).then(blob=>{
    if(canceled||!blob)return;
    createdUrl=URL.createObjectURL(blob);
    displayedUrl=createdUrl;
    imageSource='approximation';
   });
  };
  if(exact){
   // Per-ID, locally hosted verified captured image takes priority over
   // guessed 2D recoloring. Failed/corrupt/missing files fall back safely.
   const picture=new Image();
   picture.src=exact;
   void picture.decode().then(()=>{
    if(canceled)return;
    displayedUrl=exact;
    imageSource='game-capture';
   }).catch(renderApproximation);
  }else renderApproximation();

  return ()=>{
   canceled=true;
   if(createdUrl)URL.revokeObjectURL(createdUrl);
  };
 });
</script>

<!-- An original source sprite stays visible until the exact capture has
     decoded or the approximate colored image has finished rendering. -->
<span class="item-sprite"
 data-dye-rendered={displayedUrl!==null?'true':'false'}
 data-dye-source={imageSource}
 style:background-image={'url("'+(displayedUrl??sprite.url)+'")'}
 style:background-position={imageSource==='game-capture'?'center':displayedUrl?'0px 0px':'-'+sprite.x+'px -'+sprite.y+'px'}
 style:background-size={imageSource==='game-capture'?'contain':displayedUrl?'96px 96px':undefined}
 style:background-repeat={imageSource==='game-capture'?'no-repeat':undefined}></span>
