import type {InventoryEntry} from './worker-client';
import type {CollectionItem} from './subcategories';
import type {NativeInventoryIndex} from './inventory-native-data';
import {FLOWER_CREATION_SOURCE_IDS} from './inventory-native-crafting';

/** Original InventoryViewModel.RawCategories array: v3.0.1 metadata 0xC1E150.
 * Category mask browsing preserves records and multiple matching tabs; specialized
 * runtime visibility/filter behavior is not asserted to match the game exactly.
 * Native category semantics; colored representative game art for navigation.
 */
export const NATIVE_INVENTORY_TABS=[
 {key:'key-items',bit:134217728,art:null},
 {key:'items',bit:0,art:null},
 {key:'food',bit:65536,art:'collections_group_food.webp'},
 {key:'chef-station',bit:4096,art:'collections_group_recipes.webp'},
 {key:'flowers',bit:50331648,art:'collections_group_flowers.webp'},
 {key:'creation-station',bit:32,art:'collections_group_plans.webp'},
 {key:'critters',bit:8,art:'collections_group_critters.webp'},
 {key:'fish',bit:16384,art:'collections_group_fish.webp'},
 {key:'clothes',bit:256,art:'collections_group_clothing.webp'},
 {key:'furniture',bit:64,art:'collections_group_furniture.webp'},
 {key:'comics',bit:67108864,art:'collections_group_comics.webp'},
 {key:'music',bit:2097152,art:'collections_group_musicdiscs.webp'},
 {key:'wands',bit:8388608,art:null}
] as const;
export type InventoryGroupKey=(typeof NATIVE_INVENTORY_TABS)[number]['key']|'other';
/** Navigation artwork is a visual representative, not a classification rule.
 * IDs point to original game item art with motifs close to TabItemView.CategoryIcons.
 * A backpack may be a wearable item while representing the general Items tab. */
export const INVENTORY_CATEGORY_REPRESENTATIVES:Partial<Record<InventoryGroupKey,number>>={
 'key-items':767455829, // Toolbox
 items:433573896, // Mint Hiking Backpack
 food:1328220329, // Milk Bread
 'chef-station':633402456, // Omelet (pan)
 flowers:274491259, // Tulias
 'creation-station':1434684945, // Friendship Bouquet
 critters:71754032, // Phantom Flutterby
 furniture:286009791, // Nordic Armchair
 wands:1277599998 // Lala's Magic Wand
};
export function inventoryCategoryRepresentative(key:InventoryGroupKey,index:NativeInventoryIndex):number|undefined{
 const id=INVENTORY_CATEGORY_REPRESENTATIVES[key];
 return id!==undefined&&index.has(id)?id:undefined;
}
export const OTHER_INVENTORY_GROUP:InventoryGroupKey='other';
export function nativeInventoryGroups(itemId:number,index:NativeInventoryIndex):InventoryGroupKey[]{
 const source=index.get(itemId);
 if(!source)return [OTHER_INVENTORY_GROUP];
 const flags=source.hasUiOverride?source.uiOverrideFlags:source.rawFlags;
 if(flags<0)return [OTHER_INVENTORY_GROUP];
 // CreationStationFilterViewModel.BaseFilter reads CraftingSources (FlowerCreationStation=24)
 // and excludes effective Outfit. ChefStationFilterViewModel.BaseFilter reads raw definition category.
 // Do not reproduce game runtime visibility gating here: every saved row must remain manageable.
 const matches:InventoryGroupKey[]=NATIVE_INVENTORY_TABS.filter(t=>{
  if(t.key==='creation-station')return (flags&256)===0&&FLOWER_CREATION_SOURCE_IDS.has(itemId);
  if(t.key==='chef-station')return (source.rawFlags&t.bit)!==0;
  return t.bit!==0&&(flags&t.bit)!==0;
 }).map(t=>t.key);
 return matches.length?matches:['items'];
}
export function inventoryGroupCounts(rows:readonly InventoryEntry[],index:NativeInventoryIndex):Map<InventoryGroupKey,number>{
 const counts=new Map<InventoryGroupKey,number>();
 for(const row of rows)for(const key of nativeInventoryGroups(row.itemId,index))counts.set(key,(counts.get(key)??0)+1);
 return counts;
}

/** Select the first occupied native tab in original order. Unknown rows remain reachable. */
export function defaultInventoryGroup(counts:ReadonlyMap<InventoryGroupKey,number>):InventoryGroupKey{
 return NATIVE_INVENTORY_TABS.find(t=>(counts.get(t.key)??0)>0)?.key ??
  ((counts.get(OTHER_INVENTORY_GROUP)??0)>0?OTHER_INVENTORY_GROUP:NATIVE_INVENTORY_TABS[0].key);
}

/** Shared presentation predicate for browsing and per-category search counts. */
function matchesInventorySearch(row:InventoryEntry,q:string,editableOnly:boolean,
 localizedNames:Readonly<Record<string,string>>,sourceItems:ReadonlyMap<number,CollectionItem>,variantName?:(row:InventoryEntry)=>string):boolean{
 if(editableOnly&&!row.editable&&!row.unique?.flowerEditable&&!row.unique?.furnitureEditable&&!row.cafe?.editable&&!row.flowerCreatable)return false;
 if(!q)return true;
 const source=sourceItems.get(row.itemId);
 const fields=[String(row.itemId),localizedNames[String(row.itemId)]??'',source?.[5]??'',source?.[6]??'',variantName?.(row)??''].map(v=>v.toLocaleLowerCase());
 // Preserve single-field substring matches; allow a flower name, color and
 // pattern to be combined as whitespace-separated terms across fields.
 return fields.some(v=>v.includes(q))||q.split(/\s+/u).every(term=>fields.some(v=>v.includes(term)));
}
export function inventorySearchGroupCounts(rows:readonly InventoryEntry[],term:string,editableOnly:boolean,
 localizedNames:Readonly<Record<string,string>>,sourceItems:ReadonlyMap<number,CollectionItem>,index:NativeInventoryIndex,variantName?:(row:InventoryEntry)=>string):Map<InventoryGroupKey,number>{
 const q=term.trim().toLocaleLowerCase();
 return inventoryGroupCounts(rows.filter(row=>matchesInventorySearch(row,q,editableOnly,localizedNames,sourceItems,variantName)),index);
}
/** Retain the selected native category when it contains a match; otherwise
 * reveal the first matching category. Do not switch on edits or snapshot refresh. */
export function inventorySearchTarget(current:InventoryGroupKey,counts:ReadonlyMap<InventoryGroupKey,number>):InventoryGroupKey{
 return (counts.get(current)??0)>0||counts.size===0?current:defaultInventoryGroup(counts);
}
/** Search/filter only; quantity CAS and writer remain solely Rust/WASM. */
export function browseInventory(
 rows:readonly InventoryEntry[],term:string,selectedGroup:InventoryGroupKey,
 editableOnly:boolean,localizedNames:Readonly<Record<string,string>>,
 sourceItems:ReadonlyMap<number,CollectionItem>,index:NativeInventoryIndex,locale:string,variantName?:(row:InventoryEntry)=>string
):InventoryEntry[]{
 const q=term.trim().toLocaleLowerCase();
 return rows.filter(row=>nativeInventoryGroups(row.itemId,index).includes(selectedGroup)&&
  matchesInventorySearch(row,q,editableOnly,localizedNames,sourceItems,variantName)).sort((a,b)=>{
  const an=localizedNames[String(a.itemId)]??sourceItems.get(a.itemId)?.[5]??String(a.itemId);
  const bn=localizedNames[String(b.itemId)]??sourceItems.get(b.itemId)?.[5]??String(b.itemId);
  return an.localeCompare(bn,locale)||a.itemId-b.itemId||a.documentId-b.documentId;
 });
}
