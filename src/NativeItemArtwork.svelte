<script lang="ts">
 import NativeArtwork from './NativeArtwork.svelte';
 import {useNativeArt} from './native-art-context';
 import type {InventoryArtAppearance} from './versioned-inventory-routes';
 let {itemId,domain='inventory',appearance}:{itemId:number;domain?:'inventory'|'collection'|'definition';appearance?:InventoryArtAppearance}=$props();
 const get=useNativeArt();
 const session=$derived(get());
 const renderKey=$derived(JSON.stringify([session?.version,domain,itemId,appearance]));
 const render=$derived.by(()=>{
  const s=session,i=itemId,d=domain,a=appearance;
  return async()=>{
   if(!s)return null;
   if(d==='definition')return s.service.item.definition(i,s.version);
   const row=await (d==='collection'?s.service.item.collection(i,s.version):s.service.item.inventory(i,s.version,a));
   return row?.art instanceof Blob?row.art:null;
  };
 });
 const renderPartial=$derived.by(()=>{
  const s=session,i=itemId;
  return domain==='inventory'&&appearance?async()=>{
   const row=await s?.service.item.inventory(i,s.version);
   return row?.art instanceof Blob?row.art:null;
  }:undefined;
 });
</script>
<NativeArtwork {renderKey} {render} {renderPartial} source={domain}/>
