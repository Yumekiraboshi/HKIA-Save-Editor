import type {InventoryEntry} from './worker-client';
import type {CollectionItem} from './subcategories';
import type {NativeInventoryIndex} from './inventory-native-data';

/** Original InventoryViewModel.RawCategories array: v3.0.1 metadata 0xC1E150.
 * Category mask browsing preserves records and multiple matching tabs; specialized
 * runtime visibility/filter behavior is not asserted to match the game exactly.
 * Non-inventory-specific artwork reuses original game Collection UI art.
 */
export const NATIVE_INVENTORY_TABS=[
 {key:'key-items',bit:134217728,art:null},
 {key:'items',bit:0,art:null},
 {key:'food',bit:65536,art:'collections_group_food.webp'},
 {key:'chef-station',bit:4096,art:'collections_group_recipes.webp'},
 {key:'flowers',bit:50331648,art:'inventory-category-flowers.png'},
 {key:'creation-station',bit:32,art:'collections_group_plans.webp'},
 {key:'critters',bit:8,art:'collections_group_critters.webp'},
 {key:'fish',bit:16384,art:'collections_group_fish.webp'},
 {key:'clothes',bit:256,art:'collections_group_clothing.webp'},
 {key:'furniture',bit:64,art:'inventory-category-furniture.png'},
 {key:'comics',bit:67108864,art:'collections_group_comics.webp'},
 {key:'music',bit:2097152,art:'collections_group_musicdiscs.webp'},
 {key:'wands',bit:8388608,art:null}
] as const;
export type InventoryGroupKey=(typeof NATIVE_INVENTORY_TABS)[number]['key']|'other';
export const OTHER_INVENTORY_GROUP:InventoryGroupKey='other';
export function nativeInventoryGroups(itemId:number,index:NativeInventoryIndex):InventoryGroupKey[]{
 const source=index.get(itemId);
 if(!source)return [OTHER_INVENTORY_GROUP];
 const flags=source.hasUiOverride?source.uiOverrideFlags:source.rawFlags;
 if(flags<0)return [OTHER_INVENTORY_GROUP];
 const matches:InventoryGroupKey[]=NATIVE_INVENTORY_TABS.filter(t=>t.bit!==0&&(flags&t.bit)!==0).map(t=>t.key);
 return matches.length?matches:['items'];
}
export function inventoryGroupCounts(rows:readonly InventoryEntry[],index:NativeInventoryIndex):Map<InventoryGroupKey,number>{
 const counts=new Map<InventoryGroupKey,number>();
 for(const row of rows)for(const key of nativeInventoryGroups(row.itemId,index))counts.set(key,(counts.get(key)??0)+1);
 return counts;
}

/** Search/filter only; quantity CAS and writer remain solely Rust/WASM. */
export function browseInventory(
 rows:readonly InventoryEntry[],term:string,selectedGroup:InventoryGroupKey|null,
 editableOnly:boolean,localizedNames:Readonly<Record<string,string>>,
 sourceItems:ReadonlyMap<number,CollectionItem>,index:NativeInventoryIndex,locale:string
):InventoryEntry[]{
 const q=term.trim().toLocaleLowerCase();
 return rows.filter(row=>{
  if(editableOnly&&!row.editable)return false;
  if(selectedGroup!==null&&!nativeInventoryGroups(row.itemId,index).includes(selectedGroup))return false;
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
