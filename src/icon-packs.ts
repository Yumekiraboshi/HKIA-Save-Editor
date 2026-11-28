import packSource from '../data/collection-icon-pack-digests-v3.0.1.json';
export type NativeSheetAsset={root:string;file:string;sha256:string;bytes:number};
export type SpriteCell={url:string;x:number;y:number;group?:string;sheet?:number;cell?:number;nativeSheet?:NativeSheetAsset};
export type IconPack={group:string;entries:Record<string,SpriteCell>;dispose():void};
type PackIndex={schema:string;group:string;size:number;columns:number;records:Array<[number,number,number]>};
const NAME=/^(?:index\.json|sheet-\d{3}\.webp)$/;
const PART_COUNTS:Record<string,number>={collections_group_events:6};
const packDigests=new Map(packSource.rows.map(([name,bytes,sha])=>[String(name),{bytes:Number(bytes),sha:String(sha)}]));
/** Verify the exact committed ZIP bytes, using Git's blob object digest.
 * This detects accidental stale, damaged or substituted delivery, not a
 * signature or independent authentication of the origin. */
export async function verifyIconPackBytes(name:string,data:ArrayBuffer):Promise<void>{
 const source=packDigests.get(name);
 if(!source||data.byteLength!==source.bytes)throw Error('ICON_PACK_SOURCE_SIZE');
 const prefix=new TextEncoder().encode('blob '+data.byteLength+'\0');
 const input=new Uint8Array(prefix.length+data.byteLength);
 input.set(prefix);input.set(new Uint8Array(data),prefix.length);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1',input)),v=>v.toString(16).padStart(2,'0')).join('');
 if(hash!==source.sha)throw Error('ICON_PACK_SOURCE_HASH');
}

function readStoredZip(data:ArrayBuffer):Map<string,Uint8Array>{
 const bytes=new Uint8Array(data);
 const view=new DataView(data);
 const files=new Map<string,Uint8Array>();
 let position=0;
 while(position+4<=bytes.byteLength && view.getUint32(position,true)===0x04034b50){
  if(position+30>bytes.byteLength)throw Error('ICON_ZIP_INVALID');
  const flags=view.getUint16(position+6,true);
  const method=view.getUint16(position+8,true);
  const packed=view.getUint32(position+18,true);
  const unpacked=view.getUint32(position+22,true);
  const nameSize=view.getUint16(position+26,true);
  const extraSize=view.getUint16(position+28,true);
  const start=position+30+nameSize+extraSize;
  const end=start+packed;
  if((flags&8)!==0||method!==0||packed!==unpacked||end>bytes.byteLength||nameSize>80)throw Error('ICON_ZIP_INVALID');
  const filename=new TextDecoder().decode(bytes.subarray(position+30,position+30+nameSize));
  if(!NAME.test(filename)||files.has(filename))throw Error('ICON_ZIP_INVALID');
  const slice=bytes.slice(start,end);
  if(filename.endsWith('.webp')&&(slice.length<12||new TextDecoder('ascii').decode(slice.subarray(0,4))!=='RIFF'||new TextDecoder('ascii').decode(slice.subarray(8,12))!=='WEBP'))throw Error('ICON_WEBP_INVALID');
  files.set(filename,slice);
  position=end;
 }
 if(files.size===0)throw Error('ICON_ZIP_INVALID');
 return files;
}

function validateIndex(value:unknown,group:string):PackIndex{
 const v=value as PackIndex;
 if(!v||v.schema!=='HKIA.SheetIcons.1'||v.group!==group||v.size!==96||v.columns!==12||!Array.isArray(v.records)||v.records.length>15000)throw Error('ICON_MAP_INVALID');
 for(const r of v.records){
  if(!Array.isArray(r)||r.length!==3||!r.every(Number.isInteger)||r[0]<=0||r[1]<0||r[1]>250||r[2]<0||r[2]>=144)throw Error('ICON_MAP_INVALID');
 }
 return v;
}

export async function loadIconPack(group:string,base:string):Promise<IconPack>{
 if(!/^[a-z_]+$/.test(group))throw Error('ICON_GROUP_INVALID');
 const count=PART_COUNTS[group]??1;
 const urls:string[]=[];
 try{
  const indexed=new Map<string,Uint8Array>();
  const response=await Promise.all(Array.from({length:count},(_,i)=>
   fetch(base+'item-packs/'+group+(i?'-'+i:'')+'.zip')));
  if(response.some(r=>!r.ok))throw Error('ICON_FETCH_FAILED');
  let total=0;
  for(const [i,r] of response.entries()){
   const data=await r.arrayBuffer();
   total+=data.byteLength;if(total>20*1024*1024)throw Error('ICON_PACK_BUDGET');
   await verifyIconPackBytes(group+(i?'-'+i:'')+'.zip',data);
   for(const [k,v] of readStoredZip(data)){
    if(indexed.has(k))throw Error('ICON_DUPLICATE');
    indexed.set(k,v);
   }
  }
  const indexBytes=indexed.get('index.json');
  if(!indexBytes)throw Error('ICON_MAP_MISSING');
  const index=validateIndex(JSON.parse(new TextDecoder().decode(indexBytes)),group);
  const pages=new Map<number,string>();
  for(const [name,data] of indexed){
   if(!name.endsWith('.webp'))continue;
   const sheet=Number(name.slice(6,9));
   const blob=new Blob([data.buffer as ArrayBuffer],{type:'image/webp'});
   const url=URL.createObjectURL(blob);urls.push(url);
   pages.set(sheet,url);
  }
  const entries:Record<string,SpriteCell>={};
  for(const [id,sheet,cell] of index.records){
   const url=pages.get(sheet);
   if(!url)throw Error('ICON_SHEET_MISSING');
   if(Object.hasOwn(entries,String(id)))throw Error('ICON_MAP_DUPLICATE');
   entries[String(id)]={url,x:(cell%12)*96,y:Math.floor(cell/12)*96,group,sheet,cell};
  }
  return {group,entries,dispose(){urls.forEach(x=>URL.revokeObjectURL(x))}};
 }catch(e){
  urls.forEach(x=>URL.revokeObjectURL(x));
  throw e;
 }
}
