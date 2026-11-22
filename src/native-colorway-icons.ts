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
};
const ID=/^[1-9][0-9]{0,9}$/;
const SHA=/^[a-f0-9]{64}$/;
const GROUP=/^[a-z_]+$/;
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
  result[id]=base+'native-colorways/'+id+'.png';
 }
 return result;
}
export async function loadNativeColorwayIcons(base:string):Promise<Record<string,string>>{
 const response=await fetch(base+'native-colorways/index.json',{cache:'force-cache'});
 if(!response.ok)throw Error('NATIVE_COLORWAY_INDEX_NOT_FOUND');
 return parseNativeColorwayIcons(await response.json(),base);
}
