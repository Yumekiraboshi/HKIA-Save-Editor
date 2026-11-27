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

/** Join the exact authored renderer IDs, mesh and material references to the
 * selected slot treatments. Preserve non-customizable renderers, never
 * assume the first mesh is the whole item. This is a diagnostic draw plan;
 * a downstream renderer must support every referenced shader and texture. */
export function bindFurnitureRendererTreatments(d:RugNativeSources,itemId:number,indices:readonly number[]){
 const choices=createFurnitureTreatmentResolver(d.catalog,d.variants)(itemId,indices);
 const geo=d.geometry.rows.filter(r=>r.itemId===itemId),base=d.base.rows.filter(r=>r.itemId===itemId);
 if(geo.length!==1||base.length!==1||d.geometry.version!=='3.0.1'||d.base.version!=='3.0.1')fail('RENDER_SOURCE');
 const geometry=geo[0],bindings=unique(base[0].bindings,x=>x[0]),submeshBindings=unique(base[0].submeshBindings??[],x=>x.rendererPathId);
 const used=new Set<number>();
 type Plan={rendererPathId:string;meshPathId:string;submeshIndex:number|undefined;baseMaterialId:string;baseMaterial:RugNativeSources['base']['materials'][string];choice:(typeof choices)[number]|null};
 const plans=geometry.nodes.filter(n=>n.rendererPathId!==undefined).flatMap<Plan>(n=>{
  const id=n.rendererPathId!,meshId=n.meshPathId,mesh=meshId&&geometry.meshes[meshId];
  if(!meshId||!mesh||!n.active||n.enabled!==true)throw Error('FURNITURE_TREATMENT_RENDERER');
  const materialFor=(materialKey:string,materialId:string)=>{
   const ref=geometry.materials[materialKey] as {objectSha256?:string;externalCab?:string;pathId?:string}|undefined;
   const material=d.base.materials[materialId];
   if(!ref||!material)throw Error('FURNITURE_TREATMENT_BASE');
   const [file,pid]=materialKey.split(':');
   if(file==='0'){
    if(materialId!==geometry.cab+':'+pid||material.objectSha256!==ref.objectSha256)fail('BASE_LINK');
   }else if(!ref.externalCab||ref.pathId!==pid||materialId!==ref.externalCab.split('/').at(-1)+':'+pid)fail('BASE_LINK');
   return material;
  };
  if(n.materialSlots!==undefined||mesh.submeshes!==undefined){
   const binding=submeshBindings.get(id);
   // Native VisualSlot uses Renderer.GetMaterial/GetSharedMaterial (first
   // assigned material), not an array. Admit only the source-pinned COLO26
   // renderer with unchanged ordered submesh/material identity.
   if(n.material!==undefined||bindings.has(id)||!n.materialSlots||!mesh.submeshes||!binding||
    mesh.submeshes.length<2||mesh.submeshes.length!==n.materialSlots.length||binding.materials.length!==n.materialSlots.length)throw Error('FURNITURE_TREATMENT_SUBMESH_COVERAGE');
   let choice:(typeof choices)[number]|null=null;
   if(n.slot!=null||binding.slot!=null){
    const expectedKeys=['0:1280843064671824810','0:7360047341139011972'];
    const expectedHashes=['c1609f4de37c830a53cd72fc562447861d7804113ef33a8fca0882adb119cc26','4dcc89a9999c7f7d4ec5d1d298d323fa20376b7731eb11b7a63c7314e1603cbf'];
    const ranges=mesh.submeshes;
    if(itemId!==1913359021||geometry.cab!=='CAB-80143f8385dbc1ffc5569bdd27b3c5c5'||
     geometry.bundleSha256!=='ff07ef7230109e8bb6afc8b4b20604eec0e0ad725b1003394f19658262b767c8'||
     geometry.visualSlotObjectPathId!=='3887440351149882788'||geometry.visualSlotObjectSha256!=='e66f9346178ec5a43c9215fedbcd1356616ea0ab8a6b369ed62cd249c1a0d6b5'||
     geometry.geometrySha256!=='0469e802cebdebe72e4330dd8a074382c487027d76b9fa89eda90df82f09ab5f'||
     id!=='-6498765778094195292'||meshId!=='2102444807489941090'||n.slot?.slot!==0||n.slot.displayedDefinitionGuid!==null||
     binding.slot?.slot!==0||binding.slot.displayedDefinitionGuid!==null||n.scale?.join(',')!=='1,1,1'||
     mesh.vertexCount!==397||mesh.indexCount!==1824||ranges.length!==2||
     ranges.some((s,i)=>s.firstByte!==[0,1920][i]||s.indexCount!==[960,864][i]||s.firstVertex!==[0,212][i]||s.vertexCount!==[212,185][i])||
     expectedKeys.some((k,i)=>n.materialSlots![i]!==k||geometry.materials[k]?.objectSha256!==expectedHashes[i]))fail('SUBMESH_TREATMENT_UNVERIFIED');
    const selected=choices.find(x=>x.slot===0);
    // All six original COLO26 choices are nonmirrored; the fixed range's
    // shared renderer transform is unchanged. Do not infer a mirror rule
    // for other multi-material prefabs.
    if(!selected||selected.selectedIndex<207||selected.selectedIndex>212||selected.definition[15]!==false)fail('SUBMESH_TREATMENT_UNVERIFIED');
    choice=selected!;used.add(choice.slot);
   }
   submeshBindings.delete(id);
   return n.materialSlots.map((key,submeshIndex)=>({rendererPathId:id,meshPathId:meshId,submeshIndex,baseMaterialId:binding.materials[submeshIndex],baseMaterial:materialFor(key,binding.materials[submeshIndex]),choice:submeshIndex===0?choice:null}));
  }
  const binding=bindings.get(id),materialKey=n.material;
  if(!binding||!materialKey||submeshBindings.has(id))throw Error('FURNITURE_TREATMENT_RENDERER');
  bindings.delete(id);
  const material=materialFor(materialKey,binding[1]);
  if((n.slot?.slot??null)!==(binding[2]?.slot??null)||(n.slot?.displayedDefinitionGuid??null)!==(binding[2]?.displayedDefinitionGuid??null))fail('SLOT_LINK');
  if(n.slot?.displayedDefinitionGuid!=null)fail('AUTHORED_OVERRIDE_UNRESOLVED');
  const choice=n.slot?choices.find(x=>x.slot===n.slot!.slot):null;
  if(n.slot&&!choice)fail('SLOT_MISSING');
  if(choice)used.add(choice.slot);
  return [{rendererPathId:id,meshPathId:meshId,submeshIndex:undefined as number|undefined,baseMaterialId:binding[1],baseMaterial:material,choice:choice??null}];
 });
 if(bindings.size||submeshBindings.size||choices.some(x=>!used.has(x.slot)))fail('RENDERER_COVERAGE');
 return {geometry,plans,fidelity:'source-binding-only' as const};
}
