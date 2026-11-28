<script lang="ts">
 import {onMount,tick,untrack} from 'svelte';
 import {openSave,changeCollection,changeInventoryQuantity,changeInventoryQuantities,removeInventoryEntries,requestFlowerVariants,requestFlowerPreview,requestFlowerCreationVariants,createInventoryFlowerVariant,changeInventoryFlowerVariant,requestFurniturePreview,createInventoryFurnitureVariant,changeInventoryFurnitureVariant,requestPalettePreview,changeInventoryPaletteVariant,createInventoryPaletteVariant,requestBobaVariants,changeInventoryBobaVariant,requestBobaCreationVariants,createInventoryBobaVariant,requestCafePreview,changeInventoryCafeVariant,createInventoryCafeVariant,requestWandVariants,changeInventoryWandIdentity,requestWandNestedMaterials,requestWandNestedPairs,changeInventoryWandNested,createInventoryWandNested,requestWandEditSources,requestAbsentWandSources,requestOwnedFurnitureWandSources,requestOwnedFurnitureWandPairs,requestWandCreationVariants,createInventoryWandVariant,editAchievementAuto,planAchievementToggle,applyDraft,jumpHistory,restoreHistory,exportSave,clear,type SaveSnapshot,type InventoryEntry,type InventoryPatch,type InventoryQuantityRequest,type AchievementEntry,type AchievementValue,type HistoryRecord} from './worker-client';
 import {diffPatches,diffInventory,inventoryPatchesEqual,restoreLocalDraft,saveOriginalLocally,saveDraftChanges,forgetLocalDraft,type DraftPatch} from './draft-store';
 import {diffAchievements,decodeAchievementDraft,type StoredPatch} from './achievement-draft';
 import {achievementCopy} from './achievement-ui';
 import {historyCopy,historyDetailCopy} from './history-copy';
 import {selectMatchingInventoryRows,deselectMatchingInventoryRows} from './inventory-selection';
 import {inventoryCopy,inventoryBatchCopy,inventoryEmptyCopy,inventoryAddCopy,inventorySelectVisibleCopy,inventoryDeselectVisibleCopy,inventoryDeleteCopy,inventoryShowZeroCopy,inventoryZeroStackCopy,inventoryRemoveEntryCopy,inventoryRemoveEntryWarning} from './inventory-copy';
 import {flowerVariantOf,type FlowerVariant,furnitureVariantOf,type FurnitureVariant,inventorySavedHomeName} from './inventory-unique';
 import {flowerEditorCopy,furnitureEditorCopy,flowerGrowthLabel} from './inventory-unique-copy';
 import {loadFurnitureDisplay,materialLabel,materialSwatch,furnitureVariantTitle,furnitureHasCustomizedAppearance,furnitureChoiceLabel,type FurnitureDisplay} from './inventory-furniture-display';
 import InventoryDecorator from './InventoryDecorator.svelte';
 import {flowerDecorators} from './inventory-flower-display';
 import {inventoryCategoryRepresentative,inventoryAddRows,inventoryDisplayRows,inventoryCustomizationSource,browseInventory,inventoryGroupCounts,inventorySearchGroupCounts,inventorySearchTarget,defaultInventoryGroup,OTHER_INVENTORY_GROUP,NATIVE_INVENTORY_TABS,type InventoryGroupKey} from './inventory-browse';
 import {createFlowerDisplayLoader,flowerDisplay,flowerGrowthKind,hasNativeFlowerArt,type FlowerDisplayDefinitions,type FlowerLabels} from './inventory-flower-display';
 import {loadNativeInventoryIndex,type NativeInventoryIndex} from './inventory-native-data';
 import {initialInventoryNativeArt,createInventoryNativeArtLoader,type InventoryNativeArt} from './inventory-native-art';
 import {nativeInventoryIconScale} from './native-inventory-icon-scale';
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
 import {loadAchievementCategoryAtlas,resolveAchievementDetailCategoryArt,type CategoryIconAtlas} from './achievement-category-icons';
 import {loadAchievementIndividualAtlas,type IndividualAchievementAtlas,type IndividualAchievementIdentity} from './achievement-individual-icons';
 import {loadAchievementIndex,achievementGuid,readableSourceKey,type AchievementIndex} from './achievement-index';
 import {loadAchievementTitles,type AchievementTitles} from './achievement-localization';
 import {editorErrors} from './ui-copy';
 import {supportedLocales,isLocale,detectLocale,isRtl,type Locale,type LanguagePref} from './locales';
 import {localizedCopy} from './ui-locales';
 import {loadLocaleIndex,loadGameLabels,EMPTY_LABELS,type GameLabels} from './game-localization';
 import {loadIconPack,type IconPack} from './icon-packs';
 import {createIconPackRequests} from './icon-pack-requests';
 import {loadNativeDyePalettes,dyeDecoratorFor,type NativeDyePalettes} from './native-dye-palettes';
 import {createVariantArtSourceLoader} from './variant-art';
 import DyeSprite from './DyeSprite.svelte';
 import InventoryAtlasSprite from './InventoryAtlasSprite.svelte';
 import DynamicFlowerSprite from './DynamicFlowerSprite.svelte';
 import DynamicPaletteSprite from './DynamicPaletteSprite.svelte';
 import DynamicChefSprite from './DynamicChefSprite.svelte';
 import DynamicWandSprite from './DynamicWandSprite.svelte';
 import DynamicArtSprite from './DynamicArtSprite.svelte';
 import {renderNativePlaceholderArt} from './native-placeholder-art';
 import {nativeResultIconTarget} from './native-result-icon';
 import {selectWandOriginalCell,selectInventoryWandOriginalCell} from './wand-original-subicon';
 import {inventoryWandAppearance,hasNativeWandArt,wandVariantOf,wandVariantLabel,wandMaterialLabel,wandFieldOptions,wandFieldLabels,wandNestedOf,type WandNested,type WandVariant,type WandInventoryAppearance} from './inventory-wand-display';
 import {inventoryChefAppearance,hasNativeChefArt} from './inventory-chef-display';
 import {nativeChefInstructionBase} from './native-icon-route';
 import {CUSTOM_PALETTE_ITEM_ID,paletteVariantOf,paletteFromWords,paletteColorHex,paletteRemovalSwatches,paletteSelectChannel,paletteChannelEqual,type PaletteVariant} from './inventory-palette-display';
 import {cafeSlotLabel,cafeVariantLabel,cafeOptionLabel,type CafeVariant,type CafeOption} from './inventory-cafe-display';
 import {bobaFieldOptions,bobaFieldLabel,bobaFieldValue,bobaNeedsTupleChoice,fullBobaLabel,type BobaVariant,type BobaField} from './inventory-boba-display';
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
  | {kind:'achievements';item:AchievementListRow;name:string;revision:number}
  | {kind:'inventory';requests:InventoryQuantityRequest[];physical:boolean;zero:boolean;batch:boolean;name:string;targets:{documentId:number;name:string;quantity:number;paletteColors:string[]}[];revision:number};
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
 const flowerDisplayLoader=createFlowerDisplayLoader(import.meta.env.BASE_URL);
 let flowerDisplayDisposed=false;
 function refreshFlowerDisplay(){
  if(flowerDisplayDisposed)return;
  if(!flowerDefinitions)void flowerDisplayLoader.definitions().then(data=>{if(!flowerDisplayDisposed)flowerDefinitions=data;}).catch(()=>{});
  if(!Object.keys(flowerLabels).length)void flowerDisplayLoader.labels().then(data=>{if(!flowerDisplayDisposed)flowerLabels=data;}).catch(()=>{});
 }
 let flowerDialogEl:HTMLDialogElement|undefined=$state();
 let flowerEdit=$state<{documentId:number;itemId:number;revision:number;before:FlowerVariant;options:FlowerVariant[];creationOptions:FlowerVariant[];absent?:boolean}|null>(null);
 let flowerDraft=$state<FlowerVariant|null>(null);
 let flowerDraftCreatable=$state(false);
 let variantAddQuantity=$state<number|undefined>(1);
 const validVariantAddQuantity=$derived(typeof variantAddQuantity==='number'&&Number.isInteger(variantAddQuantity)&&variantAddQuantity>=1&&variantAddQuantity<=2147483647);
 let furnitureDialogEl:HTMLDialogElement|undefined=$state();
 let furnitureDisplay:FurnitureDisplay|null=$state(null);
 let furnitureEdit=$state<{documentId:number;itemId:number;revision:number;before:FurnitureVariant;options:FurnitureVariant[];createOnly:boolean}|null>(null);
 let furnitureDraft=$state<FurnitureVariant|null>(null);
 let furnitureDraftCreatable=$state(false);
 let paletteDialogEl:HTMLDialogElement|undefined=$state();
 let paletteEdit=$state<{documentId:number;itemId:number;revision:number;before:PaletteVariant;options:PaletteVariant[]}|null>(null);
 let cafeDialogEl:HTMLDialogElement|undefined=$state();
 let cafeEdit=$state<{documentId:number;itemId:number;revision:number;before:CafeVariant;options:CafeOption[];absent?:boolean}|null>(null);
 let cafeDraft=$state<CafeVariant|null>(null);
 let cafeDraftCreatable=$state(false);
 let wandDialogEl:HTMLDialogElement|undefined=$state();
 let wandEdit=$state<{documentId:number;itemId:number;revision:number;before:WandVariant;appearance:WandInventoryAppearance;options:WandVariant[];creationOptions:WandVariant[];absent?:boolean;sourceChoices?:number[];beforeSource?:number;nestedBefore?:WandNested;nestedOptions?:FurnitureVariant[];nestedCreationOptions?:FurnitureVariant[];ownedFurnitureChoices?:number[];ownedFurnitureSource?:number;ownedFurnitureWitness?:WandNested}|null>(null);
 let wandSelection=$state(-1);
 let wandMaterialSelection=$state(-1);
 let wandSourceQuery=$state('');
 let bobaDialogEl:HTMLDialogElement|undefined=$state();
 let bobaEdit=$state<{documentId:number;itemId:number;revision:number;before:BobaVariant;options:BobaVariant[];creationOptions:BobaVariant[];absent?:boolean}|null>(null);
 let bobaSelection=$state(-1);
 let paletteSlot=$state(0);
 let paletteDraft=$state<PaletteVariant|null>(null);
 let paletteDraftCreatable=$state(false);
 let inventoryNativeArt:InventoryNativeArt=$state(initialInventoryNativeArt());
 const requestInventoryNativeArt=createInventoryNativeArtLoader(import.meta.env.BASE_URL);
 let inventoryNativeArtDisposed=false;
 function refreshInventoryNativeArt(){
  void requestInventoryNativeArt().then(art=>{
   if(!inventoryNativeArtDisposed)inventoryNativeArt=art;
  }).catch(()=>{});
 }
 let inventoryEditableOnly=$state(false);
 let inventoryShowZero=$state(false);
 let inventoryAddMode=$state(false);
 let inventoryBatchMode=$state(false);
 let inventoryBatchSelected=$state<Set<number>>(new Set());
 let inventoryBatchQuantity=$state<number|undefined>(undefined);
 // Presentation only: the tightest bound returned by Rust for selected rows.
 const inventoryBatchMinimum=$derived.by(()=>{
  if(inventoryAddMode||!snapshot||inventoryBatchSelected.size===0)return 1;
  return inventoryBrowseRows.some(row=>inventoryBatchSelected.has(row.documentId)&&row.quantityMinimum!==0)?1:0;
 });
 const selectedInventoryRows=$derived.by(()=>inventoryBrowseRows.filter(row=>inventoryBatchSelected.has(row.documentId)));
 const inventoryBatchCanQuantity=$derived(selectedInventoryRows.length>0&&selectedInventoryRows.every(row=>row.editable));
 const inventoryBatchCanDelete=$derived(!inventoryAddMode&&selectedInventoryRows.length>0&&selectedInventoryRows.length===inventoryBatchSelected.size&&((selectedInventoryRows.every(row=>row.editable&&row.quantityMinimum===0)&&selectedInventoryRows.some(row=>row.quantity>0))||selectedInventoryRows.every(row=>row.removable)));
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
 const inventoryIconRequests=new Map<string,Promise<IconPack|null>>();
 const iconPackRequests=createIconPackRequests(group=>loadIconPack(group,import.meta.env.BASE_URL));
 const inventoryIconFailed=new Set<string>();
 let inventoryIconPacks:Record<string,IconPack>=$state({});
 let inventoryIconPulse=$state(0);
 let inventoryIconEpoch=0;
 let achievementIndex:AchievementIndex=$state(new Map());
 let achievementGroupHierarchy:AchievementHierarchy|null=$state(null);
 let achievementCategoryAtlas:CategoryIconAtlas|null=$state(null);
 let achievementIndividualAtlas:IndividualAchievementAtlas|null=$state(null);
 let achievementIndividualIdentity:IndividualAchievementIdentity|null=$state(null);
 let achievementIndividualFailed=$state(false),achievementCategoryFailed=$state(false);
 const achievementImagesFailed=$derived(achievementIndividualFailed||achievementCategoryFailed);
 let achievementIndividualPending=false,achievementCategoryPending=false,achievementImagesDisposed=false;
 function refreshAchievementImages(){
  if(achievementImagesDisposed||!snapshot||activeTool!=='achievements'||achievementIndex.size!==820||!achievementGroupHierarchy)return;
  const index=achievementIndex,groups=achievementGroupHierarchy;
  if(!achievementIndividualAtlas&&!achievementIndividualPending){
   achievementIndividualPending=true;
   void loadAchievementIndividualAtlas(import.meta.env.BASE_URL,index,identity=>{
    if(!achievementImagesDisposed)achievementIndividualIdentity=identity;
   }).then(atlas=>{
    if(achievementImagesDisposed){atlas.dispose?.();return;}
    achievementIndividualAtlas=atlas;achievementIndividualFailed=false;
   }).catch(()=>{if(!achievementImagesDisposed)achievementIndividualFailed=true;}).finally(()=>{achievementIndividualPending=false;});
  }
  if(!achievementCategoryAtlas&&!achievementCategoryPending){
   achievementCategoryPending=true;
   void loadAchievementCategoryAtlas(import.meta.env.BASE_URL,index,groups).then(atlas=>{
    if(achievementImagesDisposed){atlas.dispose?.();return;}
    achievementCategoryAtlas=atlas;achievementCategoryFailed=false;
   }).catch(()=>{if(!achievementImagesDisposed)achievementCategoryFailed=true;}).finally(()=>{achievementCategoryPending=false;});
  }
 }
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
 const loadVariantArtSources=createVariantArtSourceLoader(import.meta.env.BASE_URL);
 let variantArtEpoch=0;
 function refreshVariantArtwork(){
  const epoch=variantArtEpoch;
  void loadVariantArtSources().then(art=>{
   if(epoch!==variantArtEpoch)return;
   originalVariantArt=art.originals;exactVariantArt=art.reconstructions;
  }).catch(()=>{});
 }
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
 const inventoryAvailableToAdd=$derived(inventoryAddRows((snapshot as SaveSnapshot|null)?.inventory??[],(snapshot as SaveSnapshot|null)?.inventoryCreatable??[]));
 const inventoryBrowseRows:InventoryEntry[]=$derived(inventoryAddMode?inventoryAvailableToAdd:(snapshot as SaveSnapshot|null)?.inventory??[]);
 const inventoryDisplayedRows=$derived(inventoryDisplayRows(inventoryBrowseRows,inventoryAddMode,inventoryShowZero));
 const inventoryGroupTotals=$derived(inventoryGroupCounts(inventoryDisplayedRows,nativeInventoryIndex));
 const inventoryMatchTotals=$derived(inventorySearchGroupCounts(inventoryDisplayedRows,inventoryQuery,inventoryEditableOnly,sourceNames,inventorySourceItems,nativeInventoryIndex,inventoryVariantSearchName));
 const inventoryVisibleGroups=$derived(nativeInventoryIndex.size?NATIVE_INVENTORY_TABS:[]);
 const activeInventoryGroup=$derived(inventoryGroup===OTHER_INVENTORY_GROUP&&!(inventoryGroupTotals.get(OTHER_INVENTORY_GROUP)??0)?defaultInventoryGroup(inventoryGroupTotals):inventoryGroup??defaultInventoryGroup(inventoryGroupTotals));
 const inventoryRows=$derived(browseInventory(
  inventoryDisplayedRows,inventoryQuery,activeInventoryGroup,
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
  refreshFlowerDisplay();
  window.addEventListener('online',refreshFlowerDisplay);
  void loadFurnitureDisplay().then(data=>furnitureDisplay=data).catch(()=>{});
  refreshInventoryNativeArt();
  window.addEventListener('online',refreshInventoryNativeArt);
  window.addEventListener('online',recoverSharedItemArtwork);
  window.addEventListener('online',refreshAchievementImages);
  // Exact game dye palettes, used exclusively for recoloring item image pixels.
  void loadNativeDyePalettes(import.meta.env.BASE_URL)
   .then(palettes=>nativeDyePalettes=palettes).catch(()=>{});
  refreshVariantArtwork();
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
   window.removeEventListener('online',refreshInventoryNativeArt);
   window.removeEventListener('online',recoverSharedItemArtwork);
   window.removeEventListener('online',refreshFlowerDisplay);
   flowerDisplayDisposed=true;
   inventoryNativeArtDisposed=true;
   iconEpoch++;iconLoadingGroup=null;iconPack=null;
   variantArtEpoch++;
   inventoryIconEpoch++;
   for(const pack of Object.values(inventoryIconPacks))pack.dispose();
   inventoryIconPacks={};
   window.removeEventListener('online',refreshAchievementImages);
   achievementImagesDisposed=true;
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
  if(!snapshot||activeTool!=='achievements'||achievementIndex.size!==820||!achievementGroupHierarchy)return;
  // Atlas state changes must not themselves cause automatic retries. Each
  // pending request is independent, including when the other atlas fails.
  untrack(refreshAchievementImages);
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
  function addWandSource(id:number|undefined){
   if(!id||id===1185152302||inventoryNativeArt?.entries.has(id)||inventoryNativeArt?.withheld.has(id))return;
   const item=inventorySourceItems.get(id);
   if(item&&inventorySourceGroups.has(item[3]))groups.add(item[3]);
  }
  for(const row of inventoryRows.slice(0,inventoryLimit)){
   // Native TryGetSubIcon returns the source item's normal UiIcon, even
   // when the wand itself has a native inventory-art entry.
   if(hasNativeWandArt(row.itemId))addWandSource(inventoryWandAppearance(row.itemId,row.unique)?.sourceItemId);
   const resultId=nativeResultIconTarget(row.itemId,snapshot.version);
   if(resultId!==undefined){
    if(!inventoryNativeArt?.entries.has(resultId)&&!inventoryNativeArt?.withheld.has(resultId)){
     const result=inventorySourceItems.get(resultId);
     if(result&&inventorySourceGroups.has(result[3]))groups.add(result[3]);
    }
    continue;
   }
   if(inventoryNativeArt?.entries.has(row.itemId)||inventoryNativeArt?.withheld.has(row.itemId))continue;
   const item=inventorySourceItems.get(row.itemId);
   if(item&&inventorySourceGroups.has(item[3]))groups.add(item[3]);
  }
  if(wandEdit&&hasNativeWandArt(wandEdit.itemId))addWandSource(wandEdit.appearance.sourceItemId);
  // A dialog may outlive its visible inventory row or be opened from Add.
  // Load its own original definition group using the same bounded pack queue.
  for(const edit of [flowerEdit,paletteEdit,cafeEdit,bobaEdit,wandEdit,furnitureEdit]){
   if(!edit||inventoryNativeArt?.entries.has(edit.itemId)||inventoryNativeArt?.withheld.has(edit.itemId))continue;
   const item=inventorySourceItems.get(edit.itemId);
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
 // Global collection results share the original pack cache and its bounded request queue.
 $effect(()=>{
  inventoryIconPulse;
  if(activeTool!=='collections'||!snapshot||!catalog||!showingGlobalCollectionSearch)return;
  const groups=new Set(collectionSearchResults.slice(0,visibleLimit).map(item=>item[3]));
  for(const group of groups){
   if(inventoryIconPending.size>=3)break;
   if(iconPack?.group===group||inventoryIconPacks[group]||inventoryIconPending.has(group)||inventoryIconFailed.has(group))continue;
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
 function bobaName(v:BobaVariant):string{return fullBobaLabel(v,locale,snapshot?.bobaWitnesses??[],id=>sourceNames[String(id)]??'')}
 function cafeName(v:CafeVariant):string{return cafeVariantLabel(v,snapshot?.cafeWitnesses??[],id=>sourceNames[String(id)]??'')}
 function wandName(v:WandVariant):string{return wandVariantLabel(v,id=>sourceNames[String(id)]??'—')}
 function inventoryVariantSearchName(row:InventoryEntry):string{
  const savedHomeName=inventorySavedHomeName(row.unique);if(savedHomeName!==null)return savedHomeName;
  const w=wandVariantOf(row.unique);if(w){
   const nested=wandNestedOf(row.unique);
   return nested?[inventoryName(nested[0]),wandName(w),furnitureVariantTitle(furnitureDisplay,nested[0],nested.slice(3),furnitureCopy.defaultMaterial)].filter(Boolean).join(' · '):wandName(w)
  }
  if(row.boba)return bobaName(row.boba.variant);
  if(row.cafe)return cafeName(row.cafe.variant);
  const furniture=furnitureVariantOf(row.unique);
  if(furniture)return furnitureVariantTitle(furnitureDisplay,row.itemId,furniture,furnitureCopy.defaultMaterial);
  return [flowerGrowthLabel(locale,flowerGrowthKind(row.itemId,row.flower)),flowerDisplay(row.flower,flowerDefinitions,flowerLabels[locale]??{})?.title].filter(Boolean).join(' · ');
 }
 function flowerVariantName(v:FlowerVariant):string{
  return flowerDisplay({growState:v[0],baseColor:v[1],pattern:v[2],patternColor:v[3]},flowerDefinitions,flowerLabels[locale]??{})?.title||'—';
 }
 function flowerOptionGroup(before:FlowerVariant,next:FlowerVariant):number{
  if(next[2]!==before[2]){
   const index=next[2]||before[2];
   return flowerDefinitions?.patterns[String(index)]?.effect?3:1;
  }
  return next[1]!==before[1]?0:2;
 }
 function flowerFieldValue(v:FlowerVariant,group:number):string{
  const defs=flowerDefinitions,labels=flowerLabels[locale]??{};
  const pattern=defs?.patterns[String(v[2])];
  const def=group===0?defs?.colors[String(v[1])]:group===2?defs?.colors[String(v[3])]:
   ((group===1&&!pattern?.effect)||(group===3&&pattern?.effect))?pattern:undefined;
  return def?labels[def.labelId]??'—':'—';
 }
 function flowerFieldOption(before:FlowerVariant,next:FlowerVariant,group:number):string{
  const name=flowerFieldValue(next,group);
  return group!==2&&next[3]!==before[3]?name+' · '+flowerCopy.accent+': '+flowerFieldValue(next,2):name;
 }
 function wandOriginalCell(id:number){
  if(inventoryNativeArt?.withheld.has(id))return undefined;
  const native=selectInventoryWandOriginalCell(id,inventoryNativeArt?.entries);
  if(native)return native;
  const group=inventorySourceItems.get(id)?.[3];
  return selectWandOriginalCell(id,group,group?inventoryIconPacks[group]?.entries:undefined);
 }
 function inventoryOriginalSprite(itemId:number){
  if(inventoryNativeArt?.withheld.has(itemId))return undefined;
  const native=inventoryNativeArt?.entries.get(itemId);
  if(native)return native;
  const group=inventorySourceItems.get(itemId)?.[3];
  return group?inventoryIconPacks[group]?.entries[String(itemId)]:undefined;
 }
 function inventoryName(itemId:number):string{
  return sourceNames[String(itemId)]??'#'+String(itemId);
 }
 function fetchInventoryIcons(group:string):Promise<IconPack|null>{
  const cached=inventoryIconPacks[group];if(cached)return Promise.resolve(cached);
  const existing=inventoryIconRequests.get(group);if(existing)return existing;
  const epoch=inventoryIconEpoch;
  inventoryIconPending.add(group);
  const task=(async()=>{
   try{
    const pack=await iconPackRequests.request(group);
    if(epoch!==inventoryIconEpoch){pack.dispose();return null}
    inventoryIconPacks={...inventoryIconPacks,[group]:pack};
    return pack;
   }catch{
    if(epoch===inventoryIconEpoch)inventoryIconFailed.add(group);
    return null;
   }finally{
    inventoryIconPending.delete(group);inventoryIconRequests.delete(group);
    if(epoch===inventoryIconEpoch)inventoryIconPulse++;
   }
  })();
  inventoryIconRequests.set(group,task);
  return task;
 }
 // Reconnection restores the current view without resetting its search,
 // selection, dialog or already verified image packs.
 function recoverSharedItemArtwork(){
  refreshVariantArtwork();
  if(inventoryIconFailed.size){
   inventoryIconFailed.clear();inventoryIconPulse++;
  }
  if(activeTool==='collections'&&selectedGroup&&iconError)void fetchImages(selectedGroup);
 }
 function openInventoryTab(){
  refreshVariantArtwork();
  clearInventoryBatch();inventoryAddMode=false;
  activeTool='inventory';inventoryQuery='';inventoryGroup=null;inventoryEditableOnly=false;inventoryShowZero=false;
  inventoryLimit=BATCH_SIZE;editingAchievement=null;error='';
  refreshInventoryNativeArt();
  refreshFlowerDisplay();
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
  refreshAchievementImages();
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
  refreshVariantArtwork();
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
  refreshVariantArtwork();
  activeTool='collections';selectedGroup=null;selectedSubgroup=null;showVariants=false;visibleLimit=BATCH_SIZE;
  editId=null;query='';collectionSearchDrilldown=false;filter='all';iconEpoch++;iconLoadingGroup=null;iconPack=null;iconError=false;
  if(snapshot)void persistDraft();
 }
 function askFile(){if(busy||!restored)return;fileMenu&&(fileMenu.open=false);fileInput?.click();}
 async function fetchImages(key:string){
  if((iconPack?.group===key||iconLoadingGroup===key)&&!iconError)return;
  const epoch=++iconEpoch;
  iconLoadingGroup=key;iconPack=null;iconError=false;
  try{
   inventoryIconFailed.delete(key);
   const pack=await fetchInventoryIcons(key);
   if(epoch!==iconEpoch||selectedGroup!==key)return;
   if(!pack){iconError=true;return}
   iconPack=pack;
  }catch{if(epoch===iconEpoch)iconError=true}
  finally{if(epoch===iconEpoch)iconLoadingGroup=null}
 }
 function historyEntryChange(i:number):string{
  return formatHistoryChange(tabHistoryDetails[i],locale,hDetailCopy,hCopy.paired,iCopy.quantity,flowerVariantName,v=>v.map(n=>materialLabel(furnitureDisplay,n,furnitureCopy.defaultMaterial)).join(' / '),id=>inventoryName(inventoryHistoryItems.get(id)??(id>2147483647?id-2147483648:0)),bobaName,cafeName,wandName,inventoryName)||
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
   inventoryPatchesEqual(diffInventory(baseInventory,recovered.inventory),inventoryPatches);
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
   iconEpoch++;iconLoadingGroup=null;iconPack=null;iconError=false;
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
     selectedGroup=null;selectedSubgroup=null;showVariants=false;iconEpoch++;iconLoadingGroup=null;iconPack=null;
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
   flowerDraft=[...before];flowerDraftCreatable=false;variantAddQuantity=1;await tick();
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
   const before=options[0];
   const preview=await requestFlowerPreview(row.documentId,before,before);
   if(!snapshot||snapshot.revision!==revision)return;
   flowerEdit={documentId:row.documentId,itemId:row.itemId,revision,before,options:preview.options,creationOptions:options,absent:true};
   flowerDraft=[...before];flowerDraftCreatable=preview.creatable;variantAddQuantity=1;await tick();
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
   const [preview,display]=await Promise.all([requestFurniturePreview(row.documentId,before,before),furnitureDisplay?Promise.resolve(furnitureDisplay):loadFurnitureDisplay()]);
   if(!snapshot||snapshot.revision!==revision)return;
   furnitureDisplay=display;
   furnitureEdit={documentId:row.documentId,itemId:row.itemId,revision,before,options:preview.options,createOnly};
   furnitureDraft=[...before];furnitureDraftCreatable=preview.creatable;variantAddQuantity=1;await tick();
   if(furnitureDialogEl&&!furnitureDialogEl.open)furnitureDialogEl.showModal();
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 async function openCafeEditor(row:InventoryEntry){
  if(!snapshot||busy||!row.cafe?.editable)return;
  const before=row.cafe.variant,revision=snapshot.revision;busy=true;error='';
  try{
   const preview=await requestCafePreview(row.documentId,before,before);
   if(!snapshot||snapshot.revision!==revision)return;
   cafeEdit={documentId:row.documentId,itemId:row.itemId,revision,before,options:preview.options,absent:row.cafe.creationOnly};cafeDraft=[...before];cafeDraftCreatable=preview.creatable;variantAddQuantity=1;await tick();
   if(cafeDialogEl&&!cafeDialogEl.open)cafeDialogEl.showModal();
  }catch(e){error=describeError(e)}finally{busy=false}
 }
 async function addInventoryCafeVariant(){
  const edit=cafeEdit,quantity=variantAddQuantity;
  if(!snapshot||busy||!edit||snapshot.revision!==edit.revision||quantity===undefined||!validVariantAddQuantity)return;
  const next=cafeDraft;if(!next||!cafeDraftCreatable)return;
  busy=true;error='';
  try{update(await createInventoryCafeVariant(edit.documentId,edit.before,next,quantity));closeCafeEditor();await persistDraft()}
  catch(e){error=describeError(e)}finally{busy=false}
 }
 async function selectCafeSlot(index:number,slot:number){
  const edit=cafeEdit;if(!snapshot||busy||!edit||!cafeDraft||snapshot.revision!==edit.revision)return;
  const option=edit.options[index];if(!option||option.slot!==slot){return}
  busy=true;error='';
  try{
   const preview=await requestCafePreview(edit.documentId,edit.before,option.variant);
   if(!snapshot||snapshot.revision!==edit.revision||cafeEdit?.documentId!==edit.documentId)return;
   cafeDraft=[...option.variant];cafeDraftCreatable=preview.creatable;cafeEdit={...edit,options:preview.options};
  }catch(e){error=describeError(e)}finally{busy=false}
 }
 function closeCafeEditor(){if(cafeDialogEl?.open)cafeDialogEl.close()}
 async function applyInventoryCafeVariant(event:SubmitEvent){
  event.preventDefault();if(inventoryAddMode)return;const edit=cafeEdit;
  if(!snapshot||busy||!edit||snapshot.revision!==edit.revision)return;
  const next=cafeDraft;if(!next||next.every((n,i)=>n===edit.before[i]))return;
  busy=true;error='';
  try{update(await changeInventoryCafeVariant(edit.documentId,edit.before,next));closeCafeEditor();await persistDraft()}
  catch(e){error=describeError(e)}finally{busy=false}
 }
 async function openAbsentWandEditor(row:InventoryEntry){
  if(!snapshot||busy||row.wandCreatableStyle===undefined)return;
  const revision=snapshot.revision;busy=true;error='';
  try{
   const [options,sourceChoices,ownedFurnitureChoices]=await Promise.all([requestWandCreationVariants(row.documentId),row.wandCreatableStyle===0?requestAbsentWandSources(row.documentId):Promise.resolve(undefined),row.wandCreatableStyle===0?requestOwnedFurnitureWandSources(row.documentId):Promise.resolve([])]);
   if(!snapshot||snapshot.revision!==revision||!options.length||(sourceChoices&&!sourceChoices.length&&!ownedFurnitureChoices.length))return;
   const before:WandVariant=[0,0],appearance:WandInventoryAppearance={sourceItemId:0,sourceUnique:null,styleCharacteristicId:row.wandCreatableStyle,magicCharacteristicId:options[0][0],fleckCharacteristicId:options[0][1]};
   wandEdit={documentId:row.documentId,itemId:row.itemId,revision,before,appearance,options,creationOptions:options,absent:true,sourceChoices,ownedFurnitureChoices};
   wandSourceQuery='';wandSelection=0;variantAddQuantity=1;await tick();
   if(wandDialogEl&&!wandDialogEl.open)wandDialogEl.showModal();
  }catch(e){error=describeError(e)}finally{busy=false}
 }
 async function chooseAbsentWandSource(value:string){
  const source=Number(value),edit=wandEdit;
  if(busy||!snapshot||!edit?.sourceChoices?.includes(source)||snapshot.revision!==edit.revision)return;
  busy=true;error='';
  try{
   const options=await (edit.absent?requestWandCreationVariants(edit.documentId,source):requestWandVariants(edit.documentId,source));
   const creationOptions=edit.absent?options:source===edit.beforeSource?await requestWandCreationVariants(edit.documentId):[];
   if(wandEdit!==edit||snapshot?.revision!==edit.revision)return;
   wandEdit={...edit,before:edit.absent?[source,0]:edit.before,appearance:{...edit.appearance,sourceItemId:source,sourceUnique:null},options,creationOptions,ownedFurnitureSource:undefined,ownedFurnitureWitness:undefined};
   wandSelection=options.length?0:-1;
  }catch(e){error=describeError(e)}finally{busy=false}
 }
 async function chooseOwnedFurnitureWandSource(value:string){
  const id=Number(value),edit=wandEdit;
  if(busy||!snapshot||!edit?.absent||!edit.ownedFurnitureChoices?.includes(id)||snapshot.revision!==edit.revision)return;
  const row=snapshot.inventory.find(r=>r.documentId===id),materials=furnitureVariantOf(row?.unique);
  if(!row||!materials)return;
  busy=true;error='';
  try{
   const options=await requestOwnedFurnitureWandPairs(id);
   if(wandEdit!==edit||snapshot?.revision!==edit.revision||!options.length)return;
   const witness:WandNested=[row.itemId,0,0,...materials];
   wandEdit={...edit,before:[row.itemId,0],appearance:{...edit.appearance,sourceItemId:row.itemId,sourceUnique:{tag:8,words:[...materials]}},options,creationOptions:options,ownedFurnitureSource:id,ownedFurnitureWitness:witness};
   wandSelection=0;wandMaterialSelection=-1;
  }catch(e){error=describeError(e)}finally{busy=false}
 }
 async function openWandEditor(row:InventoryEntry){
  const before=wandVariantOf(row.unique),appearance=inventoryWandAppearance(row.itemId,row.unique);
  if(!snapshot||busy||!row.unique?.wandEditable||!before||!appearance)return;
  const revision=snapshot.revision;busy=true;error='';
  try{
   const nestedBefore=wandNestedOf(row.unique)??undefined;
   const [options,creationOptions,sources,nestedOptions,nestedCreationOptions]=await Promise.all([nestedBefore?requestWandNestedPairs(row.documentId,inventoryAddMode):requestWandVariants(row.documentId),nestedBefore?Promise.resolve([]):requestWandCreationVariants(row.documentId),!inventoryAddMode&&!nestedBefore&&appearance.sourceItemId>0?requestWandEditSources(row.documentId):Promise.resolve([]),!inventoryAddMode&&nestedBefore?requestWandNestedMaterials(row.documentId):Promise.resolve([]),nestedBefore?requestWandNestedMaterials(row.documentId,true):Promise.resolve([])]);
   if(!snapshot||snapshot.revision!==revision)return;
   wandEdit={documentId:row.documentId,itemId:row.itemId,revision,before,appearance,options,creationOptions,beforeSource:appearance.sourceItemId,sourceChoices:sources.length?sources:undefined,nestedBefore,nestedOptions:inventoryAddMode?nestedCreationOptions:nestedOptions,nestedCreationOptions};wandSourceQuery='';wandSelection=-1;wandMaterialSelection=-1;variantAddQuantity=1;await tick();
   if(wandDialogEl&&!wandDialogEl.open)wandDialogEl.showModal();
  }catch(e){error=describeError(e)}finally{busy=false}
 }
 async function chooseWandPair(value:string){
  const edit=wandEdit;if(!edit?.nestedBefore){wandMaterialSelection=-1;return}
  if(busy||!snapshot||snapshot.revision!==edit.revision)return;
  const pair=edit.options[Number(value)]??edit.before;
  const previous: FurnitureVariant=edit.nestedOptions?.[wandMaterialSelection]??[edit.nestedBefore[3],edit.nestedBefore[4],edit.nestedBefore[5]];
  busy=true;error='';
  try{
   let [options,creation]=await Promise.all([inventoryAddMode?Promise.resolve([]):requestWandNestedMaterials(edit.documentId,false,pair,previous),requestWandNestedMaterials(edit.documentId,true,pair,previous)]);
   if(!(inventoryAddMode?creation:options).length){[options,creation]=await Promise.all([inventoryAddMode?Promise.resolve([]):requestWandNestedMaterials(edit.documentId,false,pair),requestWandNestedMaterials(edit.documentId,true,pair)]);}
   if(wandEdit!==edit||snapshot?.revision!==edit.revision)return;
   const available=inventoryAddMode?creation:options;
   wandEdit={...edit,nestedOptions:available,nestedCreationOptions:creation};
   wandMaterialSelection=available.findIndex(v=>v.every((n,i)=>n===previous[i]));
  }catch(e){error=describeError(e);if(wandEdit===edit){wandEdit={...edit,nestedOptions:[],nestedCreationOptions:[]};wandMaterialSelection=-1}}finally{busy=false}
 }
 async function chooseWandNestedMaterial(index:number){
  const edit=wandEdit;
  if(busy||!snapshot||!edit?.nestedBefore||snapshot.revision!==edit.revision)return;
  const draft=edit.nestedOptions?.[index];if(!draft)return;
  const pair=edit.options[wandSelection]??edit.before;
  busy=true;error='';
  try{
   const [options,creation]=await Promise.all([inventoryAddMode?Promise.resolve([]):requestWandNestedMaterials(edit.documentId,false,pair,draft),requestWandNestedMaterials(edit.documentId,true,pair,draft)]);
   if(wandEdit!==edit||snapshot?.revision!==edit.revision)return;
   const available=inventoryAddMode?creation:options;
   const selection=available.findIndex(v=>v.every((n,i)=>n===draft[i]));
   if(selection<0)throw Error('INVENTORY_CONFLICT');
   wandEdit={...edit,nestedOptions:available,nestedCreationOptions:creation};wandMaterialSelection=selection;
  }catch(e){error=describeError(e)}finally{busy=false}
 }
 function canAddWandVariant():boolean{
  const edit=wandEdit;if(!edit)return false;
  const pair=edit.options[wandSelection],materials=edit.nestedOptions?.[wandMaterialSelection];
  if(edit.ownedFurnitureWitness)return Boolean(pair&&edit.ownedFurnitureSource&&edit.creationOptions.some(v=>v.every((n,i)=>n===pair[i])));
  if(edit.absent&&edit.sourceChoices&&!edit.sourceChoices.includes(edit.before[0]))return false;
  if(edit.nestedBefore)return Boolean(materials&&edit.nestedCreationOptions?.some(v=>v.every((n,i)=>n===materials[i])));
  return Boolean(pair&&edit.creationOptions.some(v=>v.every((n,i)=>n===pair[i])));
 }
 async function addInventoryWandVariant(){
  const edit=wandEdit,quantity=variantAddQuantity;
  if(!snapshot||busy||!edit||snapshot.revision!==edit.revision||quantity===undefined||!validVariantAddQuantity)return;
  if(!canAddWandVariant())return;
  const next=edit.options[wandSelection]??edit.before;
  const materials=edit.nestedOptions?.[wandMaterialSelection];
  busy=true;error='';
  try{update(await (edit.ownedFurnitureWitness&&edit.ownedFurnitureSource?createInventoryWandNested(edit.ownedFurnitureSource,edit.ownedFurnitureWitness,[edit.ownedFurnitureWitness[0],...next,...edit.ownedFurnitureWitness.slice(3)] as WandNested,quantity):edit.nestedBefore?createInventoryWandNested(edit.documentId,edit.nestedBefore,[edit.nestedBefore[0],...next,...(materials??[edit.nestedBefore[3],edit.nestedBefore[4],edit.nestedBefore[5]])] as WandNested,quantity):createInventoryWandVariant(edit.documentId,edit.before,next,quantity)));closeWandEditor();await persistDraft()}
  catch(e){error=describeError(e)}finally{busy=false}
 }
 function closeWandEditor(){if(wandDialogEl?.open)wandDialogEl.close()}
 async function applyInventoryWandVariant(event:SubmitEvent){
  event.preventDefault();if(inventoryAddMode)return;const edit=wandEdit;
  if(!snapshot||busy||!edit||snapshot.revision!==edit.revision)return;
  const pair=edit.options[wandSelection],materials=edit.nestedOptions?.[wandMaterialSelection];
  if(edit.nestedBefore?!materials:!pair)return;
  const next=pair??edit.before;
  busy=true;error='';
  try{update(await (edit.nestedBefore?changeInventoryWandNested(edit.documentId,edit.nestedBefore,[edit.nestedBefore[0],...next,...(materials??[edit.nestedBefore[3],edit.nestedBefore[4],edit.nestedBefore[5]])] as WandNested):changeInventoryWandIdentity(edit.documentId,[edit.beforeSource??0,...edit.before],[edit.appearance.sourceItemId,...next])));closeWandEditor();await persistDraft()}
  catch(e){error=describeError(e)}finally{busy=false}
 }
 async function openBobaEditor(row:InventoryEntry){
  if(!snapshot||busy||!row.boba?.editable)return;
  const before=row.boba.variant,revision=snapshot.revision;busy=true;error='';
  try{
   const [options,creationOptions]=await Promise.all([row.boba.creationOnly?Promise.resolve([] as BobaVariant[]):requestBobaVariants(row.documentId),requestBobaCreationVariants(row.documentId)]);
   if(!snapshot||snapshot.revision!==revision)return;
   bobaEdit={documentId:row.documentId,itemId:row.itemId,revision,before,options:row.boba.creationOnly?creationOptions:options,creationOptions,absent:row.boba.creationOnly};bobaSelection=row.boba.creationOnly?creationOptions.findIndex(v=>v.every((n,i)=>n===before[i])):-1;variantAddQuantity=1;await tick();
   if(bobaDialogEl&&!bobaDialogEl.open)bobaDialogEl.showModal();
  }catch(e){error=describeError(e)}finally{busy=false}
 }
 async function addInventoryBobaVariant(){
  const edit=bobaEdit,quantity=variantAddQuantity;
  if(!snapshot||busy||!edit||snapshot.revision!==edit.revision||quantity===undefined||!validVariantAddQuantity)return;
  const next=edit.options[bobaSelection];if(!next||!edit.creationOptions.some(v=>v.every((n,i)=>n===next[i])))return;
  busy=true;error='';
  try{update(await createInventoryBobaVariant(edit.documentId,edit.before,next,quantity));closeBobaEditor();await persistDraft()}
  catch(e){error=describeError(e)}finally{busy=false}
 }
 function closeBobaEditor(){if(bobaDialogEl?.open)bobaDialogEl.close()}
 async function applyInventoryBobaVariant(event:SubmitEvent){
  event.preventDefault();if(inventoryAddMode)return;const edit=bobaEdit;
  if(!snapshot||busy||!edit||snapshot.revision!==edit.revision)return;
  const next=edit.options[bobaSelection];if(!next)return;
  busy=true;error='';
  try{update(await changeInventoryBobaVariant(edit.documentId,edit.before,next));closeBobaEditor();await persistDraft()}
  catch(e){error=describeError(e)}finally{busy=false}
 }
 async function openPaletteEditor(row:InventoryEntry){
  const before=row.paletteCreationDefault??paletteVariantOf(row.unique);
  if(!snapshot||busy||(!row.paletteCreationDefault&&!row.unique?.paletteEditable)||!before)return;
  const revision=snapshot.revision;busy=true;error='';
  try{
   const preview=await requestPalettePreview(row.documentId,before,before);
   if(!snapshot||snapshot.revision!==revision)return;
   paletteEdit={documentId:row.documentId,itemId:row.itemId,revision,before,options:preview.options};
   paletteSlot=0;paletteDraft=[...before];paletteDraftCreatable=preview.creatable;variantAddQuantity=1;await tick();
   if(paletteDialogEl&&!paletteDialogEl.open)paletteDialogEl.showModal();
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 async function addInventoryPaletteVariant(){
  const edit=paletteEdit,quantity=variantAddQuantity;
  if(!snapshot||busy||!edit||snapshot.revision!==edit.revision||quantity===undefined||!validVariantAddQuantity)return;
  const next=paletteDraft;if(!next||!paletteDraftCreatable)return;
  busy=true;error='';
  try{update(await createInventoryPaletteVariant(edit.documentId,edit.before,next,quantity));closePaletteEditor();await persistDraft()}
  catch(e){error=describeError(e)}finally{busy=false}
 }
 async function refreshPaletteDraft(next:PaletteVariant){
  const edit=paletteEdit;
  if(!snapshot||busy||!edit||snapshot.revision!==edit.revision)return;
  busy=true;error='';
  try{
   const preview=await requestPalettePreview(edit.documentId,edit.before,next);
   if(!snapshot||snapshot.revision!==edit.revision||paletteEdit?.documentId!==edit.documentId)return;
   paletteDraft=[...next];paletteDraftCreatable=preview.creatable;
   paletteEdit={...edit,options:preview.options};
  }catch(e){error=describeError(e)}finally{busy=false}
 }
 function closePaletteEditor(){if(paletteDialogEl?.open)paletteDialogEl.close()}
 async function applyInventoryPaletteVariant(event:SubmitEvent){
  event.preventDefault();if(inventoryAddMode)return;const edit=paletteEdit;
  if(!snapshot||busy||!edit||snapshot.revision!==edit.revision)return;
  const next=paletteDraft;if(!next||next.every((n,i)=>n===edit.before[i]))return;
  busy=true;error='';
  try{update(await changeInventoryPaletteVariant(edit.documentId,edit.before,next));closePaletteEditor();await persistDraft()}
  catch(e){error=describeError(e)}finally{busy=false}
 }
 async function refreshFurnitureDraft(next:FurnitureVariant){
  const edit=furnitureEdit;
  if(!snapshot||busy||!edit||snapshot.revision!==edit.revision)return;
  busy=true;error='';
  try{
   const preview=await requestFurniturePreview(edit.documentId,edit.before,next);
   if(!snapshot||snapshot.revision!==edit.revision||furnitureEdit?.documentId!==edit.documentId)return;
   furnitureDraft=[...next];furnitureDraftCreatable=preview.creatable;furnitureEdit={...edit,options:preview.options};
  }catch(e){error=describeError(e)}finally{busy=false}
 }
 async function selectFurniturePart(index:number){
  const option=furnitureEdit?.options[index];if(option)await refreshFurnitureDraft(option)
 }
 async function resetFurniturePart(slot:number){
  if(furnitureEdit&&furnitureDraft){const next:FurnitureVariant=[...furnitureDraft];next[slot]=furnitureEdit.before[slot];await refreshFurnitureDraft(next)}
 }
 function closeFurnitureEditor(){if(furnitureDialogEl?.open)furnitureDialogEl.close()}
 async function applyInventoryFurnitureVariant(event:SubmitEvent){
  event.preventDefault();if(inventoryAddMode)return;
  const selected=furnitureEdit;
  if(!snapshot||busy||!selected||snapshot.revision!==selected.revision)return;
  const next=furnitureDraft;if(!next||next.every((v,i)=>v===selected.before[i]))return;
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
  const next=furnitureDraft;
  const quantity=variantAddQuantity;
  if(!next||!validVariantAddQuantity||quantity===undefined||!furnitureDraftCreatable)return;
  busy=true;error='';
  try{
   update(await createInventoryFurnitureVariant(selected.documentId,selected.before,next,quantity));
   closeFurnitureEditor();await persistDraft();
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 async function selectFlowerDraft(index:number){
  const edit=flowerEdit;
  if(!snapshot||busy||!edit||snapshot.revision!==edit.revision)return;
  const next=edit.options[index];if(!next)return;
  await refreshFlowerDraft(next);
 }
 async function refreshFlowerDraft(next:FlowerVariant){
  const edit=flowerEdit;
  if(!snapshot||busy||!edit||snapshot.revision!==edit.revision)return;
  busy=true;error='';
  try{
   const preview=await requestFlowerPreview(edit.documentId,edit.before,next);
   if(!snapshot||snapshot.revision!==edit.revision||flowerEdit?.documentId!==edit.documentId)return;
   flowerDraft=[...next];flowerDraftCreatable=preview.creatable;
   flowerEdit={...edit,options:preview.options};
  }catch(e){error=describeError(e)}
  finally{busy=false}
 }
 function closeFlowerEditor(){if(flowerDialogEl?.open)flowerDialogEl.close()}
 async function applyInventoryFlowerVariant(event:SubmitEvent){
  event.preventDefault();if(inventoryAddMode)return;
  const selected=flowerEdit;
  if(!snapshot||busy||!selected||snapshot.revision!==selected.revision)return;
  const next=flowerDraft;if(!next||next.every((n,i)=>n===selected.before[i]))return;
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
  const next=flowerDraft;
  const quantity=variantAddQuantity;
  if(!next||!validVariantAddQuantity||quantity===undefined||!flowerDraftCreatable)return;
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
  const counts=inventorySearchGroupCounts(inventoryDisplayRows(inventoryBrowseRows,inventoryAddMode,inventoryShowZero),next,inventoryEditableOnly,sourceNames,inventorySourceItems,nativeInventoryIndex,inventoryVariantSearchName);
  inventoryGroup=inventorySearchTarget(activeInventoryGroup,counts);
 }
 function toggleInventoryShowZero(){
  const previous=activeInventoryGroup;
  inventoryShowZero=!inventoryShowZero;inventoryLimit=BATCH_SIZE;
  if(!inventoryShowZero){
   const visible=new Set(inventoryDisplayRows(inventoryBrowseRows,false,false).map(row=>row.documentId));
   inventoryBatchSelected=new Set([...inventoryBatchSelected].filter(id=>visible.has(id)));
  }
  const counts=inventorySearchGroupCounts(inventoryDisplayRows(inventoryBrowseRows,false,inventoryShowZero),inventoryQuery,inventoryEditableOnly,sourceNames,inventorySourceItems,nativeInventoryIndex,inventoryVariantSearchName);
  if(inventoryQuery.trim())inventoryGroup=inventorySearchTarget(previous,counts);
 }
 function toggleInventoryBatch(row:InventoryEntry){
  if(!snapshot||busy||!inventoryBatchMode||(!row.editable&&(inventoryAddMode||!row.removable)))return;
  const next=new Set(inventoryBatchSelected);
  if(next.has(row.documentId))next.delete(row.documentId);
  else if(next.size<snapshot.inventoryBatchLimit)next.add(row.documentId);
  inventoryBatchSelected=next;
 }
 // Select matching editable records independently of incremental rendering.
 // Explicit selections in other categories/searches remain selected.
 const inventorySelectableMatching=$derived(inventoryRows.some(row=>(row.editable||!inventoryAddMode&&row.removable)&&!inventoryBatchSelected.has(row.documentId)));
 const inventoryDeselectableMatching=$derived(inventoryRows.some(row=>inventoryBatchSelected.has(row.documentId)));
 function deselectMatchingInventoryBatch(){
  if(!snapshot||busy||!inventoryBatchMode)return;
  inventoryBatchSelected=deselectMatchingInventoryRows(inventoryRows,inventoryBatchSelected);
 }
 function selectMatchingInventoryBatch(){
  if(!snapshot||busy||!inventoryBatchMode)return;
  inventoryBatchSelected=selectMatchingInventoryRows(inventoryRows,inventoryBatchSelected,snapshot.inventoryBatchLimit,!inventoryAddMode);
 }
 function requestInventoryDelete(rows:InventoryEntry[],batch:boolean,opener:HTMLElement,allowPhysical=true){
  if(!snapshot||busy||inventoryAddMode||!rows.length)return;
  const physical=allowPhysical&&rows.every(row=>row.removable);
  const zero=rows.every(row=>row.editable&&row.quantityMinimum===0)&&rows.some(row=>row.quantity>0);
  if(!physical&&!zero)return;
  const targets=physical?rows:rows.filter(row=>row.quantity>0);
  const requests:InventoryQuantityRequest[]=targets.map(row=>[row.documentId,row.quantity,0]);
  const details=targets.map(row=>({documentId:row.documentId,name:[inventoryName(row.itemId),inventoryVariantSearchName(row)].filter(Boolean).join(' · '),quantity:row.quantity,paletteColors:paletteRemovalSwatches(row.palette)}));
  const name=batch?targets.length.toLocaleString(locale):details[0].name+' × '+details[0].quantity.toLocaleString(locale);
  void requestRemoval({kind:'inventory',requests,physical,zero,batch,name,targets:details,revision:snapshot.revision},opener);
 }
 function requestInventoryBatchDelete(opener:HTMLElement){
  if(!inventoryBatchMode||!inventoryBatchCanDelete)return;
  const rows=inventoryBrowseRows.filter(row=>inventoryBatchSelected.has(row.documentId));
  if(rows.length!==inventoryBatchSelected.size)return;
  requestInventoryDelete(rows,true,opener);
 }
 async function applyInventoryBatch(event:SubmitEvent){
  event.preventDefault();
  if(!snapshot||busy||!inventoryBatchMode||!inventoryBatchSelected.size)return;
  const next=inventoryBatchQuantity;
  if(next===undefined||!Number.isSafeInteger(next)||next<inventoryBatchMinimum||next>inventoryBatchMaximum)return;
  const rows=inventoryBrowseRows.filter(row=>inventoryBatchSelected.has(row.documentId));
  if(rows.length!==inventoryBatchSelected.size||rows.some(row=>!row.editable))return;
  if(rows.every(row=>row.quantity===next)){resetInventoryBatchSelection();return}
  if(next===0){requestInventoryDelete(rows,true,(event.submitter??event.currentTarget) as HTMLElement,false);return;}
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
  if(!Number.isSafeInteger(next)||row.quantityLimit===null||next<(inventoryAddMode?Math.max(1,row.quantityMinimum):row.quantityMinimum)||next>row.quantityLimit){error=copy.fileError;return}
  if(next===row.quantity)return;
  if(next===0){requestInventoryDelete([row],false,(event.submitter??event.currentTarget) as HTMLElement,false);return;}
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
 async function confirmRemoval(physical=false){
  const target=pendingRemoval;
  if(!target||!snapshot||busy)return;
  if(snapshot.revision!==target.revision||original!==removalOriginal||
   (target.kind==='collections'
    ?recorded[String(target.id)]!==target.before
    :target.kind==='achievements'
     ?snapshot.achievements.find(row=>achievementGuid(row.guid)===target.item.guid)?.value.complete!==true
     :((physical?!target.physical:!target.zero)||target.requests.some(([id,before])=>!snapshot?.inventory.some(row=>row.documentId===id&&row.quantity===before&&(physical?row.removable:row.editable&&row.quantityMinimum===0)))))){
   closeRemovalConfirmation();error=removalCopy.stale;return;
  }
  closeRemovalConfirmation();
  if(target.kind==='collections'){
   const success=await change(target.id,null);
   if(target.fromDateDialog){
    if(success)closeDateDialog();
    else dateValidation=error||copy.fileError;
   }
  }else if(target.kind==='achievements')await quickToggleAchievement(target.item,undefined,undefined,true);
  else{
   busy=true;error='';
   try{
    if(physical){update(await removeInventoryEntries(target.requests.map(([id,before])=>[id,before])));resetInventoryBatchSelection()}
    else if(target.batch){update(await changeInventoryQuantities(target.requests.filter(([,before])=>before!==0)));resetInventoryBatchSelection()}
    else{const [id,before,next]=target.requests[0];update(await changeInventoryQuantity(id,before,next))}
    await persistDraft();
   }catch(e){error=describeError(e)}
   finally{busy=false}
  }
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
     {@const dialogCategoryArt=resolveAchievementDetailCategoryArt(editingSaveGuid,snapshot.version,achievementCategoryAtlas,achievementIndividualIdentity,achievementGroupHierarchy)}
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
         <span class="achievement-category-sprite" data-icon-source={dialogCategoryArt.saveGuid===editingSaveGuid?'category':'native-parent'} style:background-image={`url("${achievementCategoryAtlas?.url}")`} style:background-position={`${dialogCategoryArt.x} ${dialogCategoryArt.y}`}></span>
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
    {#if !inventoryAddMode}
     <button type="button" class="inventory-editable-filter inventory-show-zero-toggle" class:active={inventoryShowZero}
      aria-pressed={inventoryShowZero} onclick={toggleInventoryShowZero}>{inventoryShowZeroCopy(locale)}</button>
    {/if}
    <button type="button" class="inventory-editable-filter inventory-add-toggle" class:active={inventoryAddMode}
     aria-pressed={inventoryAddMode} disabled={busy||(!inventoryAddMode&&inventoryAvailableToAdd.length===0)}
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
      <button type="button" class="inventory-editable-filter inventory-select-visible" disabled={busy||inventoryBatchSelected.size>=snapshot.inventoryBatchLimit||!inventorySelectableMatching} title={inventorySelectVisibleCopy(locale)} aria-label={inventorySelectVisibleCopy(locale)} onclick={selectMatchingInventoryBatch}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 12 3 3 7-7"/></svg>
       </button>
       <button type="button" class="inventory-editable-filter inventory-deselect-visible" disabled={busy||!inventoryDeselectableMatching} title={inventoryDeselectVisibleCopy(locale)} aria-label={inventoryDeselectVisibleCopy(locale)} onclick={deselectMatchingInventoryBatch}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 12h10"/></svg>
       </button>
       <span class="inventory-total" aria-live="polite">{inventoryBatchSelected.size.toLocaleString(locale)} / {snapshot.inventoryBatchLimit.toLocaleString(locale)}</span>
      <input type="number" min={inventoryBatchMinimum} max={inventoryBatchMaximum} step="1" required bind:value={inventoryBatchQuantity} placeholder={iCopy.quantity} aria-label={iCopy.quantity} disabled={busy||!inventoryBatchCanQuantity}/>
      <button type="submit" class="primary" disabled={busy||!inventoryBatchCanQuantity||inventoryBatchQuantity===undefined}>{iCopy.apply}</button>
      {#if !inventoryAddMode}<button type="button" class="inventory-editable-filter inventory-batch-delete" disabled={busy||!inventoryBatchCanDelete} title={inventoryDeleteCopy(locale)} aria-label={inventoryDeleteCopy(locale)} onclick={e=>requestInventoryBatchDelete(e.currentTarget)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button>{/if}
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
       <span class="inventory-category-representative" aria-hidden="true">
        <img class="inventory-category-fallback" src={t.art?ICONS+t.art:INVENTORY_UI+'category-'+t.key+'.webp'} alt="" loading="lazy"
         onerror={e=>{const image=e.currentTarget as HTMLImageElement,native=INVENTORY_UI+'category-'+t.key+'.webp';if(image.getAttribute('src')!==native)image.src=native;else image.style.visibility='hidden';}}/>
        {#if representative!==undefined&&(representativeSprite||originalVariantArt[String(representative)]||exactVariantArt[String(representative)])}
         {#if originalVariantArt[String(representative)]||exactVariantArt[String(representative)]||(!representativeNative&&representativeSprite&&nativeDyePalettes[String(representative)])}
          <DyeSprite sprite={representativeSprite} palette={nativeDyePalettes[String(representative)]}
           sourceKey={representativeSource?.[1]??''} exactArtUrl={exactVariantArt[String(representative)]} originalArtUrl={originalVariantArt[String(representative)]}/>
         {:else if representativeSprite}
          <InventoryAtlasSprite sprite={representativeSprite}/>
         {/if}
        {/if}
       </span>
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
     {@const resultId=nativeResultIconTarget(item.itemId,snapshot.version)}
     {@const resultSprite=resultId===undefined?undefined:inventoryOriginalSprite(resultId)}
     {@const resultOriginal=resultId===undefined?undefined:originalVariantArt[String(resultId)]}
     {@const resultPlaceholder=resultId!==undefined&&inventoryNativeArt?.placeholders.has(resultId)}
     {@const sprite=definition&&!inventoryNativeArt?.withheld.has(item.itemId)?inventoryIconPacks[definition[3]]?.entries[String(item.itemId)]:undefined}
     {@const flower=flowerDisplay(item.flower,flowerDefinitions,flowerLabels[locale]??{})}
     {@const growth=flowerGrowthKind(item.itemId,item.flower)}
     {@const flowerBadges=snapshot.version==='3.0.1'?flowerDecorators(item.flower,flowerDefinitions):[]}
     {@const customized=snapshot.version==='3.0.1'&&furnitureHasCustomizedAppearance(furnitureDisplay,furnitureVariantOf(item.unique))}
     {@const dyeBadge=flowerBadges.length===0?dyeDecoratorFor(item.itemId,snapshot.version,nativeDyePalettes):null}
     {@const variantTitle=inventoryVariantSearchName(item)}
     {@const chef=inventoryChefAppearance(item.itemId,item.unique)}
     {@const wand=inventoryWandAppearance(item.itemId,item.unique)}
     {@const canFlower=!!item.flower&&!!item.unique?.flowerEditable&&!!flowerDefinitions&&!!flowerLabels[locale]}
     {@const canFurniture=!!item.unique?.furnitureEditable||!!item.furnitureCreatable}
     {@const canPalette=!!item.paletteCreationDefault||!!item.unique?.paletteEditable&&!!item.palette}
     {@const canCafe=!!item.cafe?.editable}
     {@const canWand=!!item.unique?.wandEditable&&!!wand}
     {@const canBoba=!!item.boba?.editable}
      <article class="inventory-card" class:inventory-empty-stack={!inventoryAddMode&&item.quantity===0} class:inventory-readonly={!item.editable&&!item.removable&&!canFlower&&!canFurniture&&!canPalette&&!canBoba&&!canCafe&&!canWand&&!item.flowerCreatable&&item.wandCreatableStyle===undefined} class:inventory-batch-selected={inventoryBatchMode&&inventoryBatchSelected.has(item.documentId)}>
      {#if inventoryBatchMode&&(item.editable||!inventoryAddMode&&item.removable)}
       <input class="inventory-batch-checkbox" type="checkbox" checked={inventoryBatchSelected.has(item.documentId)} aria-label={iBatchCopy+': '+inventoryName(item.itemId)}
        disabled={busy||(!inventoryBatchSelected.has(item.documentId)&&inventoryBatchSelected.size>=snapshot.inventoryBatchLimit)} onchange={()=>toggleInventoryBatch(item)}/>
      {/if}
        {#if !inventoryAddMode&&!inventoryBatchMode}
         <button type="button" class="inventory-stack-delete" disabled={busy||!item.removable&&(!item.editable||item.quantityMinimum!==0||item.quantity<=0)} title={inventoryDeleteCopy(locale)} aria-label={inventoryDeleteCopy(locale)+': '+inventoryName(item.itemId)} onclick={e=>requestInventoryDelete([item],false,e.currentTarget)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg></button>
        {/if}
      <div class="inventory-card-heading" data-flower-growth={growth??undefined}>
       <span class="inventory-item-art" class:inventory-blueprint={resultId!==undefined} class:flower-variant={customized||flowerBadges.length>0||!!dyeBadge||resultId!==undefined} style:position="relative" style:--inventory-icon-scale={nativeInventoryIconScale(item.itemId,snapshot.version)} aria-hidden="true">
        {#if resultId!==undefined}
         <span class="inventory-blueprint-pattern" data-native-blueprint-pattern="bp_grid" style:background-image={'url("'+INVENTORY_UI+'bp-grid.webp")'}></span>
        {/if}
        {#if hasNativeWandArt(item.itemId)&&snapshot.version==='3.0.1'&&!originalVariantArt[String(item.itemId)]}
          <DynamicWandSprite itemId={item.itemId} appearance={wand} fallback={nativeSprite??sprite} originalCell={wand?wandOriginalCell(wand.sourceItemId):undefined}/>
         {:else if snapshot.version==='3.0.1'&&nativeChefInstructionBase(item.itemId)!==undefined&&(!item.unique||item.unique.tag===0)&&!originalVariantArt[String(item.itemId)]}
          <DynamicChefSprite itemId={item.itemId} originalOnly={true} fallback={nativeSprite??sprite}/>
         {:else if hasNativeChefArt(item.itemId)&&snapshot.version==='3.0.1'&&!originalVariantArt[String(item.itemId)]}
          <DynamicChefSprite itemId={item.itemId} appearance={chef} fallback={nativeSprite??sprite}/>
         {:else if item.itemId===CUSTOM_PALETTE_ITEM_ID&&snapshot.version==='3.0.1'&&!originalVariantArt[String(item.itemId)]}
         <DynamicPaletteSprite itemId={item.itemId} palette={item.palette} fallback={nativeSprite??sprite}/>
        {:else if hasNativeFlowerArt(item.itemId)&&snapshot.version==='3.0.1'&&!originalVariantArt[String(item.itemId)]}
         <DynamicFlowerSprite itemId={item.itemId} flower={item.flower} definitions={flowerDefinitions} fallback={nativeSprite??sprite}/>
        {:else if resultId!==undefined&&resultOriginal}
         <DyeSprite sprite={resultSprite} sourceKey={inventorySourceItems.get(resultId)?.[1]??''} originalArtUrl={resultOriginal}/>
        {:else if resultId!==undefined&&resultSprite}
         <InventoryAtlasSprite sprite={resultSprite} source="native-result" target={resultId}/>
        {:else if resultPlaceholder}
         <DynamicArtSprite source="native-placeholder" render={renderNativePlaceholderArt}/>
        {:else if resultId!==undefined}
         <span class="item-art-empty" data-inventory-art="native-result-unavailable" data-result-icon-target={resultId}>✧</span>
        {:else if originalVariantArt[String(item.itemId)]||exactVariantArt[String(item.itemId)]||(!nativeSprite&&sprite&&nativeDyePalettes[String(item.itemId)])}
         <DyeSprite sprite={nativeSprite??sprite} palette={nativeDyePalettes[String(item.itemId)]}
          sourceKey={definition?.[1]??''} exactArtUrl={exactVariantArt[String(item.itemId)]} originalArtUrl={originalVariantArt[String(item.itemId)]}/>
        {:else if inventoryNativeArt?.placeholders.has(item.itemId)}
         <DynamicArtSprite source="native-placeholder" render={renderNativePlaceholderArt}/>
        {:else if nativeSprite}
         <InventoryAtlasSprite sprite={nativeSprite} source="native"/>
        {:else if sprite}
         <span class="item-sprite" style:background-image={'url("'+sprite.url+'")'}
          style:background-position={'-'+sprite.x+'px -'+sprite.y+'px'}></span>
        {:else}
         <span class="item-art-empty">✧</span>
        {/if}
        {#if customized||flowerBadges.length||dyeBadge||resultId!==undefined}
         <span class="inventory-native-decorators">
          {#if resultId!==undefined}<InventoryDecorator type={8}/>
          {:else if customized}<InventoryDecorator type={9}/>{/if}
          {#if dyeBadge}<InventoryDecorator type={14} primaryColor={dyeBadge.primaryColor} iconColor={dyeBadge.iconColor}/>{/if}
          {#each flowerBadges as badge (badge.type)}
           {#if badge.type===12}<InventoryDecorator type={12} primaryColor={badge.primaryColor}/>
           {:else}<InventoryDecorator type={11} patternUrl={badge.patternUrl}/>{/if}
          {/each}
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
         <input type="number" name="quantity" min={inventoryAddMode?Math.max(1,item.quantityMinimum):item.quantityMinimum} max={item.quantityLimit??1} step="1"
          value={inventoryAddMode?1:item.quantity} disabled={busy||inventoryBatchMode} aria-label={iCopy.quantity+': '+inventoryName(item.itemId)}/>
        </label>
        <button type="submit" class="primary" disabled={busy||inventoryBatchMode} title={iCopy.apply} aria-label={iCopy.apply}>
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
        </button>
        {#if canFlower||canFurniture||canPalette||canBoba||canCafe||canWand}
         <button class="inventory-unique-edit-button inventory-compact-variant" type="button" disabled={busy||inventoryBatchMode}
          title={canWand||canCafe?inventoryName(item.itemId):canBoba?inventoryName(item.itemId):canPalette?flowerCopy.color:canFurniture?furnitureCopy.title:flowerCopy.title} aria-label={(canWand||canCafe?inventoryName(item.itemId):canBoba?inventoryName(item.itemId):canPalette?flowerCopy.color:canFurniture?furnitureCopy.title:flowerCopy.title)+': '+inventoryName(item.itemId)}
          onclick={()=>void (canWand?openWandEditor(item):canCafe?openCafeEditor(item):canBoba?openBobaEditor(item):canPalette?openPaletteEditor(item):canFurniture?openFurnitureEditor(item):openFlowerEditor(item))}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7l-4-4L4 15z"/></svg>
         </button>
        {/if}
       </form>
      {:else if inventoryAddMode&&inventoryCustomizationSource(item)&&(canFlower||canFurniture||canPalette||canBoba||canCafe||canWand)}
       <button class="inventory-unique-edit-button inventory-add-source" type="button" disabled={busy||inventoryBatchMode}
        title={inventoryAddCopy(locale)+': '+inventoryName(item.itemId)} aria-label={inventoryAddCopy(locale)+': '+inventoryName(item.itemId)}
        onclick={()=>void (canWand?openWandEditor(item):canCafe?openCafeEditor(item):canBoba?openBobaEditor(item):canPalette?openPaletteEditor(item):canFurniture?openFurnitureEditor(item):openFlowerEditor(item))}>
        <span>{item.quantity.toLocaleString(locale)}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
       </button>
      {:else if item.wandCreatableStyle!==undefined}
       <button class="inventory-unique-edit-button" type="button" disabled={busy||inventoryBatchMode} aria-label={inventoryAddCopy(locale)+': '+inventoryName(item.itemId)} onclick={()=>void openAbsentWandEditor(item)}>{inventoryAddCopy(locale)}</button>
      {:else if item.paletteCreationDefault}
       <button class="inventory-unique-edit-button" type="button" disabled={busy||inventoryBatchMode} aria-label={inventoryAddCopy(locale)+': '+inventoryName(item.itemId)} onclick={()=>void openPaletteEditor(item)}>{inventoryAddCopy(locale)}</button>
      {:else if item.flowerCreatable}
       <button class="inventory-unique-edit-button" type="button" disabled={busy||inventoryBatchMode} aria-label={inventoryAddCopy(locale)+': '+inventoryName(item.itemId)} onclick={()=>void openAbsentFlowerEditor(item)}>{inventoryAddCopy(locale)}</button>
      {:else if item.boba?.creationOnly||item.cafe?.creationOnly}
       <button class="inventory-unique-edit-button" type="button" disabled={busy||inventoryBatchMode} aria-label={inventoryAddCopy(locale)+': '+inventoryName(item.itemId)} onclick={()=>void (item.boba?.creationOnly?openBobaEditor(item):openCafeEditor(item))}>{inventoryAddCopy(locale)}</button>
      {:else if canFlower||canFurniture||canPalette||canBoba||canCafe||canWand}
       <button class="inventory-unique-edit-button" type="button" disabled={busy||inventoryBatchMode}
        title={canFurniture?furnitureCopy.title:canFlower?flowerCopy.title:inventoryName(item.itemId)} aria-label={(canFurniture?furnitureCopy.title:canFlower?flowerCopy.title:inventoryName(item.itemId))+': '+inventoryName(item.itemId)}
        onclick={()=>void (canWand?openWandEditor(item):canCafe?openCafeEditor(item):canBoba?openBobaEditor(item):canPalette?openPaletteEditor(item):canFurniture?openFurnitureEditor(item):openFlowerEditor(item))}>
        <span>{item.quantity.toLocaleString(locale)}</span>
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
       {@const sprite=(iconPack?.group===item[3]?iconPack.entries:inventoryIconPacks[item[3]]?.entries)?.[String(item[0])]}
       <button type="button" class="collection-search-result" onclick={()=>jumpToCollectionItem(item)}>
        <span class="collection-search-art" aria-hidden="true">
         {#if originalVariantArt[String(item[0])]||exactVariantArt[String(item[0])]||(sprite&&nativeDyePalettes[String(item[0])])}
          <DyeSprite sprite={sprite} palette={nativeDyePalettes[String(item[0])]} sourceKey={item[1]} exactArtUrl={exactVariantArt[String(item[0])]} originalArtUrl={originalVariantArt[String(item[0])]}/>
         {:else if sprite}
          <span class="item-sprite" style:background-image={'url("'+sprite.url+'")'} style:background-position={'-'+sprite.x+'px -'+sprite.y+'px'}></span>
         {:else}
          <span class="item-art-empty">✧</span>
         {/if}
        </span>
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
        <DyeSprite sprite={sprite} palette={nativeDyePalettes[String(sub.previewId)]} sourceKey={catalog?.items.find(x=>x[0]===sub.previewId)?.[1]??''} exactArtUrl={exactVariantArt[String(sub.previewId)]} originalArtUrl={originalVariantArt[String(sub.previewId)]}/>
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
         <DyeSprite sprite={sprite} palette={nativeDyePalettes[String(item[0])]} sourceKey={item[1]} exactArtUrl={exactVariantArt[String(item[0])]} originalArtUrl={originalVariantArt[String(item[0])]}/>
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
 <dialog class="date-dialog" bind:this={cafeDialogEl} aria-labelledby="cafe-editor-title" onclose={()=>{cafeEdit=null;cafeDraft=null;cafeDraftCreatable=false}} oncancel={e=>{if(busy)e.preventDefault()}}>
  {#if cafeEdit}
   {@const edit=cafeEdit}
   {@const selected=cafeDraft??edit.before}
   {@const changed=selected.some((n,i)=>n!==edit.before[i])}
   {@const canCreate=cafeDraftCreatable}
   <form class="date-dialog-inner" onsubmit={applyInventoryCafeVariant}>
    <div class="date-dialog-heading">
     <h2 id="cafe-editor-title">{inventoryName(edit.itemId)}</h2>
     <button class="date-dialog-close" type="button" aria-label={copy.cancel} disabled={busy} onclick={closeCafeEditor}>×</button>
    </div>
    <div style="display:flex;justify-content:center"><DynamicChefSprite itemId={edit.itemId} appearance={{kind:'cafe',colors:selected.slice(3).filter(n=>n>0)}} fallback={inventoryOriginalSprite(edit.itemId)}/></div>
    {#each [0,1,2].filter(i=>selected[i]>0||edit.before[i]>0||edit.options.some(v=>v.slot===i)) as slot}
     {@const choices=edit.options.map((option,index)=>({option,index})).filter(({option})=>option.slot===slot)}
     <label class="date-dialog-field" data-cafe-slot={slot}>
      <span>{slot+1} · {cafeSlotLabel(selected,slot,snapshot?.cafeWitnesses??[],id=>sourceNames[String(id)]??'')}</span>
      <select name={'cafe-slot-'+slot} aria-label={inventoryName(edit.itemId)+' '+(slot+1)} value={-1} onchange={e=>{const index=Number(e.currentTarget.value);e.currentTarget.value='-1';void selectCafeSlot(index,slot)}} disabled={busy||!choices.length}>
       <option value={-1} disabled>{cafeSlotLabel(selected,slot,snapshot?.cafeWitnesses??[],id=>sourceNames[String(id)]??'')}</option>
       {#each choices as {option,index} (index)}
        <option value={index} data-ingredient-id={option.ingredientId}>{cafeOptionLabel(option,selected,snapshot?.cafeWitnesses??[],id=>sourceNames[String(id)]??'')}</option>
       {/each}
      </select>
     </label>
    {/each}
    {#if !edit.options.length}<p class="compact-hint">{iCopy.readonly}</p>{/if}
    {#if canCreate}
     <label class="date-dialog-field">
      <span>{inventoryAddCopy(locale)} · {iCopy.quantity}</span>
      <input type="number" name="variant-add-quantity" min="1" max="2147483647" step="1" bind:value={variantAddQuantity} disabled={busy}/>
     </label>
    {/if}
    {#if error}<p class="date-dialog-error" role="alert">{error}</p>{/if}
    <div class="date-dialog-actions">
     <button type="button" class="date-dialog-cancel" disabled={busy} onclick={closeCafeEditor}>{copy.cancel}</button>
     {#if inventoryAddMode||canCreate}
      <button type="button" class="inventory-create-cafe" disabled={busy||!validVariantAddQuantity||!canCreate} onclick={()=>void addInventoryCafeVariant()}>{inventoryAddCopy(locale)}</button>
     {/if}
     {#if !inventoryAddMode}<button type="submit" formnovalidate class="primary" disabled={busy||!changed}>{copy.apply}</button>{/if}
    </div>
   </form>
  {/if}
 </dialog>

 <dialog class="date-dialog" bind:this={wandDialogEl} aria-labelledby="wand-editor-title" onclose={()=>{wandEdit=null;wandSelection=-1;wandMaterialSelection=-1}} oncancel={e=>{if(busy)e.preventDefault()}}>
  {#if wandEdit}
   {@const edit=wandEdit}
   {@const selected=edit.options[wandSelection]??(edit.sourceChoices?[edit.appearance.magicCharacteristicId,edit.appearance.fleckCharacteristicId]:edit.before)}
   <form class="date-dialog-inner" onsubmit={applyInventoryWandVariant}>
    <div class="date-dialog-heading">
     <h2 id="wand-editor-title">{inventoryName(edit.itemId)}</h2>
     <button class="date-dialog-close" type="button" aria-label={copy.cancel} disabled={busy} onclick={closeWandEditor}>×</button>
    </div>
    <div style="display:flex;justify-content:center"><DynamicWandSprite itemId={edit.itemId} appearance={{...edit.appearance,magicCharacteristicId:selected[0],fleckCharacteristicId:selected[1]}} originalCell={wandOriginalCell(edit.appearance.sourceItemId)} fallback={inventoryOriginalSprite(edit.itemId)}/></div>
    {#if edit.nestedBefore}
     {@const materials=edit.nestedOptions?.[wandMaterialSelection]??edit.nestedBefore.slice(3)}
     <div class="compact-hint">{inventoryName(edit.nestedBefore[0])}</div>
     <div data-wand-material-selected={materials.join(':')} data-wand-material-busy={busy}>
      {#each [0,1,2] as slot}
       {@const choices=(edit.nestedOptions??[]).map((variant,index)=>({variant,index})).filter(({variant})=>variant[slot]!==materials[slot])}
       {#if materials[slot]!==0||choices.length}
        <label class="date-dialog-field">
         <span>{furnitureCopy.part} {String.fromCharCode(65+slot)}</span>
         <select name={'wand-nested-part-'+slot} value={-1} disabled={busy||!choices.length} onchange={e=>{const index=Number(e.currentTarget.value);e.currentTarget.value='-1';void chooseWandNestedMaterial(index)}}>
          <option value={-1} disabled>{materialLabel(furnitureDisplay,materials[slot],furnitureCopy.defaultMaterial)}</option>
          {#each choices as choice (choice.index)}
           <option value={choice.index} data-wand-material={choice.variant.join(':')} data-material-index={choice.variant[slot]}>{materialLabel(furnitureDisplay,choice.variant[slot],furnitureCopy.defaultMaterial)}</option>
          {/each}
         </select>
        </label>
       {/if}
      {/each}
     </div>
    {/if}
    {#if edit.sourceChoices}
     <label class="date-dialog-field">
      <input type="search" name="wand-source-search" bind:value={wandSourceQuery} placeholder={iCopy.search} aria-label={iCopy.search} disabled={busy}/>
      <select name="wand-source" aria-label={iCopy.search} value={edit.ownedFurnitureSource?0:edit.appearance.sourceItemId} onchange={e=>chooseAbsentWandSource(e.currentTarget.value)} disabled={busy}>
       <option value={0} disabled>—</option>
       {#if edit.appearance.sourceItemId>0&&!edit.ownedFurnitureSource}<option value={edit.appearance.sourceItemId}>{inventoryName(edit.appearance.sourceItemId)}</option>{/if}
       {#each edit.sourceChoices.filter(id=>(edit.ownedFurnitureSource||id!==edit.appearance.sourceItemId)&&(!wandSourceQuery.trim()||String(id).includes(wandSourceQuery.trim())||inventoryName(id).toLocaleLowerCase().includes(wandSourceQuery.trim().toLocaleLowerCase()))).slice(0,200) as source}
        <option value={source}>{inventoryName(source)}</option>
       {/each}
      </select>
     </label>
    {/if}
    {#if edit.ownedFurnitureChoices?.length}
     <label class="date-dialog-field">
      <span>{furnitureCopy.material}</span>
      <select name="wand-owned-furniture" value={edit.ownedFurnitureSource??0} onchange={e=>void chooseOwnedFurnitureWandSource(e.currentTarget.value)} disabled={busy}>
       <option value={0} disabled>—</option>
       {#each edit.ownedFurnitureChoices as id}
        {@const row=snapshot?.inventory.find(r=>r.documentId===id)}
        {@const materials=furnitureVariantOf(row?.unique)}
        {#if row&&materials}<option value={id}>{inventoryName(row.itemId)} · {furnitureVariantTitle(furnitureDisplay,row.itemId,materials,furnitureCopy.defaultMaterial)}</option>{/if}
       {/each}
      </select>
     </label>
    {/if}
    <div class="date-dialog-field" data-wand-option-count={edit.options.length} data-wand-selected={selected.join(':')} data-wand-selection={wandSelection} data-wand-busy={busy}>
     {#each wandFieldLabels(locale) as label, i}
      {@const field=i===0?0:1}
      {@const other=field===0?1:0}
      {@const allowReset=!edit.absent&&edit.appearance.sourceItemId===edit.beforeSource}
      {@const pairs=allowReset?[...edit.options,edit.before]:edit.options}
      {@const choices=wandFieldOptions(pairs,selected,field)}
      <label class="date-dialog-field">
       <span>{label}</span>
       <select name={field===0?'wand-magic':'wand-fleck'} value={''} onchange={e=>{const value=e.currentTarget.value;e.currentTarget.value='';wandSelection=Number(value);void chooseWandPair(value)}} disabled={busy||!choices.length||Boolean(edit.sourceChoices&&!edit.appearance.sourceItemId)}>
        <option value={''} disabled>{wandMaterialLabel(selected[field],id=>sourceNames[String(id)]??'—')}</option>
        {#each choices as choice (choice.index)}
         <option value={choice.index===edit.options.length?-1:choice.index} data-wand-variant={choice.pair.join(':')} data-wand-field-value={choice.pair[field]}>{wandMaterialLabel(choice.pair[field],id=>sourceNames[String(id)]??'—')}{choice.pair[other]!==selected[other]?' · '+wandFieldLabels(locale)[other]+': '+wandMaterialLabel(choice.pair[other],id=>sourceNames[String(id)]??'—'):''}</option>
        {/each}
       </select>
      </label>
     {/each}
    </div>
    {#if !edit.options.length&&!edit.nestedOptions?.length}<p class="compact-hint">{iCopy.readonly}</p>{/if}
    {#if canAddWandVariant()}
     <label class="date-dialog-field">
      <span>{inventoryAddCopy(locale)} · {iCopy.quantity}</span>
      <input type="number" name="variant-add-quantity" min="1" max="2147483647" step="1" bind:value={variantAddQuantity} disabled={busy}/>
     </label>
    {/if}
    {#if error}<p class="date-dialog-error" role="alert">{error}</p>{/if}
    <div class="date-dialog-actions">
     <button type="button" class="date-dialog-cancel" disabled={busy} onclick={closeWandEditor}>{copy.cancel}</button>
     {#if edit.creationOptions.length||edit.nestedCreationOptions?.length}
      <button type="button" class="inventory-create-wand" disabled={busy||!validVariantAddQuantity||!canAddWandVariant()} onclick={()=>void addInventoryWandVariant()}>{inventoryAddCopy(locale)}</button>
     {/if}
     {#if !inventoryAddMode}<button type="submit" formnovalidate class="primary" disabled={busy||(edit.nestedBefore?wandMaterialSelection<0:wandSelection<0)}>{copy.apply}</button>{/if}
    </div>
   </form>
  {/if}
 </dialog>

 <dialog class="date-dialog" bind:this={bobaDialogEl} aria-labelledby="boba-editor-title" onclose={()=>{bobaEdit=null;bobaSelection=-1}} oncancel={e=>{if(busy)e.preventDefault()}}>
  {#if bobaEdit}
   {@const edit=bobaEdit}
   {@const selected=edit.options[bobaSelection]??edit.before}
   <form class="date-dialog-inner" onsubmit={applyInventoryBobaVariant}>
    <div class="date-dialog-heading">
     <h2 id="boba-editor-title">{inventoryName(edit.itemId)}</h2>
     <button class="date-dialog-close" type="button" aria-label={copy.cancel} disabled={busy} onclick={closeBobaEditor}>×</button>
    </div>
    <div style="display:flex;justify-content:center"><DynamicChefSprite itemId={edit.itemId} appearance={{kind:'boba',colorId:selected[0]}} fallback={inventoryOriginalSprite(edit.itemId)}/></div>
    {#each ([1,3,2,4] as BobaField[]) as field}
     {@const choices=bobaFieldOptions(edit.before,edit.options,bobaSelection,field,edit.absent)}
     <label class="date-dialog-field">
      <span>{bobaFieldLabel(locale,field)}</span>
      <select name={['','boba-flavor','boba-pearls','boba-milk','boba-sweetness'][field]} value={bobaSelection}
       onchange={e=>{bobaSelection=Number(e.currentTarget.value);error=''}} disabled={busy||choices.length<=1}>
       {#each choices as choice (choice.index)}
        <option value={choice.index} data-boba-value={choice.variant[field]}>{bobaFieldValue(choice.variant,selected,field,locale,snapshot?.bobaWitnesses??[],id=>sourceNames[String(id)]??'')}</option>
       {/each}
      </select>
     </label>
    {/each}
    {#if bobaNeedsTupleChoice(edit.before,edit.options,bobaSelection,edit.absent)}
     <label class="date-dialog-field">
      <span>{([1,3,2,4] as BobaField[]).map(field=>bobaFieldLabel(locale,field)).join(' / ')}</span>
      <select name="boba-full-tuple" value={bobaSelection} disabled={busy} onchange={e=>{bobaSelection=Number(e.currentTarget.value);error=''}}>
       {#if !edit.absent}<option value={-1}>{bobaName(edit.before)}</option>{/if}
       {#each edit.options as variant,index}<option value={index}>{bobaName(variant)}</option>{/each}
      </select>
     </label>
    {/if}
    {#if !edit.options.length}<p class="compact-hint">{iCopy.readonly}</p>{/if}
    {#if edit.creationOptions.some(v=>v.every((n,i)=>n===edit.options[bobaSelection]?.[i]))}
     <label class="date-dialog-field">
      <span>{inventoryAddCopy(locale)} · {iCopy.quantity}</span>
      <input type="number" name="variant-add-quantity" min="1" max="2147483647" step="1" bind:value={variantAddQuantity} disabled={busy}/>
     </label>
    {/if}
    {#if error}<p class="date-dialog-error" role="alert">{error}</p>{/if}
    <div class="date-dialog-actions">
     <button type="button" class="date-dialog-cancel" disabled={busy} onclick={closeBobaEditor}>{copy.cancel}</button>
     {#if edit.creationOptions.length}
      <button type="button" class="inventory-create-boba" disabled={busy||!validVariantAddQuantity||bobaSelection<0||!edit.creationOptions.some(v=>v.every((n,i)=>n===edit.options[bobaSelection]?.[i]))} onclick={()=>void addInventoryBobaVariant()}>{inventoryAddCopy(locale)}</button>
     {/if}
     {#if !inventoryAddMode}<button type="submit" formnovalidate class="primary" disabled={busy||bobaSelection<0}>{copy.apply}</button>{/if}
    </div>
   </form>
  {/if}
 </dialog>

 <dialog class="date-dialog" bind:this={paletteDialogEl} aria-labelledby="palette-editor-title" onclose={()=>{paletteEdit=null;paletteDraft=null;paletteDraftCreatable=false}} oncancel={e=>{if(busy)e.preventDefault()}}>
  {#if paletteEdit}
   {@const edit=paletteEdit}
   {@const selected=paletteDraft??edit.before}
   {@const changed=selected.some((n,i)=>n!==edit.before[i])}
   {@const canCreate=paletteDraftCreatable}
   <form class="date-dialog-inner" onsubmit={applyInventoryPaletteVariant}>
    <div class="date-dialog-heading">
     <h2 id="palette-editor-title">{inventoryName(edit.itemId)}</h2>
     <button class="date-dialog-close" type="button" aria-label={copy.cancel} disabled={busy} onclick={closePaletteEditor}>×</button>
    </div>
    <div class="inventory-palette-preview" style="display:flex;justify-content:center">
     <DynamicPaletteSprite itemId={edit.itemId} palette={paletteFromWords(selected)} fallback={inventoryOriginalSprite(edit.itemId)}/>
    </div>
    <div class="date-dialog-field">
     <div style="display:flex;gap:8px">
      {#each [0,1,2] as slot}
       <button class="inventory-palette-slot" type="button" data-palette-slot={slot} aria-label={flowerCopy.color+' '+(slot+1)} aria-pressed={paletteSlot===slot} disabled={busy} onclick={()=>{paletteSlot=slot}} style="min-width:44px;min-height:36px;display:flex;align-items:center;gap:6px">
        <span style:background-color={paletteColorHex(selected,slot)} style="width:22px;height:22px;border:1px solid currentColor;border-radius:4px" aria-hidden="true"></span>{slot+1}
       </button>
      {/each}
     </div>
     <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(32px,1fr));gap:5px;margin-top:8px">
      {#each edit.options as option,i}
       {#if !paletteChannelEqual(option,selected,paletteSlot)&&!paletteChannelEqual(option,edit.before,paletteSlot)}
        <button class="inventory-palette-option" type="button" data-palette-option={i} aria-label={paletteColorHex(option,paletteSlot)} title={paletteColorHex(option,paletteSlot)} aria-pressed={paletteChannelEqual(option,selected,paletteSlot)} disabled={busy} onclick={()=>void refreshPaletteDraft(paletteSelectChannel(selected,option,paletteSlot))} style:background-color={paletteColorHex(option,paletteSlot)} style="width:32px;height:32px;border:1px solid currentColor;border-radius:5px" style:outline={paletteChannelEqual(option,selected,paletteSlot)?'2px solid currentColor':'none'}></button>
       {/if}
      {/each}
      {#if !paletteChannelEqual(selected,edit.before,paletteSlot)}
       <button class="inventory-palette-reset" type="button" title={paletteColorHex(edit.before,paletteSlot)} aria-label={paletteColorHex(edit.before,paletteSlot)} disabled={busy} onclick={()=>void refreshPaletteDraft(paletteSelectChannel(selected,edit.before,paletteSlot))} style:background-color={paletteColorHex(edit.before,paletteSlot)} style="width:32px;height:32px;border:1px dashed currentColor;border-radius:5px"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10h10a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5" transform="translate(0 -2)"/></svg></button>
      {/if}
     </div>
     {#if !edit.options.length}<p class="compact-hint">{iCopy.readonly}</p>{/if}
    </div>
    {#if canCreate}
     <label class="date-dialog-field">
      <span>{inventoryAddCopy(locale)} · {iCopy.quantity}</span>
      <input type="number" name="variant-add-quantity" min="1" max="2147483647" step="1" bind:value={variantAddQuantity} disabled={busy}/>
     </label>
    {/if}
    {#if error}<p class="date-dialog-error" role="alert">{error}</p>{/if}
    <div class="date-dialog-actions">
     <button type="button" class="date-dialog-cancel" disabled={busy} onclick={closePaletteEditor}>{copy.cancel}</button>
     {#if canCreate}
      <button type="button" class="inventory-create-palette" disabled={busy||!validVariantAddQuantity} onclick={()=>void addInventoryPaletteVariant()}>{inventoryAddCopy(locale)}</button>
     {/if}
     {#if !inventoryAddMode}<button type="submit" formnovalidate class="primary" disabled={busy||!changed}>{copy.apply}</button>{/if}
    </div>
   </form>
  {/if}
 </dialog>

 <dialog class="date-dialog" bind:this={furnitureDialogEl} aria-labelledby="furniture-editor-title" onclose={()=>{furnitureEdit=null;furnitureDraft=null;furnitureDraftCreatable=false}} oncancel={e=>{if(busy)e.preventDefault()}}>
  {#if furnitureEdit}
   {@const edit=furnitureEdit}
   {@const selected=furnitureDraft??edit.before}
   {@const changed=selected.some((v,i)=>v!==edit.before[i])}
   {@const canCreate=furnitureDraftCreatable}
   {@const original=inventoryOriginalSprite(edit.itemId)}
   {@const customized=snapshot?.version==='3.0.1'&&furnitureHasCustomizedAppearance(furnitureDisplay,selected)}
   <form class="date-dialog-inner" onsubmit={e=>{if(edit.createOnly){e.preventDefault();void addInventoryFurnitureVariant()}else void applyInventoryFurnitureVariant(e)}}>
    <div class="date-dialog-heading">
     <h2 id="furniture-editor-title">{inventoryName(edit.itemId)}</h2>
     <button class="date-dialog-close" type="button" aria-label={copy.cancel} disabled={busy} onclick={closeFurnitureEditor}>×</button>
    </div>
    <div style="display:flex;justify-content:center" aria-hidden="true">
     <span class="inventory-item-art" class:flower-variant={customized} style:position="relative" data-furniture-icon-preview>
      {#if originalVariantArt[String(edit.itemId)]||exactVariantArt[String(edit.itemId)]}
       <DyeSprite sprite={original} originalArtUrl={originalVariantArt[String(edit.itemId)]} exactArtUrl={exactVariantArt[String(edit.itemId)]}/>
      {:else if inventoryNativeArt?.placeholders.has(edit.itemId)}
       <DynamicArtSprite source="native-placeholder" render={renderNativePlaceholderArt}/>
      {:else if original}
       <InventoryAtlasSprite sprite={original}/>
      {:else}
       <span class="item-art-empty">✧</span>
      {/if}
      {#if customized}<span class="inventory-native-decorators"><InventoryDecorator type={9}/></span>{/if}
     </span>
    </div>
    {#each [0,1,2] as slot}
     {@const choices=edit.options.map((variant,index)=>({variant,index})).filter(({variant})=>variant[slot]!==selected[slot])}
     {#if selected[slot]!==0||edit.before[slot]!==0||choices.length}
      <div class="date-dialog-field" data-furniture-part={slot}>
       <label class="date-dialog-field">
        <span style="display:flex;align-items:center;gap:8px">{furnitureCopy.part} {String.fromCharCode(65+slot)}
         <span style:background={materialSwatch(furnitureDisplay,edit.itemId,slot,selected[slot])} style="width:24px;height:24px;border:1px solid currentColor;border-radius:4px;flex-shrink:0" aria-hidden="true"></span>
        </span>
        <select name={'furniture-part-'+slot} value={-1} disabled={busy||!choices.length} onchange={e=>{const index=Number(e.currentTarget.value);e.currentTarget.value='-1';void selectFurniturePart(index)}}>
         <option value={-1} disabled>{materialLabel(furnitureDisplay,selected[slot],furnitureCopy.defaultMaterial)}</option>
         {#each choices as choice (choice.index)}
          <option value={choice.index} data-material-index={choice.variant[slot]}>{furnitureChoiceLabel(furnitureDisplay,selected,choice.variant,slot,furnitureCopy.defaultMaterial,furnitureCopy.part)}</option>
         {/each}
        </select>
       </label>
       {#if selected[slot]!==edit.before[slot]}
        <button type="button" class="inventory-furniture-reset" data-furniture-reset={slot} disabled={busy} aria-label={materialLabel(furnitureDisplay,edit.before[slot],furnitureCopy.defaultMaterial)} title={materialLabel(furnitureDisplay,edit.before[slot],furnitureCopy.defaultMaterial)} onclick={()=>void resetFurniturePart(slot)}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10h10a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5" transform="translate(0 -2)"/></svg></button>
       {/if}
      </div>
     {/if}
    {/each}
    {#if !edit.options.length}<p class="compact-hint">{iCopy.readonly}</p>{/if}
    {#if canCreate}
     <label class="date-dialog-field">
      <span>{inventoryAddCopy(locale)} · {iCopy.quantity}</span>
      <input type="number" name="variant-add-quantity" min="1" max="2147483647" step="1" bind:value={variantAddQuantity} disabled={busy}/>
     </label>
    {/if}
    {#if error}<p class="date-dialog-error" role="alert">{error}</p>{/if}
    <div class="date-dialog-actions">
     <button type="button" class="date-dialog-cancel" disabled={busy} onclick={closeFurnitureEditor}>{copy.cancel}</button>
     {#if edit.createOnly||inventoryAddMode||canCreate}
      <button type={edit.createOnly?'submit':'button'} class="inventory-create-furniture" disabled={busy||!validVariantAddQuantity||!canCreate} onclick={()=>{if(!edit.createOnly)void addInventoryFurnitureVariant()}}>{inventoryAddCopy(locale)}</button>
     {/if}
     {#if !edit.createOnly&&!inventoryAddMode}<button type="submit" formnovalidate class="primary" disabled={busy||!changed}>{copy.apply}</button>{/if}
    </div>
   </form>
  {/if}
 </dialog>
 <dialog class="date-dialog" bind:this={flowerDialogEl} aria-labelledby="flower-editor-title"
  onclose={()=>{flowerEdit=null;flowerDraft=null;flowerDraftCreatable=false}} oncancel={e=>{if(busy)e.preventDefault()}}>
  {#if flowerEdit}
   {@const edit=flowerEdit}
   {@const current=flowerDraft??edit.before}
   {@const appearance={growState:current[0],baseColor:current[1],pattern:current[2],patternColor:current[3]}}
   {@const previewBadges=snapshot?.version==='3.0.1'?flowerDecorators(appearance,flowerDefinitions):[]}
   {@const changed=current.some((n,i)=>n!==edit.before[i])}
   <form class="date-dialog-inner" onsubmit={e=>{if(edit.absent){e.preventDefault();void addInventoryFlowerVariant()}else void applyInventoryFlowerVariant(e)}}>
    <div class="date-dialog-heading">
     <h2 id="flower-editor-title">{inventoryName(edit.itemId)}{#if flowerGrowthKind(edit.itemId,{growState:current[0],baseColor:0,pattern:0,patternColor:0})} · {flowerGrowthLabel(locale,flowerGrowthKind(edit.itemId,{growState:current[0],baseColor:0,pattern:0,patternColor:0}))}{/if}</h2>
     <button class="date-dialog-close" type="button" aria-label={copy.cancel} disabled={busy} onclick={closeFlowerEditor}>×</button>
    </div>
    <div class="date-dialog-item">
     <span class="date-dialog-art" style:height={previewBadges.length?'118px':undefined} aria-hidden="true">
      <span style:position="relative" style:display="flex" style:padding-top={previewBadges.length?'22px':undefined}>
       <DynamicFlowerSprite itemId={edit.itemId} flower={appearance} definitions={flowerDefinitions} fallback={inventoryOriginalSprite(edit.itemId)}/>
       {#if previewBadges.length}
        <span class="inventory-native-decorators">
         {#each previewBadges as badge (badge.type)}
          {#if badge.type===12}<InventoryDecorator type={12} primaryColor={badge.primaryColor}/>
          {:else}<InventoryDecorator type={11} patternUrl={badge.patternUrl}/>{/if}
         {/each}
        </span>
       {/if}
      </span>
     </span>
     <div class="date-dialog-detail"><strong>{flowerVariantName(current)}</strong>{#if changed}<button type="button" class="inventory-flower-reset" disabled={busy} aria-label={flowerVariantName(edit.before)} title={flowerVariantName(edit.before)} onclick={()=>void refreshFlowerDraft(edit.before)}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10h10a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5" transform="translate(0 -2)"/></svg></button>{/if}</div>
    </div>
    {#if edit.options.some(v=>v[0]!==current[0])}
     <div style="display:flex;gap:6px;flex-wrap:wrap">
      {#each [0,6,7] as grow}
       {@const target=edit.options.find(v=>v[0]===grow&&v[1]===current[1]&&v[2]===current[2]&&v[3]===current[3])}
       <button type="button" class="inventory-flower-growth" data-flower-grow={grow} aria-pressed={grow===current[0]} disabled={busy||!target} onclick={()=>{if(target)void refreshFlowerDraft(target)}}>{flowerGrowthLabel(locale,flowerGrowthKind(edit.itemId,{growState:grow,baseColor:0,pattern:0,patternColor:0}))}</button>
      {/each}
     </div>
    {/if}
    {#each [flowerCopy.color,flowerCopy.pattern,flowerCopy.effect,flowerCopy.accent] as label, index}
     {@const g=[0,1,3,2][index]}
     {@const choices=edit.options.map((v,i)=>({v,i})).filter(({v})=>v[0]===current[0]&&flowerOptionGroup(current,v)===g)}
     <label class="date-dialog-field">
      <span>{label}</span>
      <select name={['flower-base-color','flower-pattern','flower-effect','flower-pattern-color'][index]} value={-1}
       onchange={e=>{const i=Number(e.currentTarget.value);e.currentTarget.value='-1';void selectFlowerDraft(i)}} disabled={busy||choices.length===0}>
       <option value={-1} disabled>{flowerFieldValue(current,g)}</option>
       {#each choices as {v,i} (i)}
        <option value={i} data-flower-variant={v.join(',')}>{flowerFieldOption(current,v,g)}</option>
       {/each}
      </select>
     </label>
    {/each}
    {#if flowerDraftCreatable}
     <label class="date-dialog-field">
      <span>{inventoryAddCopy(locale)} · {iCopy.quantity}</span>
      <input type="number" name="variant-add-quantity" min="1" max="2147483647" step="1" bind:value={variantAddQuantity} disabled={busy}/>
     </label>
    {/if}
    {#if error}<p class="date-dialog-error" role="alert">{error}</p>{/if}
    <div class="date-dialog-actions">
     <button type="button" class="date-dialog-cancel" disabled={busy} onclick={closeFlowerEditor}>{copy.cancel}</button>
     {#if edit.creationOptions.length||flowerDraftCreatable}
      <button type="button" class="inventory-create-flower" disabled={busy||!validVariantAddQuantity||!flowerDraftCreatable} onclick={()=>void addInventoryFlowerVariant()}>{inventoryAddCopy(locale)}</button>
     {/if}
     {#if !edit.absent&&!inventoryAddMode}<button type="submit" formnovalidate class="primary" disabled={busy||!changed}>{copy.apply}</button>{/if}
    </div>
   </form>
  {/if}
 </dialog>
 <dialog class="date-dialog" bind:this={dateDialogEl} onclose={onDateDialogClosed} oncancel={e=>{if(busy)e.preventDefault()}}>
  {#if dateDialogItem && dateDialogTick!==null}
   {@const sprite=(iconPack?.group===dateDialogItem[3]?iconPack.entries:inventoryIconPacks[dateDialogItem[3]]?.entries)?.[String(dateDialogItem[0])]}
   <form class="date-dialog-inner" onsubmit={e=>{e.preventDefault();void applyDate()}}>
    <div class="date-dialog-heading">
     <h2>{copy.editDate}</h2>
     <button type="button" class="date-dialog-close" aria-label={copy.cancel} disabled={busy} onclick={closeDateDialog}>×</button>
    </div>
    <div class="date-dialog-item">
     <span class="date-dialog-art" aria-hidden="true">
      {#if originalVariantArt[String(dateDialogItem[0])]||exactVariantArt[String(dateDialogItem[0])]||(sprite&&nativeDyePalettes[String(dateDialogItem[0])])}
       <DyeSprite sprite={sprite} palette={nativeDyePalettes[String(dateDialogItem[0])]} sourceKey={dateDialogItem[1]} exactArtUrl={exactVariantArt[String(dateDialogItem[0])]} originalArtUrl={originalVariantArt[String(dateDialogItem[0])]}/>
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
     <h2 id="removal-confirm-title">{pendingRemoval.kind==='inventory'?inventoryDeleteCopy(locale):pendingRemoval.kind==='collections'?removalCopy.collectionTitle:removalCopy.achievementTitle}</h2>
     <button type="button" class="date-dialog-close" aria-label={removalCopy.cancel} disabled={busy} onclick={closeRemovalConfirmation}>×</button>
    </div>
    <strong class="removal-confirm-name">{pendingRemoval.name}</strong>
    {#if pendingRemoval.kind==='inventory'}
     {#if pendingRemoval.batch}
      <ul class="inventory-removal-targets">
       {#each pendingRemoval.targets as target (target.documentId)}
        <li><span>{target.name}
         {#if target.paletteColors.length}<span class="inventory-removal-palette">{#each target.paletteColors as color}<span class="inventory-removal-swatch" style:background-color={color} title={color} aria-label={color} role="img"></span>{/each}</span>{/if}
        </span><span class="inventory-removal-quantity">× {target.quantity.toLocaleString(locale)}</span></li>
       {/each}
      </ul>
     {:else if pendingRemoval.targets[0]?.paletteColors.length}
      <span class="inventory-removal-palette">{#each pendingRemoval.targets[0].paletteColors as color}<span class="inventory-removal-swatch" style:background-color={color} title={color} aria-label={color} role="img"></span>{/each}</span>
     {/if}
    {/if}
    {#if pendingRemoval.kind==='inventory'}
     {#if pendingRemoval.zero}<p class="removal-confirm-warning">{inventoryEmptyCopy(locale)}</p>{/if}
     {#if pendingRemoval.physical}<p class="removal-confirm-warning">{inventoryRemoveEntryWarning(locale)}</p>{/if}
    {:else}<p class="removal-confirm-warning">{pendingRemoval.kind==='collections'?removalCopy.collectionWarning:removalCopy.achievementWarning}</p>{/if}
    <div class="date-dialog-actions">
     <button type="button" class="date-dialog-cancel removal-cancel" autofocus disabled={busy} onclick={closeRemovalConfirmation}>{removalCopy.cancel}</button>
     {#if pendingRemoval.kind!=='inventory'||pendingRemoval.zero}<button type="button" class="removal-confirm-action" disabled={busy} onclick={()=>void confirmRemoval()}>{pendingRemoval.kind==='inventory'?inventoryZeroStackCopy(locale):removalCopy.remove}</button>{/if}
     {#if pendingRemoval.kind==='inventory'&&pendingRemoval.physical}<button type="button" class="inventory-remove-entry-action" disabled={busy} onclick={()=>void confirmRemoval(true)}>{inventoryRemoveEntryCopy(locale)}</button>{/if}
    </div>
   </div>
  {/if}
 </dialog>
</div>
