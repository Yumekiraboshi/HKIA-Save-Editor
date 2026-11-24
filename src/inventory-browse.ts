import type {InventoryEntry} from './worker-client';
import type {CollectionItem} from './subcategories';
import type {NativeInventoryIndex} from './inventory-native-data';
import {FLOWER_CREATION_SOURCE_IDS} from './inventory-native-crafting';

/** Original InventoryViewModel.RawCategories array: v3.0.1 metadata 0xC1E150.
 * Category mask browsing preserves records and multiple matching tabs; specialized
 * runtime visibility/filter behavior is not asserted to match the game exactly.
 * Original TabItemView.CategoryIcons only; unresolved art is text-only.
 */
export const NATIVE_INVENTORY_TABS=[
 {key:'key-items',bit:134217728,art:'category-key-items.webp'},
 {key:'items',bit:0,art:'category-items.webp'},
 {key:'food',bit:65536,art:'category-food.webp'},
 {key:'chef-station',bit:4096,art:null},
 {key:'flowers',bit:50331648,art:'category-flowers.webp'},
 {key:'creation-station',bit:32,art:null},
 {key:'critters',bit:8,art:'category-critters.webp'},
 {key:'fish',bit:16384,art:null},
 {key:'clothes',bit:256,art:'category-clothes.webp'},
 {key:'furniture',bit:64,art:'category-furniture.webp'},
 {key:'comics',bit:67108864,art:null},
 {key:'music',bit:2097152,art:'category-music.webp'},
 {key:'wands',bit:8388608,art:null}
] as const;
export type InventoryGroupKey=(typeof NATIVE_INVENTORY_TABS)[number]['key']|'other';
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

/** Search/filter only; quantity CAS and writer remain solely Rust/WASM. */
export function browseInventory(
 rows:readonly InventoryEntry[],term:string,selectedGroup:InventoryGroupKey,
 editableOnly:boolean,localizedNames:Readonly<Record<string,string>>,
 sourceItems:ReadonlyMap<number,CollectionItem>,index:NativeInventoryIndex,locale:string
):InventoryEntry[]{
 const q=term.trim().toLocaleLowerCase();
 return rows.filter(row=>{
  if(editableOnly&&!row.editable)return false;
  if(!nativeInventoryGroups(row.itemId,index).includes(selectedGroup))return false;
  if(!q)return true;
  const source=sourceItems.get(row.itemId);
  return String(row.itemId).includes(q)||
   (localizedNames[String(row.itemId)]??'').toLocaleLowerCase().includes(q)||
   (source?.[5]??'').toLocaleLowerCase().includes(q)||
   (source?.[6]??'').toLocaleLowerCase().includes(q);
 }).sort((a,b)=>{
  const an=localizedNames[String(a.itemId)]??sourceItems.get(a.itemId)?.[5]??String(a.itemId);
  const bn=localizedNames[String(b.itemId)]??sourceItems.get(b.itemId)?.[5]??String(b.itemId);
  return an.localeCompare(bn,locale)||a.itemId-b.itemId||a.documentId-b.documentId;
 });
}
