/** Read-only native material bindings for appearance generation.
 * No save editing, ownership, entitlement or eligibility decisions. */
import type {RugNativeSources} from './furniture-rug-source';
import type {Vec3,Vec4} from './furniture-surface-v3.0.1';
type Catalog=RugNativeSources['catalog'];
type Variants=RugNativeSources['variants'];
type Row=Variants['rows'][number];
const fail=(reason:string):never=>{throw Error('FURNITURE_TREATMENT_'+reason);};
const unique=<K,V>(rows:readonly V[],key:(row:V)=>K)=>{const map=new Map<K,V>();for(const row of rows){const k=key(row);if(map.has(k))fail('DUPLICATE');map.set(k,row);}return map;};
const finite=(x:readonly number[],n:number)=>x.length===n&&x.every(Number.isFinite);
/** Raw SetColor/SetFloat arguments, before Unity native-engine color handling.
 * A failed load of a non-null source GUID is NOT treated as a null pattern. */
export function nativeFurnitureTreatment(row:Row,loadedPatternGuid:string|null){
 if(row[5]!==loadedPatternGuid)fail('PATTERN_REFERENCE');
 if(!finite(row[3],4)||!finite(row[6],2)||!finite(row[7],2)||!finite(row[8],4)||!finite(row[10],4)||
 ![row[9],...row.slice(11,15)].every(Number.isFinite)||typeof row[4]!=='boolean'||typeof row[15]!=='boolean')fail('MATERIAL_FIELDS');
 const baseColor:Vec4=[row[3][0],row[3][1],row[3][2],loadedPatternGuid===null?1:row[3][3]];
 return {baseColor,patternTint:row[8],useBaseMapMask:row[4],patternST:[...row[6],...row[7]] as Vec4,
  rotationTurns:row[9],rotationCenter:[row[10][0],row[10][1]] as const,
  patternSmoothnessShift:row[11],patternMetallicShift:row[12],smoothnessShift:row[13],metallicShift:row[14],
  mirrored:row[15],patternMapGuid:row[5],materialIndex:row[0],materialGuid:row[1],recordSha256:row[17],
  fidelity:'native-setter-arguments' as const};
}
/** Native treatment changes the renderer's own Transform.localScale.x,
 * not the root, UV coordinates or the scale of every renderer in the item. */
export function furnitureTreatmentScale(scale:Vec3,mirrored:boolean):Vec3{
 if(!finite(scale,3)||typeof mirrored!=='boolean')fail('SCALE');
 const [x,y,z]=scale;return [mirrored?-Math.abs(x):Math.abs(x),y,z];
}
/** Original source catalog resolution for all three slot assignments.
 * Zero means source default; reject unknown/unsupported source tuples rather
 * than silently substituting a different appearance. */
export function createFurnitureTreatmentResolver(c:Catalog,v:Variants){
 if(c.schema!=='HKIA.FurnitureCustomizationSource.1'||c.gameVersion!=='3.0.1'||v.schema!=='HKIA.FurnitureMaterialRenderSource.1'||v.version!=='3.0.1'||
 c.source.definitionSha256!==v.definitionsSha256||c.source.payloadPathId!==v.payloadPathId)fail('VERSION');
 const items=unique(c.items,x=>x[0]),sets=unique(c.sets,x=>x[0]),catalog=unique(c.materials,x=>x[0]),variants=unique(v.rows,x=>x[0]);
 if(items.size!==649||sets.size!==141||catalog.size!==877||variants.size!==877)fail('COVERAGE');
 for(const [index,row] of variants){
  const m=catalog.get(index);if(!m||m[1]!==row[1]||m[2]!==row[2]||m[3]!==row[16])fail('MATERIAL_LINK');
 }
 return (itemId:number,indices:readonly number[])=>{
  if(indices.length!==3||!indices.every(x=>Number.isSafeInteger(x)&&x>=0))fail('TUPLE');
  const item=items.get(itemId);if(!item)throw Error('FURNITURE_TREATMENT_ITEM');
  const slots=unique(item[4],x=>x[0]);
  if([...slots.keys()].some(x=>x!==0&&x!==1&&x!==2))fail('SLOT');
  for(let i=0;i<3;i++)if(!slots.has(i)&&indices[i]!==0)fail('UNASSIGNED_SLOT');
  return [...slots.values()].sort((a,b)=>a[0]-b[0]).map(slot=>{
   const index=indices[slot[0]]||slot[2],allowed=new Set([slot[2]]);
   for(const key of slot[3]){const set=sets.get(key);if(!set)throw Error('FURNITURE_TREATMENT_SET');for(const i of set[2])allowed.add(i);}
   const row=variants.get(index);
   if(!allowed.has(index)||!row)throw Error('FURNITURE_TREATMENT_SLOT_MATERIAL');
   return {slot:slot[0],sourceDefault:slot[2],selectedIndex:index,definition:row};
  });
 };
}
