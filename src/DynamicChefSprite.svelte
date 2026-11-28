<script lang="ts">
 import type {ChefAppearance} from './chef-appearance';
 import {renderChefArt,renderChefBaseArt} from './chef-runtime-art';
 import type {SpriteCell} from './icon-packs';
 import DynamicArtSprite from './DynamicArtSprite.svelte';
 let {itemId,appearance,fallback,originalOnly=false}:{itemId:number;appearance?:ChefAppearance|null;fallback?:SpriteCell;originalOnly?:boolean}=$props();
 const renderKey=$derived(JSON.stringify([itemId,originalOnly,originalOnly?null:appearance?.kind,originalOnly?null:appearance?.kind==='boba'?appearance.colorId:appearance?.colors]));
 let render=$derived.by(()=>{
  const id=itemId;if(originalOnly)return ()=>renderChefBaseArt(id);
  if(!appearance)return async()=>null;
  const data:ChefAppearance=appearance.kind==='boba'?{kind:'boba',colorId:appearance.colorId}:{kind:'cafe',colors:[...appearance.colors]};
  return ()=>renderChefArt(id,data);
 });
 let renderPartial=$derived.by(()=>{const id=itemId;return ()=>renderChefBaseArt(id);});
</script>
<DynamicArtSprite {renderKey} {render} {renderPartial} source="native-chef" {fallback}/>
