import type {InventoryEntry} from './worker-client';

/** UI selection only. The full filtered category, not just mounted cards,
 * is eligible; Rust still provides the limit and validates every CAS.
 */
export function selectMatchingInventoryRows(
 rows:readonly InventoryEntry[],selected:ReadonlySet<number>,limit:number
):Set<number>{
 const next=new Set(selected);
 for(const row of rows){
  if(next.size>=limit)break;
  if(row.editable)next.add(row.documentId);
 }
 return next;
}
