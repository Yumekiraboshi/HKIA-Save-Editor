/** Only source archive membership can supply an alternate route. It never
 * changes item identity, category, unique appearance or save eligibility. */
export type InventoryCollectionRoutes=Readonly<Record<string,string>>;
export function decodeInventoryCollectionRoutes(raw:unknown):InventoryCollectionRoutes{
 const v=raw as {schema?:string;version?:string;routes?:Record<string,string>};
 if(!v||v.schema!=='HKIA.InventoryCollectionRoutes.1'||v.version!=='3.0.1'||!v.routes||typeof v.routes!=='object'||Array.isArray(v.routes)||Object.keys(v.routes).length>12163)throw Error('INVENTORY_ART_ROUTES_INVALID');
 for(const [id,group] of Object.entries(v.routes)){
  if(!/^[1-9]\d{0,9}$/.test(id)||Number(id)>0x7fffffff||typeof group!=='string'||!/^(?:collection|collections)_group_[a-z]+$/.test(group))throw Error('INVENTORY_ART_ROUTES_INVALID');
 }
 return v.routes;
}
export async function loadInventoryCollectionRoutes(base:string):Promise<InventoryCollectionRoutes>{
 const r=await fetch(base+'inventory-art/collection-routes.json');
 if(!r.ok)throw Error('INVENTORY_ART_ROUTES_UNAVAILABLE');
 const data=await r.text();if(data.length>600000)throw Error('INVENTORY_ART_ROUTES_INVALID');
 return decodeInventoryCollectionRoutes(JSON.parse(data));
}
export function inventoryCollectionRoute(id:number,preferred:string|undefined,routes:InventoryCollectionRoutes):string|undefined{
 return Object.hasOwn(routes,String(id))?routes[String(id)]:preferred;
}
