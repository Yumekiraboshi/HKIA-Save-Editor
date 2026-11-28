<script lang="ts">
 import NativeArtwork from './NativeArtwork.svelte';
 import {useNativeArt} from './native-art-context';
 let {domain,key,detail=false}:{domain:'achievement'|'collection'|'inventory';key:string;detail?:boolean}=$props();
 const get=useNativeArt(),session=$derived(get());
 const renderKey=$derived(JSON.stringify([session?.version,domain,key,detail]));
 const render=$derived.by(()=>{
  const s=session,d=domain,k=key,showDetail=detail;
  return async()=>{
   if(!s)return null;
   const row=await (d==='achievement'?s.service.achievement?.artwork(k,s.version,showDetail):s.service.category?.artwork(d,k,s.version));
   return row?.art instanceof Blob?row.art:null;
  };
 });
</script>
<NativeArtwork {renderKey} {render} source={domain} empty={domain!=='achievement'||detail}/>
