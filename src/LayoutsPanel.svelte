<script lang="ts">
 import {onMount} from 'svelte';
 import type {Locale} from './locales';
 import {layoutsCopy} from './layouts-copy';
 import {requestLayoutSourceCatalog,captureLayoutSource,type LayoutSourceCatalog,type LayoutSourceScope,type LayoutGuid} from './worker-client';
 let {locale,busy}:{locale:Locale;busy:boolean}=$props();
 const copy=$derived(layoutsCopy(locale));
 let catalog:LayoutSourceCatalog|null=$state(null);
 let loading=$state(true);
 let failed=$state(false);
 let exporting=$state(false);
 let name=$state('');
 let selected=$state('all');
 let alive=true;
 function key(id:LayoutGuid){return id.join(':')}
 const buildings=$derived.by(()=>{
  const map=new Map<string,{id:LayoutGuid;rooms:LayoutSourceCatalog['rooms']}>();
  for(const room of catalog?.rooms??[]){const k=key(room.cabin);let building=map.get(k);if(!building){building={id:room.cabin,rooms:[]};map.set(k,building)}building.rooms.push(room)}
  return Array.from(map.values());
 });
 const options=$derived.by(()=>{
  const all:{value:string;label:string;scope:LayoutSourceScope}[]=[{value:'all',label:copy.all,scope:{kind:'all-cabin-sources'}}];
  for(let i=0;i<buildings.length;i++){
   const building=buildings[i];
   all.push({value:'b:'+key(building.id),label:copy.building+' '+(i+1),scope:{kind:'cabin',id:building.id}});
   for(let j=0;j<building.rooms.length;j++){const room=building.rooms[j];all.push({value:'r:'+key(room.home),label:copy.building+' '+(i+1)+' / '+copy.room+' '+(j+1),scope:{kind:'room',id:room.home}})}
  }
  return all;
 });
 onMount(()=>{
  void requestLayoutSourceCatalog().then(value=>{if(alive)catalog=value}).catch(()=>{if(alive)catalog=null}).finally(()=>{if(alive)loading=false});
  return ()=>{alive=false};
 });
 async function backup(){
  const option=options.find(o=>o.value===selected);
  if(!catalog||!catalog.rooms.length||!option||!name.trim()||busy||exporting)return;
  exporting=true;failed=false;
  try{
   const created=Date.now();
   const bytes=await captureLayoutSource(catalog.identity,option.scope,name.trim(),created);
   if(!alive)return;
   const blob=new Blob([bytes.slice().buffer as ArrayBuffer],{type:'application/octet-stream'});
   const url=URL.createObjectURL(blob);
   const link=document.createElement('a');link.href=url;link.download=(name.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,80)||'layout')+'-'+created+'.hkialayout-source';
   document.body.append(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch{if(alive)failed=true}
  finally{if(alive)exporting=false}
 }
</script>
<section class="layouts-panel">
 <div class="section-heading"><h1>Layouts</h1></div>
 {#if loading}<p role="status">{copy.loading}</p>
 {:else if !catalog?.rooms.length}<p role="status">{copy.unavailable}</p>
 {:else}
  <p class="layout-warning">{copy.warning}</p>
  <label class="layout-field">
   <span>{copy.all}</span>
   <select bind:value={selected} disabled={busy||exporting}>
    {#each options as option (option.value)}<option value={option.value}>{option.label}</option>{/each}
   </select>
  </label>
  <label class="layout-field">
   <span>{copy.name}</span>
   <input bind:value={name} maxlength="128" disabled={busy||exporting}/>
  </label>
  <div class="layout-actions">
   <button type="button" class="primary" disabled={busy||exporting||!name.trim()} onclick={()=>void backup()}>{copy.exportSource}</button>
   <button type="button" disabled>{copy.restore}</button>
  </div>
  {#if failed}<p role="alert">{copy.failed}</p>{/if}
 {/if}
</section>
<style>
 .layouts-panel{display:grid;gap:1rem;align-content:start}
 .layout-field{display:grid;gap:.4rem;max-width:38rem}
 .layout-field input,.layout-field select{font:inherit;min-height:2.5rem;padding:.4rem .6rem}
 .layout-actions{display:flex;gap:.5rem;flex-wrap:wrap}
 .layout-warning{max-width:50rem}
</style>
