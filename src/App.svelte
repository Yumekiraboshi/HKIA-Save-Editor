<script lang="ts">
 import {onMount,tick} from 'svelte';
 import {openSave,changeCollection,changeInventoryQuantity,changeInventoryQuantities,requestFlowerVariants,requestFlowerCreationVariants,createInventoryFlowerVariant,changeInventoryFlowerVariant,requestFurnitureVariants,requestFurnitureCreationVariants,createInventoryFurnitureVariant,changeInventoryFurnitureVariant,requestPaletteVariants,changeInventoryPaletteVariant,requestPaletteCreationVariants,createInventoryPaletteVariant,requestBobaVariants,changeInventoryBobaVariant,editAchievementAuto,planAchievementToggle,applyDraft,jumpHistory,restoreHistory,exportSave,clear,type SaveSnapshot,type InventoryEntry,type InventoryPatch,type InventoryQuantityRequest,type AchievementEntry,type AchievementValue,type HistoryRecord} from './worker-client';
 import {diffPatches,diffInventory,restoreLocalDraft,saveOriginalLocally,saveDraftChanges,forgetLocalDraft,type DraftPatch} from './draft-store';
 import {diffAchievements,decodeAchievementDraft,type StoredPatch} from './achievement-draft';
 import {achievementCopy} from './achievement-ui';
 import {historyCopy,historyDetailCopy} from './history-copy';
 import {inventoryCopy,inventoryBatchCopy,inventoryEmptyCopy,inventoryAddCopy,inventorySelectVisibleCopy} from './inventory-copy';
 import {flowerVariantOf,type FlowerVariant,furnitureVariantOf,type FurnitureVariant} from './inventory-unique';
 import {flowerEditorCopy,furnitureEditorCopy,flowerGrowthLabel} from './inventory-unique-copy';
 import {loadFurnitureDisplay,materialLabel,materialSwatch,furnitureVariantTitle,type FurnitureDisplay} from './inventory-furniture-display';
 import {inventoryCategoryRepresentative,browseInventory,inventoryGroupCounts,inventorySearchGroupCounts,inventorySearchTarget,defaultInventoryGroup,OTHER_INVENTORY_GROUP,NATIVE_INVENTORY_TABS,type InventoryGroupKey} from './inventory-browse';
 import {loadFlowerDisplayDefinitions,loadFlowerLabels,flowerDisplay,flowerGrowthKind,type FlowerDisplayDefinitions,type FlowerLabels} from './inventory-flower-display';
 import {loadNativeInventoryIndex,type NativeInventoryIndex} from './inventory-native-data';
 import {loadInventoryNativeArt,type InventoryNativeArt} from './inventory-native-art';
 import {inventoryGroupLabel} from './inventory-native-category-copy';
 import {loadSourceItemNames,type SourceItemNames} from './source-names';
 import {decodeHistoryDetails,formatHistoryChange} from './history-details';
 import {compactAchievementCopy} from './achievement-compact-ui';
 import {removalConfirmationCopy} from './removal-confirmation';
 import {loadAchievementFacts,type AchievementFactsIndex} from './achievement-facts';
 import {joinAchievementCatalog,type AchievementListRow} from './achievement-catalog';
import {searchAchievementRows} from './achievement-search';
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
 import {loadVariantArtSources} from './variant-art';
 import {loadNativeColorwayIcons} from './native-colorway-icons';
 import DyeSprite from './DyeSprite.svelte';
 import DynamicFlowerSprite from './DynamicFlowerSprite.svelte';
 import DynamicPaletteSprite from './DynamicPaletteSprite.svelte';
 import DynamicChefSprite from './DynamicChefSprite.svelte';
 import DynamicWandSprite from './DynamicWandSprite.svelte';
 import {inventoryWandAppearance} from './inventory-wand-display';
 import {inventoryChefAppearance} from './inventory-chef-display';
 import {CUSTOM_PALETTE_ITEM_ID,paletteVariantOf,paletteFromWords,paletteColorHex,type PaletteVariant} from './inventory-palette-display';
 import {bobaVariantLabel,type BobaVariant} from './inventory-boba-display';
 import {toDateTimeValue,fromDateTimeValue} from './collection-date';
 import {toAchievementDateTimeValue,fromAchievementDateTimeValue} from './achievement-date';
 import {listSubcategories,subcategoryLabel,recordedFamilies,type CollectionItem} from './subcategories';
 import {searchAllCollectionItems,collectionDisplayName,filterCollectionItems} from './collection-search';
import {verifiedFloorplanName} from './floorplan-names';
 type Item=CollectionItem;
 type Group=[string,string,string,number,number,string];
 type Catalog={schema:string;version:string;source:{membership:string;names:string;nameVersionMatchesSave:boolean};groups:Group[];items:Item[]};
 type Filter='all'|'recorded'|'unrecorded';
 type Tool='collections'|'achievements'|'inventory';
 type ThemePref='system'|'light'|'dark';
 type PendingRemoval=
  | {kind:'collections';id:number;name:string;before:bigint;revision:number;fromDateDialog:boolean}
  | {kind:'achievements';item:AchievementListRow;name:string;revision:number};
 const BATCH_SIZE=40;
 const EPOCH=621355968000000000n;
 const ICONS=import.meta.env.BASE_URL+'icons/';
 const INVENTORY_UI=import.meta.env.BASE_URL+'inventory-ui/';
 let activeTool:Tool=$state('collections');
 let achievementQuery=$state('');
 let inventoryQuery=$state('');
 let inventoryGroup:InventoryGroupKey|null=$state(null);
 let nativeInventoryIndex:NativeInventoryIndex=$state(new Map());
 let flowerDefinitions:FlowerDisplayDefinitions|null=$state(null);
 let flowerLabels:FlowerLabels=$state({});
 let flowerDialogEl:HTMLDialogElement|undefined=$state();
 let flowerEdit=$state<{documentId:number;itemId:number;revision:number;before:FlowerVariant;options:FlowerVariant[];creationOptions:FlowerVariant[];absent?:boolean}|null>(null);
 let flowerSelection=$state(-1);
 let variantAddQuantity=$state<number|undefined>(1);
 const validVariantAddQuantity=$derived(typeof variantAddQuantity==='number'&&Number.isInteger(variantAddQuantity)&&variantAddQuantity>=1&&variantAddQuantity<=2147483647);
 let furnitureDialogEl:HTMLDialogElement|undefined=$state();
 let furnitureDisplay:FurnitureDisplay|null=$state(null);
 let furnitureEdit=$state<{documentId:number;itemId:number;revision:number;before:FurnitureVariant;options:FurnitureVariant[];creationOptions:FurnitureVariant[];createOnly:boolean}|null>(null);
 let furnitureSelection=$state(-1);
 let paletteDialogEl:HTMLDialogElement|undefined=$state();
 let paletteEdit=$state<{documentId:number;itemId:number;revision:number;before:PaletteVariant;options:PaletteVariant[];creationOptions:PaletteVariant[]}|null>(null);
 let bobaDialogEl:HTMLDialogElement|undefined=$state();
 let bobaEdit=$state<{documentId:number;itemId:number;revision:number;before:BobaVariant;options:BobaVariant[]}|null>(null);
 let bobaSelection=$state(-1);
 let paletteSlot=$state(0);
 let paletteSelection=$state(-1);
 let inventoryNativeArt:InventoryNativeArt|null=$state(null);
 let inventoryEditableOnly=$state(false);
 let inventoryAddMode=$state(false);
 let inventoryBatchMode=$state(false);
 let inventoryBatchSelected=$state<Set<number>>(new Set());
 let inventoryBatchQuantity=$state<number|undefined>(undefined);
 // Presentation only: the tightest bound returned by Rust for selected rows.
 const inventoryBatchMinimum=$derived.by(()=>{
  if(!snapshot||inventoryBatchSelected.size===0)return 1;
  return inventoryBrowseRows.some(row=>inventoryBatchSelected.has(row.documentId)&&row.quantityMinimum!==0)?1:0;
 });
 const inventoryBatchMaximum=$derived.by(()=>{
  let cap=2147483647;
  if(snapshot)for(const row of inventoryBrowseRows){
   if(inventoryBatchSelected.has(row.documentId))cap=Math.min(cap,row.quantityLimit??0);
  }
  return Math.max(1,cap);
 });
 function resetInventoryBatchSelection(){inventoryBatchSelected=new Set();inventoryBatchQuantity=undefined}
 function clearInventoryBatch(){inventoryBatchMode=false;resetInventoryBatchSelection()}
 $effect(()=>{if(activeTool!=='inventory'){clearInventoryBatch();inventoryAddMode=false}});
 let inventoryLimit=$state(BATCH_SIZE);
 let inventoryLoadMoreSentinel=$state<HTMLDivElement|undefined>(undefined);
 let inventoryBaseline:InventoryEntry[]=[];
 // Source-verified game UiIcon ZIP packs are shared by Collection/Inventory.
 // Inventory loads only groups currently needed by visible owned rows.
 const inventoryIconPending=new Set<string>();
 const inventoryIconFailed=new Set<string>();
 let inventoryIconPacks:Record<string,IconPack>=$state({});
 let inventoryIconPulse=$state(0);
 let inventoryIconEpoch=0;
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
 let removalConfirmEl:HTMLDialogElement|undefined=$state(undefined);
 let pendingRemoval:PendingRemoval|null=$state(null);
 let removalReturnFocus:HTMLElement|null=null;
 let removalOriginal:File|null=null;
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
 let exactVariantArt:Record<string,string>=$state({});
 let originalVariantArt:Record<string,string>=$state({});
 let nativeColorwayIcons:Record<string,string>=$state({});
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
 const removalCopy=$derived(removalConfirmationCopy(locale));
 const achCopy=$derived(achievementCopy(locale));
 const iCopy=$derived(inventoryCopy(locale));
 const iBatchCopy=$derived(inventoryBatchCopy(locale));
 const flowerCopy=$derived(flowerEditorCopy(locale));
 const furnitureCopy=$derived(furnitureEditorCopy(locale));
 const hCopy=$derived(historyCopy(locale));
 const hDetailCopy=$derived(historyDetailCopy(locale));
 const compactCopy=$derived(compactAchievementCopy(locale));
 const groupCopy=$derived(achievementGroupCopy(locale));
 const actualTheme=$derived(themePref==='system'?(prefersDark?'dark':'light'):themePref);
 const entriesCount=$derived(Object.keys(recorded).length);
 const eligibleCollectionHistoryIds=$derived(new Set((snapshot as SaveSnapshot|null)?.eligibleCollectionHistoryIds??[]));
 const achievementGoalsByGuid=$derived(new Map((snapshot as SaveSnapshot|null)?.achievementGoals??[]));
 const tabHistory=$derived(((snapshot as SaveSnapshot|null)?.history??[]).filter((entry:HistoryRecord)=>entry.scope===activeTool));
 const tabHistoryCursor=$derived(tabHistory.filter(entry=>entry.applied).length);
 const historyDetails=$derived(decodeHistoryDetails((snapshot as SaveSnapshot|null)?.historyCheckpoint??null,(snapshot as SaveSnapshot|null)?.history??[]));
 const tabHistoryDetails=$derived(historyDetails.filter(entry=>entry.scope===activeTool));
 const historyItems=$derived(new Map(((catalog as Catalog|null)?.items??[]).map(item=>[item[0],item])));
 const inventoryHistoryItems=$derived.by(()=>{
  const result=new Map(((snapshot as SaveSnapshot|null)?.inventory??[]).map(item=>[item.documentId,item.itemId]));
  for(const detail of historyDetails)if(detail.scope==='inventory'&&'createdHandle' in detail)result.set(detail.createdHandle,detail.itemId);
  return result;
 });
 // Item IDs and category-to-art mappings are original Steam v3.0.1
 // collection catalog data, NOT inferred inventory ownership/categories.
 const inventorySourceItems=$derived(new Map(((catalog as Catalog|null)?.items??[]).map(item=>[item[0],item])));
 const inventorySourceGroups=$derived(new Set(((catalog as Catalog|null)?.groups??[]).map(group=>group[0])));
 const sourceAchievementRows=$derived(joinAchievementCatalog(achievementIndex,(snapshot as SaveSnapshot|null)?.achievements??[]));
 const achievementGroupSummaries=$derived(achievementGroupHierarchy?summarizeAchievementGroups(achievementGroupHierarchy,sourceAchievementRows):[]);
 const unmappedAchievementRows=$derived(achievementGroupHierarchy?ungroupedRows(achievementGroupHierarchy,sourceAchievementRows):[]);
 const sourceOrderedAchievementRows=$derived(nativeAchievementOrder(achievementGroupHierarchy,sourceAchievementRows,achievementFacts));
 const groupScopedAchievementRows=$derived(achievementGroupHierarchy&&achievementGroupSelection?
  achievementGroupSelection==='__unmapped'?unmappedAchievementRows:groupRows(achievementGroupHierarchy,achievementGroupSelection,sourceAchievementRows,achievementFacts):
  sourceOrderedAchievementRows);
 const inventoryBrowseRows:InventoryEntry[]=$derived((inventoryAddMode?(snapshot as SaveSnapshot|null)?.inventoryCreatable:(snapshot as SaveSnapshot|null)?.inventory)??[]);
 const inventoryGroupTotals=$derived(inventoryGroupCounts(inventoryBrowseRows,nativeInventoryIndex));
 const inventoryMatchTotals=$derived(inventorySearchGroupCounts(inventoryBrowseRows,inventoryQuery,inventoryEditableOnly,sourceNames,inventorySourceItems,nativeInventoryIndex,inventoryVariantSearchName));
 const inventoryVisibleGroups=$derived(nativeInventoryIndex.size?NATIVE_INVENTORY_TABS:[]);
 const activeInventoryGroup=$derived(inventoryGroup===OTHER_INVENTORY_GROUP&&!(inventoryGroupTotals.get(OTHER_INVENTORY_GROUP)??0)?defaultInventoryGroup(inventoryGroupTotals):inventoryGroup??defaultInventoryGroup(inventoryGroupTotals));
 const inventoryRows=$derived(browseInventory(
  inventoryBrowseRows,inventoryQuery,activeInventoryGroup,
  inventoryEditableOnly,sourceNames,inventorySourceItems,nativeInventoryIndex,locale,inventoryVariantSearchName));
 const achievementRows=$derived(searchAchievementRows(achievementQuery,sourceOrderedAchievementRows,
  groupScopedAchievementRows,achievementName,guid=>achievementIndex.get(guid)?.key??''));
 const group=$derived(((catalog as Catalog | null)?.groups??[]).find((g:Group)=>g[0]===selectedGroup)??null);
 const subgroups=$derived(selectedGroup?listSubcategories((catalog as Catalog|null)?.items??[],selectedGroup,recorded,locale):[]);
 const activeSubgroup=$derived(subgroups.length===1?subgroups[0].key:subgroups.some(s=>s.key===selectedSubgroup)?selectedSubgroup:null);
 const families=$derived(recordedFamilies((catalog as Catalog|null)?.items??[],recorded));
 const hasVariants=$derived(Boolean(activeSubgroup&&((catalog as Catalog|null)?.items??[]).some((item:Item)=>item[3]===selectedGroup&&item[2]===activeSubgroup&&item[0]!==item[7])));
 const dateDialogItem=$derived(editId===null?null:((catalog as Catalog|null)?.items??[]).find((item:Item)=>item[0]===editId)??null);
 const dateDialogTick=$derived(editId===null?null:recorded[String(editId)]??null);
 const dateChanged=$derived(dateDialogTick!==null&&dateValue!==toDateTimeValue(dateDialogTick));

 onMount(()=>{
  void loadNativeInventoryIndex(import.meta.env.BASE_URL).then(index=>nativeInventoryIndex=index).catch(()=>{});
  void loadFlowerDisplayDefinitions(import.meta.env.BASE_URL).then(data=>flowerDefinitions=data).catch(()=>{});
  void loadFlowerLabels(import.meta.env.BASE_URL).then(data=>flowerLabels=data).catch(()=>{});
  void loadFurnitureDisplay().then(data=>furnitureDisplay=data).catch(()=>{});
  void loadInventoryNativeArt(import.meta.env.BASE_URL).then(art=>inventoryNativeArt=art).catch(()=>{});
  // Exact game dye palettes, used exclusively for recoloring item image pixels.
  void loadNativeDyePalettes(import.meta.env.BASE_URL)
   .then(palettes=>nativeDyePalettes=palettes).catch(()=>{});
  void loadVariantArtSources(import.meta.env.BASE_URL)
   .then(art=>{originalVariantArt=art.originals;exactVariantArt=art.reconstructions;}).catch(()=>{});
  void loadNativeColorwayIcons(import.meta.env.BASE_URL)
   .then(icons=>nativeColorwayIcons=icons).catch(()=>{});
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
   inventoryIconEpoch++;
   for(const pack of Object.values(inventoryIconPacks))pack.dispose();
   inventoryIconPacks={};
   achievementImagesEpoch++;
   achievementIndividualAtlas?.dispose?.();
   achievementCategoryAtlas?.dispose?.();
  };
 });
 $effect(()=>{
  if(typeof document!=='undefined'){document.documentElement.lang=locale;document.documentElement.dir=isRtl(locale)?'rtl':'ltr';document.documentElement.dataset.theme=actualTheme;}
 });
 /* v3.0.1 Name.selectedString provides an exact original Babel lookup
    for 10,262 collection IDs in all 16 locales plus 1,901 additional inventory
    IDs in 15 verified locales. No guessed title for an unknown inventory ID. */
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
  if(achievementImagesFailed||!snapshot||activeTool!=='achievements'||achievementIndex.size!==820||!achievementGroupHierarchy||achievementImagesStarted)return;
  achievementImagesStarted=true;
  const epoch=++achievementImagesEpoch;
  const index=achievementIndex,groups=achievementGroupHierarchy;
  if(!achievementIndividualAtlas)void loadAchievementIndividualAtlas(import.meta.env.BASE_URL,index)
   .then(atlas=>{
    if(epoch!==achievementImagesEpoch){atlas.dispose?.();return;}
    achievementIndividualAtlas=atlas;
   }).catch(()=>{if(epoch===achievementImagesEpoch)achievementImagesFailed=true});
  if(!achievementCategoryAtlas)void loadAchievementCategoryAtlas(import.meta.env.BASE_URL,index,groups)
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
 $effect(()=>{
  const el=inventoryLoadMoreSentinel;
  if(!el||typeof IntersectionObserver==='undefined')return;
  const observer=new IntersectionObserver(entries=>{
   if(entries.some(x=>x.isIntersecting))
    inventoryLimit=Math.min(inventoryLimit+BATCH_SIZE,inventoryRows.length);
  },{rootMargin:'720px 0px'});
  observer.observe(el);
  return ()=>observer.disconnect();
 });
 /* No extra image service, no speculative item artwork: load the exact
    original game UiIcon atlas group for each visible inventory Item ID.
    Three concurrent ZIP requests maximum, with successful groups cached.
    If a group cannot be verified, leave its card with the safe placeholder. */
 $effect(()=>{
  inventoryIconPulse;
  if(activeTool!=='inventory'||!snapshot||!catalog)return;
  const groups=new Set<string>();
  for(const row of inventoryRows.slice(0,inventoryLimit)){
   if(inventoryNativeArt?.entries.has(row.itemId)||inventoryNativeArt?.withheld.has(row.itemId))continue;
   const item=inventorySourceItems.get(row.itemId);
   if(item&&inventorySourceGroups.has(item[3]))groups.add(item[3]);
  }
  // The category representatives use the same verified item atlas/cache.
  for(const tab of NATIVE_INVENTORY_TABS){
   const id=inventoryCategoryRepresentative(tab.key,nativeInventoryIndex);
   if(id===undefined||inventoryNativeArt?.entries.has(id))continue;
   const item=inventorySourceItems.get(id);
   if(item&&inventorySourceGroups.has(item[3]))groups.add(item[3]);
  }
  for(const group of groups){
   if(inventoryIconPending.size>=3)break;
   if(inventoryIconPacks[group]||inventoryIconPending.has(group)||inventoryIconFailed.has(group))continue;
   void fetchInventoryIcons(group);
  }
 });
 const unnamed=$derived((catalog as Catalog|null)?.items.filter((x:Item)=>!x[5]&&!x[6]&&!verifiedFloorplanName(x[0],locale)).length??0);
 function describeError(e:unknown){const raw=e instanceof Error?e.message:String(e);return editorErrors[locale==='ja'?'ja':'en'][raw]??(locale==='ja'?(raw||copy.unknown):copy.unknown);}
 function setLanguage(v:LanguagePref){
  languagePref=v;try{localStorage.setItem('hkia-display-locale',v)}catch{}
 }
 function setTheme(v:ThemePref){
  themePref=v;try{localStorage.setItem('hkia-display-theme',v)}catch{}
 }
 function inventoryVariantSearchName(row:InventoryEntry):string{
  if(row.boba)return bobaVariantLabel(row.boba.variant,locale);
  const furniture=furnitureVariantOf(row.unique);
  if(furniture)return furnitureVariantTitle(furnitureDisplay,row.itemId,furniture,furnitureCopy.defaultMaterial);
  return [flowerGrowthLabel(locale,flowerGrowthKind(row.itemId,row.flower)),flowerDisplay(row.flower,flowerDefinitions,flowerLabels[locale]??{})?.title].filter(Boolean).join(' · ');
 }
 function flowerVariantName(v:FlowerVariant):string{
  return flowerDisplay({growState:v[0],baseColor:v[1],pattern:v[2],patternColor:v[3]},flowerDefinitions,flowerLabels[locale]??{})?.title||'—';
 }
 function flowerOptionGroup(before:FlowerVariant,next:FlowerVariant):number{
  return next[2]!==before[2]?1:next[1]!==before[1]?0:2;
 }
 function inventoryName(itemId:number):string{
  return sourceNames[String(itemId)]??'#'+String(itemId);
 }
 async function fetchInventoryIcons(group:string){
  const epoch=inventoryIconEpoch;
  inventoryIconPending.add(group);
  try{
   const pack=await loadIconPack(group,import.meta.env.BASE_URL);
   if(epoch!==inventoryIconEpoch){pack.dispose();return}
   inventoryIconPacks={...inventoryIconPacks,[group]:pack};
  }catch{
   if(epoch===inventoryIconEpoch)inventoryIconFailed.add(group);
  }finally{
   inventoryIconPending.delete(group);
   if(epoch===inventoryIconEpoch)inventoryIconPulse++;
  }
 }
 function openInventoryTab(){
  clearInventoryBatch();inventoryAddMode=false;
  activeTool='inventory';inventoryQuery='';inventoryGroup=null;inventoryEditableOnly=false;
  inventoryLimit=BATCH_SIZE;editingAchievement=null;error='';
  // Retry transient failures only when the user reopens Inventory.
  // Successfully verified original images remain cached and unchanged.
  inventoryIconFailed.clear();inventoryIconPulse++;
 }
 function showAchievementGroup(guid:string|null){
  achievementGroupSelection=guid;achievementQuery='';
  achievementLimit=BATCH_SIZE;
 }
 function openAchievementsTab(){
  activeTool='achievements';editingAchievement=null;showAchievementGroup(null);error='';
  if(achievementImagesFailed){
   // A verified atlas stays cached; only previously failed source images are
   // re-fetched on an explicit tab visit (including selecting the current tab).
   // The reactive error flag ensures the loader effect retries exactly once.
   achievementImagesStarted=false;
   achievementImagesFailed=false;
  }
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
  return formatHistoryChange(tabHistoryDetails[i],locale,hDetailCopy,hCopy.paired,iCopy.quantity,flowerVariantName,v=>v.map(n=>materialLabel(furnitureDisplay,n,furnitureCopy.defaultMaterial)).join(' / '),id=>inventoryName(inventoryHistoryItems.get(id)??(id>2147483647?id-2147483648:0)))||
   (tabHistory[i]?.paired?hCopy.paired:'');
 }
 function historyEntryLabel(entry:HistoryRecord,i:number):string{
  const detail=tabHistoryDetails[i];
  if(detail?.scope==='inventory'&&'batch' in detail)return iBatchCopy+' ('+detail.batch.length.toLocaleString(locale)+')';
  if(entry.scope==='collections'){
   const item=historyItems.get(entry.itemId??0);
   return item?nameFor(item):'#'+String(entry.itemId);
  }
  if(entry.scope==='inventory')return inventoryName(inventoryHistoryItems.get(entry.itemId??0)??((entry.itemId??0)>2147483647?entry.itemId!-2147483648:0));
  if(!entry.guid)return hCopy.title;
  return achievementName(achievementGuid(entry.guid),0);
 }
 function update(s:SaveSnapshot){
  const previousGroup=activeInventoryGroup;
  snapshot=s;recorded=Object.fromEntries(s.entries.map(([id,t])=>[String(id),t]));
  // A restored or newly created search match must not remain hidden in a
  // different category. Keep the current category whenever it still matches.
  if(activeTool==='inventory'&&inventoryQuery.trim()){
   const target=inventorySearchTarget(previousGroup,inventoryMatchTotals);
   if(target!==previousGroup){inventoryGroup=target;inventoryLimit=BATCH_SIZE}
  }
 }
 /** Verify a restored native journal reproduces the locally persisted net edits.
  * Canonical comparison retains lossless decimal timestamp strings.
  */
 function recoveredMatchesDraft(
  baseRows:ReadonlyMap<number,bigint>,baseAchievements:readonly AchievementEntry[],baseInventory:readonly InventoryEntry[],
  recovered:SaveSnapshot,collectionPatches:readonly DraftPatch[],achievementPatches:readonly StoredPatch[],inventoryPatches:readonly InventoryPatch[]
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
   sortedAchievement(diffAchievements(baseAchievements,recovered.achievements))===sortedAchievement(achievementPatches)&&
   JSON.stringify(diffInventory(baseInventory,recovered.inventory))===JSON.stringify(inventoryPatches);
 }
 function persistDraft():Promise<void>{
  if(!original)return Promise.resolve();
  const patches=diffPatches(baseline,recorded);
  const achievements=diffAchievements(achievementBaseline,snapshot?.achievements??[]);
  const inventoryPatches=diffInventory(inventoryBaseline,snapshot?.inventory??[]);
  const ui={group:selectedGroup,subgroup:selectedSubgroup};
  const checkpoint=(snapshot as SaveSnapshot|null)?.historyCheckpoint??null;
  const job=draftWrites.catch(()=>{}).then(()=>saveDraftChanges(patches,ui,achievements,checkpoint,inventoryPatches));
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
    const inventoryPatches=draft.inventoryPatches;
    let session:SaveSnapshot|null=null;
    if(draft.historyCheckpoint){
     try{
      const recovered=await restoreHistory(draft.historyCheckpoint);
      if(!recoveredMatchesDraft(originalRows,s.achievements,s.inventory,recovered,draft.patches,draft.achievementPatches,inventoryPatches))
       throw Error('HISTORY_RESTORE_CONFLICT');
      session=recovered;
     }catch{
      // Atomic native replay may reject stale or malformed metadata.
      // Reopen the original file before applying validated net changes.
      await openSave(draft.file);
     }
    }
    if(!session)session=patches.length||achievementPatches.length||inventoryPatches.length?await applyDraft(patches,achievementPatches,inventoryPatches):s;
   collectionSearchDrilldown=false;query='';
    original=draft.file;baseline=originalRows;achievementBaseline=s.achievements;inventoryBaseline=s.inventory;update(session);
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
  const priorInventory=snapshot?.inventory??[];
  const priorInventoryBaseline=inventoryBaseline;
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
   clearInventoryBatch();inventoryAddMode=false;
   original=file;baseline=new Map(session.entries);achievementBaseline=session.achievements;inventoryBaseline=session.inventory;update(session);
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
     const inventoryPatches=diffInventory(priorInventoryBaseline,priorInventory);
     let previous:SaveSnapshot|null=null;
     if(priorHistoryCheckpoint){
      try{
       const recovered=await restoreHistory(priorHistoryCheckpoint);
       if(!recoveredMatchesDraft(priorBaseline,opened.achievements,opened.inventory,recovered,
        diffPatches(priorBaseline,priorRecorded),achievementPatches,inventoryPatches))throw Error('HISTORY_RESTORE_CONFLICT');
       previous=recovered;
      }catch{await openSave(priorFile)}
     }
     if(!previous)previous=patches.length||decodedAchievements.length||inventoryPatches.length?await applyDraft(patches,decodedAchievements,inventoryPatches):opened;
     original=priorFile;baseline=priorBaseline;achievementBaseline=priorAchievementBaseline;inventoryBaseline=priorInventoryBaseline;update(previous);
     selectedGroup=priorGroup;selectedSubgroup=priorSubgroup;showVariants=priorVariants;visibleLimit=BATCH_SIZE;
     if(priorGroup&&(!iconPack||iconPack.group!==priorGroup))void fetchImages(priorGroup);
    }catch{
     original=null;snapshot=null;recorded={};baseline=new Map();achievementBaseline=[];inventoryBaseline=[];
     selectedGroup=null;selectedSubgroup=null;showVariants=false;iconEpoch++;iconPack?.dispose();iconPack=null;
    }
   }
   error=reason;
  }
  finally{busy=false}
 }
 async function openFlowerEditor(row:InventoryEntry){
  if(!snapshot||busy||!row.flower||!row.unique?.flowerEditable)return;
  const revision=snapshot.revision,before=flowerVariantOf(row.flower);
  busy=true;error='';
  try{
   const [options,creationOptions]=await Promise.all([requestFlowerVariants(row.documentId),requestFlowerCreationVariants(row.documentId)]);
   if(!snapshot||snapshot.revision!==revision)return;
   flowerEdit={documentId:row.documentId,itemId:row.itemId,revision,before,options,creationOptions};
   flowerSelection=-1;variantAddQuantity=1;await tick();
   if(flowerDialogEl&&!flowerDialogEl.open)flowerDialogEl.showModal();
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 async function openAbsentFlowerEditor(row:InventoryEntry){
  if(!snapshot||busy||!row.flowerCreatable)return;
  const revision=snapshot.revision;
  busy=true;error='';
  try{
   const options=await requestFlowerCreationVariants(row.documentId);
   if(!snapshot||snapshot.revision!==revision||!options.length)return;
   flowerEdit={documentId:row.documentId,itemId:row.itemId,revision,before:[0,0,0,0],options,creationOptions:options,absent:true};
   flowerSelection=0;variantAddQuantity=1;await tick();
   if(flowerDialogEl&&!flowerDialogEl.open)flowerDialogEl.showModal();
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 async function openFurnitureEditor(row:InventoryEntry){
  const createOnly=row.furnitureCreatable===true;
  const before:FurnitureVariant|null=createOnly?[0,0,0]:furnitureVariantOf(row.unique);
  if(!snapshot||busy||!before||(!createOnly&&!row.unique?.furnitureEditable))return;
  const revision=snapshot.revision;
  busy=true;error='';
  try{
   const [options,creationOptions,display]=await Promise.all([createOnly?Promise.resolve([] as FurnitureVariant[]):requestFurnitureVariants(row.documentId),requestFurnitureCreationVariants(row.documentId),furnitureDisplay?Promise.resolve(furnitureDisplay):loadFurnitureDisplay()]);
   if(!snapshot||snapshot.revision!==revision)return;
   furnitureDisplay=display;
   furnitureEdit={documentId:row.documentId,itemId:row.itemId,revision,before,options:createOnly?creationOptions:options,creationOptions,createOnly};
   furnitureSelection=-1;variantAddQuantity=1;await tick();
   if(furnitureDialogEl&&!furnitureDialogEl.open)furnitureDialogEl.showModal();
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 async function openBobaEditor(row:InventoryEntry){
  if(!snapshot||busy||!row.boba?.editable)return;
  const before=row.boba.variant,revision=snapshot.revision;busy=true;error='';
  try{
   const options=await requestBobaVariants(row.documentId);
   if(!snapshot||snapshot.revision!==revision)return;
   bobaEdit={documentId:row.documentId,itemId:row.itemId,revision,before,options};bobaSelection=-1;await tick();
   if(bobaDialogEl&&!bobaDialogEl.open)bobaDialogEl.showModal();
  }catch(e){error=describeError(e)}finally{busy=false}
 }
 function closeBobaEditor(){if(bobaDialogEl?.open)bobaDialogEl.close()}
 async function applyInventoryBobaVariant(event:SubmitEvent){
  event.preventDefault();const edit=bobaEdit;
  if(!snapshot||busy||!edit||snapshot.revision!==edit.revision)return;
  const next=edit.options[bobaSelection];if(!next)return;
  busy=true;error='';
  try{update(await changeInventoryBobaVariant(edit.documentId,edit.before,next));closeBobaEditor();await persistDraft()}
  catch(e){error=describeError(e)}finally{busy=false}
 }
 async function openPaletteEditor(row:InventoryEntry){
  const before=paletteVariantOf(row.unique);
  if(!snapshot||busy||!row.unique?.paletteEditable||!before)return;
  const revision=snapshot.revision;busy=true;error='';
  try{
   const [options,creationOptions]=await Promise.all([requestPaletteVariants(row.documentId),requestPaletteCreationVariants(row.documentId)]);
   if(!snapshot||snapshot.revision!==revision)return;
   paletteEdit={documentId:row.documentId,itemId:row.itemId,revision,before,options,creationOptions};
   paletteSlot=0;paletteSelection=-1;variantAddQuantity=1;await tick();
   if(paletteDialogEl&&!paletteDialogEl.open)paletteDialogEl.showModal();
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 async function addInventoryPaletteVariant(){
  const edit=paletteEdit,quantity=variantAddQuantity;
  if(!snapshot||busy||!edit||snapshot.revision!==edit.revision||quantity===undefined||!validVariantAddQuantity)return;
  const next=edit.options[paletteSelection];if(!next||!edit.creationOptions.some(v=>v.every((n,i)=>n===next[i])))return;
  busy=true;error='';
  try{update(await createInventoryPaletteVariant(edit.documentId,edit.before,next,quantity));closePaletteEditor();await persistDraft()}
  catch(e){error=describeError(e)}finally{busy=false}
 }
 function closePaletteEditor(){if(paletteDialogEl?.open)paletteDialogEl.close()}
 async function applyInventoryPaletteVariant(event:SubmitEvent){
  event.preventDefault();const edit=paletteEdit;
  if(!snapshot||busy||!edit||snapshot.revision!==edit.revision)return;
  const next=edit.options[paletteSelection];if(!next)return;
  busy=true;error='';
  try{update(await changeInventoryPaletteVariant(edit.documentId,edit.before,next));closePaletteEditor();await persistDraft()}
  catch(e){error=describeError(e)}finally{busy=false}
 }
 function closeFurnitureEditor(){if(furnitureDialogEl?.open)furnitureDialogEl.close()}
 async function applyInventoryFurnitureVariant(event:SubmitEvent){
  event.preventDefault();
  const selected=furnitureEdit;
  if(!snapshot||busy||!selected||snapshot.revision!==selected.revision)return;
  const next=selected.options[furnitureSelection];if(!next)return;
  busy=true;error='';
  try{
   update(await changeInventoryFurnitureVariant(selected.documentId,selected.before,next));
   closeFurnitureEditor();await persistDraft();
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 async function addInventoryFurnitureVariant(){
  const selected=furnitureEdit;
  if(!snapshot||busy||!selected||snapshot.revision!==selected.revision)return;
  const next=selected.options[furnitureSelection];
  const quantity=variantAddQuantity;
  if(!next||!validVariantAddQuantity||quantity===undefined||!selected.creationOptions.some(v=>v.every((n,i)=>n===next[i])))return;
  busy=true;error='';
  try{
   update(await createInventoryFurnitureVariant(selected.documentId,selected.before,next,quantity));
   closeFurnitureEditor();await persistDraft();
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 function closeFlowerEditor(){if(flowerDialogEl?.open)flowerDialogEl.close()}
 async function applyInventoryFlowerVariant(event:SubmitEvent){
  event.preventDefault();
  const selected=flowerEdit;
  if(!snapshot||busy||!selected||snapshot.revision!==selected.revision)return;
  const next=selected.options[flowerSelection];if(!next)return;
  busy=true;error='';
  try{
   update(await changeInventoryFlowerVariant(selected.documentId,selected.before,next));
   closeFlowerEditor();await persistDraft();
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 async function addInventoryFlowerVariant(){
  const selected=flowerEdit;
  if(!snapshot||busy||!selected||snapshot.revision!==selected.revision)return;
  const next=selected.options[flowerSelection];
  const quantity=variantAddQuantity;
  if(!next||!validVariantAddQuantity||quantity===undefined||!selected.creationOptions.some(v=>v.every((n,i)=>n===next[i])))return;
  busy=true;error='';
  try{
   update(await createInventoryFlowerVariant(selected.documentId,selected.before,next,quantity));
   closeFlowerEditor();await persistDraft();
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 function onInventorySearch(event:Event){
  const next=(event.currentTarget as HTMLInputElement).value;
  inventoryLimit=BATCH_SIZE;
  if(!next.trim())return;
  const counts=inventorySearchGroupCounts(inventoryBrowseRows,next,inventoryEditableOnly,sourceNames,inventorySourceItems,nativeInventoryIndex,inventoryVariantSearchName);
  inventoryGroup=inventorySearchTarget(activeInventoryGroup,counts);
 }
 function toggleInventoryBatch(row:InventoryEntry){
  if(!snapshot||busy||!inventoryBatchMode||!row.editable)return;
  const next=new Set(inventoryBatchSelected);
  if(next.has(row.documentId))next.delete(row.documentId);
  else if(next.size<snapshot.inventoryBatchLimit)next.add(row.documentId);
  inventoryBatchSelected=next;
 }
 // Select only currently rendered, quantity-editable rows, up to Rust's
 // transaction limit. Preserve explicit selections made in other tabs/searches.
 const inventorySelectableVisible=$derived(inventoryRows.slice(0,inventoryLimit)
  .filter(row=>row.editable&&!inventoryBatchSelected.has(row.documentId)));
 function selectVisibleInventoryBatch(){
  if(!snapshot||busy||!inventoryBatchMode)return;
  const next=new Set(inventoryBatchSelected);
  for(const row of inventorySelectableVisible){
   if(next.size>=snapshot.inventoryBatchLimit)break;
   next.add(row.documentId);
  }
  inventoryBatchSelected=next;
 }
 async function applyInventoryBatch(event:SubmitEvent){
  event.preventDefault();
  if(!snapshot||busy||!inventoryBatchMode||!inventoryBatchSelected.size)return;
  const next=inventoryBatchQuantity;
  if(next===undefined||!Number.isSafeInteger(next)||next<inventoryBatchMinimum||next>inventoryBatchMaximum)return;
  const rows=inventoryBrowseRows.filter(row=>inventoryBatchSelected.has(row.documentId));
  if(rows.length!==inventoryBatchSelected.size||rows.some(row=>!row.editable))return;
  if(rows.every(row=>row.quantity===next)){resetInventoryBatchSelection();return}
  if(next===0&&!confirm(inventoryEmptyCopy(locale)))return;
  const requests:InventoryQuantityRequest[]=rows.map(row=>[row.documentId,row.quantity,next]);
  busy=true;error='';
  try{
   update(await changeInventoryQuantities(requests));
   resetInventoryBatchSelection();
   await persistDraft();
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 async function applyInventoryQuantity(row:InventoryEntry,event:SubmitEvent){
  event.preventDefault();
  if(!snapshot||busy||inventoryBatchMode||!row.editable)return;
  const value=new FormData(event.currentTarget as HTMLFormElement).get('quantity');
  if(typeof value!=='string'||!/^(0|[1-9][0-9]*)$/.test(value)){
   error=copy.fileError;return;
  }
  const next=Number(value);
  if(!Number.isSafeInteger(next)||row.quantityLimit===null||next<row.quantityMinimum||next>row.quantityLimit){error=copy.fileError;return}
  if(next===row.quantity)return;
  if(next===0&&!confirm(inventoryEmptyCopy(locale)))return;
  busy=true;error='';
  try{
   update(await changeInventoryQuantity(row.documentId,row.quantity,next));
   await persistDraft();
  }catch(e){error=describeError(e)}
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

 /** Destructive edits are never sent to the Worker before a user decision. */
 async function requestRemoval(target:PendingRemoval,opener:HTMLElement){
  if(!snapshot||busy||pendingRemoval)return;
  pendingRemoval=target;removalReturnFocus=opener;removalOriginal=original;
  await tick();
  if(!pendingRemoval||!snapshot||original!==removalOriginal){closeRemovalConfirmation();return}
  if(removalConfirmEl&&!removalConfirmEl.open)removalConfirmEl.showModal();
 }
 function closeRemovalConfirmation(){if(removalConfirmEl?.open)removalConfirmEl.close();}
 function onRemovalConfirmationClosed(){
  pendingRemoval=null;removalOriginal=null;
  const focus=removalReturnFocus;removalReturnFocus=null;
  if(focus?.isConnected)focus.focus();
 }
 async function confirmRemoval(){
  const target=pendingRemoval;
  if(!target||!snapshot||busy)return;
  if(snapshot.revision!==target.revision||original!==removalOriginal||
   (target.kind==='collections'
    ?recorded[String(target.id)]!==target.before
    :snapshot.achievements.find(row=>achievementGuid(row.guid)===target.item.guid)?.value.complete!==true)){
   closeRemovalConfirmation();error=removalCopy.stale;return;
  }
  closeRemovalConfirmation();
  if(target.kind==='collections'){
   const success=await change(target.id,null);
   if(target.fromDateDialog){
    if(success)closeDateDialog();
    else dateValidation=error||copy.fileError;
   }
  }else await quickToggleAchievement(target.item,undefined,undefined,true);
 }
 async function toggleCollection(id:number,name:string,opener:HTMLElement){
  if(!snapshot||busy||pendingRemoval)return;
  const before=recorded[String(id)];
  if(before!==undefined){
   if(!snapshot.membershipEdit)return;
   await requestRemoval({kind:'collections',id,name,before,revision:snapshot.revision,fromDateDialog:false},opener);
  }else await change(id,EPOCH+BigInt(Date.now())*10000n);
 }
 async function goToHistory(target:number){
  if(!snapshot||busy||!Number.isSafeInteger(target)||target<0||target>tabHistory.length||target===tabHistoryCursor)return;
  const scope=activeTool;
  busy=true;error='';
  try{
   update(await jumpHistory(scope,target));
   // A history jump may remove or recreate selected inventory rows. Never
   // carry a selection or an unsubmitted quantity across native revisions.
   if(scope==='inventory')resetInventoryBatchSelection();
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
  try{await draftWrites.catch(()=>{});await forgetLocalDraft();await clear();snapshot=null;original=null;recorded={};baseline=new Map();achievementBaseline=[];inventoryBaseline=[];editingAchievement=null;goHome();draftReady=true;draftWarning=false;}
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
 async function clearDate(opener:HTMLElement){
  if(editId===null||dateDialogTick===null||busy||!snapshot?.membershipEdit)return;
  await requestRemoval({
   kind:'collections',id:editId,name:dateDialogItem?nameFor(dateDialogItem):String(editId),
   before:dateDialogTick,revision:snapshot.revision,fromDateDialog:true
  },opener);
 }

 /** An absent saved AchievementModel means 0/X in the game UI.
  * Only clicking a verified source-defined tile creates a new Union(16) model.
  * v3.0.0 creation is gated until its exact version-specific source is verified.
  */
 async function quickToggleAchievement(item:AchievementListRow,opener?:HTMLElement,name?:string,confirmed=false){
  if(!snapshot||busy||(!confirmed&&pendingRemoval))return;
  const live=snapshot.achievements.find(x=>achievementGuid(x.guid)===item.guid);
  if(!live&&(snapshot.version!=='3.0.1'||!achievementIndex.has(item.guid)))return;
  if(live?.value.complete&&!confirmed){
   if(opener)await requestRemoval({
    kind:'achievements',item,name:name??achievementName(item.guid,item.index),revision:snapshot.revision
   },opener);
   return;
  }
  busy=true;error='';
  try{
   const guid=item.guid.split(':').map(word=>parseInt(word,16)) as AchievementEntry['guid'];
   // Rust alone determines goal, progress clamp and recorded completion time.
   const next=await planAchievementToggle(guid,Date.now());
   update(await editAchievementAuto(guid,live?.value??null,next));
   await persistDraft();
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 async function openAchievement(row:AchievementEntry,opener:HTMLElement,index:number){
  if(busy||!row.value.complete)return;
  editingAchievement=row;achievementReturnFocus=opener;editingAchievementTitle=achievementName(achievementGuid(row.guid),index);
  achievementDate=toAchievementDateTimeValue(row.value.completed);
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
  if(!achievementDate){achievementValidation=achCopy.invalid;return}
  let completed:AchievementValue['completed'];
  try{completed=fromAchievementDateTimeValue(achievementDate,selected.value.completed)}
  catch{achievementValidation=achCopy.invalid;return}
  const next:AchievementValue={complete:selected.value.complete,current:selected.value.current,completed};
  if(next.current===selected.value.current&&next.completed?.[0]===selected.value.completed?.[0]&&
   next.completed?.[1]===selected.value.completed?.[1]){closeAchievement();return}
  busy=true;error='';achievementValidation='';
  try{
   update(await editAchievementAuto(selected.guid,selected.value,next));
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
    <button type="button" class="tool-tab" data-tool="inventory" class:active={activeTool==='inventory'} aria-current={activeTool==='inventory'?'page':undefined} onclick={openInventoryTab}>{iCopy.tab}</button>
    <button type="button" class="tool-tab" data-tool="collections" class:active={activeTool==='collections'} aria-current={activeTool==='collections'?'page':undefined} onclick={goHome}>{copy.toolCollection}</button>
    <button type="button" class="tool-tab" data-tool="achievements" class:active={activeTool==='achievements'} aria-current={activeTool==='achievements'?'page':undefined} onclick={openAchievementsTab}>{achCopy.title}</button>
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
           <span class="history-step">{i+1}</span><span class="history-text"><span class="history-item-name">{historyEntryLabel(entry,i)}</span>{#if historyEntryChange(i)}<span class="history-change">{historyEntryChange(i)}</span>{/if}</span>
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
   {#if achievementGroupHierarchy && achievementGroupSelection!==null && !achievementQuery.trim()}
    <button type="button" class="back-link achievement-group-back" onclick={()=>showAchievementGroup(null)}>‹ {groupCopy.back}</button>
   {/if}
   {#if achievementGroupHierarchy && achievementGroupSelection!==null && !achievementQuery.trim()}
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
      {@const progressGoal=achievementGoalsByGuid.get(item.guid)??null}
      <article class="item-tile achievement-tile" class:is-recorded={item.row?.value.complete===true}>
       <button type="button" class="item-toggle achievement-toggle"
        aria-pressed={item.row?.value.complete??false}
        aria-label={(item.row?.value.complete?compactCopy.relock:compactCopy.unlock)+': '+title}
        title={item.row?.value.complete?compactCopy.relock:compactCopy.unlock}
        disabled={busy||(!item.row&&(snapshot.version!=='3.0.1'||!achievementIndex.has(item.guid)))}
        onclick={e=>void quickToggleAchievement(item,e.currentTarget,title)}>
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
       {#if item.row?.value.complete}
        <button type="button" class="date-button achievement-dialog-button"
         title={compactCopy.date}
         aria-label={compactCopy.date+': '+title}
         disabled={busy} onclick={e=>{if(item.row)void openAchievement(item.row,e.currentTarget,item.index)}}>
         ◷
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
   <dialog class="achievement-dialog" bind:this={achievementDialogEl} onclose={onAchievementDialogClosed} oncancel={e=>{if(busy)e.preventDefault()}}>
    {#if editingAchievement}
     {@const editingSaveGuid=achievementGuid(editingAchievement.guid)}
     {@const dialogIndividualArt=achievementIndividualAtlas?.bySaveGuid.get(editingSaveGuid)}
     {@const dialogCategoryArt=achievementCategoryAtlas?.bySaveGuid.get(editingSaveGuid)}
     <form class="achievement-form" onsubmit={e=>{e.preventDefault();void saveAchievement()}}>
      <div class="date-dialog-heading">
       <h2>{compactCopy.date}</h2>
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
  {:else if activeTool==='inventory'}
   <div class="collection-controls inventory-controls">
    <label class="search-field">
     <svg class="search-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.75" cy="10.75" r="6.75"/><path d="m16 16 5 5"/></svg>
     <input type="search" bind:value={inventoryQuery} oninput={onInventorySearch} placeholder={iCopy.search} aria-label={iCopy.search}/>
    </label>
    <button type="button" class="inventory-editable-filter" class:active={inventoryEditableOnly}
     aria-pressed={inventoryEditableOnly}
     onclick={()=>{inventoryEditableOnly=!inventoryEditableOnly;inventoryLimit=BATCH_SIZE}}>
     {iCopy.editableOnly}
    </button>
    <button type="button" class="inventory-editable-filter inventory-add-toggle" class:active={inventoryAddMode}
     aria-pressed={inventoryAddMode} disabled={busy||(!inventoryAddMode&&snapshot.inventoryCreatable.length===0)}
     onclick={()=>{clearInventoryBatch();inventoryAddMode=!inventoryAddMode;inventoryQuery='';inventoryGroup=null;inventoryLimit=BATCH_SIZE}}>
     {inventoryAddMode?iCopy.tab:'+ '+inventoryAddCopy(locale)}
    </button>
    <button type="button" class="inventory-editable-filter inventory-batch-toggle" class:active={inventoryBatchMode}
     aria-pressed={inventoryBatchMode} disabled={busy||snapshot.inventoryBatchLimit<1}
     onclick={()=>{if(inventoryBatchMode)clearInventoryBatch();else inventoryBatchMode=true}}>
     {iBatchCopy}
    </button>
    {#if inventoryBatchMode}
     <form class="inventory-batch-form" onsubmit={e=>void applyInventoryBatch(e)}>
      <button type="button" class="inventory-editable-filter inventory-select-visible" disabled={busy||inventoryBatchSelected.size>=snapshot.inventoryBatchLimit||inventorySelectableVisible.length===0} title={inventorySelectVisibleCopy(locale)} aria-label={inventorySelectVisibleCopy(locale)} onclick={selectVisibleInventoryBatch}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/></svg>
       </button>
       <span class="inventory-total" aria-live="polite">{inventoryBatchSelected.size.toLocaleString(locale)} / {snapshot.inventoryBatchLimit.toLocaleString(locale)}</span>
      <input type="number" min={inventoryBatchMinimum} max={inventoryBatchMaximum} step="1" required bind:value={inventoryBatchQuantity} placeholder={iCopy.quantity} aria-label={iCopy.quantity} disabled={busy}/>
      <button type="submit" class="primary" disabled={busy||!inventoryBatchSelected.size||inventoryBatchQuantity===undefined}>{iCopy.apply}</button>
      <button type="button" class="inventory-editable-filter" disabled={busy} onclick={clearInventoryBatch}>{copy.cancel}</button>
     </form>
    {:else}
     <span class="inventory-total">{inventoryAddMode?inventoryAddCopy(locale):iCopy.count}: {inventoryRows.length.toLocaleString(locale)}</span>
    {/if}
   </div>
   {#if inventoryVisibleGroups.length>0||(inventoryGroupTotals.get(OTHER_INVENTORY_GROUP)??0)>0}
    
    <nav class="inventory-group-strip" aria-label={iCopy.tab}>
     {#each inventoryVisibleGroups as t (t.key)}
      {@const representative=inventoryCategoryRepresentative(t.key,nativeInventoryIndex)}
      {@const representativeSource=representative===undefined?undefined:inventorySourceItems.get(representative)}
      {@const representativeNative=representative===undefined?undefined:inventoryNativeArt?.entries.get(representative)}
      {@const representativeSprite=representativeNative??(representativeSource&&representative!==undefined?inventoryIconPacks[representativeSource[3]]?.entries[String(representative)]:undefined)}
      <button type="button" class="inventory-group-option" data-inventory-group={t.key} class:active={activeInventoryGroup===t.key}
       aria-pressed={activeInventoryGroup===t.key} onclick={()=>{inventoryGroup=t.key;inventoryLimit=BATCH_SIZE}}>
       {#if representative!==undefined&&(representativeSprite||originalVariantArt[String(representative)]||exactVariantArt[String(representative)])}
        <span class="inventory-category-representative" aria-hidden="true">
         {#if originalVariantArt[String(representative)]||exactVariantArt[String(representative)]||(!representativeNative&&representativeSprite&&nativeDyePalettes[String(representative)])}
          <DyeSprite sprite={representativeSprite} palette={nativeDyePalettes[String(representative)]}
           sourceKey={representativeSource?.[1]??''} exactArtUrl={exactVariantArt[String(representative)]} originalArtUrl={originalVariantArt[String(representative)]}
           previewUrl={nativeColorwayIcons[String(representative)]}/>
         {:else if representativeSprite}
          <span style:background-image={'url("'+representativeSprite.url+'")'} style:background-position={'-'+representativeSprite.x+'px -'+representativeSprite.y+'px'}></span>
         {/if}
        </span>
       {:else if t.art}
        <img src={ICONS+t.art} alt="" loading="lazy" onerror={e=>(e.currentTarget as HTMLImageElement).style.visibility='hidden'}/>
       {/if}
       <span>{inventoryGroupLabel(locale,t.key)}</span><small>{(inventoryMatchTotals.get(t.key)??0).toLocaleString(locale)}</small>
      </button>
     {/each}
     {#if (inventoryGroupTotals.get(OTHER_INVENTORY_GROUP)??0)>0}
      <button type="button" class="inventory-group-option" class:active={activeInventoryGroup===OTHER_INVENTORY_GROUP}
       aria-pressed={activeInventoryGroup===OTHER_INVENTORY_GROUP}
       onclick={()=>{inventoryGroup=OTHER_INVENTORY_GROUP;inventoryLimit=BATCH_SIZE}}>
       <span>{iCopy.other}</span><small>{(inventoryMatchTotals.get(OTHER_INVENTORY_GROUP)??0).toLocaleString(locale)}</small>
      </button>
     {/if}
    </nav>
   {/if}
   <div class="inventory-grid">
    {#each inventoryRows.slice(0,inventoryLimit) as item (item.documentId)}
     {@const definition=inventorySourceItems.get(item.itemId)}
     {@const nativeSprite=inventoryNativeArt?.entries.get(item.itemId)}
     {@const sprite=definition&&!inventoryNativeArt?.withheld.has(item.itemId)?inventoryIconPacks[definition[3]]?.entries[String(item.itemId)]:undefined}
     {@const flower=flowerDisplay(item.flower,flowerDefinitions,flowerLabels[locale]??{})}
     {@const growth=flowerGrowthKind(item.itemId,item.flower)}
     {@const variantTitle=inventoryVariantSearchName(item)}
     {@const chef=inventoryChefAppearance(item.itemId,item.unique)}
     {@const wand=inventoryWandAppearance(item.itemId,item.unique)}
     {@const canFlower=!!item.flower&&!!item.unique?.flowerEditable&&!!flowerDefinitions&&!!flowerLabels[locale]}
     {@const canFurniture=!!item.unique?.furnitureEditable||!!item.furnitureCreatable}
     {@const canPalette=!!item.unique?.paletteEditable&&!!item.palette}
     {@const canBoba=!!item.boba?.editable}
      <article class="inventory-card" class:inventory-readonly={!item.editable&&!canFlower&&!canFurniture&&!item.flowerCreatable} class:inventory-batch-selected={inventoryBatchMode&&inventoryBatchSelected.has(item.documentId)}>
      {#if inventoryBatchMode&&item.editable}
       <input class="inventory-batch-checkbox" type="checkbox" checked={inventoryBatchSelected.has(item.documentId)} aria-label={iBatchCopy+': '+inventoryName(item.itemId)}
        disabled={busy||(!inventoryBatchSelected.has(item.documentId)&&inventoryBatchSelected.size>=snapshot.inventoryBatchLimit)} onchange={()=>toggleInventoryBatch(item)}/>
      {/if}
      <div class="inventory-card-heading" data-flower-growth={growth??undefined}>
       <span class="inventory-item-art" class:flower-variant={!!flower} aria-hidden="true">
        {#if wand&&snapshot.version==='3.0.1'&&!originalVariantArt[String(item.itemId)]}
          <DynamicWandSprite itemId={item.itemId} appearance={wand} fallback={nativeSprite??sprite}/>
         {:else if chef&&snapshot.version==='3.0.1'&&!originalVariantArt[String(item.itemId)]}
          <DynamicChefSprite itemId={item.itemId} appearance={chef} fallback={nativeSprite??sprite}/>
         {:else if item.palette&&item.itemId===CUSTOM_PALETTE_ITEM_ID&&snapshot.version==='3.0.1'&&!originalVariantArt[String(item.itemId)]}
         <DynamicPaletteSprite itemId={item.itemId} palette={item.palette}/>
        {:else if item.flower&&flowerDefinitions&&snapshot.version==='3.0.1'&&!originalVariantArt[String(item.itemId)]}
         <DynamicFlowerSprite itemId={item.itemId} flower={item.flower} definitions={flowerDefinitions} fallback={nativeSprite??sprite}/>
        {:else if originalVariantArt[String(item.itemId)]||exactVariantArt[String(item.itemId)]||(!nativeSprite&&sprite&&nativeDyePalettes[String(item.itemId)])}
         <DyeSprite sprite={nativeSprite??sprite} palette={nativeDyePalettes[String(item.itemId)]}
          sourceKey={definition?.[1]??''} exactArtUrl={exactVariantArt[String(item.itemId)]} originalArtUrl={originalVariantArt[String(item.itemId)]}
          previewUrl={nativeColorwayIcons[String(item.itemId)]}/>
        {:else if nativeSprite}
         <span class="item-sprite" data-inventory-art="native" style:background-image={'url("'+nativeSprite.url+'")'}
          style:background-position={'-'+nativeSprite.x+'px -'+nativeSprite.y+'px'}></span>
        {:else if sprite}
         <span class="item-sprite" style:background-image={'url("'+sprite.url+'")'}
          style:background-position={'-'+sprite.x+'px -'+sprite.y+'px'}></span>
        {:else}
         <span class="item-art-empty">✧</span>
        {/if}
        {#if flower}
         <span class="inventory-flower-decorators">
          {#if flower.color}<span class="inventory-flower-color" style:background-color={flower.color}></span>{/if}
          {#if flower.patternUrl}<img class="inventory-flower-pattern" src={INVENTORY_UI+flower.patternUrl} alt=""/>{/if}
         </span>
        {/if}
       </span>
       <strong class="inventory-name" title={inventoryName(item.itemId)}>{inventoryName(item.itemId)}</strong>
       {#if variantTitle}<span class="inventory-flower-variant-name" title={variantTitle}>{variantTitle}</span>{/if}
      </div>
      {#if item.editable}
       <form class="inventory-quantity-form" onsubmit={e=>void applyInventoryQuantity(item,e)}>
        <label>
         <span class="visually-hidden">{iCopy.quantity}</span>
         <input type="number" name="quantity" min={item.quantityMinimum} max={item.quantityLimit??1} step="1"
          value={inventoryAddMode?1:item.quantity} disabled={busy||inventoryBatchMode} aria-label={iCopy.quantity+': '+inventoryName(item.itemId)}/>
        </label>
        <button type="submit" class="primary" disabled={busy||inventoryBatchMode} title={iCopy.apply} aria-label={iCopy.apply}>
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
        </button>
        {#if canFlower||canFurniture||canPalette||canBoba}
         <button class="inventory-unique-edit-button inventory-compact-variant" type="button" disabled={busy||inventoryBatchMode}
          title={canBoba?inventoryName(item.itemId):canPalette?flowerCopy.color:canFurniture?furnitureCopy.title:flowerCopy.title} aria-label={(canBoba?inventoryName(item.itemId):canPalette?flowerCopy.color:canFurniture?furnitureCopy.title:flowerCopy.title)+': '+inventoryName(item.itemId)}
          onclick={()=>void (canBoba?openBobaEditor(item):canPalette?openPaletteEditor(item):canFurniture?openFurnitureEditor(item):openFlowerEditor(item))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7l-4-4L4 15z"/></svg>
         </button>
        {/if}
       </form>
      {:else if item.flowerCreatable}
       <button class="inventory-unique-edit-button" type="button" disabled={busy||inventoryBatchMode} aria-label={inventoryAddCopy(locale)+': '+inventoryName(item.itemId)} onclick={()=>void openAbsentFlowerEditor(item)}>{inventoryAddCopy(locale)}</button>
      {:else if canFurniture}
       <button class="inventory-unique-edit-button" type="button" disabled={busy||inventoryBatchMode} title={furnitureCopy.title} aria-label={furnitureCopy.title+': '+inventoryName(item.itemId)} onclick={()=>void openFurnitureEditor(item)}>
        <span>{item.quantity}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7l-4-4L4 15z"/></svg>
       </button>
      {:else if canFlower}
       <button class="inventory-unique-edit-button" type="button" disabled={busy||inventoryBatchMode}
        title={flowerCopy.title} aria-label={flowerCopy.title+': '+inventoryName(item.itemId)} onclick={()=>void openFlowerEditor(item)}>
        <span>{item.quantity}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7l-4-4L4 15z"/></svg>
       </button>
      {:else}
       <span class="inventory-readonly-quantity" title={iCopy.readonly}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
        <span class="visually-hidden">{iCopy.readonly} · {iCopy.quantity}: </span>{item.quantity}
       </span>
      {/if}
     </article>
    {/each}
   </div>
   {#if inventoryRows.length===0}<p class="empty-result">{iCopy.empty}</p>{/if}
   {#if inventoryRows.length>inventoryLimit}
    <div class="load-marker" bind:this={inventoryLoadMoreSentinel}>
     {#if typeof IntersectionObserver==='undefined'}
      <button type="button" onclick={()=>inventoryLimit=Math.min(inventoryLimit+BATCH_SIZE,inventoryRows.length)}>{copy.moreItems}</button>
     {/if}
    </div>
   {/if}
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
       {#if sub.previewId!==null&&(originalVariantArt[String(sub.previewId)]||exactVariantArt[String(sub.previewId)]||(sprite&&nativeDyePalettes[String(sub.previewId)]))}
        <DyeSprite sprite={sprite} palette={nativeDyePalettes[String(sub.previewId)]} sourceKey={catalog?.items.find(x=>x[0]===sub.previewId)?.[1]??''} exactArtUrl={exactVariantArt[String(sub.previewId)]} originalArtUrl={originalVariantArt[String(sub.previewId)]} previewUrl={nativeColorwayIcons[String(sub.previewId)]}/>
       {:else if sprite}
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
     {@const mayAdd=snapshot.version===catalog?.version&&eligibleCollectionHistoryIds.has(item[0])}
     {@const mayToggle=showVariants?(direct?snapshot.membershipEdit:mayAdd):(recordIds.length===0?mayAdd:recordIds.length===1&&direct&&snapshot.membershipEdit)}
     {@const sprite=iconPack?.group===selectedGroup?iconPack.entries[String(item[0])]:undefined}
     <article class="item-tile" id={'collection-item-'+item[0]} class:is-recorded={has}>
      <button type="button" class="item-toggle" aria-pressed={has} aria-label={(has?copy.unsetRecorded:copy.setRecorded)+': '+nameFor(item)}
       title={mayToggle?(has?copy.unsetRecorded:copy.setRecorded):!showVariants&&recordIds.length>0?copy.variantsToEdit:copy.unsafe} disabled={busy||!mayToggle}
       onclick={e=>void toggleCollection(item[0],nameFor(item),e.currentTarget)}>
       <span class="item-art" aria-hidden="true">
        {#if originalVariantArt[String(item[0])]||exactVariantArt[String(item[0])]||(sprite&&nativeDyePalettes[String(item[0])])}
         <DyeSprite sprite={sprite} palette={nativeDyePalettes[String(item[0])]} sourceKey={item[1]} exactArtUrl={exactVariantArt[String(item[0])]} originalArtUrl={originalVariantArt[String(item[0])]} previewUrl={nativeColorwayIcons[String(item[0])]}/>
        {:else if sprite}
         <span class="item-sprite" style:background-image={'url("'+sprite.url+'")'} style:background-position={'-'+sprite.x+'px -'+sprite.y+'px'}></span>
        {:else}
         <span class="item-art-empty">✧</span>
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
 <dialog class="date-dialog" bind:this={bobaDialogEl} aria-labelledby="boba-editor-title" onclose={()=>{bobaEdit=null;bobaSelection=-1}} oncancel={e=>{if(busy)e.preventDefault()}}>
  {#if bobaEdit}
   {@const edit=bobaEdit}
   <form class="date-dialog-inner" onsubmit={applyInventoryBobaVariant}>
    <div class="date-dialog-heading">
     <h2 id="boba-editor-title">{inventoryName(edit.itemId)}</h2>
     <button class="date-dialog-close" type="button" aria-label={copy.cancel} disabled={busy} onclick={closeBobaEditor}>×</button>
    </div>
    <div style="display:flex;justify-content:center"><DynamicChefSprite itemId={edit.itemId} appearance={{kind:'boba',colorId:edit.before[0]}}/></div>
    <label class="date-dialog-field">
     <span>{bobaVariantLabel(edit.before,locale)}</span>
     <select name="boba-variant" bind:value={bobaSelection} disabled={busy}>
      <option value={-1}>{bobaVariantLabel(edit.before,locale)}</option>
      {#each edit.options as option,i}<option value={i}>{bobaVariantLabel(option,locale)}</option>{/each}
     </select>
    </label>
    {#if !edit.options.length}<p class="compact-hint">{iCopy.readonly}</p>{/if}
    <div class="date-dialog-actions">
     <button type="button" class="date-dialog-cancel" disabled={busy} onclick={closeBobaEditor}>{copy.cancel}</button>
     <button type="submit" class="primary" disabled={busy||bobaSelection<0}>{copy.apply}</button>
    </div>
   </form>
  {/if}
 </dialog>

 <dialog class="date-dialog" bind:this={paletteDialogEl} aria-labelledby="palette-editor-title" onclose={()=>{paletteEdit=null;paletteSelection=-1}} oncancel={e=>{if(busy)e.preventDefault()}}>
  {#if paletteEdit}
   {@const edit=paletteEdit}
   {@const selected=edit.options[paletteSelection]??edit.before}
   <form class="date-dialog-inner" onsubmit={applyInventoryPaletteVariant}>
    <div class="date-dialog-heading">
     <h2 id="palette-editor-title">{inventoryName(edit.itemId)}</h2>
     <button class="date-dialog-close" type="button" aria-label={copy.cancel} disabled={busy} onclick={closePaletteEditor}>×</button>
    </div>
    <div class="inventory-palette-preview" style="display:flex;justify-content:center">
     <DynamicPaletteSprite itemId={edit.itemId} palette={paletteFromWords(selected)}/>
    </div>
    <div class="date-dialog-field">
     <div style="display:flex;gap:8px">
      {#each [0,1,2] as slot}
       <button class="inventory-palette-slot" type="button" data-palette-slot={slot} aria-label={flowerCopy.color+' '+(slot+1)} aria-pressed={paletteSlot===slot} disabled={busy} onclick={()=>{paletteSlot=slot;paletteSelection=-1}} style="min-width:44px;min-height:36px;display:flex;align-items:center;gap:6px">
        <span style:background-color={paletteColorHex(selected,slot)} style="width:22px;height:22px;border:1px solid currentColor;border-radius:4px" aria-hidden="true"></span>{slot+1}
       </button>
      {/each}
     </div>
     <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(32px,1fr));gap:5px;margin-top:8px">
      {#each edit.options as option,i}
       {#if option.slice(paletteSlot*4,paletteSlot*4+4).some((v,j)=>v!==edit.before[paletteSlot*4+j])}
        <button class="inventory-palette-option" type="button" data-palette-option={i} aria-label={paletteColorHex(option,paletteSlot)} title={paletteColorHex(option,paletteSlot)} aria-pressed={paletteSelection===i} disabled={busy} onclick={()=>paletteSelection=i} style:background-color={paletteColorHex(option,paletteSlot)} style="width:32px;height:32px;border:1px solid currentColor;border-radius:5px" style:outline={paletteSelection===i?'2px solid currentColor':'none'}></button>
       {/if}
      {/each}
     </div>
     {#if !edit.options.length}<p class="compact-hint">{iCopy.readonly}</p>{/if}
    </div>
    {#if edit.creationOptions.some(v=>v.every((n,i)=>n===edit.options[paletteSelection]?.[i]))}
     <label class="date-dialog-field">
      <span>{inventoryAddCopy(locale)} · {iCopy.quantity}</span>
      <input type="number" name="variant-add-quantity" min="1" max="2147483647" step="1" bind:value={variantAddQuantity} disabled={busy}/>
     </label>
    {/if}
    <div class="date-dialog-actions">
     <button type="button" class="date-dialog-cancel" disabled={busy} onclick={closePaletteEditor}>{copy.cancel}</button>
     {#if edit.creationOptions.length}
      <button type="button" class="inventory-create-palette" disabled={busy||!validVariantAddQuantity||paletteSelection<0||!edit.creationOptions.some(v=>v.every((n,i)=>n===edit.options[paletteSelection]?.[i]))} onclick={()=>void addInventoryPaletteVariant()}>{inventoryAddCopy(locale)}</button>
     {/if}
     <button type="submit" formnovalidate class="primary" disabled={busy||paletteSelection<0}>{copy.apply}</button>
    </div>
   </form>
  {/if}
 </dialog>

 <dialog class="date-dialog" bind:this={furnitureDialogEl} aria-labelledby="furniture-editor-title" onclose={()=>{furnitureEdit=null;furnitureSelection=-1}} oncancel={e=>{if(busy)e.preventDefault()}}>
  {#if furnitureEdit}
   {@const edit=furnitureEdit}
   {@const selected=edit.options[furnitureSelection]??edit.before}
   <form class="date-dialog-inner" onsubmit={e=>{if(edit.createOnly){e.preventDefault();void addInventoryFurnitureVariant()}else void applyInventoryFurnitureVariant(e)}}>
    <div class="date-dialog-heading">
     <h2 id="furniture-editor-title">{inventoryName(edit.itemId)}</h2>
     <button class="date-dialog-close" type="button" aria-label={copy.cancel} disabled={busy} onclick={closeFurnitureEditor}>×</button>
    </div>
    <div class="date-dialog-field">
     <span>{furnitureCopy.title}</span>
     {#each [0,1,2] as slot}
      {#if edit.before[slot]!==0||edit.options.some(v=>v[slot]!==edit.before[slot])}
       <div style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <span>{furnitureCopy.part} {String.fromCharCode(65+slot)}</span>
        <span style:background={materialSwatch(furnitureDisplay,edit.itemId,slot,selected[slot])} style="width:24px;height:24px;border:1px solid currentColor;border-radius:4px;flex-shrink:0" aria-hidden="true"></span>
        <span>{materialLabel(furnitureDisplay,selected[slot],furnitureCopy.defaultMaterial)}</span>
       </div>
      {/if}
     {/each}
    </div>
    {#if edit.options.length}
     <label class="date-dialog-field">
      <span>{furnitureCopy.material}</span>
      <select bind:value={furnitureSelection} disabled={busy} required>
       <option value={-1} disabled>{furnitureCopy.title}</option>
       {#each [0,1,2] as slot}
        {#if edit.options.some(v=>v[slot]!==edit.before[slot])}
         <optgroup label={furnitureCopy.part+' '+String.fromCharCode(65+slot)}>
          {#each edit.options as v,i}
           {#if v[slot]!==edit.before[slot]}
            <option value={i}>{materialLabel(furnitureDisplay,v[slot],furnitureCopy.defaultMaterial)}</option>
           {/if}
          {/each}
         </optgroup>
        {/if}
       {/each}
      </select>
     </label>
    {:else}
     <p class="compact-hint">{iCopy.readonly}</p>
    {/if}
    {#if edit.creationOptions.some(v=>v.every((n,i)=>n===edit.options[furnitureSelection]?.[i]))}
     <label class="date-dialog-field">
      <span>{inventoryAddCopy(locale)} · {iCopy.quantity}</span>
      <input type="number" name="variant-add-quantity" min="1" max="2147483647" step="1" bind:value={variantAddQuantity} disabled={busy}/>
     </label>
    {/if}
    <div class="date-dialog-actions">
     <button type="button" class="date-dialog-cancel" disabled={busy} onclick={closeFurnitureEditor}>{copy.cancel}</button>
     {#if edit.creationOptions.length}
      <button type={edit.createOnly?'submit':'button'} class="inventory-create-furniture" disabled={busy||!validVariantAddQuantity||furnitureSelection<0||!edit.creationOptions.some(v=>v.every((n,i)=>n===edit.options[furnitureSelection]?.[i]))} onclick={()=>{if(!edit.createOnly)void addInventoryFurnitureVariant()}}>{inventoryAddCopy(locale)}</button>
     {/if}
     {#if !edit.createOnly}<button type="submit" formnovalidate class="primary" disabled={busy||furnitureSelection<0}>{copy.apply}</button>{/if}
    </div>
   </form>
  {/if}
 </dialog>
 <dialog class="date-dialog" bind:this={flowerDialogEl} aria-labelledby="flower-editor-title"
  onclose={()=>{flowerEdit=null;flowerSelection=-1}} oncancel={e=>{if(busy)e.preventDefault()}}>
  {#if flowerEdit}
   {@const edit=flowerEdit}
   <form class="date-dialog-inner" onsubmit={e=>{if(edit.absent){e.preventDefault();void addInventoryFlowerVariant()}else void applyInventoryFlowerVariant(e)}}>
    <div class="date-dialog-heading">
     <h2 id="flower-editor-title">{inventoryName(edit.itemId)}{#if flowerGrowthKind(edit.itemId,{growState:(edit.absent?edit.options[0]?.[0]:edit.before[0])??255,baseColor:0,pattern:0,patternColor:0})} · {flowerGrowthLabel(locale,flowerGrowthKind(edit.itemId,{growState:(edit.absent?edit.options[0]?.[0]:edit.before[0])??255,baseColor:0,pattern:0,patternColor:0}))}{/if}</h2>
     <button class="date-dialog-close" type="button" aria-label={copy.cancel} disabled={busy} onclick={closeFlowerEditor}>×</button>
    </div>
    <div class="date-dialog-item">
     <span class="date-dialog-art" aria-hidden="true">
      {#if flowerDefinitions}
       {@const current=edit.options[flowerSelection]??edit.before}
       <DynamicFlowerSprite itemId={edit.itemId} flower={{growState:current[0],baseColor:current[1],pattern:current[2],patternColor:current[3]}} definitions={flowerDefinitions} fallback={inventoryNativeArt?.entries.get(edit.itemId)}/>
      {/if}
     </span>
     <div class="date-dialog-detail"><strong>{flowerVariantName(edit.absent?(edit.options[flowerSelection]??edit.options[0]):edit.before)}</strong></div>
    </div>
    {#if edit.options.length}
     <label class="date-dialog-field">
      <span>{flowerCopy.title}</span>
      <select bind:value={flowerSelection} disabled={busy} required>
       {#if edit.absent}
        {#each edit.options as v,i}<option value={i}>{flowerVariantName(v)}</option>{/each}
       {:else}
       <option value={-1} disabled>{flowerVariantName(edit.before)}</option>
       {#each [flowerCopy.color,flowerCopy.pattern,flowerCopy.accent] as group, g}
        {#if edit.options.some(v=>flowerOptionGroup(edit.before,v)===g)}
         <optgroup label={group}>
          {#each edit.options as v,i}
           {#if flowerOptionGroup(edit.before,v)===g}
            <option value={i}>{flowerVariantName(v)}</option>
           {/if}
          {/each}
         </optgroup>
        {/if}
       {/each}
       {/if}
      </select>
     </label>
    {:else}
     <p class="compact-hint">{iCopy.readonly}</p>
    {/if}
    {#if edit.creationOptions.some(v=>v.every((n,i)=>n===edit.options[flowerSelection]?.[i]))}
     <label class="date-dialog-field">
      <span>{inventoryAddCopy(locale)} · {iCopy.quantity}</span>
      <input type="number" name="variant-add-quantity" min="1" max="2147483647" step="1" bind:value={variantAddQuantity} disabled={busy}/>
     </label>
    {/if}
    <div class="date-dialog-actions">
     <button type="button" class="date-dialog-cancel" disabled={busy} onclick={closeFlowerEditor}>{copy.cancel}</button>
     {#if edit.creationOptions.length}
      <button type="button" class="inventory-create-flower" disabled={busy||!validVariantAddQuantity||flowerSelection<0||!edit.creationOptions.some(v=>v.every((n,i)=>n===edit.options[flowerSelection]?.[i]))} onclick={()=>void addInventoryFlowerVariant()}>{inventoryAddCopy(locale)}</button>
     {/if}
     {#if !edit.absent}<button type="submit" formnovalidate class="primary" disabled={busy||flowerSelection<0}>{copy.apply}</button>{/if}
    </div>
   </form>
  {/if}
 </dialog>
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
      {#if originalVariantArt[String(dateDialogItem[0])]||exactVariantArt[String(dateDialogItem[0])]||(sprite&&nativeDyePalettes[String(dateDialogItem[0])])}
       <DyeSprite sprite={sprite} palette={nativeDyePalettes[String(dateDialogItem[0])]} sourceKey={dateDialogItem[1]} exactArtUrl={exactVariantArt[String(dateDialogItem[0])]} originalArtUrl={originalVariantArt[String(dateDialogItem[0])]} previewUrl={nativeColorwayIcons[String(dateDialogItem[0])]}/>
      {:else if sprite}
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
      <button type="button" class="date-dialog-clear" disabled={busy} onclick={e=>void clearDate(e.currentTarget)}>{copy.unsetRecorded}</button>
     {/if}
     <span class="date-dialog-spacer"></span>
     <button type="button" class="date-dialog-cancel" disabled={busy} onclick={closeDateDialog}>{copy.cancel}</button>
     <button type="submit" class="primary" disabled={busy||!dateValue||!dateChanged}>{copy.apply}</button>
    </div>
   </form>
  {/if}
 </dialog>
 <dialog class="removal-confirm-dialog" bind:this={removalConfirmEl}
  aria-labelledby="removal-confirm-title" onclose={onRemovalConfirmationClosed}
  oncancel={e=>{if(busy)e.preventDefault()}}>
  {#if pendingRemoval}
   <div class="removal-confirm-inner">
    <div class="date-dialog-heading">
     <h2 id="removal-confirm-title">{pendingRemoval.kind==='collections'?removalCopy.collectionTitle:removalCopy.achievementTitle}</h2>
     <button type="button" class="date-dialog-close" aria-label={removalCopy.cancel} disabled={busy} onclick={closeRemovalConfirmation}>×</button>
    </div>
    <strong class="removal-confirm-name">{pendingRemoval.name}</strong>
    <p class="removal-confirm-warning">{pendingRemoval.kind==='collections'?removalCopy.collectionWarning:removalCopy.achievementWarning}</p>
    <div class="date-dialog-actions">
     <button type="button" class="date-dialog-cancel removal-cancel" autofocus disabled={busy} onclick={closeRemovalConfirmation}>{removalCopy.cancel}</button>
     <button type="button" class="removal-confirm-action" disabled={busy} onclick={()=>void confirmRemoval()}>{removalCopy.remove}</button>
    </div>
   </div>
  {/if}
 </dialog>
</div>
