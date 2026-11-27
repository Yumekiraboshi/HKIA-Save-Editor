import aliases from '../data/wand-original-sprite-aliases-v3.0.1.json';
import type {PixelBuffer,SpriteOverlay} from './dynamic-sprite-raster';
import {loadVerifiedArtAsset,loadOpaqueArtTexture,type TextureAsset} from './dynamic-art-assets';

const ROOT=import.meta.env.BASE_URL+'dynamic-wand-art/candidate-source/';
export const WAND_NON_SQUARE_SOURCE_SHA='950095992ecb78341afb1cf6c5c2afaf16de8b6b365cf66c8fcb66c692d7096a';
const NON_SQUARE_IDS=[371479572,583339916,803563219,1057045178,1314269583] as const;
export const WAND_CANDIDATE_SOURCE_SHA='1b006f3ed28cfb16f4f25738d1d57ec2f86a447bf9e717a85124c3827d78dd09';
const ID=/^[1-9][0-9]{0,9}$/;
const PID=/^-?[1-9][0-9]{0,18}$/;
const HASH=/^[a-f0-9]{64}$/;
type Transform=Pick<SpriteOverlay,'scale'|'offsetPercent'|'rotation'>;
type Row=readonly [string,number,number,string,string,number];
type Manifest={schema:string;version:string;definitionsSha256:string;atlasSha256:string;ingredientBitsetSha256:string;sampleSize:number;sampleOrigin:number[];logicalSize:number;scale:number;offsetPercent:number[];rotation:number;columns:number;rowsPerSheet:number;alphaOffsetY:number;textures:TextureAsset[];sprites:Row[];items:Record<string,string>};
type Binding={manifest:Manifest;rows:ReadonlyMap<string,Row>;aliasRows:ReadonlyMap<number,Row>};
export function decodeWandCandidateSource(raw:unknown):Binding{
 const m=raw as Manifest;
 if(!m||m.schema!=='HKIA.WandSampledOriginalSubIcon.1'||m.version!=='3.0.1'||
  m.definitionsSha256!=='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0'||
  m.atlasSha256!=='04c1f4c191b0a821a0bbcb15e67a75bec85cf343a0b2e875ee8e525e1e8dfc7b'||
  m.ingredientBitsetSha256!=='433ec9faa61477cfc61bb069222522f2daa82f3c89d9c9474223a59e6e5afcca'||
  m.sampleSize!==34||m.sampleOrigin?.length!==2||m.sampleOrigin[0]!==4||m.sampleOrigin[1]!==4||
  m.logicalSize!==84||m.scale!==Math.fround(.4)||m.offsetPercent?.length!==2||m.offsetPercent[0]!==-.25||m.offsetPercent[1]!==.25||
  m.rotation!==0||m.columns!==24||m.rowsPerSheet!==24||m.alphaOffsetY!==816||
  !Array.isArray(m.textures)||m.textures.length!==6||!Array.isArray(m.sprites)||m.sprites.length!==3150||
  !m.items||typeof m.items!=='object'||Array.isArray(m.items)||Object.keys(m.items).length!==8601)throw Error('WAND_CANDIDATE_SOURCE');
 for(const [i,t] of m.textures.entries()){
  if(!t||t.file!=='wand-candidate-source-'+String(i).padStart(2,'0')+'.webp'||t.width!==816||t.height!==1632||
   !Number.isInteger(t.bytes)||t.bytes<1||t.bytes>1024*1024||!HASH.test(t.sha256)||!HASH.test(t.rgbSha256))throw Error('WAND_CANDIDATE_TEXTURE');
 }
 const rows=new Map<string,Row>();let direct=0;
 for(const [i,r] of m.sprites.entries()){
  if(!Array.isArray(r)||r.length!==6||typeof r[0]!=='string'||!PID.test(r[0])||rows.has(r[0])||
   r[1]!==Math.floor(i/576)||r[2]!==i%576||typeof r[3]!=='string'||!PID.test(r[3])||
   typeof r[4]!=='string'||!/^[a-f0-9]{48}$/.test(r[4])||!([0,1].includes(r[5])))throw Error('WAND_CANDIDATE_ROW');
  rows.set(r[0],r);direct+=r[5];
 }
 if(direct!==9)throw Error('WAND_CANDIDATE_DIRECT');
 const referenced=new Set<string>();
 for(const [id,pid] of Object.entries(m.items)){
  if(!ID.test(id)||Number(id)>0x7fffffff||!rows.has(pid))throw Error('WAND_CANDIDATE_ITEM');
  referenced.add(pid);
 }
 if(referenced.size!==rows.size)throw Error('WAND_CANDIDATE_COVERAGE');
 const aliasRows=new Map<number,Row>();
 if(aliases.schema!=='HKIA.WandOriginalSpriteAliases.1'||aliases.version!==m.version||
  aliases.definitionsSha256!==m.definitionsSha256||aliases.candidateManifestSha256!==WAND_CANDIDATE_SOURCE_SHA||
  aliases.count!==206||aliases.rows.length!==206)throw Error('WAND_ALIAS_SOURCE');
 let last=0;const used=new Set<string>();
 for(const [id,pid] of aliases.rows){
  if(typeof id!=='number'||!Number.isInteger(id)||id<=last||id>0x7fffffff||Object.hasOwn(m.items,String(id))||
   typeof pid!=='string'||pid==='-6646601456236922891')throw Error('WAND_ALIAS_ITEM');
  const row=rows.get(pid);if(!row)throw Error('WAND_ALIAS_SPRITE');
  aliasRows.set(id,row);used.add(pid);last=id;
 }
 if(used.size!==179)throw Error('WAND_ALIAS_COVERAGE');
 return {manifest:m,rows,aliasRows};
}
export function candidateWandSprite(binding:Binding,itemId:number,transform:Transform):Row|undefined{
 if(!Number.isInteger(itemId)||itemId<=0||itemId>0x7fffffff||
  transform.scale!==Math.fround(.4)||transform.offsetPercent[0]!==-.25||transform.offsetPercent[1]!==.25||transform.rotation!==0)return;
 return Object.hasOwn(binding.manifest.items,String(itemId))?binding.rows.get(binding.manifest.items[String(itemId)]):binding.aliasRows.get(itemId);
}
/** The original source sprite was sampled once at the native transform's
 * 34 occupied pixel centers on this editor's fixed 84px content grid.
 * Place those samples directly on the same centers (no second resize).
 * All tinting and alpha composition with the wand base stay on demand. */
export function sampledWandOverlay(texture:PixelBuffer,row:Row):SpriteOverlay{
 return sampledCellOverlay(texture,row[2]%24*34,Math.floor(row[2]/24)*34,816);
}
function sampledCellOverlay(texture:PixelBuffer,x:number,y:number,alphaOffsetY:number):SpriteOverlay{
 return {texture,sampleRect:[x,y,34,34],trim:[0,0,34,34],alphaOffsetY,
  logicalWidth:34,logicalHeight:34,scale:34/84,offsetPercent:[-.25,.25],rotation:0,
  sampleClamp:[x+.5,y+.5,x+33.5,y+33.5]};
}
let loading:Promise<Binding>|undefined;
function source(){
 if(!loading)loading=(async()=>{
  const bytes=await loadVerifiedArtAsset(ROOT,'index.json',WAND_CANDIDATE_SOURCE_SHA,634497,634497);
  return decodeWandCandidateSource(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
 })().catch(e=>{loading=undefined;throw e;});
 return loading;
}
type NonSquareRow={itemId:number;spritePathId:string;definitionPathId:string;texturePathId:string;logicalSize:[number,number];cell:number;kind:number;format:number};
type NonSquareManifest={schema:string;version:string;definitionsSha256:string;atlasSha256:string;sampleSize:number;sampleOrigin:number[];logicalSize:number;scale:number;offsetPercent:number[];rotation:number;alphaOffsetY:number;texture:TextureAsset;rows:NonSquareRow[]};
export function decodeWandNonSquareSource(raw:unknown):NonSquareManifest{
 const m=raw as NonSquareManifest;
 if(!m||m.schema!=='HKIA.WandNonSquareSource.1'||m.version!=='3.0.1'||
  m.definitionsSha256!=='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0'||m.atlasSha256!=='04c1f4c191b0a821a0bbcb15e67a75bec85cf343a0b2e875ee8e525e1e8dfc7b'||
  m.sampleSize!==34||m.sampleOrigin?.length!==2||m.sampleOrigin[0]!==4||m.sampleOrigin[1]!==4||m.logicalSize!==84||m.scale!==Math.fround(.4)||m.offsetPercent?.length!==2||m.offsetPercent[0]!==-.25||m.offsetPercent[1]!==.25||m.rotation!==0||m.alphaOffsetY!==34||
  m.texture?.file!=='wand-nonsquare.webp'||m.texture.width!==170||m.texture.height!==68||m.texture.bytes!==6226||m.texture.sha256!=='e1f90466bf5ebdb1c1810e83f7b2510bffd201d658821f189bcee57f8ec4fd95'||m.texture.rgbSha256!=='0e85b7addc5cabd49ed3309bd6651b5b8b44564161afc0df149d94c5882a204e'||
  !Array.isArray(m.rows)||m.rows.length!==NON_SQUARE_IDS.length||new Set(m.rows.map(r=>r.spritePathId)).size!==5)throw Error('WAND_NON_SQUARE_SOURCE');
 for(const [i,r] of m.rows.entries())if(!r||r.itemId!==NON_SQUARE_IDS[i]||r.cell!==i||![r.spritePathId,r.definitionPathId,r.texturePathId].every(v=>typeof v==='string'&&PID.test(v))||
  !Array.isArray(r.logicalSize)||r.logicalSize.length!==2||r.logicalSize.some(n=>!Number.isFinite(n)||n<=0)||r.logicalSize[0]===r.logicalSize[1]||r.kind!==(i===2?0:1)||r.format!==(i===2?12:3))throw Error('WAND_NON_SQUARE_ROW');
 return m;
}
let nonSquareLoading:Promise<NonSquareManifest>|undefined;
function nonSquareSource(){
 if(!nonSquareLoading)nonSquareLoading=(async()=>decodeWandNonSquareSource(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await loadVerifiedArtAsset(ROOT,'wand-nonsquare.json',WAND_NON_SQUARE_SOURCE_SHA,8192)))))().catch(e=>{nonSquareLoading=undefined;throw e;});
 return nonSquareLoading;
}
export async function loadSampledWandOverlay(itemId:number,transform:Transform):Promise<{spritePathId:string;sourceHash:string;overlay:SpriteOverlay}|null>{
 try{
  if((NON_SQUARE_IDS as readonly number[]).includes(itemId)){
   if(transform.scale!==Math.fround(.4)||transform.offsetPercent[0]!==-.25||transform.offsetPercent[1]!==.25||transform.rotation!==0)return null;
   const m=await nonSquareSource(),r=m.rows.find(r=>r.itemId===itemId);if(!r)return null;
   // Source aspect and original trim were applied at sample time; the 34px
   // square is just the target sample grid, with transparent unused pixels.
   return {spritePathId:r.spritePathId,sourceHash:WAND_NON_SQUARE_SOURCE_SHA,overlay:sampledCellOverlay(await loadOpaqueArtTexture(ROOT,m.texture),r.cell*34,0,34)};
  }
  const b=await source(),r=candidateWandSprite(b,itemId,transform);
  if(!r)return null;
  return {spritePathId:r[0],sourceHash:WAND_CANDIDATE_SOURCE_SHA,overlay:sampledWandOverlay(await loadOpaqueArtTexture(ROOT,b.manifest.textures[r[1]]),r)};
 }catch{return null;}
}
