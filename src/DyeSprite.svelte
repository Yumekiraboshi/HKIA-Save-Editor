<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import type {NativeDyePalette} from './native-dye-palettes';
 import {renderDyeSprite} from './dye-recolor';

 let {sprite,palette,sourceKey=''}:{sprite:SpriteCell;palette:NativeDyePalette;sourceKey?:string}=$props();
 let coloredUrl=$state<string|null>(null);

 $effect(()=>{
  const cell=sprite,colors=palette,key=sourceKey;
  let canceled=false;
  let createdUrl:string|null=null;
  coloredUrl=null;
  void renderDyeSprite(cell,colors,key).then(blob=>{
   if(canceled||!blob)return;
   createdUrl=URL.createObjectURL(blob);
   coloredUrl=createdUrl;
  });
  return ()=>{
   canceled=true;
   if(createdUrl)URL.revokeObjectURL(createdUrl);
  };
 });
</script>

<!-- Fallback: the original native sprite remains visible until conversion finishes
     or if the source colors/neutral-fabric detection cannot be applied. -->
<span class="item-sprite"
 data-dye-rendered={coloredUrl!==null?'true':'false'}
 style:background-image={'url("'+(coloredUrl??sprite.url)+'")'}
 style:background-position={coloredUrl?'0px 0px':'-'+sprite.x+'px -'+sprite.y+'px'}
 style:background-size={coloredUrl?'96px 96px':undefined}></span>
