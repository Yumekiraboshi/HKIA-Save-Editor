import type {SpriteOverlay} from './dynamic-sprite-raster';
import {loadVerifiedArtAsset,loadOpaqueArtTexture,type TextureAsset} from './dynamic-art-assets';
const ROOT=import.meta.env.BASE_URL+'dynamic-wand-art/mip-source/';
export const WAND_MIP_SOURCE_SHA='173d88da94f5bdc04f9401a67d559cf245db9e45a1d8dbeea981844f7dd297c6';
const IDS=[2331500,44896622,80708366,85971728,111768402,204348434,208908113,259796064,329967663,387416829,580985473,609629546,633780906,666059867,726083933,782438519,930355949,1018091164,1126234156,1129021310,1151118535,1187123255,1202567481,1249971600,1363935481,1497838438,1519475918,1550127688,1554196663,1590594063,1603690900,1615817876,1617263408,1676807847,1726087820,1808367466,1918343605,1945115935,1975254441,1987248362,2002081880,2006231987,2024903123,2095079608,2106317580,2107465149,2118433790] as const;
const PID=/^-?[1-9][0-9]{0,18}$/;
const HASH=/^[a-f0-9]{64}$/;
type Transform=Pick<SpriteOverlay,'scale'|'offsetPercent'|'rotation'>;
type Row={itemId:number;spritePathId:string;texturePathId:string;renderKey:string;name:string;sourceTextureSha256:string;mipSha256:string;sampleRgbaSha256:string;cell:number};
type Manifest={schema:string;version:string;definitionsSha256:string;sampleSize:number;sampleOrigin:number[];logicalSize:number;scale:number;offsetPercent:number[];rotation:number;sourceSize:number;format:number;mipCount:number;filterMode:number;colorSpace:number;mipBias:number;mipLevel:number;columns:number;alphaOffsetY:number;texture:TextureAsset;rows:Row[]};
export function hasWandMipSource(id:number):boolean{return (IDS as readonly number[]).includes(id);}
export function decodeWandMipSource(raw:unknown):Manifest{
 const m=raw as Manifest;
 if(!m||m.schema!=='HKIA.WandMipSource.1'||m.version!=='3.0.1'||m.definitionsSha256!=='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0'||
 m.sampleSize!==34||m.sampleOrigin?.length!==2||m.sampleOrigin[0]!==4||m.sampleOrigin[1]!==4||m.logicalSize!==84||m.scale!==Math.fround(.4)||m.offsetPercent?.length!==2||m.offsetPercent[0]!==-.25||m.offsetPercent[1]!==.25||m.rotation!==0||
 m.sourceSize!==512||m.format!==10||m.mipCount!==10||m.filterMode!==1||m.colorSpace!==1||m.mipBias!==0||m.mipLevel!==4||m.columns!==10||m.alphaOffsetY!==170||
 m.texture?.file!=='wand-mip-source.webp'||m.texture.bytes!==72600||m.texture.width!==340||m.texture.height!==340||m.texture.sha256!=='5036ed1c7f0d08315364d34dff8f77a62cd10ec9d2a0f1f2c7120486fe23002a'||m.texture.rgbSha256!=='2331a7f7db1c49f8491bda36ac0102f10f42fe46429b37e9f58346fce66cadac'||
 !Array.isArray(m.rows)||m.rows.length!==IDS.length||new Set(m.rows.map(r=>r?.spritePathId)).size!==47||new Set(m.rows.map(r=>r?.texturePathId)).size!==47)throw Error('WAND_MIP_SOURCE');
 for(const [i,r] of m.rows.entries())if(!r||r.itemId!==IDS[i]||r.cell!==i||!PID.test(r.spritePathId)||!PID.test(r.texturePathId)||!/^[a-f0-9]{48}$/.test(r.renderKey)||!/^Pickup_HK50Card_Graphic[0-9]+_C$/.test(r.name)||![r.sourceTextureSha256,r.mipSha256,r.sampleRgbaSha256].every(h=>HASH.test(h)))throw Error('WAND_MIP_ROW');
 return m;
}
let loading:Promise<Manifest>|undefined;
function source(){
 if(!loading)loading=(async()=>decodeWandMipSource(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await loadVerifiedArtAsset(ROOT,'wand-mip-source.json',WAND_MIP_SOURCE_SHA,22293,22293)))))().catch(e=>{loading=undefined;throw e;});
 return loading;
}
/** Original mip 4, sampled at the same normalized pixel centers as other
 * source packs. Runtime game streaming state is not inferred. */
export async function loadWandMipOverlay(itemId:number,transform:Transform):Promise<{spritePathId:string;sourceHash:string;overlay:SpriteOverlay}|null>{
 if(!hasWandMipSource(itemId)||transform.scale!==Math.fround(.4)||transform.offsetPercent[0]!==-.25||transform.offsetPercent[1]!==.25||transform.rotation!==0)return null;
 try{
  const m=await source(),r=m.rows.find(r=>r.itemId===itemId);if(!r)return null;
  const x=r.cell%10*34,y=Math.floor(r.cell/10)*34;
  return {spritePathId:r.spritePathId,sourceHash:WAND_MIP_SOURCE_SHA,overlay:{texture:await loadOpaqueArtTexture(ROOT,m.texture),sampleRect:[x,y,34,34],trim:[0,0,34,34],alphaOffsetY:170,logicalWidth:34,logicalHeight:34,scale:34/84,offsetPercent:[-.25,.25],rotation:0,sampleClamp:[x+.5,y+.5,x+33.5,y+33.5]}};
 }catch{return null;}
}
