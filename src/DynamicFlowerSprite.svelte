<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import {flowerGrowthKind,type InventoryFlower,type FlowerDisplayDefinitions} from './inventory-flower-display';
 import {renderFlowerArt,renderFlowerOriginalBaseArt} from './flower-runtime-art';
 import {isStaticFlowerCreationIcon} from './flower-icon-route';
 import {loadFlowerGrowthCell} from './flower-growth-art';
 import {watchDynamicArtVisibility} from './dynamic-art-view';
 import DynamicArtSprite from './DynamicArtSprite.svelte';
 let {itemId,flower,definitions,fallback}:{itemId:number;flower:InventoryFlower;definitions:FlowerDisplayDefinitions;fallback?:SpriteCell}=$props();
 const growth=$derived(flowerGrowthKind(itemId,flower));
 let near=$state(false);
 let resolved=$state<{id:number;state:number;cell:SpriteCell}|undefined>();
 const setNear=(value:boolean)=>{near=value;};
 const growthCell=$derived(resolved?.id===itemId&&resolved.state===flower.growState?resolved.cell:undefined);
 const displayed=$derived(growthCell??fallback);
 $effect(()=>{
  const id=itemId,fields={growState:flower.growState,baseColor:flower.baseColor,pattern:flower.pattern,patternColor:flower.patternColor};
  if(!near||(growth!=='seed'&&growth!=='uprooted'))return;
  let active=true;
  void loadFlowerGrowthCell(id,fields).then(cell=>{if(active&&cell)resolved={id,state:fields.growState,cell};});
  return ()=>{active=false;};
 });
 let render=$derived.by(()=>{
  const id=itemId,defs=definitions,fields={growState:flower.growState,baseColor:flower.baseColor,pattern:flower.pattern,patternColor:flower.patternColor};
  return ()=>renderFlowerArt(id,fields,defs);
 });
 let renderPartial=$derived.by(()=>{const id=itemId,fields={growState:flower.growState,baseColor:flower.baseColor,pattern:flower.pattern,patternColor:flower.patternColor};return ()=>renderFlowerOriginalBaseArt(id,fields);});
</script>
{#if growth==='seed'||growth==='uprooted'}
 <span use:watchDynamicArtVisibility={setNear} class:item-sprite={!!displayed} class:item-art-empty={!displayed}
  data-flower-state-art={growthCell?'native-state-sprite':fallback?'species-reference':undefined}
  data-inventory-art={growthCell?'native-growth-state':undefined}
  style:background-image={displayed?'url("'+displayed.url+'")':undefined}
  style:background-position={displayed?'-'+displayed.x+'px -'+displayed.y+'px':undefined}>{#if !displayed}✧{/if}</span>
{:else if isStaticFlowerCreationIcon(itemId)}
 <span class:item-sprite={!!fallback} class:item-art-empty={!fallback} data-inventory-art="native-static-route" style:background-image={fallback?'url("'+fallback.url+'")':undefined} style:background-position={fallback?'-'+fallback.x+'px -'+fallback.y+'px':undefined}>{#if !fallback}✧{/if}</span>
{:else if growth==='unknown'}
 <span class:item-sprite={!!fallback} class:item-art-empty={!fallback} data-flower-state-art={fallback?'species-reference':undefined}
  style:background-image={fallback?'url("'+fallback.url+'")':undefined}
  style:background-position={fallback?'-'+fallback.x+'px -'+fallback.y+'px':undefined}>{#if !fallback}✧{/if}</span>
{:else}
 <DynamicArtSprite {render} {renderPartial} source="native-flower" {fallback}/>
{/if}
