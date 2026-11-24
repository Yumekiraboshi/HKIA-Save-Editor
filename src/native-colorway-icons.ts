/** Build-time colorized ORIGINAL 96px game UiIcon previews.
 * These are explicitly not game-shader-accurate color placement.
 * A source-based icon is preferred to any alternative 3D viewpoint.
 */
type NativeIconRecord={
 file:string;sha256:string;sourceSheetSha256:string;
 group:string;sheet:number;cell:number;dye:number;
 changedPixels:number;channels:number[];
 sourceType:'original-uiicon-pixel-recolor';fidelity:'approximate';
};
type NativeIconIndex={
 schema:'HKIA.NativeColorwayIcons.1';version:'3.0.1';
 records:Record<string,NativeIconRecord>;
 sourceFits?:unknown;
};
const ID=/^[1-9][0-9]{0,9}$/;
const SHA=/^[a-f0-9]{64}$/;
const GROUP=/^[a-z_]+$/;
type SourceFitFamily={
 anchorIds:number[];anchorSha256:string[];sharedUiIconPathId:string;
 group:string;sheet:number;cell:number;meanMae:number;worstMae:number;
 alphaIdentical:true;method:'bounded-two-channel-neutral-lighting-v1';
};
type SourceFitRecord={
 file:string;sha256:string;family:string;
 sourceType:'original-named-sprite-fit';fidelity:'approximate';
};
type SourceFitIndex={
 schema:'HKIA.SourceSpriteFit.1';fidelity:'approximate';
 families:Record<string,SourceFitFamily>;records:Record<string,SourceFitRecord>;
};
const FAMILY=/^[a-z][a-z0-9-]{2,90}$/;
/** Source-calibrated previews are still approximate. Preserve the older
 * validated preview if an optional reconstruction manifest is invalid. */
export function parseSourceFits(raw:unknown,base:string,original:Record<string,NativeIconRecord>):Record<string,string>{
 const index=raw as SourceFitIndex;
 if(!index||index.schema!=='HKIA.SourceSpriteFit.1'||index.fidelity!=='approximate'||
  !index.families||typeof index.families!=='object'||Array.isArray(index.families)||
  !index.records||typeof index.records!=='object'||Array.isArray(index.records)||
  Object.keys(index.families).length>369||Object.keys(index.records).length>6000||
  !base.startsWith('/')||!base.endsWith('/')||base.includes('..')||
  base.includes('\\')||base.includes('//'))throw Error('SOURCE_FIT_INDEX_INVALID');
 for(const [name,f] of Object.entries(index.families)){
  if(!FAMILY.test(name)||!f||!Array.isArray(f.anchorIds)||f.anchorIds.length<3||
   f.anchorIds.length>20||new Set(f.anchorIds).size!==f.anchorIds.length||
   !f.anchorIds.every(id=>Number.isInteger(id)&&id>0&&id<=0x7fffffff)||
   !Array.isArray(f.anchorSha256)||f.anchorSha256.length!==f.anchorIds.length||
   !f.anchorSha256.every(hash=>typeof hash==='string'&&SHA.test(hash))||
   !/^-?[1-9][0-9]{0,18}$/.test(f.sharedUiIconPathId)||
   !GROUP.test(f.group)||!Number.isInteger(f.sheet)||f.sheet<0||f.sheet>250||
   !Number.isInteger(f.cell)||f.cell<0||f.cell>=144||
   !Number.isFinite(f.meanMae)||f.meanMae<0||f.meanMae>6||
   !Number.isFinite(f.worstMae)||f.worstMae<f.meanMae||f.worstMae>9||
   f.alphaIdentical!==true||f.method!=='bounded-two-channel-neutral-lighting-v1')
   throw Error('SOURCE_FIT_FAMILY_INVALID');
 }
 const result:Record<string,string>={};
 for(const [id,r] of Object.entries(index.records)){
  if(!ID.test(id)||!r||!FAMILY.test(r.family)||!Object.hasOwn(index.families,r.family)||
   r.file!==id+'.png'||!SHA.test(r.sha256)||r.sourceType!=='original-named-sprite-fit'||
   r.fidelity!=='approximate'||!Object.hasOwn(original,id))
   throw Error('SOURCE_FIT_RECORD_INVALID');
  const f=index.families[r.family],s=original[id];
  if(f.anchorIds.includes(Number(id))||s.group!==f.group||s.sheet!==f.sheet||s.cell!==f.cell)
   throw Error('SOURCE_FIT_RECORD_SOURCE_MISMATCH');
  result[id]=base+'native-colorways/source-fit/'+id+'.png?v='+r.sha256;
 }
 return result;
}
export function parseNativeColorwayIcons(raw:unknown,base:string):Record<string,string>{
 const index=raw as NativeIconIndex;
 if(!index||index.schema!=='HKIA.NativeColorwayIcons.1'||
  index.version!=='3.0.1'||!index.records||
  typeof index.records!=='object'||Array.isArray(index.records)||
  !base.startsWith('/')||!base.endsWith('/')||
  base.includes('..')||base.includes('\\')||base.includes('//'))
  throw Error('NATIVE_COLORWAY_INDEX_INVALID');
 const entries=Object.entries(index.records);
 if(entries.length>6000)throw Error('NATIVE_COLORWAY_INDEX_OVERSIZE');
 const result:Record<string,string>={};
 for(const [id,record] of entries){
  if(!ID.test(id)||!record||typeof record!=='object'||
   record.file!==id+'.png'||!SHA.test(record.sha256)||
   !SHA.test(record.sourceSheetSha256)||!GROUP.test(record.group)||
   !Number.isInteger(record.sheet)||record.sheet<0||record.sheet>250||
   !Number.isInteger(record.cell)||record.cell<0||record.cell>=144||
   !Number.isInteger(record.dye)||record.dye<0||
   !Number.isInteger(record.changedPixels)||record.changedPixels<=8||
   record.sourceType!=='original-uiicon-pixel-recolor'||
   record.fidelity!=='approximate'||
   !Array.isArray(record.channels)||record.channels.length===0||
   record.channels.some(channel=>!Number.isInteger(channel)||channel<1||channel>5))
   throw Error('NATIVE_COLORWAY_RECORD_INVALID');
  // The generated filename is stable across deployments, but its pixel data is not.
  // Pin the URL to the source-verified PNG digest so a newly generated
  // colorway never silently reuses a previous browser/CDN cache entry.
  result[id]=base+'native-colorways/'+id+'.png?v='+record.sha256;
 }
 if(index.sourceFits!==undefined){
  try{Object.assign(result,parseSourceFits(index.sourceFits,base,index.records));}
  catch{/* optional higher-quality preview rejected; use validated original preview */}
 }
 return result;
}
export async function loadNativeColorwayIcons(base:string):Promise<Record<string,string>>{
 // Revalidate the manifest on each editor load. Its per-item PNG digests
 // provide immutable URLs after validation, preserving normal image caching.
 const response=await fetch(base+'native-colorways/index.json',{cache:'no-cache'});
 if(!response.ok)throw Error('NATIVE_COLORWAY_INDEX_NOT_FOUND');
 return parseNativeColorwayIcons(await response.json(),base);
}
