<script lang="ts">
 import {onMount} from 'svelte';
 import type {Locale} from './locales';
 import {layoutsCopy,layoutNavigationCopy} from './layouts-copy';
 import {requestLayoutSourceCatalog,captureLayoutSource,inspectLayoutSource,type LayoutSourceInfo,type LayoutSourceCatalog,type LayoutSourceScope,type LayoutGuid} from './worker-client';
 let {locale,busy}:{locale:Locale;busy:boolean}=$props();
 const copy=$derived(layoutsCopy(locale));
 let catalog:LayoutSourceCatalog|null=$state(null);
 let loading=$state(true);
 let failed=$state(false);
 let exporting=$state(false);
 let name=$state('');
 let selected=$state('all');
 let navigation=$state<'root'|'cabins'>('root');
 let expanded=$state('');
 let inspecting=$state(false);
 let imported=$state<LayoutSourceInfo|null>(null);
 let importFailed=$state(false);
 let fileInput:HTMLInputElement;
 const labels=$derived(layoutNavigationCopy(locale));
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
 function selectBuilding(id:LayoutGuid){
  const k=key(id);expanded=k;selected='b:'+k;
 }
 async function inspectFile(event:Event){
  const input=event.currentTarget as HTMLInputElement;
  const file=input.files?.[0];input.value='';
  if(!file||inspecting||busy)return;
  inspecting=true;importFailed=false;imported=null;
  try{
   if(file.size===0||file.size>45*1024*1024)throw Error('LAYOUT_SOURCE_INVALID');
   const result=await inspectLayoutSource(new Uint8Array(await file.arrayBuffer()));
   if(alive)imported=result;
  }catch{if(alive)importFailed=true}
  finally{if(alive)inspecting=false}
 }
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
 {:else}
  {#if navigation==='root'}
   <div class="space-grid">
    <button class="space-card" type="button" disabled={!catalog?.rooms.length||busy} onclick={()=>{navigation='cabins';selected='all';expanded=''}}>
     <svg viewBox="0 0 80 64" aria-hidden="true"><path d="M8 29 40 7 72 29M15 25v32h50V25M33 57V36h14v21M20 32h9v10h-9m31-10h9v10h-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>
     <strong>{labels.cabins}</strong><small>{buildings.length} / {catalog?.rooms.length??0}</small>
    </button>
    <button class="space-card" type="button" disabled>
     <svg viewBox="0 0 80 64" aria-hidden="true"><path d="M8 29 40 7 72 29M15 25v32h50V25M33 57V36h14v21" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M40 29c-15-8-5-17 0-10 5-7 15 2 0 10Z" fill="currentColor"/></svg>
     <strong>{labels.player}</strong>
    </button>
    <button class="space-card" type="button" disabled>
     <svg viewBox="0 0 80 64" aria-hidden="true"><path d="M8 29 40 7 72 29M15 25v32h50V25M33 57V36h14v21" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><circle cx="25" cy="34" r="5" fill="currentColor"/><circle cx="55" cy="34" r="5" fill="currentColor"/></svg>
     <strong>{labels.character}</strong>
    </button>
   </div>
   {#if !catalog?.rooms.length}<p role="status">{copy.unavailable}</p>{/if}
  {:else}
   <div class="layout-actions">
    <button type="button" disabled={exporting||inspecting} onclick={()=>{navigation='root';selected='all';expanded=''}}>← {labels.cabins}</button>
    <button type="button" class:chosen={selected==='all'} aria-pressed={selected==='all'} disabled={exporting||busy} onclick={()=>{selected='all';expanded=''}}>{copy.all}</button>
   </div>
   <div class="building-grid">
    {#each buildings as building,i (key(building.id))}
     <button type="button" class="space-card building-card" class:chosen={expanded===key(building.id)} aria-pressed={expanded===key(building.id)} disabled={busy||exporting} onclick={()=>selectBuilding(building.id)}>
      <svg viewBox="0 0 80 64" aria-hidden="true"><path d="M8 29 40 7 72 29M15 25v32h50V25M33 57V36h14v21" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>
      <strong>{copy.building} {i+1}</strong><small>{building.rooms.length} {copy.room}</small>
     </button>
    {/each}
   </div>
   {#if expanded}
    {@const building=buildings.find(b=>key(b.id)===expanded)}
    {#if building}
     <div class="room-grid">
      <button type="button" class:chosen={selected==='b:'+expanded} aria-pressed={selected==='b:'+expanded} disabled={busy||exporting} onclick={()=>{selected='b:'+expanded}}>{copy.building}</button>
      {#each building.rooms as room,j (key(room.home))}
       <button type="button" class:chosen={selected==='r:'+key(room.home)} aria-pressed={selected==='r:'+key(room.home)} disabled={busy||exporting} onclick={()=>{selected='r:'+key(room.home)}}>
        <svg viewBox="0 0 48 38" aria-hidden="true"><path d="M3 3h42v32H3ZM3 25h11V3M25 35V23h20" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        {copy.room} {j+1}
       </button>
      {/each}
     </div>
    {/if}
   {/if}
   <label class="layout-field">
    <span>{copy.name}</span>
    <input bind:value={name} maxlength="128" disabled={busy||exporting}/>
   </label>
   <div class="layout-actions">
    <button type="button" class="primary" disabled={busy||exporting||!name.trim()} onclick={()=>void backup()}>{copy.exportSource}</button>
   </div>
  {/if}
  <div class="layout-actions">
   <input type="file" accept=".hkialayout-source" bind:this={fileInput} onchange={inspectFile} hidden/>
   <button type="button" disabled={busy||inspecting||exporting} onclick={()=>fileInput?.click()}>{labels.open}</button>
   <button type="button" disabled>{copy.restore}</button>
  </div>
  {#if imported}
   <div class="backup-info" role="status">
    <strong>{imported.name}</strong>
    <span>{new Date(imported.createdMs).toLocaleString(locale)} · {imported.version}</span>
    <span>{imported.buildings} {copy.building} · {imported.rooms} {copy.room}</span>
    <span>{imported.sameSource?labels.same:labels.different}</span>
   </div>
  {/if}
  <p class="layout-warning">{copy.warning}</p>
  {#if failed||importFailed}<p role="alert">{importFailed?labels.invalid:copy.failed}</p>{/if}
 {/if}
</section>
<style>
 .layouts-panel{display:grid;gap:1rem;align-content:start}
 .space-grid,.building-grid,.room-grid{display:grid;gap:.65rem;grid-template-columns:repeat(auto-fill,minmax(9rem,1fr))}
 .space-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
 .space-card{display:grid;justify-items:center;align-content:center;gap:.45rem;min-height:7.5rem;padding:.65rem;border:1px solid currentColor;border-radius:.8rem;font:inherit;background:transparent;color:inherit;cursor:pointer;text-align:center}
 .space-card:disabled{opacity:.38;cursor:default}
 .space-card svg{width:4.5rem;height:3.5rem}
 .space-card small{opacity:.75}
 .building-card{min-height:6.5rem}
 .room-grid button{display:grid;justify-items:center;align-content:center;gap:.4rem;min-height:3.5rem}
 .room-grid svg{width:2.4rem;height:1.9rem}
 .chosen{outline:2px solid currentColor;outline-offset:-3px}
 .layout-field{display:grid;gap:.4rem;max-width:38rem}
 .layout-field input{font:inherit;min-height:2.5rem;padding:.4rem .6rem}
 .layout-actions{display:flex;gap:.5rem;flex-wrap:wrap}
 .layout-warning{max-width:50rem;font-size:.85em;opacity:.8}
 .backup-info{display:grid;gap:.3rem;overflow-wrap:anywhere}
 @media(max-width:520px){.space-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
