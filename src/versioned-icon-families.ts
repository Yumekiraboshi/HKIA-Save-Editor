/** Version-specific original display bindings. This adapter reuses the
 * existing shader input resolvers and never interprets raw save payloads.
 * Release pins must come from reviewed bundled data, not the save or network.
 */
import {loadVerifiedArtAsset} from './dynamic-art-assets';
import {createVersionedDynamicSourceLoader,type DynamicSourcePin,type VersionedOverlay} from './versioned-dynamic-source';
import {resolveFlowerAppearance,type FlowerMaskIndex,type FlowerTintDefinitions} from './flower-appearance';
import {flowerGrowthSpriteState,flowerUsesDefinitionIcon,type InventoryFlower} from './inventory-flower-display';
import {resolveChefTints,type ChefAppearance} from './chef-appearance';
import {resolveWandBaseTints,type WandBaseAppearance} from './wand-appearance';
import {resolvePaletteChannels,type InventoryPalette} from './inventory-palette-display';
import type {Rgba} from './dynamic-sprite-color';
import type {SpriteOverlay} from './dynamic-sprite-raster';

type Family='flower'|'cafe'|'boba'|'wand'|'palette'|'instruction'|'unknown';
type FamilyRow={itemId:number;family:Family;maskGuid:string|null;baseSpritePathId:string;flowerMasks:{patternIndex:number;maskGuid:string}[]};
type Transform=Pick<SpriteOverlay,'scale'|'offsetPercent'|'rotation'>;
type Bindings={rows:Map<number,FamilyRow>;defs:FlowerTintDefinitions;flowerIndex:FlowerMaskIndex;
 known:Set<number>;chefMapped:Set<number>;chef:Map<number,Rgba>;magic:Map<number,Rgba>;flecks:Map<number,Rgba>;
 growth:Set<number>;patternArt:Set<number>;transforms:Map<number,Transform>};
export type FamilySourcePin=Readonly<{version:string;bindingsSha256:string;dynamic:DynamicSourcePin;auxiliary:DynamicSourcePin}>;
const SHA=/^[a-f0-9]{64}$/;
const GUID=/^[a-f0-9]{32}$/;
function check(ok:unknown):asserts ok{if(!ok)throw Error('ICON_FAMILY_SOURCE_INVALID');}
function obj(v:unknown):Record<string,unknown>{check(v!==null&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;}
function list(v:unknown):unknown[]{check(Array.isArray(v)&&v.length<=100000);return v;}
function id(v:unknown):number{check(typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=0x7fffffff);return v;}
function index(v:unknown):number{return v===0?0:id(v);}
function guid(v:unknown):string{check(typeof v==='string'&&GUID.test(v));return v;}
function color(v:unknown):Rgba{
 const a=list(v);check(a.length===4&&a.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1));
 return a as unknown as Rgba;
}
function finite(v:unknown):number{check(typeof v==='number'&&Number.isFinite(v));return v;}
function validPin(pin:FamilySourcePin){
 check(/^\d+\.\d+\.\d+$/.test(pin.version)&&SHA.test(pin.bindingsSha256)&&
  pin.dynamic.version===pin.version&&pin.auxiliary.version===pin.version&&SHA.test(pin.dynamic.indexSha256)&&SHA.test(pin.auxiliary.indexSha256));
}
function colors(v:unknown,known:Set<number>):Map<number,Rgba>{
 const m=new Map<number,Rgba>();
 for(const raw of list(v)){
  const r=obj(raw),i=id(r.characteristicId);
  check(known.has(i)&&!m.has(i));m.set(i,color(r.rgba));
 }
 return m;
}
export function decodeVersionedFamilyBindings(v:unknown,pin:FamilySourcePin):Bindings{
 validPin(pin);const a=obj(v);
 check(a.schema==='HKIA.IconFamilyBindingsCandidate.1'&&a.version===pin.version&&
  a.dynamicIndexSha256===pin.dynamic.indexSha256&&a.auxiliaryIndexSha256===pin.auxiliary.indexSha256&&
  a.automaticReleaseActivationAuthorized===false);
 const knownIds=list(a.knownCharacteristicIds).map(id),known=new Set(knownIds);
 check(known.size===knownIds.length);
 const mapped=list(a.chefMappedIds).map(id),chefMapped=new Set(mapped);
 check(chefMapped.size===mapped.length&&mapped.every(i=>known.has(i)));
 const chef=colors(a.chefColors,known),magic=colors(a.magic,known),flecks=colors(a.flecks,known);
 check([...chef.keys()].every(i=>chefMapped.has(i)));
 const flowerColors:Record<string,{rgba:Rgba}>={},patterns:Record<string,boolean>={};
 for(const raw of list(a.flowerColors)){
  const r=obj(raw),i=id(r.index);check(!Object.hasOwn(flowerColors,i));flowerColors[i]={rgba:color(r.rgba)};
 }
 for(const raw of list(a.flowerPatterns)){
  const r=obj(raw),i=id(r.index);check(!Object.hasOwn(patterns,i)&&typeof r.isEffect==='boolean');patterns[i]=r.isEffect;
 }
 const patternIds=list(a.flowerPatternArtIndices??[]).map(id),patternArt=new Set(patternIds);
 check(patternArt.size===patternIds.length&&patternIds.every(i=>Object.hasOwn(patterns,i)));
 const rows=new Map<number,FamilyRow>(),flowerItems:FlowerMaskIndex['items'][number][]=[],masks:Record<string,boolean>={};
 for(const raw of list(a.rows)){
  const r=obj(raw),itemId=id(r.itemId),family=r.family;
  check(!rows.has(itemId)&&typeof family==='string'&&['flower','cafe','boba','wand','palette','instruction','unknown'].includes(family));
  const path=r.baseSpritePathId;check(typeof path==='string'&&/^-?[1-9]\d{0,18}$/.test(path));
  const maskGuid=r.maskGuid===null?null:guid(r.maskGuid),flowerMasks:{patternIndex:number;maskGuid:string}[]=[];
  const used=new Set<number>();
  for(const rawMask of list(r.flowerMasks)){
   const m=obj(rawMask),i=index(m.patternIndex),g=guid(m.maskGuid);
   check(family==='flower'&&!used.has(i)&&(i===0||Object.hasOwn(patterns,i)));
   used.add(i);flowerMasks.push({patternIndex:i,maskGuid:g});masks[g]=true;
  }
  if(family==='flower'){
   check(used.has(0));flowerItems.push({itemId,baseSpritePathId:path,patterns:flowerMasks});
  }
  if(['cafe','boba','wand','palette'].includes(family))check(maskGuid!==null);
  rows.set(itemId,{itemId,family:family as Family,maskGuid,baseSpritePathId:path,flowerMasks});
 }
 const growthIds=list(a.growthItemIds).map(id),growth=new Set(growthIds);
 check(growth.size===growthIds.length&&growthIds.every(i=>rows.get(i)?.family==='flower'));
 const transforms=new Map<number,Transform>();
 for(const raw of list(a.wandTransforms)){
  const r=obj(raw),i=id(r.itemId),scale=finite(r.scale),offset=list(r.offsetPercent);
  check(rows.get(i)?.family==='wand'&&!transforms.has(i)&&scale>=0&&offset.length===2);
  transforms.set(i,{scale,offsetPercent:[finite(offset[0]),finite(offset[1])],rotation:finite(r.rotation)});
 }
 return {rows,defs:{colors:flowerColors,patterns},flowerIndex:{items:flowerItems,masks},known,chefMapped,chef,magic,flecks,growth,patternArt,transforms};
}
/** Nonzero wand source IDs use their actual original UiIcon, never an
 * individually recolored source, a named override, or a guessed fallback.
 * All definition UiIcons share the version-pinned source page layer. An
 * optional independently verified same-version source can recover delivery
 * failures; otherwise the complete wand composite stays withheld. */
export function createVersionedFamilyRenderer(
 roots:{bindings:string;dynamic:string;auxiliary:string},pin:FamilySourcePin,
 options:{load?:typeof loadVerifiedArtAsset;loadTexture?:Parameters<typeof createVersionedDynamicSourceLoader>[3];
  itemOverlay?:(itemId:number,version:string,transform:Transform)=>Promise<VersionedOverlay|null>}={}
){
 validPin(pin);
 for(const root of Object.values(roots))check(root.startsWith('/')&&root.endsWith('/')&&!root.includes('..')&&!root.includes('//')&&!root.includes('\\')&&!/[?#]/.test(root));
 const load=options.load??loadVerifiedArtAsset;
 const dynamic=createVersionedDynamicSourceLoader(roots.dynamic,pin.dynamic,load,options.loadTexture);
 const auxiliary=createVersionedDynamicSourceLoader(roots.auxiliary,pin.auxiliary,load,options.loadTexture);
 let pending:Promise<Bindings>|undefined;
 const bindings=()=>pending??=(async()=>decodeVersionedFamilyBindings(JSON.parse(new TextDecoder().decode(
  await load(roots.bindings,'family-bindings.json',pin.bindingsSha256,8*1024*1024))),pin))().catch(e=>{pending=undefined;throw e;});
 async function original(itemId:number,version:string):Promise<Blob|null>{
  try{if(version!==pin.version)return null;const b=await bindings();
   return b.rows.has(itemId)?dynamic.original(itemId,version):null;
  }catch{return null;}
 }
 async function flower(itemId:number,version:string,value:InventoryFlower):Promise<Blob|null>{
  try{if(version!==pin.version)return null;const b=await bindings(),species=(i:number)=>b.rows.get(i)?.family==='flower';
   if(!species(itemId))return null;
   const state=flowerGrowthSpriteState(itemId,value,species);
   if(state!==undefined)return b.growth.has(itemId)?auxiliary.originalRoute('growth:'+itemId+':'+state,version):null;
   if(!flowerUsesDefinitionIcon(itemId,value,species))return null;
   if(value.growState!==6)return dynamic.original(itemId,version);
   const a=resolveFlowerAppearance(itemId,value,b.defs,b.flowerIndex,version);
   return a?dynamic.render(itemId,version,a.maskGuid,a.tints):null;
  }catch{return null;}
 }
 async function chef(itemId:number,version:string,value:ChefAppearance):Promise<Blob|null>{
  try{if(version!==pin.version)return null;const b=await bindings(),row=b.rows.get(itemId);
   if(!row?.maskGuid||(row.family!=='cafe'&&row.family!=='boba'))return null;
   const t=resolveChefTints({itemId,kind:row.family},value,b.chef,{known:b.known,mapped:b.chefMapped});
   return t?dynamic.render(itemId,version,row.maskGuid,t):null;
  }catch{return null;}
 }
 async function palette(itemId:number,version:string,value:InventoryPalette):Promise<Blob|null>{
  try{if(version!==pin.version)return null;const row=(await bindings()).rows.get(itemId);
   if(row?.family!=='palette'||!row.maskGuid)return null;
   const t=resolvePaletteChannels(value);return t?dynamic.render(itemId,version,row.maskGuid,t):null;
  }catch{return null;}
 }
 async function wand(itemId:number,version:string,value:WandBaseAppearance&{sourceItemId:number}):Promise<Blob|null>{
  try{if(version!==pin.version)return null;const b=await bindings(),row=b.rows.get(itemId),transform=b.transforms.get(itemId);
   if(row?.family!=='wand'||!row.maskGuid||!transform||!Number.isSafeInteger(value.sourceItemId)||value.sourceItemId<0||value.sourceItemId>0x7fffffff)return null;
   const t=resolveWandBaseTints(value,b.magic,b.flecks,{known:b.known,magic:new Set(b.magic.keys()),flecks:new Set(b.flecks.keys())});
   if(!t)return null;
   // Native TryGetSubIcon hides the overlay for a known characteristic
   // with no MagicDisplay entry. A mapped but unavailable Sprite is not
   // the same state. The tint resolver above rejects unknown IDs.
   if(value.sourceItemId===0&&!b.magic.has(value.magicCharacteristicId))
    return dynamic.render(itemId,version,row.maskGuid,t);
   const layer=value.sourceItemId===0?
    await auxiliary.originalOverlayRoute('magic:'+value.magicCharacteristicId,version,transform):
    ((b.rows.has(value.sourceItemId)?await dynamic.originalOverlay(value.sourceItemId,version,transform):null)
     ??await dynamic.originalOverlayRoute('item:'+value.sourceItemId,version,transform)
     ??await options.itemOverlay?.(value.sourceItemId,version,transform));
   if(!layer||layer.version!==version)return null;
   return dynamic.render(itemId,version,row.maskGuid,t,layer);
  }catch{return null;}
 }
 /** Pattern artwork is the actual native FlowerPatternDefinition.Icon,
  * not the per-species dynamic tint mask. Missing routes do not invent a
  * decorative image. The UI may use the existing circular plate renderer. */
 async function flowerPattern(patternIndex:number,version:string):Promise<Blob|null>{
  try{
   if(version!==pin.version||!Number.isSafeInteger(patternIndex)||patternIndex<=0)return null;
   const b=await bindings();if(!b.patternArt.has(patternIndex))return null;
   return auxiliary.originalRoute('pattern:'+patternIndex,version);
  }catch{return null;}
 }
 return {original,flower,chef,palette,wand,flowerPattern};
}
