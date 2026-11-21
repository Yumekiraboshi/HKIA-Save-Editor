<script lang="ts">
 import {onMount,tick} from 'svelte';
 import {openSave,changeCollection,changeAchievement,applyDraft,undo,redo,exportSave,clear,type SaveSnapshot,type AchievementEntry,type AchievementValue} from './worker-client';
 import {diffPatches,restoreLocalDraft,saveOriginalLocally,saveDraftChanges,forgetLocalDraft} from './draft-store';
 import {diffAchievements,decodeAchievementDraft} from './achievement-draft';
 import {achievementCopy} from './achievement-ui';
 import {editorErrors} from './ui-copy';
 import {supportedLocales,isLocale,detectLocale,isRtl,type Locale,type LanguagePref} from './locales';
 import {localizedCopy} from './ui-locales';
 import {loadLocaleIndex,loadGameLabels,EMPTY_LABELS,type GameLabels} from './game-localization';
 import {loadIconPack,type IconPack} from './icon-packs';
 import {toDateTimeValue,fromDateTimeValue} from './collection-date';
 import {listSubcategories,subcategoryLabel,recordedFamilies,type CollectionItem} from './subcategories';
 type Item=CollectionItem;
 type Group=[string,string,string,number,number,string];
 type Catalog={schema:string;version:string;source:{membership:string;names:string;nameVersionMatchesSave:boolean};groups:Group[];items:Item[]};
 type Filter='all'|'recorded'|'unrecorded';
 type Tool='collections'|'achievements';
 type ThemePref='system'|'light'|'dark';
 const BATCH_SIZE=40;
 const EPOCH=621355968000000000n;
 const ICONS=import.meta.env.BASE_URL+'icons/';
 let activeTool:Tool=$state('collections');
 let achievementFilter:'all'|'completed'|'incomplete'=$state('all');
 let achievementLimit=$state(BATCH_SIZE);
 let editingAchievement:AchievementEntry|null=$state(null);
 let achievementDialogEl:HTMLDialogElement;
 let achievementReturnFocus:HTMLElement|null=null;
 let achievementProgress=$state('');
 let achievementComplete=$state(false);
 let achievementDate=$state('');
 let achievementValidation=$state('');
 let achievementBaseline:AchievementEntry[]=[];
 let catalog:Catalog|null=$state(null);
 let snapshot:SaveSnapshot|null=$state(null);
 let original:File|null=$state(null);
 let recorded:Record<string,bigint>=$state({});
 let selectedGroup:string|null=$state(null);
 let selectedSubgroup:string|null=$state(null);
 let showVariants=$state(false);
 let query=$state('');
 let filter:Filter=$state('all');
 let visibleLimit=$state(BATCH_SIZE);
 let editId:number|null=$state(null);
 let dateValue=$state('');
 let dateValidation=$state('');
 let dateDialogEl:HTMLDialogElement;
 let dateReturnFocus:HTMLElement|null=null;
 let iconLoadingGroup:string|null=null;
 let busy=$state(false);
 let error=$state('');
 let restored=$state(false);
 let draftWarning=$state(false);
 let draftReady=$state(false);
 let baseline=new Map<number,bigint>();
 let draftWrites:Promise<void>=Promise.resolve();
 let iconPack:IconPack|null=$state(null);
 let iconEpoch=0;
 let iconError=$state(false);
 let loadMoreSentinel=$state<HTMLDivElement|undefined>(undefined);
 let languagePref:LanguagePref=$state('auto');
 let browserLanguage:Locale=$state('ja');
 let availableGameLocales:Locale[]=$state([]);
 let gameLabels:GameLabels=$state(EMPTY_LABELS);
 let languageLoadEpoch=0;
 let themePref:ThemePref=$state('system');
 let prefersDark=$state(false);
 let fileInput:HTMLInputElement;
 let fileMenu:HTMLDetailsElement;
 const locale=$derived(languagePref==='auto'?browserLanguage:languagePref);
 const copy=$derived(localizedCopy(locale));
 const achCopy=$derived(achievementCopy(locale));
 const actualTheme=$derived(themePref==='system'?(prefersDark?'dark':'light'):themePref);
 const entriesCount=$derived(Object.keys(recorded).length);
 const achievementRows=$derived((snapshot?.achievements??[]).map((row,index)=>({row,index:index+1})).filter(x=>
  achievementFilter==='all'||(achievementFilter==='completed'?x.row.value.complete:!x.row.value.complete)));
 const group=$derived(((catalog as Catalog | null)?.groups??[]).find((g:Group)=>g[0]===selectedGroup)??null);
 const subgroups=$derived(selectedGroup?listSubcategories((catalog as Catalog|null)?.items??[],selectedGroup,recorded,locale):[]);
 const activeSubgroup=$derived(subgroups.length===1?subgroups[0].key:subgroups.some(s=>s.key===selectedSubgroup)?selectedSubgroup:null);
 const families=$derived(recordedFamilies((catalog as Catalog|null)?.items??[],recorded));
 const hasVariants=$derived(Boolean(activeSubgroup&&((catalog as Catalog|null)?.items??[]).some((item:Item)=>item[3]===selectedGroup&&item[2]===activeSubgroup&&item[0]!==item[7])));
 const dateDialogItem=$derived(editId===null?null:((catalog as Catalog|null)?.items??[]).find((item:Item)=>item[0]===editId)??null);
 const dateDialogTick=$derived(editId===null?null:recorded[String(editId)]??null);
 const dateChanged=$derived(dateDialogTick!==null&&dateValue!==toDateTimeValue(dateDialogTick));

 onMount(()=>{
  browserLanguage=detectLocale(navigator.languages?.length?navigator.languages:[navigator.language||'en']);
  try{
   const savedLang=localStorage.getItem('hkia-display-locale');
   if(savedLang==='auto'||(savedLang&&isLocale(savedLang)))languagePref=savedLang;
   const savedTheme=localStorage.getItem('hkia-display-theme');
   if(savedTheme==='system'||savedTheme==='light'||savedTheme==='dark')themePref=savedTheme;
  }catch{}
  const media=matchMedia('(prefers-color-scheme: dark)');
  prefersDark=media.matches;
  const listener=(e:MediaQueryListEvent)=>prefersDark=e.matches;
  media.addEventListener?.('change',listener);
  void restoreSession();
  const beforeUnload=(e:BeforeUnloadEvent)=>{if(snapshot?.dirty&&(!draftReady||busy)){e.preventDefault();e.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);
  void loadLocaleIndex(import.meta.env.BASE_URL).then(available=>availableGameLocales=available).catch(()=>{});
  fetch(import.meta.env.BASE_URL+'catalog.json')
   .then(r=>r.ok?r.json():Promise.reject(Error('Collection catalog unavailable')))
   .then((v:Catalog)=>{
    if(v.schema!=='HKIA.CollectionDisplayCatalog.2'||!Array.isArray(v.groups)||!Array.isArray(v.items))throw Error('Invalid collection catalog');
    catalog=v;
   })
   .catch(e=>error=describeError(e));
  return ()=>{media.removeEventListener?.('change',listener);window.removeEventListener('beforeunload',beforeUnload);iconEpoch++;iconPack?.dispose()};
 });
 $effect(()=>{
  if(typeof document!=='undefined'){document.documentElement.lang=locale;document.documentElement.dir=isRtl(locale)?'rtl':'ltr';document.documentElement.dataset.theme=actualTheme;}
 });
 $effect(()=>{
  const current=locale;
  const available=availableGameLocales.includes(current);
  const epoch=++languageLoadEpoch;
  gameLabels=EMPTY_LABELS;
  if(available)void loadGameLabels(current,import.meta.env.BASE_URL)
   .then(labels=>{if(epoch===languageLoadEpoch)gameLabels=labels})
   .catch(()=>{if(epoch===languageLoadEpoch)gameLabels=EMPTY_LABELS});
 });
 const categories=$derived.by(()=>{
  if(!catalog)return [];
  const totals=new Map<string,Set<number>>();
  const owned=new Map<string,Set<number>>();
  for(const item of catalog.items){
   const key=item[3],parent=item[7]||item[0];
   if(!totals.has(key))totals.set(key,new Set());
   totals.get(key)!.add(parent);
   if(recorded[String(item[0])]!==undefined){
    if(!owned.has(key))owned.set(key,new Set());
    owned.get(key)!.add(parent);
   }
  }
  return catalog.groups.filter(g=>g[3]===0||(owned.get(g[0])?.size??0)>0)
   .map(g=>({row:g,count:owned.get(g[0])?.size??0,total:totals.get(g[0])?.size??0}));
 });
 const matching=$derived.by(()=>{
  if(!catalog||!selectedGroup||!activeSubgroup)return [] as Item[];
  const q=query.trim().toLocaleLowerCase();
  const filtered=catalog.items.filter(item=>{
   if(item[3]!==selectedGroup||item[2]!==activeSubgroup||!nameFor(item))return false;
   if(!showVariants&&item[0]!==item[7])return false;
   const has=showVariants?recorded[String(item[0])]!==undefined:(families[String(item[7]||item[0])]?.length??0)>0;
   if(filter==='recorded'&&!has||filter==='unrecorded'&&has)return false;
   return !q||nameFor(item).toLocaleLowerCase().includes(q)||item[5]?.toLocaleLowerCase().includes(q)||item[6]?.toLocaleLowerCase().includes(q);
  });
  filtered.sort((a,b)=>nameFor(a).localeCompare(nameFor(b),locale));
  return filtered;
 });
 const visibleItems=$derived(matching.slice(0,visibleLimit));
 $effect(()=>{
  const el=loadMoreSentinel;
  if(!el||!activeSubgroup||typeof IntersectionObserver==='undefined')return;
  const observer=new IntersectionObserver(entries=>{
   if(entries.some(x=>x.isIntersecting))visibleLimit=Math.min(visibleLimit+BATCH_SIZE,matching.length);
  },{rootMargin:'720px 0px'});
  observer.observe(el);
  return ()=>observer.disconnect();
 });
 const unnamed=$derived((catalog as Catalog | null)?.items.filter((x:Item)=>!nameFor(x)).length??0);
 function describeError(e:unknown){const raw=e instanceof Error?e.message:String(e);return editorErrors[locale==='ja'?'ja':'en'][raw]??(locale==='ja'?(raw||copy.unknown):copy.unknown);}
 function setLanguage(v:LanguagePref){
  languagePref=v;try{localStorage.setItem('hkia-display-locale',v)}catch{}
 }
 function setTheme(v:ThemePref){
  themePref=v;try{localStorage.setItem('hkia-display-theme',v)}catch{}
 }
 function titleFor(g:Group){return locale==='ja'?g[1]:g[2]}
 function nameFor(item:Item){return gameLabels.names[String(item[0])]??(locale==='ja'?item[6]??item[5]:item[5]??item[6])??''}
 function selectCategory(key:string){
  selectedGroup=key;selectedSubgroup=null;showVariants=false;visibleLimit=BATCH_SIZE;
  query='';filter='all';editId=null;error='';
  void fetchImages(key);
  void persistDraft();
 }
 function selectSubcategory(key:string){
  if(!selectedGroup||!subgroups.some(sub=>sub.key===key))return;
  selectedSubgroup=key;showVariants=false;visibleLimit=BATCH_SIZE;query='';filter='all';editId=null;error='';
  if(iconPack?.group!==selectedGroup&&iconLoadingGroup!==selectedGroup)void fetchImages(selectedGroup);
  void persistDraft();
 }
 function goSubcategories(){
  selectedSubgroup=null;showVariants=false;visibleLimit=BATCH_SIZE;editId=null;query='';filter='all';
  if(snapshot)void persistDraft();
 }
 function goHome(){
  activeTool='collections';selectedGroup=null;selectedSubgroup=null;showVariants=false;visibleLimit=BATCH_SIZE;
  editId=null;query='';filter='all';iconEpoch++;iconLoadingGroup=null;iconPack?.dispose();iconPack=null;iconError=false;
  if(snapshot)void persistDraft();
 }
 function askFile(){if(busy||!restored)return;fileMenu&&(fileMenu.open=false);fileInput?.click();}
 async function fetchImages(key:string){
  if((iconPack?.group===key||iconLoadingGroup===key)&&!iconError)return;
  const epoch=++iconEpoch;
  iconLoadingGroup=key;iconPack?.dispose();iconPack=null;iconError=false;
  try{
   const pack=await loadIconPack(key,import.meta.env.BASE_URL);
   if(epoch!==iconEpoch||selectedGroup!==key){pack.dispose();return}
   iconPack=pack;
  }catch{if(epoch===iconEpoch)iconError=true}
  finally{if(epoch===iconEpoch)iconLoadingGroup=null}
 }
 function update(s:SaveSnapshot){snapshot=s;recorded=Object.fromEntries(s.entries.map(([id,t])=>[String(id),t]));}
 function persistDraft():Promise<void>{
  if(!original)return Promise.resolve();
  const patches=diffPatches(baseline,recorded);
  const achievements=diffAchievements(achievementBaseline,snapshot?.achievements??[]);
  const ui={group:selectedGroup,subgroup:selectedSubgroup};
  const job=draftWrites.catch(()=>{}).then(()=>saveDraftChanges(patches,ui,achievements));
  draftWrites=job;
  return job.then(()=>{draftReady=true;draftWarning=false},()=>{draftReady=false;draftWarning=true});
 }
 async function restoreSession(){
  busy=true;
  try{
   const draft=await restoreLocalDraft();
   if(draft){
    const s=await openSave(draft.file);
    const originalRows=new Map(s.entries);
    const patches=draft.patches.map(p=>{
     const before=p.before===null?null:BigInt(p.before);
     const after=p.after===null?null:BigInt(p.after);
     if((originalRows.get(p.id)??null)!==before)throw Error('DRAFT_CONFLICT');
     return {id:p.id,before,after};
    });
    const achievementPatches=decodeAchievementDraft(draft.achievementPatches,s.achievements);
    const session=patches.length||achievementPatches.length?await applyDraft(patches,achievementPatches):s;
    original=draft.file;baseline=originalRows;achievementBaseline=s.achievements;update(session);
    selectedGroup=draft.ui.group;selectedSubgroup=draft.ui.subgroup;
    if(draft.ui.group)void fetchImages(draft.ui.group);
   }
   draftReady=true;
  }catch(e){draftReady=false;draftWarning=true;error=describeError(e)}
  finally{busy=false;restored=true}
 }
 function downloadFile(file:Blob,filename:string){
  const url=URL.createObjectURL(file);
  const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 async function load(file:File){
  if(busy||!restored)return;
  if(snapshot?.dirty&&!confirm(copy.discard))return;
  const priorFile=original;
  const priorBaseline=baseline;
  const priorRecorded=recorded;
  const priorAchievements=snapshot?.achievements??[];
  const priorAchievementBaseline=achievementBaseline;
  const priorGroup=selectedGroup;
  const priorSubgroup=selectedSubgroup;
  const priorVariants=showVariants;
  busy=true;error='';
  try{
   if(file.size>60*1024*1024||file.size===0)throw Error(copy.typeIssue);
   await draftWrites.catch(()=>{});
   const session=await openSave(file);
   original=file;baseline=new Map(session.entries);achievementBaseline=session.achievements;update(session);
   selectedGroup=null;selectedSubgroup=null;showVariants=false;visibleLimit=BATCH_SIZE;editId=null;query='';filter='all';
   iconEpoch++;iconPack?.dispose();iconPack=null;iconError=false;
   try{await saveOriginalLocally(file);draftReady=true;draftWarning=false}
   catch{draftReady=false;draftWarning=true}
  }catch(e){
   const reason=describeError(e);
   if(priorFile){
    try{
     const opened=await openSave(priorFile);
     const patches=diffPatches(priorBaseline,priorRecorded).map(p=>({
      id:p.id,
      before:p.before===null?null:BigInt(p.before),
      after:p.after===null?null:BigInt(p.after)
     }));
     const achievementPatches=diffAchievements(priorAchievementBaseline,priorAchievements);
     const decodedAchievements=decodeAchievementDraft(achievementPatches,opened.achievements);
     const previous=patches.length||decodedAchievements.length?await applyDraft(patches,decodedAchievements):opened;
     original=priorFile;baseline=priorBaseline;achievementBaseline=priorAchievementBaseline;update(previous);
     selectedGroup=priorGroup;selectedSubgroup=priorSubgroup;showVariants=priorVariants;visibleLimit=BATCH_SIZE;
     if(priorGroup&&(!iconPack||iconPack.group!==priorGroup))void fetchImages(priorGroup);
    }catch{
     original=null;snapshot=null;recorded={};baseline=new Map();achievementBaseline=[];
     selectedGroup=null;selectedSubgroup=null;showVariants=false;iconEpoch++;iconPack?.dispose();iconPack=null;
    }
   }
   error=reason;
  }
  finally{busy=false}
 }
 async function change(id:number,next:bigint|null):Promise<boolean>{
  if(!snapshot||busy)return false;
  const prev=recorded[String(id)]??null;
  busy=true;error='';
  try{update(await changeCollection(id,prev,next));await persistDraft();return true}
  catch(e){error=describeError(e);return false}
  finally{busy=false}
 }
 async function actHistory(which:'undo'|'redo'){
  if(!snapshot||busy)return;busy=true;error='';
  try{update(await (which==='undo'?undo():redo()));editId=null;await persistDraft();}
  catch(e){error=e instanceof Error?e.message:copy.unknown}
  finally{busy=false}
 }
 async function saveEdited(){
  if(!snapshot?.dirty||busy)return;
  busy=true;error='';if(fileMenu)fileMenu.open=false;
  try{
   const bytes=await exportSave();
   const copied=new Uint8Array(bytes.length);copied.set(bytes);
   const suffix=snapshot.zip?'.zip':'.save';
   const base=(original?.name??'HKIA-save').replace(/\.(zip|save|dat)$/i,'').replace(/[^a-zA-Z0-9_.-]/g,'_');
   downloadFile(new Blob([copied.buffer],{type:snapshot.zip?'application/zip':'application/octet-stream'}),base+'-edited'+suffix);
   
  }catch(e){error=e instanceof Error?e.message:copy.unknown}
  finally{busy=false}
 }
 function backup(){
  if(!original)return;if(fileMenu)fileMenu.open=false;
  downloadFile(original,original.name);
 }
 async function closeSave(){
  if(!snapshot||busy)return;
  if(snapshot.dirty&&!confirm(copy.discard))return;
  busy=true;error='';
  try{await draftWrites.catch(()=>{});await forgetLocalDraft();await clear();snapshot=null;original=null;recorded={};baseline=new Map();achievementBaseline=[];editingAchievement=null;goHome();draftReady=true;draftWarning=false;}
  catch(e){error=e instanceof Error?e.message:copy.unknown}
  finally{busy=false}
 }

 async function editDate(id:number,opener:HTMLElement){
  const old=recorded[String(id)];
  if(old===undefined||busy)return;
  editId=id;dateValue=toDateTimeValue(old);dateValidation='';dateReturnFocus=opener;
  await tick();
  if(dateDialogEl&&!dateDialogEl.open)dateDialogEl.showModal();
 }
 function closeDateDialog(){if(dateDialogEl?.open)dateDialogEl.close()}
 function onDateDialogClosed(){
  editId=null;dateValue='';dateValidation='';
  const focus=dateReturnFocus;dateReturnFocus=null;
  if(focus?.isConnected)focus.focus();
 }
 async function applyDate(){
  if(editId===null||dateDialogTick===null||busy||!dateChanged)return;
  const id=editId;
  let next:bigint;
  try{next=fromDateTimeValue(dateValue,dateDialogTick)}
  catch{dateValidation=copy.invalidDate;return}
  dateValidation='';
  const success=await change(id,next);
  if(success)closeDateDialog();
  else dateValidation=error||copy.fileError;
 }
 async function clearDate(){
  if(editId===null||dateDialogTick===null||busy||!snapshot?.membershipEdit)return;
  const id=editId;
  const success=await change(id,null);
  if(success)closeDateDialog();
  else dateValidation=error||copy.fileError;
 }

 function formatAchievementDate(value:AchievementValue):string{
  if(!value.completed)return '';
  const ms=Number(value.completed[0])*1000+Math.floor(value.completed[1]/1_000_000);
  const date=new Date(ms);
  if(!Number.isFinite(date.getTime()))return '';
  const pad=(v:number)=>String(v).padStart(2,'0');
  return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes())+':'+pad(date.getSeconds());
 }
 async function openAchievement(row:AchievementEntry,opener:HTMLElement){
  if(busy)return;
  editingAchievement=row;achievementReturnFocus=opener;
  achievementComplete=row.value.complete;
  achievementProgress=String(row.value.current);
  achievementDate=formatAchievementDate(row.value)||formatAchievementDate({complete:true,current:0,completed:[BigInt(Math.floor(Date.now()/1000)),0]});
  achievementValidation='';
  await tick();
  if(achievementDialogEl&&!achievementDialogEl.open)achievementDialogEl.showModal();
 }
 function closeAchievement(){if(achievementDialogEl?.open)achievementDialogEl.close()}
 function onAchievementDialogClosed(){
  editingAchievement=null;achievementValidation='';
  const focus=achievementReturnFocus;achievementReturnFocus=null;
  if(focus?.isConnected)focus.focus();
 }
 async function saveAchievement(){
  const selected=editingAchievement;
  if(!snapshot||!selected||busy)return;
  const current=Number(achievementProgress);
  if(!achievementProgress.trim()||!Number.isFinite(current)||current<0||current>3.4028234663852886e38){
   achievementValidation=achCopy.invalid;return;
  }
  let completed:AchievementValue['completed']=null;
  if(achievementComplete){
   if(!achievementDate){achievementValidation=achCopy.invalid;return}
   if(achievementDate===formatAchievementDate(selected.value)&&selected.value.completed){
    completed=selected.value.completed;
   }else{
    const ms=new Date(achievementDate).getTime();
    if(!Number.isFinite(ms)||ms<0||ms>253402300799000){achievementValidation=achCopy.invalid;return}
    const seconds=Math.floor(ms/1000);
    completed=[BigInt(seconds),Math.round((ms-seconds*1000)*1_000_000)];
   }
  }
  const next:AchievementValue={complete:achievementComplete,current,completed};
  busy=true;error='';achievementValidation='';
  try{
   update(await changeAchievement(selected.guid,selected.value,next));
   closeAchievement();await persistDraft();
  }catch(e){achievementValidation=describeError(e)}
  finally{busy=false}
 }

</script>

<svelte:head>
 <title>{activeTool==='achievements'?achCopy.title:copy.toolCollection} | Yumekiraboshi</title>
 <meta name="description" content="Local collection-history save editor"/>
</svelte:head>

<div class="site-shell">
 <header class="topbar">
  <div class="bar-inner">
   <button class="brand" type="button" onclick={goHome} aria-label={copy.brand}>
    <span class="brand-mark" aria-hidden="true">✦</span><span class="brand-name">{copy.brand}</span>
   </button>
   {#if snapshot}<nav class="tools-nav" aria-label="Tools">
    <button type="button" class="tool-tab" class:active={activeTool==='collections'} aria-current={activeTool==='collections'?'page':undefined} onclick={goHome}>{copy.toolCollection}</button>
    <button type="button" class="tool-tab" class:active={activeTool==='achievements'} aria-current={activeTool==='achievements'?'page':undefined} onclick={()=>{activeTool='achievements';editingAchievement=null;achievementFilter='all';achievementLimit=BATCH_SIZE;error='';}}>{achCopy.title}</button>
   </nav>{/if}
   <div class="bar-actions">
    {#if snapshot}
     <span class="save-indicator" title={original?.name??''}><span class:changed={snapshot.dirty} class="state-dot"></span><span class="file-short">{original?.name}</span>{#if draftWarning}<span class="draft-risk" title={copy.autosaveFailed}>⚠</span>{/if}</span>
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
      <option value="auto">{copy.system}</option>
      {#each supportedLocales as language (language.code)}
       <option value={language.code}>{language.label}</option>
      {/each}
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
  {#if snapshot && draftWarning}<div class="message error" role="alert">{copy.autosaveFailed}</div>{/if}
  {#if !snapshot}
   <section class="empty-workspace">
    <div class="empty-decoration" aria-hidden="true">✦</div>
    <h1>{copy.waiting}</h1>
    <button type="button" class="primary big" disabled={busy} onclick={askFile}>{busy?copy.busy:copy.openFile}</button>
    <p>{copy.openHint}</p>
   </section>

  {:else if activeTool==='achievements'}
   <div class="section-heading"><h1>{achCopy.title}</h1><span class="category-count">{snapshot.achievements.filter(a=>a.value.complete).length.toLocaleString(locale)} / {snapshot.achievements.length.toLocaleString(locale)}</span></div>
   <p class="achievement-note">{achCopy.notice}</p>
   <div class="collection-controls">
    <div class="status-filter" role="group" aria-label={achCopy.title}>
     <button type="button" class:active={achievementFilter==='all'} onclick={()=>{achievementFilter='all';achievementLimit=BATCH_SIZE}}>{copy.all}</button>
     <button type="button" class:active={achievementFilter==='completed'} onclick={()=>{achievementFilter='completed';achievementLimit=BATCH_SIZE}}>{achCopy.completed}</button>
     <button type="button" class:active={achievementFilter==='incomplete'} onclick={()=>{achievementFilter='incomplete';achievementLimit=BATCH_SIZE}}>{achCopy.incomplete}</button>
    </div>
   </div>
   <div class="achievement-grid">
    {#each achievementRows.slice(0,achievementLimit) as item (item.index)}
     <article class="achievement-card">
      <div><strong>{achCopy.unknown} {item.index.toLocaleString(locale)}</strong><span class:achieved={item.row.value.complete} class="achievement-status">{item.row.value.complete?'✓ '+achCopy.completed:achCopy.incomplete}</span></div>
      <span class="achievement-progress">{achCopy.progress}: {item.row.value.current.toLocaleString(locale)}</span>
      {#if item.row.value.completed}<span class="achievement-progress">{achCopy.completedAt}: {new Date(Number(item.row.value.completed[0])*1000+Math.floor(item.row.value.completed[1]/1_000_000)).toLocaleString(locale)}</span>{/if}
      <button type="button" class="achievement-edit" disabled={busy} onclick={e=>void openAchievement(item.row,e.currentTarget)}>{achCopy.edit}</button>
     </article>
    {/each}
   </div>
   {#if achievementRows.length===0}<p class="empty-result">{copy.none}</p>{/if}
   {#if achievementRows.length>achievementLimit}
    <div class="load-marker"><button type="button" onclick={()=>achievementLimit=Math.min(achievementLimit+BATCH_SIZE,achievementRows.length)}>{copy.moreItems}</button></div>
   {/if}
   <dialog class="achievement-dialog" bind:this={achievementDialogEl} onclose={onAchievementDialogClosed} oncancel={e=>{if(busy)e.preventDefault()}}>
    {#if editingAchievement}
     <form class="achievement-form" onsubmit={e=>{e.preventDefault();void saveAchievement()}}>
      <div class="date-dialog-heading"><h2>{achCopy.edit}</h2><button class="date-dialog-close" type="button" aria-label={copy.cancel} disabled={busy} onclick={closeAchievement}>×</button></div>
      <label class="achievement-check"><input type="checkbox" bind:checked={achievementComplete}/>{achCopy.completed}</label>
      <label class="date-dialog-field"><span>{achCopy.progress}</span><input type="text" inputmode="decimal" required bind:value={achievementProgress}/></label>
      {#if achievementComplete}
       <label class="date-dialog-field"><span>{achCopy.completedAt}</span><input type="datetime-local" step="1" required bind:value={achievementDate}/></label>
      {/if}
      {#if achievementValidation}<p class="date-dialog-error" role="alert">{achievementValidation}</p>{/if}
      <div class="date-dialog-actions"><button type="button" class="date-dialog-cancel" disabled={busy} onclick={closeAchievement}>{copy.cancel}</button><button type="submit" class="primary" disabled={busy}>{achCopy.save}</button></div>
     </form>
    {/if}
   </dialog>
  {:else if !selectedGroup}
   {#if !catalog}
    <div class="empty-result">{copy.busy}</div>
   {:else}
    <div class="category-grid">
     {#each categories as cat (cat.row[0])}
      <button class="category-card" type="button" onclick={()=>selectCategory(cat.row[0])}>
       <span class="category-image"><img src={ICONS+cat.row[5]} alt="" loading="lazy" onerror={e=>(e.currentTarget as HTMLImageElement).style.visibility='hidden'}/></span>
       <span class="category-label">{titleFor(cat.row)}</span>
       <span class="category-count" title={copy.progressHint}>{cat.count.toLocaleString(locale)} / {cat.total.toLocaleString(locale)}</span>
      </button>
     {/each}
    </div>
    <details class="data-note"><summary>{copy.showAbout}</summary><p>{copy.noName} {copy.sourceNotice} {copy.notGameOwnership}</p>
     <p>{copy.verifiedNames}: {(catalog.items.length-unnamed).toLocaleString(locale)} / {copy.unverifiedNames}: {unnamed.toLocaleString(locale)}</p>
    </details>
   {/if}
  {:else if !activeSubgroup}
   <div class="section-heading with-back">
    <button type="button" class="back-link" onclick={goHome}>‹ {copy.back}</button>
    <h1>{group?titleFor(group):copy.collections}</h1>
   </div>
   <div class="subcategory-grid">
    {#each subgroups as sub (sub.key)}
     {@const sprite=sub.previewId!==null&&iconPack?.group===selectedGroup?iconPack.entries[String(sub.previewId)]:undefined}
     <button type="button" class="subcategory-card" onclick={()=>selectSubcategory(sub.key)}>
      <span class="subcategory-art" aria-hidden="true">
       {#if sprite}
        <span class="item-sprite" style:background-image={'url("'+sprite.url+'")'} style:background-position={'-'+sprite.x+'px -'+sprite.y+'px'}></span>
       {:else}
        <span class="subcategory-art-empty">✧</span>
       {/if}
      </span>
      <span class="subcategory-label">{subcategoryLabel(sub.key,locale)}</span>
      <span class="subcategory-count" title={copy.progressHint}>{sub.count.toLocaleString(locale)} / {sub.total.toLocaleString(locale)}</span>
     </button>
    {/each}
   </div>
  {:else}
   <div class="section-heading with-back">
    <button type="button" class="back-link" onclick={subgroups.length>1?goSubcategories:goHome}>‹ {subgroups.length>1?copy.backSubcategories:copy.back}</button>
    <h1>{group?titleFor(group):copy.collections}{#if subgroups.length>1}<span class="subsection-divider"> / </span>{subcategoryLabel(activeSubgroup,locale)}{/if}</h1>
   </div>
   <div class="collection-controls">
    <label class="search-field">
     <span class="search-symbol" aria-hidden="true">⌕</span>
     <input type="search" placeholder={copy.search} aria-label={copy.search} bind:value={query} oninput={()=>visibleLimit=BATCH_SIZE}/>
    </label>
    <div class="status-filter" role="group" aria-label="Status">
     <button type="button" class:active={filter==='all'} onclick={()=>{filter='all';visibleLimit=BATCH_SIZE}}>{copy.all}</button>
     <button type="button" class:active={filter==='unrecorded'} onclick={()=>{filter='unrecorded';visibleLimit=BATCH_SIZE}}>{copy.unrecorded}</button>
     <button type="button" class:active={filter==='recorded'} onclick={()=>{filter='recorded';visibleLimit=BATCH_SIZE}}>{copy.recorded}</button>
    </div>
    {#if hasVariants}
     <button type="button" class="variation-button" class:active={showVariants} aria-pressed={showVariants}
      onclick={()=>{showVariants=!showVariants;visibleLimit=BATCH_SIZE;editId=null}}>
      {showVariants?copy.hideVariants:copy.showVariants}
     </button>
    {/if}
   </div>
   {#if !snapshot.membershipEdit}<div class="compact-hint">{copy.noMembership}</div>{/if}
   <div class="item-grid">
    {#each visibleItems as item (item[0])}
     {@const tick=recorded[String(item[0])]}
     {@const direct=tick!==undefined}
     {@const recordIds=families[String(item[7]||item[0])]??[]}
     {@const has=showVariants?direct:recordIds.length>0}
     {@const mayAdd=snapshot.membershipEdit && snapshot.version===catalog?.version && item[4]===0}
     {@const mayToggle=showVariants?(direct?snapshot.membershipEdit:mayAdd):(recordIds.length===0?mayAdd:recordIds.length===1&&direct&&snapshot.membershipEdit)}
     {@const sprite=iconPack?.group===selectedGroup?iconPack.entries[String(item[0])]:undefined}
     <article class="item-tile" class:is-recorded={has}>
      <button type="button" class="item-toggle" aria-pressed={has} aria-label={(has?copy.unsetRecorded:copy.setRecorded)+': '+nameFor(item)}
       title={mayToggle?(has?copy.unsetRecorded:copy.setRecorded):!showVariants&&recordIds.length>0?copy.variantsToEdit:copy.unsafe} disabled={busy||!mayToggle}
       onclick={()=>void change(item[0],direct?null:EPOCH+BigInt(Date.now())*10000n)}>
       <span class="item-art" aria-hidden="true">
        {#if sprite}
         <span class="item-sprite" style:background-image={'url("'+sprite.url+'")'} style:background-position={'-'+sprite.x+'px -'+sprite.y+'px'}></span>
        {:else}
         <span class="item-art-empty">✧</span>
        {/if}
       </span>
       <span class="item-name">{nameFor(item)}</span>
       <span class="item-status" class:has={has}>{has?'✓ '+copy.recorded:copy.unrecorded}</span>
      </button>
      {#if direct}<button type="button" class="date-button" title={copy.editDate} aria-label={copy.editDate+': '+nameFor(item)} disabled={busy} onclick={e=>void editDate(item[0],e.currentTarget)}>◷</button>{/if}
     </article>
    {/each}
   </div>
   {#if matching.length===0}<p class="empty-result">{copy.none}</p>{/if}
   {#if iconError}<p class="compact-hint">{copy.imagesUnavailable}</p>{/if}
   {#if visibleItems.length<matching.length}
    <div class="load-marker" bind:this={loadMoreSentinel} aria-label={copy.moreItems}>
     <button type="button" onclick={()=>visibleLimit=Math.min(visibleLimit+BATCH_SIZE,matching.length)}>{copy.moreItems}</button>
    </div>
   {/if}
  {/if}
 </main>
 <dialog class="date-dialog" bind:this={dateDialogEl} onclose={onDateDialogClosed} oncancel={e=>{if(busy)e.preventDefault()}}>
  {#if dateDialogItem && dateDialogTick!==null}
   {@const sprite=iconPack?.group===selectedGroup?iconPack.entries[String(dateDialogItem[0])]:undefined}
   <form class="date-dialog-inner" onsubmit={e=>{e.preventDefault();void applyDate()}}>
    <div class="date-dialog-heading">
     <h2>{copy.editDate}</h2>
     <button type="button" class="date-dialog-close" aria-label={copy.cancel} disabled={busy} onclick={closeDateDialog}>×</button>
    </div>
    <div class="date-dialog-item">
     <span class="date-dialog-art" aria-hidden="true">
      {#if sprite}
       <span class="item-sprite" style:background-image={'url("'+sprite.url+'")'} style:background-position={'-'+sprite.x+'px -'+sprite.y+'px'}></span>
      {:else}
       <span class="item-art-empty">✧</span>
      {/if}
     </span>
     <div class="date-dialog-detail"><strong>{nameFor(dateDialogItem)}</strong><span>{'✓ '+copy.recorded}</span></div>
    </div>
    <label class="date-dialog-field">
     <span>{copy.editDate}</span>
     <input type="datetime-local" step="1" required bind:value={dateValue} oninput={()=>dateValidation=''}/>
    </label>
    {#if dateValidation}<p class="date-dialog-error" role="alert">{dateValidation}</p>{/if}
    <div class="date-dialog-actions">
     {#if snapshot?.membershipEdit}
      <button type="button" class="date-dialog-clear" disabled={busy} onclick={()=>void clearDate()}>{copy.unsetRecorded}</button>
     {/if}
     <span class="date-dialog-spacer"></span>
     <button type="button" class="date-dialog-cancel" disabled={busy} onclick={closeDateDialog}>{copy.cancel}</button>
     <button type="submit" class="primary" disabled={busy||!dateValue||!dateChanged}>{copy.apply}</button>
    </div>
   </form>
  {/if}
 </dialog>
</div>
