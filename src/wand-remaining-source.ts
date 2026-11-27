import type {SpriteOverlay} from './dynamic-sprite-raster';
import {loadVerifiedArtAsset,loadOpaqueArtTexture,type TextureAsset} from './dynamic-art-assets';
import {sampledWandOverlay} from './wand-candidate-source';

const ROOT=import.meta.env.BASE_URL+'dynamic-wand-art/remaining-source/';
export const WAND_REMAINING_SOURCE_SHA='7b4834de7a2dbc86bb1fb7592c84da17630605b76a01c4f396f833da616d94ac';
const PID=/^-?[1-9][0-9]{0,18}$/;
const HASH=/^[a-f0-9]{64}$/;
type Transform=Pick<SpriteOverlay,'scale'|'offsetPercent'|'rotation'>;
type Row=readonly [string,number,number,string,string,number,number,string];
type Manifest={schema:string;version:string;definitionsSha256:string;atlasSha256:string;sampleSize:number;sampleOrigin:number[];logicalSize:number;scale:number;offsetPercent:number[];rotation:number;columns:number;rowsPerSheet:number;alphaOffsetY:number;textures:TextureAsset[];sprites:Row[];items:Record<string,string>;mipmappedExcluded:[number,string][]};
type Binding={manifest:Manifest;rows:ReadonlyMap<string,Row>};
function validId(id:unknown):id is number{return typeof id==='number'&&Number.isInteger(id)&&id>0&&id<=0x7fffffff}
export function decodeWandRemainingSource(raw:unknown):Binding{
 const m=raw as Manifest;
 if(!m||m.schema!=='HKIA.WandRemainingOriginalSprites.1'||m.version!=='3.0.1'||
  m.definitionsSha256!=='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0'||
  m.atlasSha256!=='04c1f4c191b0a821a0bbcb15e67a75bec85cf343a0b2e875ee8e525e1e8dfc7b'||
  m.sampleSize!==34||m.sampleOrigin?.length!==2||m.sampleOrigin[0]!==4||m.sampleOrigin[1]!==4||m.logicalSize!==84||
  m.scale!==Math.fround(.4)||m.offsetPercent?.length!==2||m.offsetPercent[0]!==-.25||m.offsetPercent[1]!==.25||
  m.rotation!==0||m.columns!==24||m.rowsPerSheet!==24||m.alphaOffsetY!==816||
  !Array.isArray(m.textures)||m.textures.length!==4||!Array.isArray(m.sprites)||m.sprites.length!==1816||
  !m.items||typeof m.items!=='object'||Array.isArray(m.items)||Object.keys(m.items).length!==3152||
  !Array.isArray(m.mipmappedExcluded)||m.mipmappedExcluded.length!==47)throw Error('WAND_REMAINING_SOURCE');
 for(const [i,t] of m.textures.entries()){
  if(!t||t.file!=='wand-remainder-'+String(i).padStart(2,'0')+'.webp'||t.width!==816||t.height!==1632||
   !Number.isInteger(t.bytes)||t.bytes<1||t.bytes>1024*1024||!HASH.test(t.sha256)||!HASH.test(t.rgbSha256))throw Error('WAND_REMAINING_TEXTURE');
 }
 const rows=new Map<string,Row>();
 for(const [i,r] of m.sprites.entries()){
  if(!Array.isArray(r)||r.length!==8||typeof r[0]!=='string'||!PID.test(r[0])||rows.has(r[0])||
   r[1]!==Math.floor(i/576)||r[2]!==i%576||typeof r[3]!=='string'||!PID.test(r[3])||
   typeof r[4]!=='string'||!/^[a-f0-9]{48}$/.test(r[4])||![0,1].includes(r[5])||![3,4,12].includes(r[6])||
   typeof r[7]!=='string'||!HASH.test(r[7]))throw Error('WAND_REMAINING_ROW');
  rows.set(r[0],r);
 }
 const referenced=new Set<string>();
 for(const [id,pid] of Object.entries(m.items)){
  if(!/^[1-9][0-9]{0,9}$/.test(id)||!validId(Number(id))||!rows.has(pid))throw Error('WAND_REMAINING_ITEM');
  referenced.add(pid);
 }
 if(referenced.size!==rows.size)throw Error('WAND_REMAINING_COVERAGE');
 const excluded=new Set<number>();
 for(const [id,pid] of m.mipmappedExcluded){
  if(!validId(id)||excluded.has(id)||Object.hasOwn(m.items,String(id))||typeof pid!=='string'||!PID.test(pid)||rows.has(pid))throw Error('WAND_REMAINING_EXCLUDED');
  excluded.add(id);
 }
 return {manifest:m,rows};
}
export function remainingWandSprite(binding:Binding,itemId:number,transform:Transform):Row|undefined{
 if(!validId(itemId)||transform.scale!==Math.fround(.4)||transform.offsetPercent[0]!==-.25||transform.offsetPercent[1]!==.25||transform.rotation!==0||
  !Object.hasOwn(binding.manifest.items,String(itemId)))return undefined;
 return binding.rows.get(binding.manifest.items[String(itemId)]);
}
let loading:Promise<Binding>|undefined;
function source(){
 if(!loading)loading=(async()=>decodeWandRemainingSource(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await loadVerifiedArtAsset(ROOT,'index.json',WAND_REMAINING_SOURCE_SHA,431446,431446)))))().catch(e=>{loading=undefined;throw e;});
 return loading;
}
export async function loadRemainingWandOverlay(itemId:number,transform:Transform):Promise<{spritePathId:string;sourceHash:string;overlay:SpriteOverlay}|null>{
 try{
  if(!validId(itemId)||transform.scale!==Math.fround(.4)||transform.offsetPercent[0]!==-.25||transform.offsetPercent[1]!==.25||transform.rotation!==0)return null;
  const b=await source(),r=remainingWandSprite(b,itemId,transform);if(!r)return null;
  const t=await loadOpaqueArtTexture(ROOT,b.manifest.textures[r[1]]);
  return {spritePathId:r[0],sourceHash:WAND_REMAINING_SOURCE_SHA,overlay:sampledWandOverlay(t,[r[0],r[1],r[2],r[3],r[4],r[5]])};
 }catch{return null;}
}
