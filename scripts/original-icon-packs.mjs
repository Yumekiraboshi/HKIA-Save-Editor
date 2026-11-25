/** Shared build-only reader for original collection icon archives. No browser dependencies. */
import {readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const GROUP=/^[a-z_]+$/;
const SIDE=96;
const GROUP_PARTS={collections_group_events:6};
export function readSourceIconZip(path,files){
 const b=readFileSync(path);
 let cursor=0;
 while(cursor+30<=b.length&&b.readUInt32LE(cursor)===0x04034b50){
  const flags=b.readUInt16LE(cursor+6),method=b.readUInt16LE(cursor+8);
  const compressed=b.readUInt32LE(cursor+18),uncompressed=b.readUInt32LE(cursor+22);
  const nameSize=b.readUInt16LE(cursor+26),extraSize=b.readUInt16LE(cursor+28);
  const start=cursor+30+nameSize+extraSize,end=start+compressed;
  if(flags&8||method!==0||compressed!==uncompressed||
   end>b.length||nameSize>80)throw Error('ORIGINAL_UICON_ZIP_INVALID');
  const name=b.toString('utf8',cursor+30,cursor+30+nameSize);
  if(!/^(index\.json|sheet-\d{3}\.webp)$/.test(name)||files.has(name))
   throw Error('ORIGINAL_UICON_ZIP_INVALID');
  const data=b.subarray(start,end);
  if(name.endsWith('.webp')&&(data.toString('ascii',0,4)!=='RIFF'||
   data.toString('ascii',8,12)!=='WEBP'))throw Error('ORIGINAL_UICON_WEBP_INVALID');
  files.set(name,Buffer.from(data));
  cursor=end;
 }
 if(!cursor)throw Error('ORIGINAL_UICON_ZIP_EMPTY');
}
export function collectNativeSprites(group,root=ROOT){
 if(!GROUP.test(group))throw Error('ORIGINAL_UICON_GROUP_INVALID');
 const parts=GROUP_PARTS[group]??1;
 const files=new Map();
 for(let p=0;p<parts;p++){
  const suffix=p?'-'+p:'';
  readSourceIconZip(join(root,'public/item-packs/'+group+suffix+'.zip'),files);
 }
 const meta=JSON.parse(files.get('index.json')?.toString('utf8')??'null');
 if(meta?.schema!=='HKIA.SheetIcons.1'||meta.group!==group||
  meta.size!==SIDE||meta.columns!==12||!Array.isArray(meta.records))
  throw Error('ORIGINAL_UICON_INDEX_INVALID');
 const sprites=new Map();
 for(const rec of meta.records){
  if(!Array.isArray(rec)||rec.length!==3)throw Error('ORIGINAL_UICON_INDEX_INVALID');
  const [itemId,sheet,cell]=rec;
  if(!Number.isInteger(itemId)||!Number.isInteger(sheet)||!Number.isInteger(cell)||
   itemId<=0||sheet<0||cell<0||cell>=144||sprites.has(String(itemId))||
   !files.has('sheet-'+String(sheet).padStart(3,'0')+'.webp'))
   throw Error('ORIGINAL_UICON_ENTRY_INVALID');
  sprites.set(String(itemId),{sheet,cell});
 }
 return {sprites,files};
}

export function sourceIconGroups(root=ROOT){
 return readdirSync(join(root,'public/item-packs'))
  .filter(name=>/^(?:collection|collections)_group_[a-z]+\.zip$/.test(name))
  .map(name=>name.slice(0,-4)).sort();
}
