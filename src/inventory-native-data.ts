/** Source-only InventoryItemDefinitionAsset category metadata.
 * Serialized original game bytes are never distributed or sent to a server.
 * This is display classification only; Rust owns all save mutations.
 */
const SOURCE_SHA256='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0';
const DECODED_SHA256='1d9178ffead44300e89d2b600bf401d5a3914b8845104e32a8a423b0fc319fba';
const SOURCE_ITEMS=12163;
const FILE_SHA256='30116af6becce0b587d1613886a0191090792d2493e0a8367695b7096ea749bf';
export type NativeItemCategory={rawFlags:number;hasUiOverride:boolean;uiOverrideFlags:number};
export type NativeInventoryIndex=ReadonlyMap<number,NativeItemCategory>;
type SourceEnvelope={schema:string;version:string;source?:{sha256?:string;nativeTypeIndex?:number};count:number;encoding:string;palette:unknown;data:string;rawSha256:string};

function verifiedEnvelope(value:unknown):SourceEnvelope{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('NATIVE_INVENTORY_INDEX_INVALID');
 const v=value as SourceEnvelope;
 if(v.schema!=='HKIA.NativeInventoryCategoryIndex.1'||v.version!=='3.0.1'||
   v.source?.sha256!==SOURCE_SHA256||v.source.nativeTypeIndex!==3||v.count!==SOURCE_ITEMS||
   v.encoding!=='gzip+delta-uvarint+palette-u8'||v.rawSha256!==DECODED_SHA256||
   !Array.isArray(v.palette)||v.palette.length<1||v.palette.length>256||
   typeof v.data!=='string'||v.data.length<10000||v.data.length>150000||
   !/^[A-Za-z0-9+/]+={0,2}$/.test(v.data))throw Error('NATIVE_INVENTORY_INDEX_INVALID');
 for(const row of v.palette){
  if(!Array.isArray(row)||row.length!==3||row.some(x=>!Number.isInteger(x))||
    row[0]<-2147483648||row[0]>2147483647||
    (row[1]!==0&&row[1]!==1)||row[2]<-2147483648||row[2]>2147483647)
   throw Error('NATIVE_INVENTORY_INDEX_INVALID');
 }
 return v;
}

/** Validates source index structure and every positive original Item ID.
 * Sorted deltas are unsigned LEB128; index references a source-verbatim
 * [ItemCategory,HasUiOverridenItemCategory,UiOverridenItemCategory] tuple.
 */
export function decodeNativeInventoryIndex(value:unknown,decoded:Uint8Array):NativeInventoryIndex{
 const envelope=verifiedEnvelope(value);
 if(decoded.length<envelope.count*2||decoded.length>envelope.count*6)throw Error('NATIVE_INVENTORY_INDEX_INVALID');
 const palette=envelope.palette as number[][];
 const rows=new Map<number,NativeItemCategory>();
 let id=0,offset=0;
 for(let i=0;i<envelope.count;i++){
  let shift=0,delta=0,part=0;
  do{
   if(offset>=decoded.length||shift>28)throw Error('NATIVE_INVENTORY_INDEX_INVALID');
   part=decoded[offset++];delta+=(part&127)*2**shift;shift+=7;
  }while((part&128)!==0);
  if(delta<=0||!Number.isSafeInteger(delta)||id+delta>0x7fffffff||offset>=decoded.length)
   throw Error('NATIVE_INVENTORY_INDEX_INVALID');
  id+=delta;
  const index=decoded[offset++];
  const fields=palette[index];
  if(!fields)throw Error('NATIVE_INVENTORY_INDEX_INVALID');
  rows.set(id,{rawFlags:fields[0],hasUiOverride:fields[1]===1,uiOverrideFlags:fields[2]});
 }
 if(offset!==decoded.length||rows.size!==SOURCE_ITEMS)throw Error('NATIVE_INVENTORY_INDEX_INVALID');
 return rows;
}

/** Fail closed if source proof or compressed data integrity is absent. */
export async function loadNativeInventoryIndex(base:string):Promise<NativeInventoryIndex>{
 const response=await fetch(base+'inventory-native-categories.json');
 if(!response.ok)throw Error('NATIVE_INVENTORY_INDEX_UNAVAILABLE');
 const file=await response.arrayBuffer();
 if(file.byteLength>150000)throw Error('NATIVE_INVENTORY_INDEX_INVALID');
 const fileDigest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',file)),b=>b.toString(16).padStart(2,'0')).join('');
 if(fileDigest!==FILE_SHA256)throw Error('NATIVE_INVENTORY_INDEX_INVALID');
 const value:unknown=JSON.parse(new TextDecoder().decode(file));
 const envelope=verifiedEnvelope(value);
 const zipped=Uint8Array.from(atob(envelope.data),ch=>ch.charCodeAt(0));
 if(zipped.length>60000||typeof DecompressionStream==='undefined')throw Error('NATIVE_INVENTORY_INDEX_UNAVAILABLE');
 const input=new Blob([new Uint8Array(zipped).buffer]).stream();
 const data=new Uint8Array(await new Response(input.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==DECODED_SHA256)throw Error('NATIVE_INVENTORY_INDEX_INVALID');
 return decodeNativeInventoryIndex(envelope,data);
}
