import type {CollectionItem} from './subcategories';

/** Search ALL catalog groups and all nested subcategories, independently of
 * the currently selected collection page. Both verified English/Japanese
 * names are searchable even if another display language is selected.
 * Unverified/unlabeled items stay hidden, matching the collection editor.
 */
export function searchAllCollectionItems(
 items:readonly CollectionItem[],
 term:string,
 locale:string,
 displayName:(item:CollectionItem)=>string
):CollectionItem[]{
 const q=term.trim().toLocaleLowerCase();
 if(!q)return [];
 return items.filter(item=>{
  const name=displayName(item);
  return Boolean(name)&&(
   name.toLocaleLowerCase().includes(q)||
   (item[5]??'').toLocaleLowerCase().includes(q)||
   (item[6]??'').toLocaleLowerCase().includes(q)
  );
 }).sort((a,b)=>displayName(a).localeCompare(displayName(b),locale)||a[0]-b[0]);
}

/**
 * The collection catalog retains native IDs even where the older name index
 * has no verified match. Never hide those game-defined rows or invent a
 * translated item name: show a clearly marked, stable source-ID placeholder.
 */
export function collectionDisplayName(
 item:CollectionItem,
 localizedName:string|undefined,
 preferJapanese:boolean,
 unverifiedLabel:string
):string{
 const name=localizedName?.trim()||
  (preferJapanese?item[6]?.trim()||item[5]?.trim():item[5]?.trim()||item[6]?.trim());
 return name||`${unverifiedLabel} (ID ${item[0]})`;
}

/** Preserve all native collection base items even with zero saved history.
 * Status filters are deliberate user selections, never implicit prerequisites.
 */
export function filterCollectionItems(
 items:readonly CollectionItem[],
 group:string|null,subgroup:string|null,
 recorded:Readonly<Record<string,bigint>>,
 families:Readonly<Record<string,readonly number[]>>,
 showVariants:boolean,
 status:'all'|'recorded'|'unrecorded',
 term:string,locale:string,
 displayName:(item:CollectionItem)=>string
):CollectionItem[]{
 if(!group||!subgroup)return [];
 const q=term.trim().toLocaleLowerCase();
 return items.filter(item=>{
  if(item[3]!==group||item[2]!==subgroup)return false;
  if(!showVariants&&item[0]!==item[7])return false;
  const has=showVariants?recorded[String(item[0])]!==undefined:
   (families[String(item[7]||item[0])]?.length??0)>0;
  if(status==='recorded'&&!has||status==='unrecorded'&&has)return false;
  return !q||displayName(item).toLocaleLowerCase().includes(q)||
   (item[5]?.toLocaleLowerCase().includes(q)??false)||
   (item[6]?.toLocaleLowerCase().includes(q)??false);
 }).sort((a,b)=>displayName(a).localeCompare(displayName(b),locale)||a[0]-b[0]);
}
