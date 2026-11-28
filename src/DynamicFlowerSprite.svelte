<script lang="ts">
 import {useNativeArt,inventoryArtworkAppearance} from './native-art-context';
 import NativeItemArtwork from './NativeItemArtwork.svelte';
 const getNativeSession=useNativeArt();
 const nativeSession=$derived(getNativeSession());
 import type {SpriteCell} from './icon-packs';
 import {flowerGrowthSpriteState,flowerUsesDefinitionIcon,type InventoryFlower,type FlowerDisplayDefinitions} from './inventory-flower-display';
 import {renderFlowerArt,renderFlowerOriginalBaseArt,renderFlowerDefinitionBaseArt} from './flower-runtime-art';
 import {flowerArtKey} from './flower-appearance';
 import {isStaticFlowerCreationIcon} from './flower-icon-route';
 import {loadFlowerGrowthCell} from './flower-growth-art';
 import {watchDynamicArtVisibility,startDynamicArtRequest} from './dynamic-art-view';
 import DynamicArtSprite from './DynamicArtSprite.svelte';
 import {createVerifiedSpriteView} from './verified-sprite-view.svelte';
 let {itemId,flower,definitions,fallback}:{itemId:number;flower?:InventoryFlower;definitions:FlowerDisplayDefinitions|null;fallback?:SpriteCell}=$props();
 const spriteState=$derived(flowerGrowthSpriteState(itemId,flower));
 let near=$state(false);
 let resolved=$state<{id:number;state:number;cell:SpriteCell|null}|undefined>();
 let baseFallback=$state.raw<{key:string;url:string}|null>(null);
 const growthKey=$derived(spriteState===undefined?null:itemId+':'+spriteState);
 const setNear=(value:boolean)=>{near=value;};
 const growthResult=$derived(resolved?.id===itemId&&resolved.state===spriteState?resolved:undefined);
 const growthCell=$derived(growthResult?.cell??undefined);
 const staticRoute=$derived(isStaticFlowerCreationIcon(itemId));
 const fallbackView=createVerifiedSpriteView(()=>fallback,()=>!nativeSession&&(staticRoute||near&&spriteState!==undefined&&!growthCell));
 const visible=$derived(fallbackView.cell);
 const displayed=$derived(growthCell??visible);
 $effect(()=>{
  if(nativeSession||!near||spriteState===undefined)return;
  const id=itemId,state=spriteState;
  // Only the normalized native sprite state affects the finished image.
  // Color, quantity and the equivalent Grown/GrownTroweled state do not.
  const fields={growState:state,baseColor:0,pattern:0,patternColor:0};
  let active=true,pending=false,loaded=false;
  const load=()=>{
   if(!active||pending||loaded)return;
   pending=true;
   void loadFlowerGrowthCell(id,fields).then(cell=>{
    if(active){loaded=!!cell;resolved={id,state,cell:cell??null};}
   }).finally(()=>{pending=false;});
  };
  window.addEventListener('online',load);
  load();
  return ()=>{active=false;window.removeEventListener('online',load);};
 });
 // If both ordinary atlas delivery and the state-specific sheet fail,
 // use the independently pinned definition template, never claim it is
 // the actual seed/plant image. The state-specific sheet still wins.
 const baseUrl=$derived(near&&growthKey!==null&&baseFallback?.key===growthKey?baseFallback.url:null);
 $effect(()=>{
  const key=growthKey,id=itemId;
  if(nativeSession||!near||key===null||growthResult?.cell!==null||visible){baseFallback=null;return;}
  return startDynamicArtRequest(()=>renderFlowerDefinitionBaseArt(id),value=>{baseFallback=value?{key,url:value}:null;});
 });
 const renderKey=$derived(flowerArtKey(itemId,flower,definitions));
 let render=$derived.by(()=>{
  const id=itemId,defs=definitions,fields=flower?{...flower}:undefined;
  // Native states 1, 2, 4 and 5 select the unmodified definition icon.
  // This is the intended main image, not a failed dynamic-color render.
  return ()=>fields&&fields.growState!==6&&flowerUsesDefinitionIcon(id,fields)
   ?renderFlowerOriginalBaseArt(id,fields)
   :fields&&defs?renderFlowerArt(id,fields,defs):Promise.resolve(null);
 });
 // A known species template remains a reference even for an unknown saved state.
 let renderPartial=$derived.by(()=>{const id=itemId;return ()=>renderFlowerDefinitionBaseArt(id);});
</script>
{#if nativeSession}
 <NativeItemArtwork {itemId} appearance={inventoryArtworkAppearance(flower)}/>
{:else if spriteState!==undefined}
 <span use:watchDynamicArtVisibility={setNear} class:item-sprite={!!displayed||!!baseUrl} class:item-art-empty={!displayed&&!baseUrl}
  data-flower-state-art={growthCell?'native-state-sprite':visible||baseUrl?'species-reference':undefined}
  data-icon-fidelity={!displayed&&baseUrl?'source-derived-base-only':undefined}
  data-inventory-art={growthCell?'native-growth-state':undefined}
  style:background-image={displayed?'url("'+displayed.url+'")':baseUrl?'url("'+baseUrl+'")':undefined}
  style:background-position={displayed?'-'+displayed.x+'px -'+displayed.y+'px':baseUrl?'center':undefined}
  style:background-size={!displayed&&baseUrl?'96px 96px':undefined}
  style:background-repeat={!displayed&&baseUrl?'no-repeat':undefined}>{#if !displayed&&!baseUrl}✧{/if}</span>
{:else if staticRoute}
 <span class:item-sprite={!!visible} class:item-art-empty={!visible} data-inventory-art="native-static-route" style:background-image={visible?'url("'+visible.url+'")':undefined} style:background-position={visible?'-'+visible.x+'px -'+visible.y+'px':undefined}>{#if !visible}✧{/if}</span>
{:else}
 <DynamicArtSprite {renderKey} {render} {renderPartial} source="native-flower" {fallback}/>
{/if}
