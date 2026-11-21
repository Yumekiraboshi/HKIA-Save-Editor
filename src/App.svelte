<script lang="ts">
 import {onMount} from 'svelte';
 import {openSave,changeCollection,undo,redo,exportSave,clear,type SaveSnapshot} from './worker-client';
 import {messages,editorErrors,type Locale} from './ui-copy';
 type Item=[number,string,string,string,number,string|null,string|null];
 type Group=[string,string,string,number,number,string];
 type Catalog={schema:string;version:string;source:{membership:string;names:string;nameVersionMatchesSave:boolean};groups:Group[];items:Item[]};
 type Filter='all'|'recorded'|'unrecorded';
 type LanguagePref='auto'|Locale;
 type ThemePref='system'|'light'|'dark';
 const PAGE_SIZE=24;
 const EPOCH=621355968000000000n;
 const MAX_TICKS=3155378975999999999n;
 const ICONS=import.meta.env.BASE_URL+'icons/';
 let catalog:Catalog|null=$state(null);
 let snapshot:SaveSnapshot|null=$state(null);
 let original:File|null=$state(null);
 let recorded:Record<string,bigint>=$state({});
 let selectedGroup:string|null=$state(null);
 let query=$state('');
 let filter:Filter=$state('all');
 let page=$state(0);
 let editId:number|null=$state(null);
 let dateValue=$state('');
 let busy=$state(false);
 let error=$state('');
 let notice=$state('');
 let languagePref:LanguagePref=$state('auto');
 let browserLanguage:Locale=$state('ja');
 let themePref:ThemePref=$state('system');
 let prefersDark=$state(false);
 let fileInput:HTMLInputElement;
 let fileMenu:HTMLDetailsElement;
 const locale=$derived(languagePref==='auto'?browserLanguage:languagePref);
 const copy=$derived(messages[locale]);
 const actualTheme=$derived(themePref==='system'?(prefersDark?'dark':'light'):themePref);
 const entriesCount=$derived(Object.keys(recorded).length);
 const group=$derived(((catalog as Catalog | null)?.groups??[]).find((g:Group)=>g[0]===selectedGroup)??null);

 onMount(()=>{
  browserLanguage=(navigator.languages.find(l=>l.toLowerCase().startsWith('ja')||l.toLowerCase().startsWith('en'))??navigator.language??'ja').toLowerCase().startsWith('en')?'en':'ja';
  try{
   const savedLang=localStorage.getItem('hkia-display-locale');
   if(savedLang==='auto'||savedLang==='ja'||savedLang==='en')languagePref=savedLang;
   const savedTheme=localStorage.getItem('hkia-display-theme');
   if(savedTheme==='system'||savedTheme==='light'||savedTheme==='dark')themePref=savedTheme;
  }catch{}
  const media=matchMedia('(prefers-color-scheme: dark)');
  prefersDark=media.matches;
  const listener=(e:MediaQueryListEvent)=>prefersDark=e.matches;
  media.addEventListener?.('change',listener);
  fetch(import.meta.env.BASE_URL+'catalog.json')
   .then(r=>r.ok?r.json():Promise.reject(Error('Collection catalog unavailable')))
   .then((v:Catalog)=>{
    if(v.schema!=='HKIA.CollectionDisplayCatalog.2'||!Array.isArray(v.groups)||!Array.isArray(v.items))throw Error('Invalid collection catalog');
    catalog=v;
   })
   .catch(e=>error=describeError(e));
  return ()=>media.removeEventListener?.('change',listener);
 });
 $effect(()=>{
  if(typeof document!=='undefined'){document.documentElement.lang=locale;document.documentElement.dataset.theme=actualTheme;}
 });
 const categories=$derived.by(()=>{
  if(!catalog)return [];
  const counts=new Map<string,number>();
  for(const item of catalog.items){
   if(recorded[String(item[0])]!==undefined)counts.set(item[3],(counts.get(item[3])??0)+1);
  }
  return catalog.groups.filter(g=>g[3]===0||(counts.get(g[0])??0)>0)
   .map(g=>({row:g,count:counts.get(g[0])??0}));
 });
 const visibleItems=$derived.by(()=>{
  if(!catalog||!selectedGroup)return {rows:[] as Item[],total:0,page:0,pages:1};
  const q=query.trim().toLocaleLowerCase();
  const filtered=catalog.items.filter(item=>{
   if(item[3]!==selectedGroup||!item[5]||!item[6])return false;
   const has=recorded[String(item[0])]!==undefined;
   if(filter==='recorded'&&!has||filter==='unrecorded'&&has)return false;
   return !q||item[5]!.toLocaleLowerCase().includes(q)||item[6]!.toLocaleLowerCase().includes(q);
  });
  filtered.sort((a,b)=>String(locale==='ja'?a[6]:a[5]).localeCompare(String(locale==='ja'?b[6]:b[5]),locale));
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const effective=Math.min(page,pages-1);
  return {rows:filtered.slice(effective*PAGE_SIZE,(effective+1)*PAGE_SIZE),total:filtered.length,page:effective,pages};
 });
 const unnamed=$derived((catalog as Catalog | null)?.items.filter((x:Item)=>!x[5]||!x[6]).length??0);
 function describeError(e:unknown){const raw=e instanceof Error?e.message:String(e);return editorErrors[locale][raw]??(locale==='ja'?(raw||copy.unknown):copy.unknown);}
 function setLanguage(v:LanguagePref){
  languagePref=v;try{localStorage.setItem('hkia-display-locale',v)}catch{}
 }
 function setTheme(v:ThemePref){
  themePref=v;try{localStorage.setItem('hkia-display-theme',v)}catch{}
 }
 function titleFor(g:Group){return locale==='ja'?g[1]:g[2]}
 function nameFor(item:Item){return (locale==='ja'?item[6]:item[5])??''}
 function selectCategory(key:string){selectedGroup=key;page=0;query='';filter='all';editId=null;error='';}
 function goHome(){selectedGroup=null;page=0;editId=null;query='';filter='all';}
 function askFile(){fileMenu&&(fileMenu.open=false);fileInput?.click();}
 function downloadFile(file:Blob,filename:string){
  const url=URL.createObjectURL(file);
  const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 async function load(file:File){
  if(busy)return;
  if(snapshot?.dirty&&!confirm(copy.discard))return;
  busy=true;error='';notice='';
  snapshot=null;original=null;recorded={};goHome();
  try{
   if(file.size>60*1024*1024||file.size===0)throw Error(copy.typeIssue);
   const s=await openSave(file);
   snapshot=s;original=file;recorded=Object.fromEntries(s.entries.map(([id,t])=>[String(id),t]));
   goHome();notice=copy.loaded;
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 function update(s:SaveSnapshot){snapshot=s;recorded=Object.fromEntries(s.entries.map(([id,t])=>[String(id),t]));}
 async function change(id:number,next:bigint|null){
  if(!snapshot||busy)return;
  const prev=recorded[String(id)]??null;
  busy=true;error='';notice='';
  try{update(await changeCollection(id,prev,next));editId=null;}
  catch(e){error=describeError(e)}
  finally{busy=false}
 }
 async function actHistory(which:'undo'|'redo'){
  if(!snapshot||busy)return;busy=true;error='';notice='';
  try{update(await (which==='undo'?undo():redo()));editId=null}
  catch(e){error=e instanceof Error?e.message:copy.unknown}
  finally{busy=false}
 }
 async function saveEdited(){
  if(!snapshot?.dirty||busy)return;
  busy=true;error='';notice='';if(fileMenu)fileMenu.open=false;
  try{
   const bytes=await exportSave();
   const copied=new Uint8Array(bytes.length);copied.set(bytes);
   const suffix=snapshot.zip?'.zip':'.save';
   const base=(original?.name??'HKIA-save').replace(/\.(zip|save|dat)$/i,'').replace(/[^a-zA-Z0-9_.-]/g,'_');
   downloadFile(new Blob([copied.buffer],{type:snapshot.zip?'application/zip':'application/octet-stream'}),base+'-edited'+suffix);
   notice=copy.exported;
  }catch(e){error=e instanceof Error?e.message:copy.unknown}
  finally{busy=false}
 }
 function backup(){
  if(!original)return;if(fileMenu)fileMenu.open=false;
  downloadFile(original,original.name);notice=copy.backedUp;
 }
 async function closeSave(){
  if(!snapshot||busy)return;
  if(snapshot.dirty&&!confirm(copy.discard))return;
  busy=true;error='';notice='';
  try{await clear();snapshot=null;original=null;recorded={};goHome();}
  catch(e){error=e instanceof Error?e.message:copy.unknown}
  finally{busy=false}
 }
 function toDateValue(t:bigint){
  const ms=(t-EPOCH)/10000n;
  if(ms< -8640000000000000n||ms>8640000000000000n)return '';
  const d=new Date(Number(ms));
  if(!Number.isFinite(d.getTime())||d.getFullYear()<1||d.getFullYear()>9999)return '';
  const p=(v:number,n=2)=>String(v).padStart(n,'0');
  return [p(d.getFullYear(),4),p(d.getMonth()+1),p(d.getDate())].join('-')+'T'+p(d.getHours())+':'+p(d.getMinutes());
 }
 function fromDateValue(v:string){
  const ms=new Date(v).getTime();
  if(!v||!Number.isFinite(ms))throw Error(copy.fileError);
  const t=EPOCH+BigInt(ms)*10000n;
  if(t<1n||t>MAX_TICKS)throw Error(copy.fileError);
  return t;
 }
 function jumpPage(value:string){const target=Number(value);if(Number.isFinite(target)&&Number.isInteger(target))page=Math.min(Math.max(0,target-1),visibleItems.pages-1);}
 function editDate(id:number){
  const old=recorded[String(id)];
  if(old===undefined)return;
  editId=id;dateValue=toDateValue(old);
 }
 function applyDate(){
  if(editId===null)return;
  try{void change(editId,fromDateValue(dateValue))}
  catch(e){error=e instanceof Error?e.message:copy.fileError}
 }
</script>

<svelte:head>
 <title>{copy.toolCollection} | Yumekiraboshi</title>
 <meta name="description" content="Local collection-history save editor"/>
</svelte:head>

<div class="site-shell">
 <header class="topbar">
  <div class="bar-inner">
   <button class="brand" type="button" onclick={goHome} aria-label={copy.brand}>
    <span class="brand-mark" aria-hidden="true">✦</span><span class="brand-name">{copy.brand}</span>
   </button>
   <nav class="tools-nav" aria-label="Tools">
    <button type="button" class="tool-tab active" aria-current="page" onclick={goHome}>{copy.toolCollection}</button>
   </nav>
   <div class="bar-actions">
    {#if snapshot}
     <span class="save-indicator" title={original?.name??''}><span class:changed={snapshot.dirty} class="state-dot"></span><span class="file-short">{original?.name}</span></span>
     <button type="button" class="icon-button" title={copy.undo} aria-label={copy.undo} disabled={busy||!snapshot.canUndo} onclick={()=>void actHistory('undo')}>↶</button>
     <button type="button" class="icon-button" title={copy.redo} aria-label={copy.redo} disabled={busy||!snapshot.canRedo} onclick={()=>void actHistory('redo')}>↷</button>
    {/if}
    <details class="file-menu" bind:this={fileMenu}>
     <summary class="bar-button">{copy.file} <span class="chevron">⌄</span></summary>
     <div class="menu-popover">
      <button type="button" onclick={askFile}>{snapshot?copy.replace:copy.openFile}</button>
      {#if snapshot}
       <button type="button" onclick={backup}>{copy.backup}</button>
       <button type="button" disabled={!snapshot.dirty||busy} onclick={()=>void saveEdited()}>{copy.export}</button>
       <hr/>
       <button type="button" onclick={()=>void closeSave()}>{copy.close}</button>
      {/if}
     </div>
    </details>
    <label class="header-select" title={copy.language}>
     <span class="visually-hidden">{copy.language}</span>
     <select aria-label={copy.language} value={languagePref} onchange={e=>setLanguage(e.currentTarget.value as LanguagePref)}>
      <option value="auto">{copy.system}</option><option value="ja">日本語</option><option value="en">English</option>
     </select>
    </label>
    <label class="header-select theme-select" title={copy.theme}>
     <span class="visually-hidden">{copy.theme}</span>
     <select aria-label={copy.theme} value={themePref} onchange={e=>setTheme(e.currentTarget.value as ThemePref)}>
      <option value="system">◐ {copy.system}</option><option value="light">☀ {copy.light}</option><option value="dark">☾ {copy.dark}</option>
     </select>
    </label>
   </div>
  </div>
 </header>
 <input class="visually-hidden" type="file" accept=".zip,.save,.dat,application/zip" bind:this={fileInput}
  onchange={e=>{const f=e.currentTarget.files?.[0];if(f)void load(f);e.currentTarget.value=''}}/>
 <main class="content">
  {#if error}<div class="message error" role="alert">{error}<button type="button" aria-label={copy.collapse} onclick={()=>error=''}>×</button></div>{/if}
  {#if notice}<div class="message notice" role="status">{notice}<button type="button" aria-label={copy.collapse} onclick={()=>notice=''}>×</button></div>{/if}
  {#if !snapshot}
   <section class="empty-workspace">
    <div class="empty-decoration" aria-hidden="true">✦</div>
    <h1>{copy.waiting}</h1>
    <button type="button" class="primary big" disabled={busy} onclick={askFile}>{busy?copy.busy:copy.openFile}</button>
    <p>{copy.openHint}</p>
   </section>
  {:else if !selectedGroup}
   <div class="section-heading"><h1>{copy.collections}</h1></div>
   {#if !catalog}
    <div class="empty-result">{copy.busy}</div>
   {:else}
    <div class="category-grid">
     {#each categories as cat (cat.row[0])}
      <button class="category-card" type="button" onclick={()=>selectCategory(cat.row[0])}>
       <span class="category-image"><img src={ICONS+cat.row[5]} alt="" loading="lazy" onerror={e=>(e.currentTarget as HTMLImageElement).style.visibility='hidden'}/></span>
       <span class="category-label">{titleFor(cat.row)}</span>
       {#if cat.count>0}<span class="category-count">{copy.recorded} · {cat.count.toLocaleString(locale)}</span>{/if}
      </button>
     {/each}
    </div>
    <details class="data-note"><summary>{copy.showAbout}</summary><p>{copy.noName} {copy.sourceNotice} {copy.notGameOwnership}</p>
     <p>{copy.verifiedNames}: {(catalog.items.length-unnamed).toLocaleString(locale)} / {copy.unverifiedNames}: {unnamed.toLocaleString(locale)}</p>
    </details>
   {/if}
  {:else}
   <div class="section-heading with-back">
    <button type="button" class="back-link" onclick={goHome}>‹ {copy.back}</button>
    <h1>{group?titleFor(group):copy.collections}</h1>
   </div>
   <div class="collection-controls">
    <label class="search-field">
     <span class="search-symbol" aria-hidden="true">⌕</span>
     <input type="search" placeholder={copy.search} aria-label={copy.search} bind:value={query} oninput={()=>page=0}/>
    </label>
    <div class="status-filter" role="group" aria-label="Status">
     <button type="button" class:active={filter==='all'} onclick={()=>{filter='all';page=0}}>{copy.all}</button>
     <button type="button" class:active={filter==='unrecorded'} onclick={()=>{filter='unrecorded';page=0}}>{copy.unrecorded}</button>
     <button type="button" class:active={filter==='recorded'} onclick={()=>{filter='recorded';page=0}}>{copy.recorded}</button>
    </div>
   </div>
   {#if !snapshot.membershipEdit}<div class="compact-hint">{copy.noMembership}</div>{/if}
   <div class="item-grid">
    {#each visibleItems.rows as item (item[0])}
     {@const tick=recorded[String(item[0])]}
     {@const has=tick!==undefined}
     {@const mayAdd=snapshot.membershipEdit && snapshot.version===catalog?.version && item[4]===0}
     <article class="item-tile" class:is-recorded={has}>
      <div class="item-primary">
       <div class="item-name">{nameFor(item)}</div>
       <div class="item-actions">
        {#if has}
         <button type="button" class="record-switch selected" aria-label={copy.unsetRecorded+': '+nameFor(item)} title={snapshot.membershipEdit?copy.unsetRecorded:copy.noMembership} disabled={busy||!snapshot.membershipEdit} onclick={()=>void change(item[0],null)}>
          <span aria-hidden="true">✓</span> {copy.recorded}
         </button>
         <button type="button" class="date-button" aria-label={copy.editDate+': '+nameFor(item)} title={copy.editDate} disabled={busy} onclick={()=>editDate(item[0])}>◷</button>
        {:else}
         <button type="button" class="record-switch" aria-label={copy.setRecorded+': '+nameFor(item)} title={mayAdd?copy.setRecorded:copy.unsafe} disabled={busy||!mayAdd} onclick={()=>void change(item[0],EPOCH+BigInt(Date.now())*10000n)}>
          <span aria-hidden="true">＋</span> {copy.unrecorded}
         </button>
        {/if}
       </div>
      </div>
      {#if editId===item[0] && has}
       <div class="date-panel">
        <label>{copy.editDate}<input type="datetime-local" bind:value={dateValue}/></label>
        <div><button type="button" class="primary" disabled={busy||!dateValue} onclick={applyDate}>{copy.apply}</button><button type="button" onclick={()=>editId=null}>{copy.cancel}</button></div>
       </div>
      {/if}
     </article>
    {/each}
   </div>
   {#if visibleItems.rows.length===0}<p class="empty-result">{copy.none}</p>{/if}
   <div class="pagination" role="navigation" aria-label={copy.page}>
    <button type="button" aria-label={copy.first} disabled={visibleItems.page===0} onclick={()=>page=0}>«</button>
    <button type="button" disabled={visibleItems.page===0} onclick={()=>page=visibleItems.page-1}>{copy.previous}</button>
    <label class="page-control"><span class="visually-hidden">{copy.goToPage}</span>
     <input type="number" min="1" max={visibleItems.pages} value={visibleItems.page+1} aria-label={copy.goToPage} onchange={e=>jumpPage(e.currentTarget.value)}/>
     <span>/ {visibleItems.pages}</span>
    </label>
    <button type="button" disabled={visibleItems.page>=visibleItems.pages-1} onclick={()=>page=visibleItems.page+1}>{copy.next}</button>
    <button type="button" aria-label={copy.last} disabled={visibleItems.page>=visibleItems.pages-1} onclick={()=>page=visibleItems.pages-1}>»</button>
   </div>
  {/if}
 </main>
</div>
