<script lang="ts">
 import type {SpriteCell} from './icon-packs';
 import {flowerGrowthKind,flowerGrowthSpriteState,flowerUsesDefinitionIcon,type InventoryFlower,type FlowerDisplayDefinitions} from './inventory-flower-display';
 import {renderFlowerArt,renderFlowerOriginalBaseArt,renderFlowerDefinitionBaseArt} from './flower-runtime-art';
 import {isStaticFlowerCreationIcon} from './flower-icon-route';
 import {loadFlowerGrowthCell} from './flower-growth-art';
 import {watchDynamicArtVisibility} from './dynamic-art-view';
 import DynamicArtSprite from './DynamicArtSprite.svelte';
 import {createVerifiedSpriteView} from './verified-sprite-view.svelte';
 let {itemId,flower,definitions,fallback}:{itemId:number;flower?:InventoryFlower;definitions:FlowerDisplayDefinitions|null;fallback?:SpriteCell}=$props();
 const growth=$derived(flowerGrowthKind(itemId,flower));
 const spriteState=$derived(flowerGrowthSpriteState(itemId,flower));
 let near=$state(false);
 let resolved=$state<{id:number;state:number;cell:SpriteCell}|undefined>();
 const setNear=(value:boolean)=>{near=value;};
 const growthCell=$derived(resolved?.id===itemId&&resolved.state===flower?.growState?resolved.cell:undefined);
 const staticRoute=$derived(isStaticFlowerCreationIcon(itemId));
 const unknownRoute=$derived(growth==='unknown'&&!flowerUsesDefinitionIcon(itemId,flower));
 const fallbackView=createVerifiedSpriteView(()=>fallback,()=>staticRoute||unknownRoute||near&&spriteState!==undefined&&!growthCell);
 const visible=$derived(fallbackView.cell);
 const displayed=$derived(growthCell??visible);
 $effect(()=>{
  if(!flower||!near||spriteState===undefined)return;
  const id=itemId,fields={...flower};
  let active=true,pending=false,loaded=false;
  const load=()=>{
   if(!active||pending||loaded)return;
   pending=true;
   void loadFlowerGrowthCell(id,fields).then(cell=>{
    if(active&&cell){loaded=true;resolved={id,state:fields.growState,cell};}
   }).finally(()=>{pending=false;});
  };
  window.addEventListener('online',load);
  load();
  return ()=>{active=false;window.removeEventListener('online',load);};
 });
 const renderKey=$derived(JSON.stringify([itemId,flower?.growState,flower?.baseColor,flower?.pattern,flower?.patternColor,!!definitions]));
 let render=$derived.by(()=>{
  const id=itemId,defs=definitions,fields=flower?{...flower}:undefined;
  // Native states 1, 2, 4 and 5 select the unmodified definition icon.
  // This is the intended main image, not a failed dynamic-color render.
  return ()=>fields&&fields.growState!==6&&flowerUsesDefinitionIcon(id,fields)
   ?renderFlowerOriginalBaseArt(id,fields)
   :fields&&defs?renderFlowerArt(id,fields,defs):Promise.resolve(null);
 });
 let renderPartial=$derived.by(()=>{const id=itemId,fields=flower?{...flower}:undefined;return ()=>fields?renderFlowerOriginalBaseArt(id,fields):renderFlowerDefinitionBaseArt(id);});
</script>
{#if spriteState!==undefined}
 <span use:watchDynamicArtVisibility={setNear} class:item-sprite={!!displayed} class:item-art-empty={!displayed}
  data-flower-state-art={growthCell?'native-state-sprite':visible?'species-reference':undefined}
  data-inventory-art={growthCell?'native-growth-state':undefined}
  style:background-image={displayed?'url("'+displayed.url+'")':undefined}
  style:background-position={displayed?'-'+displayed.x+'px -'+displayed.y+'px':undefined}>{#if !displayed}✧{/if}</span>
{:else if staticRoute}
 <span class:item-sprite={!!visible} class:item-art-empty={!visible} data-inventory-art="native-static-route" style:background-image={visible?'url("'+visible.url+'")':undefined} style:background-position={visible?'-'+visible.x+'px -'+visible.y+'px':undefined}>{#if !visible}✧{/if}</span>
{:else if unknownRoute}
 <span class:item-sprite={!!visible} class:item-art-empty={!visible} data-flower-state-art={visible?'species-reference':undefined}
  style:background-image={visible?'url("'+visible.url+'")':undefined}
  style:background-position={visible?'-'+visible.x+'px -'+visible.y+'px':undefined}>{#if !visible}✧{/if}</span>
{:else}
 <DynamicArtSprite {renderKey} {render} {renderPartial} source="native-flower" {fallback}/>
{/if}
