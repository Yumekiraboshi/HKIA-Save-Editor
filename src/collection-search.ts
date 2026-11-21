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
