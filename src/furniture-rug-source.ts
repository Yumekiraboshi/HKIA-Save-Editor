/** Source-bound diagnostic selection for the first completely extracted rug.
 * This is display-only. No native save eligibility or mutation is determined here.
 * Raw material values are not proof of runtime color conversion or camera parity. */
import {nativeFurnitureTreatment} from './furniture-material-treatment';
import type {Vec2,Vec4} from './furniture-surface-v3.0.1';
import type {NativeGeometrySource} from './native-furniture-mesh';
import type {NativeTextureSource} from './native-texture-upload';
import type {FurnitureForwardMaterial} from './furniture-forwardlit-gpu';
type Slot=readonly [number,string,number,readonly string[]];
type Item=readonly [number,string,string,number,readonly Slot[]];
type SetRow=readonly [string,string,readonly number[]];
type CatalogMaterial=readonly [number,string,string,string,...unknown[]];
type MaterialRow=readonly [number,string,string,Vec4,boolean,string|null,Vec2,Vec2,Vec4,number,Vec4,number,number,number,number,boolean,string,string];
type SlotLink={slot:number;displayedDefinitionGuid:string|null};
type MeshRow=NativeGeometrySource&{schema:string;version:string;itemId:number;cab:string;nodes:readonly {rendererPathId?:string;meshPathId?:string;material?:string;slot?:SlotLink;active:boolean;enabled?:boolean}[];materials:Readonly<Record<string,{objectSha256:string}>>};
type TextureLink={texture:string|null;scale:Vec2;offset:Vec2};
type BaseMaterial={objectSha256:string;shader:string;validKeywords:readonly string[];textures:Readonly<Record<string,TextureLink>>;floats:Readonly<Record<string,number>>;colors:Readonly<Record<string,Vec4>>};
type Pattern=NativeTextureSource&{materialIndex:number;guid:string};
export type RugNativeSources={
 catalog:{schema:string;gameVersion:string;source:{definitionSha256:string;payloadPathId:string};items:readonly Item[];sets:readonly SetRow[];materials:readonly CatalogMaterial[]};
 geometry:{schema:string;version:string;rows:readonly MeshRow[]};
 base:{schema:string;version:string;rows:readonly {itemId:number;bindings:readonly (readonly [string,string,SlotLink|null])[]}[];materials:Readonly<Record<string,BaseMaterial>>;textures:Readonly<Record<string,NativeTextureSource>>;shaders:Readonly<Record<string,{objectSha256:string}>>};
 variants:{schema:string;version:string;definitionsSha256:string;payloadPathId:string;rows:readonly MaterialRow[]};
 patterns:{schema:string;version:string;itemId:number;rows:readonly Pattern[]};
};
const itemId=32709745;
const shaderId='CAB-2b27edbfe7f08bad1cd631865ee4eb15:-6806329374484566350';
const shaderHash='cdb64e92e92cbc2b88b3ce48c8a3ed302a16972a23528c27e766b7a646d852d0';
function one<T>(xs:readonly T[],predicate:(x:T)=>boolean,code:string):T{
 const found=xs.filter(predicate);if(found.length!==1)throw Error('RUG_SOURCE_'+code);return found[0];
}
function requireValue<T>(value:T|undefined|null,code:string):T{if(value==null)throw Error('RUG_SOURCE_'+code);return value;}
function st(link:TextureLink):Vec4{return [link.scale[0],link.scale[1],link.offset[0],link.offset[1]];}
export function resolveNativeRugMaterial(d:RugNativeSources,requestedItemId:number,materialIndex:number){
 if(requestedItemId!==itemId)throw Error('RUG_SOURCE_ITEM_UNSUPPORTED');
 if(d.catalog.schema!=='HKIA.FurnitureCustomizationSource.1'||d.catalog.gameVersion!=='3.0.1'||
 d.geometry.schema!=='HKIA.FurnitureStaticMeshSamples.1'||d.base.schema!=='HKIA.FurnitureBaseMaterialSource.1'||
 d.variants.schema!=='HKIA.FurnitureMaterialRenderSource.1'||d.patterns.schema!=='HKIA.FurniturePatternTextureSamples.1'||
 [d.geometry,d.base,d.variants,d.patterns].some(x=>x.version!=='3.0.1')||
 d.catalog.source.definitionSha256!==d.variants.definitionsSha256||d.catalog.source.payloadPathId!==d.variants.payloadPathId||d.patterns.itemId!==itemId)throw Error('RUG_SOURCE_VERSION');
 const item=one(d.catalog.items,x=>x[0]===itemId,'ITEM');
 if(item[4].length!==1||item[4][0][0]!==0)throw Error('RUG_SOURCE_SLOT');
 const slot=item[4][0];
 const materialSetIds=slot[3];
 const indices=new Set([slot[2],...materialSetIds.flatMap(id=>one(d.catalog.sets,x=>x[0]===id,'SET')[2])]);
 if(!indices.has(materialIndex))throw Error('RUG_SOURCE_MATERIAL_NOT_IN_SLOT');
 const v=one(d.variants.rows,x=>x[0]===materialIndex,'VARIANT');
 const c=one(d.catalog.materials,x=>x[0]===materialIndex,'CATALOG_MATERIAL');
 if(v[1]!==c[1]||v[2]!==c[2]||v[16]!==c[3]||v[15]||v[5]===null)throw Error('RUG_SOURCE_VARIANT_LINK');
 const geometry=one(d.geometry.rows,x=>x.itemId===itemId,'GEOMETRY');
 if(geometry.schema!=='HKIA.FurnitureStaticMeshSource.1'||geometry.version!=='3.0.1')throw Error('RUG_SOURCE_GEOMETRY_VERSION');
 const renderers=geometry.nodes.filter(n=>n.rendererPathId);
 if(renderers.length!==1)throw Error('RUG_SOURCE_RENDERER_COUNT');
 const node=renderers[0],meshId=requireValue(node.meshPathId,'MESH');
 if(!node.active||node.enabled!==true||node.slot?.slot!==0||node.slot.displayedDefinitionGuid!==null||!geometry.meshes[meshId])throw Error('RUG_SOURCE_RENDERER');
 const bindingRow=one(d.base.rows,x=>x.itemId===itemId,'BASE_ROW');
 if(bindingRow.bindings.length!==1)throw Error('RUG_SOURCE_BASE_COUNT');
 const [renderer,materialId,bindingSlot]=bindingRow.bindings[0];
 const localMaterial=requireValue(node.material,'MATERIAL');
 if(!localMaterial.startsWith('0:')||materialId!==geometry.cab+':'+localMaterial.slice(2)||renderer!==node.rendererPathId||bindingSlot?.slot!==0||bindingSlot.displayedDefinitionGuid!==null)throw Error('RUG_SOURCE_BASE_LINK');
 const base=requireValue(d.base.materials[materialId],'BASE');
 if(base.objectSha256!==geometry.materials[localMaterial]?.objectSha256||base.shader!==shaderId||d.base.shaders[shaderId]?.objectSha256!==shaderHash||base.validKeywords.length!==0)throw Error('RUG_SOURCE_SHADER');
 if(base.textures._PatternNormalMap?.texture!==null||base.textures._Surface_EffectMap?.texture!==null||base.floats._PatternNormalMap_Toggle!==0||base.floats._Surface_Effect!==0||base.floats.CUSTOM_RIMLIGHT!==0||base.floats.GLIMMER!==0)throw Error('RUG_SOURCE_FEATURES');
 const texture=(key:string)=>{
  const link=requireValue(base.textures[key],'TEXTURE_LINK');
  const source=requireValue(d.base.textures[requireValue(link.texture,'TEXTURE_NULL')],'TEXTURE');
  return {link,source};
 };
 const b=texture('_BaseMap'),n=texture('_BumpMap'),x=texture('_MetallicGlossMap');
 // The recovered program samples all three maps through the same base UV.
 if(st(n.link).some((value,i)=>value!==st(b.link)[i])||st(x.link).some((value,i)=>value!==st(b.link)[i]))throw Error('RUG_SOURCE_UV');
 const pattern=one(d.patterns.rows,p=>p.materialIndex===materialIndex&&p.guid===v[5],'PATTERN');
 const worldUV=base.floats._Pattern_WorldUV;
 if(worldUV!==0&&worldUV!==1)throw Error('RUG_SOURCE_WORLD_UV');
 const t=nativeFurnitureTreatment(v,pattern.guid);
 const material:FurnitureForwardMaterial={
  baseColor:t.baseColor,patternTint:t.patternTint,useBaseMapMask:t.useBaseMapMask,baseST:st(b.link),patternST:t.patternST,
  rotationTurns:t.rotationTurns,rotationCenter:t.rotationCenter,smoothnessShift:t.smoothnessShift,metallicShift:t.metallicShift,patternSmoothnessShift:t.patternSmoothnessShift,patternMetallicShift:t.patternMetallicShift,
  occlusionStrength:base.floats._OcclusionStrength,worldUV:worldUV===1
 };
 const reflectionStrength=base.floats._ReflectionStrength,emissionColor=requireValue(base.colors._EmissionColor,'EMISSION');
 if(![material.occlusionStrength,reflectionStrength,...emissionColor].every(Number.isFinite))throw Error('RUG_SOURCE_UNIFORM');
 return {itemId,materialIndex,materialGuid:v[1],materialRecordSha256:v[17],geometry,meshId,rendererPathId:renderer,
  textures:{baseMap:b.source,normalMap:n.source,comboMap:x.source,patternMap:pattern},material,reflectionStrength,emissionColor,
  renderFidelity:'unverified' as const};
}
