<script lang="ts">
 import type {ChefAppearance} from './chef-appearance';
 import {renderChefArt} from './chef-runtime-art';
 import type {SpriteCell} from './icon-packs';
 import DynamicArtSprite from './DynamicArtSprite.svelte';
 let {itemId,appearance,fallback}:{itemId:number;appearance:ChefAppearance;fallback?:SpriteCell}=$props();
 let render=$derived.by(()=>{
  const id=itemId,data:ChefAppearance=appearance.kind==='boba'?{kind:'boba',colorId:appearance.colorId}:{kind:'cafe',colors:[...appearance.colors]};
  return ()=>renderChefArt(id,data);
 });
</script>
<DynamicArtSprite {render} source="native-chef" {fallback}/>
