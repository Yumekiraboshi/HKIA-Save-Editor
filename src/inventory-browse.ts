import type {InventoryEntry} from './worker-client';
import type {CollectionItem} from './subcategories';

/** Only game-derived collection GUID grouping is known here. This is a
 * browsing aid, not a claim about the game's Inventory tab category schema.
 * Unknown native inventory IDs remain visible under Other rather than being
 * silently assigned to a guessed category.
 */
export const OTHER_INVENTORY_GROUP='__inventory_other__';

export function sourceCollectionGroup(
 itemId:number,
 sourceItems:ReadonlyMap<number,CollectionItem>,
 sourceGroups:ReadonlySet<string>
):string{
 const group=sourceItems.get(itemId)?.[3];
 return group&&sourceGroups.has(group)?group:OTHER_INVENTORY_GROUP;
}

export function inventoryGroupCounts(
 rows:readonly InventoryEntry[],
 sourceItems:ReadonlyMap<number,CollectionItem>,
 sourceGroups:ReadonlySet<string>
):Map<string,number>{
 const counts=new Map<string,number>();
 for(const row of rows){
  const group=sourceCollectionGroup(row.itemId,sourceItems,sourceGroups);
  counts.set(group,(counts.get(group)??0)+1);
 }
 return counts;
}

/** Read-only search/sorting/filtering of already-parsed native rows.
 * All write eligibility, CAS, and serialization stay in Rust/WASM.
 */
export function browseInventory(
 rows:readonly InventoryEntry[],
 term:string,
 selectedGroup:string|null,
 editableOnly:boolean,
 localizedNames:Readonly<Record<string,string>>,
 sourceItems:ReadonlyMap<number,CollectionItem>,
 sourceGroups:ReadonlySet<string>,
 locale:string
):InventoryEntry[]{
 const q=term.trim().toLocaleLowerCase();
 return rows.filter(row=>{
  if(editableOnly&&!row.editable)return false;
  const source=sourceItems.get(row.itemId);
  if(selectedGroup!==null&&
   sourceCollectionGroup(row.itemId,sourceItems,sourceGroups)!==selectedGroup)return false;
  if(!q)return true;
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
