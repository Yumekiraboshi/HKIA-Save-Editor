#!/usr/bin/env node
/** Resolve Item ID -> source UnityFS prefab -> exact native five-channel
 * palette. This creates a *plan*, never a made-up render.
 *
 * node scripts/prepare-dye-render.mjs --item-id 1286846063
 * node scripts/prepare-dye-render.mjs --item-id 1286846063 --out /tmp/job.json
 * node scripts/prepare-dye-render.mjs --item-id 1286846063 --require-ready
 *
 * --require-ready deliberately refuses unknown materials and shader masks.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const load=(p)=>JSON.parse(readFileSync(resolve(ROOT,p),'utf8'));
const ID=/^[1-9][0-9]{0,9}$/;
const SHA=/^[0-9a-f]{64}$/;
const COLOR=/^#[0-9a-f]{6}$/;

export function prepareDyeRender(itemId,{catalog,palettes,families,recipes,audits,bindings={}}){
 if(!ID.test(String(itemId))||!Array.isArray(catalog?.items)||!palettes?.records||
  families?.schema!=='HKIA.DyeRenderFamilies.1'||
  recipes?.schema!=='HKIA.DyeRenderRecipes.1'||
  palettes.version!=='3.0.1'||catalog.version!=='3.0.1'&&catalog.version!==undefined)
  throw Error('DYE_JOB_DATA_INVALID');
 const row=catalog.items.find(r=>Array.isArray(r)&&r[0]===Number(itemId));
 if(!row||typeof row[1]!=='string')throw Error('DYE_JOB_ID_NOT_IN_ORIGINAL_CATALOG');
 const family=families.families.find(f=>row[1].startsWith(f.itemKeyPrefix));
 if(!family)throw Error('DYE_JOB_UNMAPPED_FAMILY');
 const palette=palettes.records[String(itemId)];
 if(!palette||!Array.isArray(palette.colors)||palette.colors.length!==5||
  palette.colors.some(x=>x!==null&&!COLOR.test(x)))
  throw Error('DYE_JOB_MISSING_GAME_PALETTE');
 const audit=audits[family.familyId];
 if(!audit||audit.sha256!==family.originalUnityFS.sha256||
  !SHA.test(audit.sha256)||audit.bundle!==family.originalUnityFS.bundle||
  audit.serialized.verifiedGameObject!==family.originalGameObject||
  (audit.serialized.classCounts.SkinnedMeshRenderer??0)+(audit.serialized.classCounts.MeshRenderer??0)<1)
  throw Error('DYE_JOB_SOURCE_AUDIT_MISMATCH');
 let binding=null;
 if(family.bindingAudit){
  const doc=bindings[family.familyId], native=doc?.families?.find(f=>f.familyId===family.familyId);
  const entry=native?.records?.find(r=>r[0]===Number(itemId));
  if(doc?.schema!=='HKIA.NativeOutfitIconBindings.1'||doc.version!==palettes.version||
   doc.definitionsSha256!==palettes.definitions_sha256||!entry||
   row[1]!==native.itemKeyPrefix+entry[1]||
   JSON.stringify(native.sharedIcon)!==JSON.stringify(family.sharedIcon))
   throw Error('DYE_JOB_NATIVE_ITEM_BINDING_MISMATCH');
  binding={definitionPathId:entry[2],outfitPathId:native.outfitPathId,
   basicStylePathId:native.basicStylePathId,uiIconPathId:native.uiIconPathId,
   addressableKey:native.addressableKey,sharedIcon:native.sharedIcon};
 }
 const recipe=recipes.recipes.find(r=>r.familyId===family.familyId);
 if(!recipe||recipe.output.width!==512||recipe.output.height!==512||
  recipe.output.transparent!==true||recipe.output.format!=='png')
  throw Error('DYE_JOB_INVALID_RECIPE');
 if(!Array.isArray(family.verifiedMaterialDependencies))
  throw Error('DYE_JOB_MISSING_MATERIAL_DEPENDENCIES');
 const rendererRefs=audit.serialized.rendererMaterialReferences;
 if(!Array.isArray(rendererRefs)||rendererRefs.length<1)
  throw Error('DYE_JOB_MISSING_MATERIAL_PPTRS');
 const requiredMaterialCABs=[...new Set(
  rendererRefs.flatMap(renderer=>renderer.materials.map(material=>material.externalCAB)
   .filter(Boolean))
 )].sort();
 if(!requiredMaterialCABs.length||
  requiredMaterialCABs.some(cab=>!/^CAB-[0-9a-f]{32}$/.test(cab)||
   !audit.serialized.externalCABs.includes(cab)))
  throw Error('DYE_JOB_INVALID_MATERIAL_PPTRS');
 const ready=family.rendererStatus==='ready'&&
  family.verifiedMaterialDependencies.length>0&&
  family.verifiedShaderPaletteMask===true&&
  recipe.publishable===true&&
  recipe.lighting.status==='verified'&&recipe.pose.status==='verified';
 return {
  schema:'HKIA.DyeRenderJob.1',version:'3.0.1',
  itemId:Number(itemId),itemKey:row[1],familyId:family.familyId,
  originalUnityFS:family.originalUnityFS,
  prefabGameObject:family.originalGameObject,
  sourceAuditSha256:audit.sha256,
  requiredMaterialCABs,
  materialSlots:rendererRefs,
  ...(binding?{nativeBinding:binding,nativeMaterial:family.nativeMaterial,
   dependencyBundleNames:family.dependencyBundleNames,
   dependencyHashes:family.verifiedMaterialDependencies}:{}),
  palette:{dye:palette.dye,colors:palette.colors},
  renderer:{...recipe,ready,verifiedMaterialDependencies:family.verifiedMaterialDependencies},
  outputRelative:'staging/variant-art/'+itemId+'.png',
  publishable:ready
 };
}
export function originalJobInputs(){
 const families=load('data/dye-render-families.json');
 const audits=Object.fromEntries(families.families.map(f=>[f.familyId,load(f.audit)]));
 const bindings=Object.fromEntries(families.families.filter(f=>f.bindingAudit).map(f=>[f.familyId,load(f.bindingAudit)]));
 return {catalog:load('public/catalog.json'),
  palettes:load('public/native-dye-palettes.json'),
  families,recipes:load('data/dye-render-recipes.json'),audits,bindings};
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 try{
  const args=process.argv.slice(2);
  const at=args.indexOf('--item-id');
  if(at<0||!args[at+1]||!ID.test(args[at+1]))throw Error('Expected --item-id <original integer>');
  const itemId=args[at+1];
  const job=prepareDyeRender(itemId,originalJobInputs());
  if(args.includes('--require-ready')&&!job.publishable)
   throw Error('DYE_RENDER_BLOCKED: original material dependencies, shader masks, pose or lighting not verified');
  const output=args.indexOf('--out');
  if(output>=0&&args[output+1]){
   writeFileSync(resolve(args[output+1]),JSON.stringify(job,null,2)+'\n',{flag:'w'});
   process.stdout.write('Wrote original-game render plan for '+itemId+'; ready='+job.publishable+'\n');
  }else process.stdout.write(JSON.stringify(job,null,2)+'\n');
 }catch(error){
  process.stderr.write(String(error.message||error)+'\n');process.exitCode=2;
 }
}
