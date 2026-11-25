<script lang="ts">
 import type {ChefAppearance} from './chef-appearance';
 import {renderChefArt} from './chef-runtime-art';
 import type {SpriteCell} from './icon-packs';
 let {itemId,appearance,fallback}:{itemId:number;appearance:ChefAppearance;fallback?:SpriteCell}=$props();
 let url=$state<string|null>(null);
 $effect(()=>{
  const id=itemId,data:ChefAppearance=appearance.kind==='boba'?{kind:'boba',colorId:appearance.colorId}:{kind:'cafe',colors:[...appearance.colors]};
  let canceled=false;let created:string|null=null;url=null;
  void renderChefArt(id,data).then(blob=>{
   if(canceled||!blob)return;
   created=URL.createObjectURL(blob);url=created;
  });
  return ()=>{canceled=true;if(created)URL.revokeObjectURL(created);};
 });
</script>
{#if url}
 <span class="item-sprite" data-dynamic-art-source="native-chef" data-icon-fidelity="source-derived-runtime"
  style:background-image={'url("'+url+'")'} style:background-position="center" style:background-size="96px 96px" style:background-repeat="no-repeat"></span>
{:else if fallback}
 <span class="item-sprite" data-icon-fidelity="species-fallback" style:background-image={'url("'+fallback.url+'")'}
  style:background-position={'-'+fallback.x+'px -'+fallback.y+'px'}></span>
{:else}
 <span class="item-art-empty">✧</span>
{/if}
