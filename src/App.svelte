<script lang="ts">
 import {onMount,tick} from 'svelte';
 import {openSave,changeCollection,createAchievement,createAchievementWithParent,completeChildWithNewParent,changeAchievement,changeAchievementPair,applyDraft,jumpHistory,restoreHistory,exportSave,clear,type SaveSnapshot,type AchievementEntry,type AchievementValue,type AchievementPatch,type HistoryRecord} from './worker-client';
 import {planCategoryParentCompletion,planMissingCategoryParentCompletion,planCategoryParentRevocation,planCategoryParentDateSync} from './achievement-parent-auto';
 import {diffPatches,restoreLocalDraft,saveOriginalLocally,saveDraftChanges,forgetLocalDraft,type DraftPatch} from './draft-store';
 import {diffAchievements,decodeAchievementDraft,type StoredPatch} from './achievement-draft';
 import {achievementCopy} from './achievement-ui';
 import {historyCopy,historyDetailCopy} from './history-copy';
 import {loadSourceItemNames,type SourceItemNames} from './source-names';
 import {decodeHistoryDetails,formatHistoryChange} from './history-details';
 import {compactAchievementCopy} from './achievement-compact-ui';
 import {toggleAchievementState} from './achievement-quick';
 import {achievementProgressTarget} from './achievement-progress';
 import {achievementFactsCopy} from './achievement-facts-ui';
 import {loadAchievementFacts,counterIndex,type AchievementFactsIndex} from './achievement-facts';
 import {joinAchievementCatalog,type AchievementListRow} from './achievement-catalog';
 import {loadAchievementGroups,groupRows,ungroupedRows,nativeAchievementOrder,groupSummaries as summarizeAchievementGroups,type AchievementHierarchy} from './achievement-groups';
 import {achievementGroupCopy} from './achievement-group-ui';
 import {loadAchievementCategoryAtlas,type CategoryIconAtlas} from './achievement-category-icons';
 import {loadAchievementIndividualAtlas,type IndividualAchievementAtlas} from './achievement-individual-icons';
 import {loadAchievementIndex,achievementGuid,readableSourceKey,type AchievementIndex} from './achievement-index';
 import {loadAchievementTitles,type AchievementTitles} from './achievement-localization';
 import {editorErrors} from './ui-copy';
 import {supportedLocales,isLocale,detectLocale,isRtl,type Locale,type LanguagePref} from './locales';
 import {localizedCopy} from './ui-locales';
 import {loadLocaleIndex,loadGameLabels,EMPTY_LABELS,type GameLabels} from './game-localization';
 import {loadIconPack,type IconPack} from './icon-packs';
 import {loadNativeDyePalettes,type NativeDyePalettes} from './native-dye-palettes';
 import {toDateTimeValue,fromDateTimeValue} from './collection-date';
 import {listSubcategories,subcategoryLabel,recordedFamilies,type CollectionItem} from './subcategories';
 import {searchAllCollectionItems,collectionDisplayName,filterCollectionItems} from './collection-search';
import {verifiedFloorplanName} from './floorplan-names';
import {mayCreateCollectionHistory} from './collection-eligibility';
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
 let achievementQuery=$state('');
 let achievementIndex:AchievementIndex=$state(new Map());
 let achievementGroupHierarchy:AchievementHierarchy|null=$state(null);
 let achievementCategoryAtlas:CategoryIconAtlas|null=$state(null);
 let achievementIndividualAtlas:IndividualAchievementAtlas|null=$state(null);
 let achievementImagesFailed=$state(false);
 let achievementImagesStarted=false;
 let achievementImagesEpoch=0;
 let achievementGroupSelection:string|null=$state(null);
 let achievementFacts:AchievementFactsIndex=$state(new Map());
 let achievementFactsEpoch=0;
 let achievementTitles:AchievementTitles=$state({});
 let achievementTitleEpoch=0;
 let achievementLimit=$state(BATCH_SIZE);
 let achievementLoadMoreSentinel=$state<HTMLDivElement|undefined>(undefined);
 let editingAchievement:AchievementEntry|null=$state(null);
 let editingAchievementTitle=$state('');
 let achievementDialogEl:HTMLDialogElement|undefined=$state();
 let achievementReturnFocus:HTMLElement|null=null;
 let achievementDate=$state('');
 let achievementValidation=$state('');
 let achievementBaseline:AchievementEntry[]=[];
 let catalog:Catalog|null=$state(null);
 let sourceNames:SourceItemNames=$state({});
 let sourceNameEpoch=0;
 let snapshot:SaveSnapshot|null=$state(null);
 let original:File|null=$state(null);
 let recorded:Record<string,bigint>=$state({});
 let selectedGroup:string|null=$state(null);
 let selectedSubgroup:string|null=$state(null);
 let showVariants=$state(false);
 let query=$state('');
 let collectionSearchDrilldown=$state(false);
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
 let nativeDyePalettes:NativeDyePalettes=$state({});
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
 let historyMenu:HTMLDetailsElement|undefined=$state(undefined);
 const locale=$derived(languagePref==='auto'?browserLanguage:languagePref);
 const copy=$derived(localizedCopy(locale));
 const achCopy=$derived(achievementCopy(locale));
 const hCopy=$derived(historyCopy(locale));
 const hDetailCopy=$derived(historyDetailCopy(locale));
 const compactCopy=$derived(compactAchievementCopy(locale));
 const groupCopy=$derived(achievementGroupCopy(locale));
 const factCopy=$derived(achievementFactsCopy(locale));
 const gameCounters=$derived(counterIndex((snapshot as SaveSnapshot|null)?.counters??[]));
 const rewardsById=$derived(new Map(((catalog as Catalog|null)?.items??[]).map((item:Item)=>[item[0],nameFor(item)])));
 const actualTheme=$derived(themePref==='system'?(prefersDark?'dark':'light'):themePref);
 const entriesCount=$derived(Object.keys(recorded).length);
 const tabHistory=$derived(((snapshot as SaveSnapshot|null)?.history??[]).filter((entry:HistoryRecord)=>entry.scope===activeTool));
 const tabHistoryCursor=$derived(tabHistory.filter(entry=>entry.applied).length);
 const historyDetails=$derived(decodeHistoryDetails((snapshot as SaveSnapshot|null)?.historyCheckpoint??null,(snapshot as SaveSnapshot|null)?.history??[]));
 const tabHistoryDetails=$derived(historyDetails.filter(entry=>entry.scope===activeTool));
 const historyItems=$derived(new Map(((catalog as Catalog|null)?.items??[]).map(item=>[item[0],item])));
 const sourceAchievementRows=$derived(joinAchievementCatalog(achievementIndex,(snapshot as SaveSnapshot|null)?.achievements??[]));
 const achievementGroupSummaries=$derived(achievementGroupHierarchy?summarizeAchievementGroups(achievementGroupHierarchy,sourceAchievementRows):[]);
 const unmappedAchievementRows=$derived(achievementGroupHierarchy?ungroupedRows(achievementGroupHierarchy,sourceAchievementRows):[]);
 const sourceOrderedAchievementRows=$derived(nativeAchievementOrder(achievementGroupHierarchy,sourceAchievementRows,achievementFacts));
 const groupScopedAchievementRows=$derived(achievementGroupHierarchy&&achievementGroupSelection?
  achievementGroupSelection==='__unmapped'?unmappedAchievementRows:groupRows(achievementGroupHierarchy,achievementGroupSelection,sourceAchievementRows,achievementFacts):
  sourceOrderedAchievementRows);
 const achievementRows=$derived(groupScopedAchievementRows.filter(x=>{
  const q=achievementQuery.trim().toLocaleLowerCase();
  if(!q)return true;
  const meta=achievementIndex.get(x.guid);
  return achievementName(x.guid,x.index).toLocaleLowerCase().includes(q)||
   (meta?.key??'').toLocaleLowerCase().includes(q);
 }));
 const group=$derived(((catalog as Catalog | null)?.groups??[]).find((g:Group)=>g[0]===selectedGroup)??null);
 const subgroups=$derived(selectedGroup?listSubcategories((catalog as Catalog|null)?.items??[],selectedGroup,recorded,locale):[]);
 const activeSubgroup=$derived(subgroups.length===1?subgroups[0].key:subgroups.some(s=>s.key===selectedSubgroup)?selectedSubgroup:null);
 const families=$derived(recordedFamilies((catalog as Catalog|null)?.items??[],recorded));
 const hasVariants=$derived(Boolean(activeSubgroup&&((catalog as Catalog|null)?.items??[]).some((item:Item)=>item[3]===selectedGroup&&item[2]===activeSubgroup&&item[0]!==item[7])));
 const dateDialogItem=$derived(editId===null?null:((catalog as Catalog|null)?.items??[]).find((item:Item)=>item[0]===editId)??null);
 const dateDialogTick=$derived(editId===null?null:recorded[String(editId)]??null);
 const dateChanged=$derived(dateDialogTick!==null&&dateValue!==toDateTimeValue(dateDialogTick));

 onMount(()=>{
  // Native original-game dye swatches are optional visual metadata.
  void loadNativeDyePalettes(import.meta.env.BASE_URL).then(palettes=>nativeDyePalettes=palettes).catch(()=>{});
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
  void loadAchievementIndex(import.meta.env.BASE_URL).then(index=>{
   achievementIndex=index;
   void loadAchievementGroups(import.meta.env.BASE_URL,index)
    .then(groups=>achievementGroupHierarchy=groups).catch(()=>{});
  }).catch(()=>{});

  fetch(import.meta.env.BASE_URL+'catalog.json')
   .then(r=>r.ok?r.json():Promise.reject(Error('Collection catalog unavailable')))
   .then((v:Catalog)=>{
    if(v.schema!=='HKIA.CollectionDisplayCatalog.2'||!Array.isArray(v.groups)||!Array.isArray(v.items))throw Error('Invalid collection catalog');
    catalog=v;
   })
   .catch(e=>error=describeError(e));
  return ()=>{
   media.removeEventListener?.('change',listener);
   window.removeEventListener('beforeunload',beforeUnload);
   iconEpoch++;iconPack?.dispose();
   achievementImagesEpoch++;
   achievementIndividualAtlas?.dispose?.();
   achievementCategoryAtlas?.dispose?.();
  };
 });
 $effect(()=>{
  if(typeof document!=='undefined'){document.documentElement.lang=locale;document.documentElement.dir=isRtl(locale)?'rtl':'ltr';document.documentElement.dataset.theme=actualTheme;}
 });
 /* v3.0.1 Name.selectedString provides an exact original Babel lookup
    for all 10,262 source-mapped collection item IDs in all 16 locales.
    Fall back to previous names if the source-names asset cannot load. */
 $effect(()=>{
  const language=locale;
  const epoch=++sourceNameEpoch;
  sourceNames={};
  void loadSourceItemNames(import.meta.env.BASE_URL,language).then(names=>{
   if(epoch===sourceNameEpoch)sourceNames=names;
  }).catch(()=>{if(epoch===sourceNameEpoch)sourceNames={};});
 });
 /* Native artwork loads only with a save in the Achievements tab.
    Tampered or stale image data fail closed without blocking save edits. */
 $effect(()=>{
  if(!snapshot||activeTool!=='achievements'||achievementIndex.size!==820||!achievementGroupHierarchy||achievementImagesStarted)return;
  achievementImagesStarted=true;
  const epoch=++achievementImagesEpoch;
  const index=achievementIndex,groups=achievementGroupHierarchy;
  void loadAchievementIndividualAtlas(import.meta.env.BASE_URL,index)
   .then(atlas=>{
    if(epoch!==achievementImagesEpoch){atlas.dispose?.();return;}
    achievementIndividualAtlas=atlas;
   }).catch(()=>{if(epoch===achievementImagesEpoch)achievementImagesFailed=true});
  void loadAchievementCategoryAtlas(import.meta.env.BASE_URL,index,groups)
   .then(atlas=>{
    if(epoch!==achievementImagesEpoch){atlas.dispose?.();return;}
    achievementCategoryAtlas=atlas;
   }).catch(()=>{if(epoch===achievementImagesEpoch)achievementImagesFailed=true});
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
 $effect(()=>{
  const current=locale;
  const index=achievementIndex;
  const epoch=++achievementTitleEpoch;
  achievementTitles={};
  if(index.size===820)void loadAchievementTitles(current,import.meta.env.BASE_URL,index)
   .then(titles=>{if(epoch===achievementTitleEpoch)achievementTitles=titles})
   .catch(()=>{if(epoch===achievementTitleEpoch)achievementTitles={}});
 });
 $effect(()=>{
  const source=achievementIndex;
  const epoch=++achievementFactsEpoch;
  achievementFacts=new Map();
  if(source.size===820)void loadAchievementFacts(import.meta.env.BASE_URL,source)
   .then(facts=>{if(epoch===achievementFactsEpoch)achievementFacts=facts})
   .catch(()=>{if(epoch===achievementFactsEpoch)achievementFacts=new Map()});
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
  return catalog.groups
   .map(g=>({row:g,count:owned.get(g[0])?.size??0,total:totals.get(g[0])?.size??0}));
 });
 const matching=$derived(filterCollectionItems(
  (catalog as Catalog|null)?.items??[],selectedGroup,activeSubgroup,
  recorded,families,showVariants,filter,query,locale,nameFor
 ));
 const showingGlobalCollectionSearch=$derived(Boolean(query.trim())&&!collectionSearchDrilldown);
 const collectionSearchResults=$derived(searchAllCollectionItems((catalog as Catalog|null)?.items??[],query,locale,nameFor));
 const visibleItems=$derived(matching.slice(0,visibleLimit));
 const hasSharedDyeableIcon=$derived(matching.some(item=>item[1].startsWith('item_c_dyeable_')));
 $effect(()=>{
  const el=loadMoreSentinel;
  const count=showingGlobalCollectionSearch?collectionSearchResults.length:matching.length;
  if(!el||typeof IntersectionObserver==='undefined')return;
  const observer=new IntersectionObserver(entries=>{
   if(entries.some(x=>x.isIntersecting))visibleLimit=Math.min(visibleLimit+BATCH_SIZE,count);
  },{rootMargin:'720px 0px'});
  observer.observe(el);
  return ()=>observer.disconnect();
 });
 $effect(()=>{
  const el=achievementLoadMoreSentinel;
  if(!el||typeof IntersectionObserver==='undefined')return;
  const observer=new IntersectionObserver(entries=>{
   if(entries.some(x=>x.isIntersecting))
    achievementLimit=Math.min(achievementLimit+BATCH_SIZE,achievementRows.length);
  },{rootMargin:'720px 0px'});
  observer.observe(el);
  return ()=>observer.disconnect();
 });
 const unnamed=$derived((catalog as Catalog|null)?.items.filter((x:Item)=>!x[5]&&!x[6]&&!verifiedFloorplanName(x[0],locale)).length??0);
 function describeError(e:unknown){const raw=e instanceof Error?e.message:String(e);return editorErrors[locale==='ja'?'ja':'en'][raw]??(locale==='ja'?(raw||copy.unknown):copy.unknown);}
 function setLanguage(v:LanguagePref){
  languagePref=v;try{localStorage.setItem('hkia-display-locale',v)}catch{}
 }
 function setTheme(v:ThemePref){
  themePref=v;try{localStorage.setItem('hkia-display-theme',v)}catch{}
 }
 function showAchievementGroup(guid:string|null){
  achievementGroupSelection=guid;achievementQuery='';
  achievementLimit=BATCH_SIZE;
 }
 function achievementName(guid:string,index:number):string{
  const meta=achievementIndex.get(guid);
  if(!meta)return achCopy.unknown+' '+index.toLocaleString(locale);
  return achievementTitles[meta.titleId]??gameLabels.strings[meta.titleId]??readableSourceKey(meta.key);
 }
 function titleFor(g:Group){
  // Owner verified the in-game Japanese label; source manifest has an older
  // community-translation string. Other categories retain their current names
  // pending game-original group title crosswalk.
  return locale==='ja'&&g[0]==='collection_group_citytown'?'都市の町':locale==='ja'?g[1]:g[2];
 }
 function nameFor(item:Item){
  // Source ItemId -> Babel ID -> original localized text takes precedence over
  // the older name-by-string heuristic. All 18 floorplans have exact ID links.
  return sourceNames[String(item[0])]??verifiedFloorplanName(item[0],locale)??
   collectionDisplayName(item,gameLabels.names[String(item[0])],locale==='ja',copy.unverifiedItem);
 }
 function jumpToCollectionItem(item:Item){
  // Search always covers all collection groups. Selecting a result restores
  // the real category/subcategory editor, including its original art pack.
  selectedGroup=item[3];selectedSubgroup=item[2];
  showVariants=item[0]!==item[7];
  query=nameFor(item);collectionSearchDrilldown=true;
  filter='all';visibleLimit=BATCH_SIZE;editId=null;error='';
  // Ensure even a late-ranked homonymous result is actually visible when opened.
  const position=matching.findIndex(x=>x[0]===item[0]);
  if(position>=0)visibleLimit=Math.ceil((position+1)/BATCH_SIZE)*BATCH_SIZE;
  void tick().then(()=>document.getElementById('collection-item-'+item[0])?.scrollIntoView({block:'center'}));
  void fetchImages(item[3]);
  void persistDraft();
 }
 function selectCategory(key:string){
  selectedGroup=key;selectedSubgroup=null;showVariants=false;visibleLimit=BATCH_SIZE;
  query='';collectionSearchDrilldown=false;filter='all';editId=null;error='';
  void fetchImages(key);
  void persistDraft();
 }
 function selectSubcategory(key:string){
  if(!selectedGroup||!subgroups.some(sub=>sub.key===key))return;
  selectedSubgroup=key;showVariants=false;visibleLimit=BATCH_SIZE;query='';collectionSearchDrilldown=false;filter='all';editId=null;error='';
  if(iconPack?.group!==selectedGroup&&iconLoadingGroup!==selectedGroup)void fetchImages(selectedGroup);
  void persistDraft();
 }
 function goSubcategories(){
  selectedSubgroup=null;showVariants=false;visibleLimit=BATCH_SIZE;editId=null;query='';collectionSearchDrilldown=false;filter='all';
  if(snapshot)void persistDraft();
 }
 function goHome(){
  activeTool='collections';selectedGroup=null;selectedSubgroup=null;showVariants=false;visibleLimit=BATCH_SIZE;
  editId=null;query='';collectionSearchDrilldown=false;filter='all';iconEpoch++;iconLoadingGroup=null;iconPack?.dispose();iconPack=null;iconError=false;
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
 function historyEntryChange(i:number):string{
  return formatHistoryChange(tabHistoryDetails[i],locale,hDetailCopy);
 }
 function historyEntryLabel(entry:HistoryRecord):string{
  if(entry.scope==='collections'){
   const item=historyItems.get(entry.itemId??0);
   return item?nameFor(item):'#'+String(entry.itemId);
  }
  if(!entry.guid)return hCopy.title;
  return achievementName(achievementGuid(entry.guid),0)+(entry.paired?' · '+hCopy.paired:'');
 }
 function update(s:SaveSnapshot){snapshot=s;recorded=Object.fromEntries(s.entries.map(([id,t])=>[String(id),t]));}
 /** Verify a restored native journal reproduces the locally persisted net edits.
  * Canonical comparison retains lossless decimal timestamp strings.
  */
 function recoveredMatchesDraft(
  baseRows:ReadonlyMap<number,bigint>,baseAchievements:readonly AchievementEntry[],
  recovered:SaveSnapshot,collectionPatches:readonly DraftPatch[],achievementPatches:readonly StoredPatch[]
 ):boolean{
  const current=Object.fromEntries(recovered.entries.map(([id,t])=>[String(id),t]));
  const sortedCollection=(xs:readonly DraftPatch[])=>
   JSON.stringify([...xs].sort((a,b)=>a.id-b.id));
  const sortedAchievement=(xs:readonly StoredPatch[])=>
   JSON.stringify([...xs].sort((a,b)=>{
    for(let i=0;i<4;i++){const d=a.guid[i]-b.guid[i];if(d)return d}
    return 0;
   }));
  return sortedCollection(diffPatches(baseRows,current))===sortedCollection(collectionPatches)&&
   sortedAchievement(diffAchievements(baseAchievements,recovered.achievements))===sortedAchievement(achievementPatches);
 }
 function persistDraft():Promise<void>{
  if(!original)return Promise.resolve();
  const patches=diffPatches(baseline,recorded);
  const achievements=diffAchievements(achievementBaseline,snapshot?.achievements??[]);
  const ui={group:selectedGroup,subgroup:selectedSubgroup};
  const checkpoint=(snapshot as SaveSnapshot|null)?.historyCheckpoint??null;
  const job=draftWrites.catch(()=>{}).then(()=>saveDraftChanges(patches,ui,achievements,checkpoint));
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
    let session:SaveSnapshot|null=null;
    if(draft.historyCheckpoint){
     try{
      const recovered=await restoreHistory(draft.historyCheckpoint);
      if(!recoveredMatchesDraft(originalRows,s.achievements,recovered,draft.patches,draft.achievementPatches))
       throw Error('HISTORY_RESTORE_CONFLICT');
      session=recovered;
     }catch{
      // Atomic native replay may reject stale or malformed metadata.
      // Reopen the original file before applying validated net changes.
      await openSave(draft.file);
     }
    }
    if(!session)session=patches.length||achievementPatches.length?await applyDraft(patches,achievementPatches):s;
   collectionSearchDrilldown=false;query='';
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
  const priorHistoryCheckpoint=(snapshot as SaveSnapshot|null)?.historyCheckpoint??null;
  const priorGroup=selectedGroup;
  const priorSubgroup=selectedSubgroup;
  const priorVariants=showVariants;
  busy=true;error='';
  try{
   if(file.size>60*1024*1024||file.size===0)throw Error(copy.typeIssue);
   await draftWrites.catch(()=>{});
   const session=await openSave(file);
   original=file;baseline=new Map(session.entries);achievementBaseline=session.achievements;update(session);
   selectedGroup=null;selectedSubgroup=null;showVariants=false;visibleLimit=BATCH_SIZE;editId=null;query='';collectionSearchDrilldown=false;filter='all';
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
     let previous:SaveSnapshot|null=null;
     if(priorHistoryCheckpoint){
      try{
       const recovered=await restoreHistory(priorHistoryCheckpoint);
       if(!recoveredMatchesDraft(priorBaseline,opened.achievements,recovered,
        diffPatches(priorBaseline,priorRecorded),achievementPatches))throw Error('HISTORY_RESTORE_CONFLICT');
       previous=recovered;
      }catch{await openSave(priorFile)}
     }
     if(!previous)previous=patches.length||decodedAchievements.length?await applyDraft(patches,decodedAchievements):opened;
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
 async function goToHistory(target:number){
  if(!snapshot||busy||!Number.isSafeInteger(target)||target<0||target>tabHistory.length||target===tabHistoryCursor)return;
  const scope=activeTool;
  busy=true;error='';
  try{
   update(await jumpHistory(scope,target));
   editId=null;editingAchievement=null;
   if(historyMenu)historyMenu.open=false;
   await persistDraft();
  }catch(e){error=e instanceof Error?e.message:copy.unknown}
  finally{busy=false}
 }
 async function actHistory(which:'undo'|'redo'){
  return goToHistory(tabHistoryCursor+(which==='undo'?-1:1));
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

 /**
  * Keep source-defined category completion, revocation, or date sync in one atomic edit.
  * Counters, rewards and platform claims remain untouched.
  */
 async function changeAchievementWithParent(live:AchievementEntry,next:AchievementValue):Promise<SaveSnapshot>{
  const revocation=snapshot?.version==='3.0.1'?planCategoryParentRevocation(
   achievementGroupHierarchy,snapshot.achievements,live.guid,live.value,next
  ):null;
  if(revocation)return changeAchievementPair({guid:live.guid,before:live.value,after:next},revocation);
  const dateSync=snapshot?.version==='3.0.1'?planCategoryParentDateSync(
   achievementGroupHierarchy,snapshot.achievements,live.guid,live.value,next
  ):null;
  if(dateSync)return changeAchievementPair({guid:live.guid,before:live.value,after:next},dateSync);
  const parent=planCategoryParentCompletion(achievementGroupHierarchy,snapshot?.achievements??[],live.guid,next);
  if(parent){
   const child:AchievementPatch={guid:live.guid,before:live.value,after:next};
   return changeAchievementPair(child,parent);
  }
  const missingParent=planMissingCategoryParentCompletion(achievementGroupHierarchy,snapshot?.achievements??[],live.guid,next);
  if(missingParent&&snapshot?.version==='3.0.1')
   return completeChildWithNewParent({guid:live.guid,before:live.value,after:next},missingParent);
  return changeAchievement(live.guid,live.value,next);
 }
 /** An absent saved AchievementModel means 0/X in the game UI.
  * Only clicking a verified source-defined tile creates a new Union(16) model.
  * v3.0.0 creation is gated until its exact version-specific source is verified.
  */
 async function quickToggleAchievement(item:AchievementListRow){
  if(!snapshot||busy)return;
  const live=snapshot.achievements.find(x=>achievementGuid(x.guid)===item.guid);
  if(!live&&(snapshot.version!=='3.0.1'||!achievementIndex.has(item.guid)))return;
  busy=true;error='';
  try{
   const target=achievementProgressTarget(
    achievementGroupHierarchy?.byGuid.get(item.guid)?.children.length??null,
    achievementFacts.get(item.guid)?.threshold??null
   );
   if(target===null&&achievementIndex.has(item.guid)){error=achCopy.goalUnavailable;return;}
   const prior:AchievementValue=live?.value??{complete:false,current:0,completed:null};
   const next=toggleAchievementState(prior,Date.now(),target);
   if(live){
    update(await changeAchievementWithParent(live,next));
   }else{
    const guid=item.guid.split(':').map(word=>parseInt(word,16)) as AchievementEntry['guid'];
    const parent=planCategoryParentCompletion(achievementGroupHierarchy,snapshot.achievements,guid,next);
    const missingParent=parent?null:planMissingCategoryParentCompletion(achievementGroupHierarchy,snapshot.achievements,guid,next);
    update(await (parent?createAchievementWithParent(guid,next,parent):
     missingParent?completeChildWithNewParent({guid,before:null,after:next},missingParent):
     createAchievement(guid,next)));
   }
   await persistDraft();
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 function formatAchievementDate(value:AchievementValue):string{
  if(!value.completed)return '';
  const ms=Number(value.completed[0])*1000+Math.floor(value.completed[1]/1_000_000);
  const date=new Date(ms);
  if(!Number.isFinite(date.getTime()))return '';
  const pad=(v:number)=>String(v).padStart(2,'0');
  return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes())+':'+pad(date.getSeconds());
 }
 async function openAchievement(row:AchievementEntry,opener:HTMLElement,index:number){
  if(busy)return;
  editingAchievement=row;achievementReturnFocus=opener;editingAchievementTitle=achievementName(achievementGuid(row.guid),index);
  achievementDate=formatAchievementDate(row.value)||(row.value.complete?formatAchievementDate({complete:true,current:0,completed:[BigInt(Math.floor(Date.now()/1000)),0]}):'');
  achievementValidation='';
  await tick();
  if(achievementDialogEl&&!achievementDialogEl.open)achievementDialogEl.showModal();
 }
 function closeAchievement(){if(achievementDialogEl?.open)achievementDialogEl.close()}
 function onAchievementDialogClosed(){
  editingAchievement=null;editingAchievementTitle='';achievementValidation='';
  const focus=achievementReturnFocus;achievementReturnFocus=null;
  if(focus?.isConnected)focus.focus();
 }
 async function saveAchievement(){
  const selected=editingAchievement;
  if(!snapshot||!selected||busy||!selected.value.complete)return;
  let completed:AchievementValue['completed']=selected.value.completed;
  if(selected.value.complete){
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
  const next:AchievementValue={complete:selected.value.complete,current:selected.value.current,completed};
  if(next.current===selected.value.current&&next.completed?.[0]===selected.value.completed?.[0]&&
   next.completed?.[1]===selected.value.completed?.[1]){closeAchievement();return}
  busy=true;error='';achievementValidation='';
  try{
   update(await changeAchievementWithParent(selected,next));
   closeAchievement();await persistDraft();
  }catch(e){achievementValidation=describeError(e)}
  finally{busy=false}
 }

</script>

<svelte:head>
 <title>{activeTool==='achievements'?achCopy.title+' | HKIA Save Editor':'HKIA Save Editor'}</title>
 <meta name="description" content="HKIA Save Editor — edit local collection history and achievements"/>
</svelte:head>

<div class="site-shell">
 <header class="topbar">
  <div class="bar-inner">
   <button class="brand" type="button" onclick={goHome} aria-label={copy.brand}>
    <span class="brand-mark" aria-hidden="true">✦</span><span class="brand-name">{copy.brand}</span>
   </button>
   {#if snapshot}<nav class="tools-nav" aria-label="Tools">
    <button type="button" class="tool-tab" class:active={activeTool==='collections'} aria-current={activeTool==='collections'?'page':undefined} onclick={goHome}>{copy.toolCollection}</button>
    <button type="button" class="tool-tab" class:active={activeTool==='achievements'} aria-current={activeTool==='achievements'?'page':undefined} onclick={()=>{activeTool='achievements';editingAchievement=null;showAchievementGroup(null);error='';}}>{achCopy.title}</button>
   </nav>{/if}
   <div class="bar-actions">
    {#if snapshot}
     <span class="save-indicator" title={original?.name??''}><span class:changed={snapshot.dirty} class="state-dot"></span><span class="file-short">{original?.name}</span>{#if draftWarning}<span class="draft-risk" title={copy.autosaveFailed}>⚠</span>{/if}</span>
     <button type="button" class="icon-button" title={copy.undo} aria-label={copy.undo} disabled={busy||tabHistoryCursor===0} onclick={()=>void actHistory('undo')}><svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 1 2.7 6.3"/></svg></button>
     <button type="button" class="icon-button" title={copy.redo} aria-label={copy.redo} disabled={busy||tabHistoryCursor>=tabHistory.length} onclick={()=>void actHistory('redo')}><svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 7v6h-6"/><path d="M21 13a9 9 0 1 0-2.7 6.3"/></svg></button>
     <details class="history-menu" bind:this={historyMenu}>
      <summary class="icon-button" title={hCopy.title} aria-label={hCopy.title}><svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg></summary>
      <div class="history-popover">
       <div class="history-heading">{hCopy.title} · {activeTool==='collections'?copy.toolCollection:achCopy.title}</div>
       {#if !tabHistory.length}
        <p class="history-empty">{hCopy.empty}</p>
       {:else}
        <div class="history-list">
         <button type="button" class:active={tabHistoryCursor===0} disabled={busy} title={hCopy.step} onclick={()=>void goToHistory(0)}>
          <span class="history-step">0</span><span class="history-text">{hCopy.initial}</span>
          {#if tabHistoryCursor===0}<span class="history-current" aria-label={hCopy.current}>✓</span>{/if}
         </button>
         {#each tabHistory as entry,i (i)}
          <button type="button" class:active={tabHistoryCursor===i+1} disabled={busy} title={hCopy.step} onclick={()=>void goToHistory(i+1)}>
           <span class="history-step">{i+1}</span><span class="history-text"><span class="history-item-name">{historyEntryLabel(entry)}</span>{#if historyEntryChange(i)}<span class="history-change">{historyEntryChange(i)}</span>{/if}</span>
           {#if tabHistoryCursor===i+1}<span class="history-current" aria-label={hCopy.current}>✓</span>{/if}
          </button>
         {/each}
        </div>
       {/if}
      </div>
     </details>
    {/if}
    <details class="file-menu" bind:this={fileMenu}>
     <summary class="bar-button icon-button file-action" title={copy.file} aria-label={copy.file}><svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h9l5 5v13H5z"/><path d="M14 3v6h5"/><path d="M8 14h8M8 17h8"/></svg><svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>
     <div class="menu-popover">
      <button type="button" onclick={askFile}><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V5h6l2 2h8v12z"/><path d="M12 10v6m-3-3h6"/></svg>{snapshot?copy.replace:copy.openFile}</button>
      {#if snapshot}
       <button type="button" onclick={backup}><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M4 17v4h16v-4"/></svg>{copy.backup}</button>
       <button type="button" disabled={!snapshot.dirty||busy} onclick={()=>void saveEdited()}><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M4 17v4h16v-4"/></svg>{copy.export}</button>
       <hr/>
       <button type="button" onclick={()=>void closeSave()}><svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3H5v18h4"/><path d="M12 12h9m-4-4 4 4-4 4"/></svg>{copy.close}</button>
      {/if}
     </div>
    </details>
    <label class="header-select" title={copy.language}><svg class="select-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
     <span class="visually-hidden">{copy.language}</span>
     <select aria-label={copy.language} value={languagePref} onchange={e=>setLanguage(e.currentTarget.value as LanguagePref)}>
      <option value="auto">{copy.system}</option>
      {#each supportedLocales as language (language.code)}
       <option value={language.code}>{language.label}</option>
      {/each}
     </select>
    </label>
    <label class="header-select theme-select" title={copy.theme}><svg class="select-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M12 3a9 9 0 0 1 0 18"/></svg>
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
   {#if achievementImagesFailed}
    <p class="compact-hint" role="status">{achCopy.imagesUnavailable}</p>
   {/if}
   {#if achievementGroupHierarchy && achievementGroupSelection!==null}
    <button type="button" class="back-link achievement-group-back" onclick={()=>showAchievementGroup(null)}>‹ {groupCopy.back}</button>
   {/if}
   {#if achievementGroupHierarchy && achievementGroupSelection!==null}
    <div class="section-heading"><h1>{achievementGroupSelection==='__unmapped'?groupCopy.uncategorized:achievementName(achievementGroupSelection,0)}</h1></div>
   {/if}
   <div class="collection-controls">
    <label class="search-field"><svg class="search-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.75" cy="10.75" r="6.75"/><path d="m16 16 5 5"/></svg><input type="search" bind:value={achievementQuery} oninput={()=>achievementLimit=BATCH_SIZE} placeholder={achCopy.search} aria-label={achCopy.search}/></label>
   </div>
   {#if achievementGroupHierarchy && achievementGroupSelection===null && !achievementQuery.trim()}
    <div class="category-grid achievement-category-grid">
     {#each achievementGroupSummaries as stat (stat.guid)}
      {@const art=achievementCategoryAtlas?.bySaveGuid.get(stat.guid)}
      <button type="button" class="category-card achievement-category-card" class:is-recorded={stat.parentComplete===true} onclick={()=>showAchievementGroup(stat.guid)}>
       <span class="category-image achievement-category-art" aria-hidden="true">
        {#if art}
         <span class="achievement-category-sprite" style:background-image={`url("${achievementCategoryAtlas?.url}")`} style:background-position={`${art.x} ${art.y}`}></span>
        {:else}
         <span class="achievement-category-placeholder" aria-hidden="true">✧</span>
        {/if}
       </span>
       <span class="category-label">{achievementName(stat.guid,0)}</span>
       <span class="category-count" title={groupCopy.groupNote}>{stat.completed.toLocaleString(locale)} / {stat.total.toLocaleString(locale)}{#if stat.parentComplete===true} · ✓{/if}</span>
      </button>
     {/each}
     {#if unmappedAchievementRows.length}
      <button type="button" class="category-card achievement-category-card" onclick={()=>showAchievementGroup('__unmapped')}>
       <span class="category-image achievement-category-placeholder" aria-hidden="true">✧</span>
       <span class="category-label">{groupCopy.uncategorized}</span>
       <span class="category-count">{unmappedAchievementRows.length.toLocaleString(locale)}</span>
      </button>
     {/if}
    </div>
   {:else}
    <div class="item-grid achievement-grid achievement-item-grid">
     {#each achievementRows.slice(0,achievementLimit) as item (item.guid)}
      {@const art=achievementCategoryAtlas?.bySaveGuid.get(item.guid)}
      {@const individualArt=achievementIndividualAtlas?.bySaveGuid.get(item.guid)}
      {@const title=achievementName(item.guid,item.index)}
      {@const progressGoal=achievementProgressTarget(
       achievementGroupHierarchy?.byGuid.get(item.guid)?.children.length??null,
       achievementFacts.get(item.guid)?.threshold??null
      )}
      <article class="item-tile achievement-tile" class:is-recorded={item.row?.value.complete===true}>
       <button type="button" class="item-toggle achievement-toggle"
        aria-pressed={item.row?.value.complete??false}
        aria-label={(item.row?.value.complete?compactCopy.relock:compactCopy.unlock)+': '+title}
        title={item.row?.value.complete?compactCopy.relock:compactCopy.unlock}
        disabled={busy||(!item.row&&(snapshot.version!=='3.0.1'||!achievementIndex.has(item.guid)))}
        onclick={()=>void quickToggleAchievement(item)}>
        <span class="item-art achievement-item-art" aria-hidden="true">
         {#if individualArt}
          <span class="achievement-individual-sprite" style:background-image={`url("${achievementIndividualAtlas?.url}")`} style:background-position={`${individualArt.x} ${individualArt.y}`}></span>
         {:else if art}
          <span class="achievement-category-sprite" style:background-image={`url("${achievementCategoryAtlas?.url}")`} style:background-position={`${art.x} ${art.y}`}></span>
         {:else}
          <span class="item-art-empty">✧</span>
         {/if}
        </span>
        <span class="item-name">{title}</span>
        <span class="item-status achievement-compact-status" class:has={item.row?.value.complete===true}>
         {#if item.row?.value.complete}
          ✓ {achCopy.completed}
         {:else if progressGoal!==null}
          {achCopy.progress}: {(item.row?.value.current??0).toLocaleString(locale)} / {progressGoal.toLocaleString(locale)}
         {:else}
          {achCopy.incomplete}
         {/if}
        </span>
       </button>
       {#if item.row}
        <button type="button" class="date-button achievement-dialog-button"
         title={item.row.value.complete?compactCopy.date:compactCopy.details}
         aria-label={(item.row.value.complete?compactCopy.date:compactCopy.details)+': '+title}
         disabled={busy} onclick={e=>{if(item.row)void openAchievement(item.row,e.currentTarget,item.index)}}>
         {item.row.value.complete?'◷':'⋯'}
        </button>
       {/if}
      </article>
     {/each}
    </div>
    {#if achievementRows.length===0}<p class="empty-result">{copy.none}</p>{/if}
    {#if achievementRows.length>achievementLimit}
     <div class="load-marker" bind:this={achievementLoadMoreSentinel}>
      {#if typeof IntersectionObserver==='undefined'}
       <button type="button" onclick={()=>achievementLimit=Math.min(achievementLimit+BATCH_SIZE,achievementRows.length)}>{copy.moreItems}</button>
      {/if}
     </div>
    {/if}
   {/if}
   <details class="data-note achievement-info-note">
    <summary>{copy.showAbout}</summary>
    <p>{compactCopy.scope}</p>
    <p>{groupCopy.groupNote}</p>
   </details>
   <dialog class="achievement-dialog" bind:this={achievementDialogEl} onclose={onAchievementDialogClosed} oncancel={e=>{if(busy)e.preventDefault()}}>
    {#if editingAchievement}
     {@const editingSaveGuid=achievementGuid(editingAchievement.guid)}
     {@const facts=achievementFacts.get(editingSaveGuid)}
     {@const dialogIndividualArt=achievementIndividualAtlas?.bySaveGuid.get(editingSaveGuid)}
     {@const dialogCategoryArt=achievementCategoryAtlas?.bySaveGuid.get(editingSaveGuid)}
     {@const linkedCounter=facts?gameCounters.get(facts.counterGuid):null}
     <form class="achievement-form" onsubmit={e=>{e.preventDefault();void saveAchievement()}}>
      <div class="date-dialog-heading">
       <h2>{editingAchievement.value.complete?compactCopy.date:compactCopy.details}</h2>
       <button class="date-dialog-close" type="button" aria-label={copy.cancel} disabled={busy} onclick={closeAchievement}>×</button>
      </div>
      <div class="date-dialog-item achievement-dialog-item">
       <span class="date-dialog-art" aria-hidden="true">
        {#if dialogIndividualArt}
         <span class="achievement-individual-sprite" style:background-image={`url("${achievementIndividualAtlas?.url}")`} style:background-position={`${dialogIndividualArt.x} ${dialogIndividualArt.y}`}></span>
        {:else if dialogCategoryArt}
         <span class="achievement-category-sprite" style:background-image={`url("${achievementCategoryAtlas?.url}")`} style:background-position={`${dialogCategoryArt.x} ${dialogCategoryArt.y}`}></span>
        {:else}
         <span class="item-art-empty">✧</span>
        {/if}
       </span>
       <div class="date-dialog-detail">
        <strong class="achievement-edit-name">{editingAchievementTitle}</strong>
        <span class="achievement-dialog-status" class:achieved={editingAchievement.value.complete}>
         {editingAchievement.value.complete?'✓ '+achCopy.completed:achCopy.incomplete}
        </span>
       </div>
      </div>
      {#if editingAchievement.value.complete}
       <label class="date-dialog-field">
        <span>{achCopy.completedAt}</span>
        <input type="datetime-local" step="1" required bind:value={achievementDate} oninput={()=>achievementValidation=''}/>
       </label>
      {/if}
      {#if facts}
       <details class="achievement-modal-source">
        <summary>{compactCopy.source}</summary>
         <dl class="achievement-fact-list">
          <dt>{factCopy.counterKind}</dt><dd>{facts.counterKind.replace(/^GameCounter|Definition$/g,'')}</dd>
          <dt>{factCopy.threshold}</dt><dd>{facts.threshold.toLocaleString(locale)}</dd>
          <dt>{factCopy.savedCounter}</dt><dd>{linkedCounter?linkedCounter.current.toLocaleString(locale):factCopy.noCounter}</dd>
         </dl>
         {#if facts.groupCondition}<p class="achievement-caution">{factCopy.group}</p>{/if}
         {#if facts.hasDlcCondition}<p class="achievement-caution">{factCopy.dlc}</p>{/if}
         {#if facts.rewardQuantity>0}
          <p class="achievement-reward">🎁 {factCopy.reward}: {facts.rewardId===null?facts.rewardKey:rewardsById.get(facts.rewardId)??facts.rewardKey} × {facts.rewardQuantity.toLocaleString(locale)}</p>
          <p class="achievement-caution">{factCopy.receiptUnverified}</p>
         {/if}
       </details>
      {/if}
      <p class="achievement-modal-scope">{compactCopy.scope}</p>
      {#if achievementValidation}<p class="date-dialog-error" role="alert">{achievementValidation}</p>{/if}
      <div class="date-dialog-actions">
       <button type="button" class="date-dialog-cancel" disabled={busy} onclick={closeAchievement}>{copy.cancel}</button>
       {#if editingAchievement.value.complete}
        <button type="submit" class="primary" disabled={busy}>{achCopy.save}</button>
       {/if}
      </div>
     </form>
    {/if}
   </dialog>
  {:else}
   <div class="collection-controls collection-search-controls">
    <label class="search-field">
     <svg class="search-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.75" cy="10.75" r="6.75"/><path d="m16 16 5 5"/></svg>
     <input type="search" placeholder={copy.search} aria-label={copy.search} bind:value={query}
      oninput={()=>{collectionSearchDrilldown=false;visibleLimit=BATCH_SIZE}}/>
    </label>
   </div>
   {#if showingGlobalCollectionSearch}
    {#if !catalog}
     <p class="empty-result">{copy.busy}</p>
    {:else}
     <div class="collection-search-result-count" role="status">{collectionSearchResults.length.toLocaleString(locale)} {copy.items}</div>
     <div class="collection-search-results">
      {#each collectionSearchResults.slice(0,visibleLimit) as item (item[0])}
       {@const resultGroup=catalog.groups.find(g=>g[0]===item[3])}
       <button type="button" class="collection-search-result" onclick={()=>jumpToCollectionItem(item)}>
        <span class="collection-search-result-text">
         <span class="collection-search-result-name">{nameFor(item)}</span>
         <span class="collection-search-result-context">
          {resultGroup?titleFor(resultGroup):copy.collections} / {subcategoryLabel(item[2],locale)}
         </span>
        </span>
        <span class="collection-search-result-chevron" aria-hidden="true">›</span>
       </button>
      {/each}
     </div>
     {#if collectionSearchResults.length===0}<p class="empty-result">{copy.none}</p>{/if}
     {#if collectionSearchResults.length>visibleLimit}
      <div class="load-marker" bind:this={loadMoreSentinel}>
       {#if typeof IntersectionObserver==='undefined'}
        <button type="button" onclick={()=>visibleLimit=Math.min(visibleLimit+BATCH_SIZE,collectionSearchResults.length)}>{copy.moreItems}</button>
       {/if}
      </div>
     {/if}
    {/if}
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
       {#if sub.previewId!==null}
        {#if nativeDyePalettes[String(sub.previewId)]}
         <span class="native-dye-swatches">
          {#each nativeDyePalettes[String(sub.previewId)].colors as dyeColor,i (i)}
           {#if dyeColor}<span class="native-dye-swatch" style:background-color={dyeColor}></span>{/if}
          {/each}
         </span>
        {/if}
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
   {#if hasSharedDyeableIcon}<p class="shared-dyeable-icon-note" role="note">{copy.sharedDyeableIcon}</p>{/if}
   <div class="item-grid">
    {#each visibleItems as item (item[0])}
     {@const tick=recorded[String(item[0])]}
     {@const direct=tick!==undefined}
     {@const recordIds=families[String(item[7]||item[0])]??[]}
     {@const has=showVariants?direct:recordIds.length>0}
     {@const mayAdd=mayCreateCollectionHistory(item,snapshot.membershipEdit,snapshot.version,catalog?.version)}
     {@const mayToggle=showVariants?(direct?snapshot.membershipEdit:mayAdd):(recordIds.length===0?mayAdd:recordIds.length===1&&direct&&snapshot.membershipEdit)}
     {@const sprite=iconPack?.group===selectedGroup?iconPack.entries[String(item[0])]:undefined}
     <article class="item-tile" id={'collection-item-'+item[0]} class:is-recorded={has}>
      <button type="button" class="item-toggle" aria-pressed={has} aria-label={(has?copy.unsetRecorded:copy.setRecorded)+': '+nameFor(item)}
       title={mayToggle?(has?copy.unsetRecorded:copy.setRecorded):!showVariants&&recordIds.length>0?copy.variantsToEdit:copy.unsafe} disabled={busy||!mayToggle}
       onclick={()=>void change(item[0],direct?null:EPOCH+BigInt(Date.now())*10000n)}>
       <span class="item-art" aria-hidden="true">
        {#if sprite}
         <span class="item-sprite" style:background-image={'url("'+sprite.url+'")'} style:background-position={'-'+sprite.x+'px -'+sprite.y+'px'}></span>
        {:else}
         <span class="item-art-empty">✧</span>
        {/if}
        {#if nativeDyePalettes[String(item[0])]}
         <span class="native-dye-swatches">
          {#each nativeDyePalettes[String(item[0])].colors as dyeColor,i (i)}
           {#if dyeColor}<span class="native-dye-swatch" style:background-color={dyeColor}></span>{/if}
          {/each}
         </span>
        {/if}
       </span>
       <span class="item-name">{nameFor(item)}</span>
       <span class="item-status" class:has={has}>{has?'✓ '+copy.recorded:copy.unrecorded+' · 0 / 1'}</span>
      </button>
      {#if direct}<button type="button" class="date-button" title={copy.editDate} aria-label={copy.editDate+': '+nameFor(item)} disabled={busy} onclick={e=>void editDate(item[0],e.currentTarget)}>◷</button>{/if}
     </article>
    {/each}
   </div>
   {#if matching.length===0}<p class="empty-result">{copy.none}</p>{/if}
   {#if iconError}<p class="compact-hint">{copy.imagesUnavailable}</p>{/if}
   {#if visibleItems.length<matching.length}
    <div class="load-marker" bind:this={loadMoreSentinel}>
     {#if typeof IntersectionObserver==='undefined'}
      <button type="button" onclick={()=>visibleLimit=Math.min(visibleLimit+BATCH_SIZE,matching.length)}>{copy.moreItems}</button>
     {/if}
    </div>
   {/if}
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
      {#if nativeDyePalettes[String(dateDialogItem[0])]}
       <span class="native-dye-swatches">
        {#each nativeDyePalettes[String(dateDialogItem[0])].colors as dyeColor,i (i)}
         {#if dyeColor}<span class="native-dye-swatch" style:background-color={dyeColor}></span>{/if}
        {/each}
       </span>
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
