/** Build-time census and narrowly scoped routing repair. Original pack
 * membership is keyed by exact Item ID, never names or inferred appearance.
 * The preferred collection group wins; a missing route is repaired only
 * when there is a single alternative original pack entry.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {collectNativeSprites,sourceIconGroups} from './original-icon-packs.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=(root,path)=>JSON.parse(readFileSync(join(root,path),'utf8'));
const assert=(ok,msg)=>{if(!ok)throw Error('INVENTORY_THUMBNAIL_'+msg);};
export function selectCollectionRoute(preferred,groups){
 if(groups.includes(preferred))return preferred;
 return groups.length===1?groups[0]:null;
}
export function buildInventoryThumbnailIndex(root,{write=true}={}){
 const native=read(root,'public/inventory-native-categories.json'),catalog=read(root,'public/catalog.json');
 const extra=read(root,'public/inventory-art/index.json'),original=read(root,'public/source-colorways/index.json');
 const dynamic=read(root,'public/dynamic-colorways/index.json'),dyes=read(root,'public/native-dye-palettes.json');
 const flags=read(root,'data/unityfs-audit/dynamic-uiicons.v3.0.1.json');
 const furniture=read(root,'public/inventory-ui/furniture-customization-v3.0.1.json');
 const raw=gunzipSync(Buffer.from(native.data,'base64'));
 assert(native.version==='3.0.1'&&native.count===12163&&sha(raw)===native.rawSha256,'SOURCE_INDEX');
 const all=new Map();let pos=0,id=0;
 for(let i=0;i<native.count;i++){
  let n=0,shift=0,b;
  do{assert(pos<raw.length&&shift<=28,'DELTA');b=raw[pos++];n+=(b&127)*2**shift;shift+=7;}while(b&128);
  id+=n;const tuple=native.palette[raw[pos++]];
  assert(n>0&&id<=0x7fffffff&&tuple,'SOURCE_ID');all.set(id,tuple);
 }
 assert(pos===raw.length&&all.size===native.count,'SOURCE_COUNT');
 const byId=new Map(catalog.items.map(row=>[row[0],row]));
 const extras=new Map(extra.records.map(row=>[row[0],row]));
 const withheld=new Map(extra.withheld.map(row=>[row[0],row[2]]));
 const originals=new Set([...Object.keys(original.records),...Object.keys(dynamic.records)].map(Number));
 const dynamicFlags=new Map(flags.rows.map(row=>[row.itemId,row.key]));
 const customFurniture=new Set(furniture.items.map(row=>row[0]));
 // Source definition flags, not an appearance classifier by themselves.
 const sourceRules=readFileSync(join(root,'core/src/inventory_source_data.rs'),'utf8').split('pub(super) const RULES:')[1].split('];')[0];
 const requiresUnique=new Set([...sourceRules.matchAll(/\((\d+),(\d+)\)/g)].filter(m=>Number(m[2])&2).map(m=>Number(m[1])));
 const packGroups=sourceIconGroups(root),packMembership=new Map();
 for(const group of packGroups){
  const {sprites}=collectNativeSprites(group,root);
  for(const key of sprites.keys()){
   const itemId=Number(key),groups=packMembership.get(itemId)??[];
   groups.push(group);packMembership.set(itemId,groups);
  }
 }
 assert(byId.size+extras.size+withheld.size===all.size,'PARTITION');
 assert([...byId.keys(),...extras.keys(),...withheld.keys()].every(id=>all.has(id)),'UNKNOWN_ID');
 assert([...byId.keys()].every(id=>!extras.has(id)&&!withheld.has(id))&&[...extras.keys()].every(id=>!withheld.has(id)),'OVERLAP');
 assert(originals.size===5383&&Object.keys(dyes.records).every(id=>originals.has(Number(id))),'COLORWAY_COVERAGE');
 const routes={},rows=[],counts={},byCategory={};
 const increment=(object,key)=>{object[key]=(object[key]??0)+1;};
 for(const [id,tuple] of all){
  const item=byId.get(id),preferred=item?.[3],groups=packMembership.get(id)??[];
  const route=selectCollectionRoute(preferred,groups);
  if(item&&route&&route!==preferred)routes[id]=route;
  const source=originals.has(id)?'original-colorway':extras.has(id)?'native-inventory':
   withheld.has(id)?withheld.get(id):route?'collection-pack':groups.length?'ambiguous-pack':'missing-pack';
  const appearance=customFurniture.has(id)?'furniture-customization':dynamicFlags.has(id)?'native-dynamic-flag':
   requiresUnique.has(id)?'other-unique-data':'no-known-dynamic-marker';
  increment(counts,source);const category=String(tuple[1]?tuple[2]:tuple[0]);
  const cat=byCategory[category]??(byCategory[category]={});
  increment(cat,source);
  rows.push({id,source,appearance,category,preferred:preferred??null,route,groups,
   ...(dynamicFlags.has(id)?{dynamicKey:dynamicFlags.get(id)}:{})});
 }
 const appearanceCounts={};for(const row of rows)increment(appearanceCounts,row.appearance);
 const unresolved=rows.filter(row=>['missing-pack','ambiguous-pack','source-placeholder','dynamic-color'].includes(row.source));
 const report={version:'3.0.1',definitions:all.size,counts,appearanceCounts,byCategory,alternateRoutes:Object.keys(routes).length,
  unresolved:unresolved.map(row=>({id:row.id,source:row.source,appearance:row.appearance,category:row.category,groups:row.groups}))};
 if(write)writeFileSync(join(root,'public/inventory-art/collection-routes.json'),JSON.stringify({schema:'HKIA.InventoryCollectionRoutes.1',version:'3.0.1',routes}));
 console.log('HKIA_INVENTORY_THUMBNAIL_CENSUS '+JSON.stringify(report));
 return {routes,rows,report};
}
