import source from '../data/native-result-icon-routes-v3.0.1.json';

const targets=new Map(source.rows.map(row=>[row[0],row[1]] as const));
/** Presentation only. Native InventoryItemViewModel uses the result
 * definition's UiIcon for recipes and the craftable result for schematics.
 * Save identity, names, category and edits continue to use the original ID. */
export function nativeResultIconTarget(itemId:number,version:string):number|undefined{
 return version===source.version?targets.get(itemId):undefined;
}
