/** Presentation-only selection from an explicitly reviewed candidate release.
 * Do not infer image routes from names, save payloads or collection ownership. */
import {loadVerifiedArtAsset} from './dynamic-art-assets';
import type {SpriteCell} from './icon-packs';
import type {InventoryFlower} from './inventory-flower-display';
import type {ChefAppearance} from './chef-appearance';
import type {InventoryPalette} from './inventory-palette-display';
import type {WandBaseAppearance} from './wand-appearance';

const SHA=/^[a-f0-9]{64}$/;
const FAMILY=['flower','cafe','boba','wand','palette'] as const;
type Family=typeof FAMILY[number];
type Kind=Family|'original-base'|'original-override'|'source-placeholder'|'native-result'|'unknown';
type Route={itemId:number;kind:Kind;sourceBlockers:readonly string[];targetItemId?:number};
export type InventoryRoutePin=Readonly<{version:string;receiptFileSha256:string}>;
export type InventoryArtAppearance=
 {kind:'flower';value:InventoryFlower}|
 {kind:'cafe'|'boba';value:ChefAppearance}|
 {kind:'palette';value:InventoryPalette}|
 {kind:'wand';value:WandBaseAppearance&{sourceItemId:number}};
type SourceArt=Blob|SpriteCell;
export type InventoryArtwork={itemId:number;sourceItemId:number;kind:Exclude<Kind,'native-result'|'unknown'>;fidelity:'original'|'original-base-only'|'dynamic'|'source-placeholder';art:SourceArt};
export type InventoryArtProviders={
 base:(id:number,version:string)=>Promise<SourceArt|null>;
 override:(id:number,version:string)=>Promise<Blob|null>;
 placeholder:(id:number,version:string)=>Promise<Blob|null>;
 family:{
  original:(id:number,version:string)=>Promise<Blob|null>;
  flower:(id:number,version:string,value:InventoryFlower)=>Promise<Blob|null>;
  chef:(id:number,version:string,value:ChefAppearance)=>Promise<Blob|null>;
  wand:(id:number,version:string,value:WandBaseAppearance&{sourceItemId:number})=>Promise<Blob|null>;
  palette:(id:number,version:string,value:InventoryPalette)=>Promise<Blob|null>;
 };
};
function check(ok:unknown):asserts ok{if(!ok)throw Error('INVENTORY_ROUTE_CANDIDATE_INVALID');}
function obj(v:unknown):Record<string,unknown>{check(v!==null&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>;}
function id(v:unknown):number{check(typeof v==='number'&&Number.isSafeInteger(v)&&v>0&&v<=0x7fffffff);return v;}
function list(v:unknown):unknown[]{check(Array.isArray(v)&&v.length<=100000);return v;}
function pinCheck(p:InventoryRoutePin){check(/^\d+\.\d+\.\d+$/.test(p.version)&&SHA.test(p.receiptFileSha256));}
function rootCheck(root:string){check(root.startsWith('/')&&root.endsWith('/')&&!root.includes('..')&&!root.includes('//')&&!root.includes('\\')&&!/[?#]/.test(root));}
function isFamily(kind:Kind):kind is Family{return (FAMILY as readonly string[]).includes(kind);}
const KINDS:readonly string[]=[...FAMILY,'original-base','original-override','source-placeholder','native-result','unknown'];
export function decodeInventoryRouteCandidate(value:unknown,pin:InventoryRoutePin):ReadonlyMap<number,Route>{
 pinCheck(pin);const v=obj(value);
 check(v.schema==='HKIA.IconReleaseCandidate.1'&&v.version===pin.version&&v.approval==='review-required'&&v.automaticReleaseActivationAuthorized===false);
 const rows=list(v.routes),routes=new Map<number,Route>(),missing=new Set<number>(),results=new Map<number,number>();
 check(rows.length>0&&rows.length===v.definitionCount);
 for(const raw of rows){
  const r=obj(raw),itemId=id(r.itemId),kind=r.kind;
  check(!routes.has(itemId)&&typeof kind==='string'&&KINDS.includes(kind));
  const blockers=list(r.sourceBlockers);
  check(blockers.length<=32&&blockers.every(b=>typeof b==='string'&&/^[a-z][a-z0-9-]{0,127}$/.test(b))&&new Set(blockers).size===blockers.length);
  if(blockers.length)missing.add(itemId);
  if(kind==='unknown')check(blockers.length>0);
  const targetItemId=kind==='native-result'?id(r.targetItemId):undefined;
  if(targetItemId!==undefined){check(targetItemId!==itemId);results.set(itemId,targetItemId);}
  else check(r.targetItemId===undefined);
  routes.set(itemId,{itemId,kind:kind as Kind,sourceBlockers:blockers as string[],targetItemId});
 }
 const missingIds=list(v.unresolvedInventorySourceItemIds).map(id);
 check(new Set(missingIds).size===missingIds.length&&missingIds.length===missing.size&&missingIds.every(i=>missing.has(i)));
 const resultRows=list(v.nativeResultRoutes),seen=new Set<number>();
 for(const row of resultRows){
  check(Array.isArray(row)&&row.length===2);
  const i=id(row[0]),t=id(row[1]),target=routes.get(t),route=routes.get(i);
  check(!seen.has(i)&&results.get(i)===t&&target&&target.kind!=='native-result'&&route);
  check(target.sourceBlockers.every(b=>route.sourceBlockers.includes(b)));
  if(isFamily(target.kind)||target.kind==='unknown')check(route.sourceBlockers.includes('unreviewed-dynamic-result-target'));
  seen.add(i);
 }
 check(seen.size===results.size);
 return routes;
}

/** Load the route table exactly once per reviewed release; retry a failed
 * receipt delivery. Source providers are same-release adapters and never
 * substitute another Item ID on a source failure. */
export function createVersionedInventoryArtwork(root:string,pin:InventoryRoutePin,providers:InventoryArtProviders,load=loadVerifiedArtAsset){
 pinCheck(pin);rootCheck(root);
 let pending:Promise<ReadonlyMap<number,Route>>|undefined;
 const routes=()=>pending??=(async()=>decodeInventoryRouteCandidate(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(
  await load(root,'release-candidate.json',pin.receiptFileSha256,16*1024*1024))),pin))().catch(e=>{pending=undefined;throw e;});
 return async(itemId:number,version:string,appearance?:InventoryArtAppearance):Promise<InventoryArtwork|null>=>{
  try{
   if(version!==pin.version)return null;
   id(itemId);const table=await routes(),own=table.get(itemId);
   if(!own||own.sourceBlockers.length)return null;
   const row=own.kind==='native-result'?table.get(own.targetItemId!):own;
   if(!row||row.sourceBlockers.length||row.kind==='native-result'||row.kind==='unknown')return null;
   const sourceItemId=row.itemId,kind=row.kind;
   let art:SourceArt|null=null,fidelity:InventoryArtwork['fidelity']='original';
   if(kind==='original-base')art=await providers.base(sourceItemId,version);
   else if(kind==='original-override')art=await providers.override(sourceItemId,version);
   else if(kind==='source-placeholder'){art=await providers.placeholder(sourceItemId,version);fidelity='source-placeholder';}
   else if(isFamily(kind)){
    if(own.kind==='native-result')return null;
    if(!appearance){art=await providers.family.original(sourceItemId,version);fidelity='original-base-only';}
    else{
     if(appearance.kind!==kind)return null;
     fidelity='dynamic';
     switch(appearance.kind){
      case 'flower':art=await providers.family.flower(sourceItemId,version,appearance.value);break;
      case 'cafe':case 'boba':art=await providers.family.chef(sourceItemId,version,appearance.value);break;
      case 'palette':art=await providers.family.palette(sourceItemId,version,appearance.value);break;
      case 'wand':art=await providers.family.wand(sourceItemId,version,appearance.value);break;
     }
    }
   }
   return art?{itemId,sourceItemId,kind,fidelity,art}:null;
  }catch{return null;}
 };
}
