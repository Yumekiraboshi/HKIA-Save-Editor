/** Materialize source-original 96px WebP assets from bounded stored ZIPs.
 * Only derived icon files are packed, never original game bundles or saves.
 * All bytes and identities are validated before writing any file. */
import {readFileSync,readdirSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ID=/^[1-9][0-9]{0,9}\.webp$/;
const PACK=/^atlas-colorways-\d{2}\.zip$/;
const HASH=/^[a-f0-9]{64}$/;
export function readStoredIconPack(bytes,expected){
 if(!Buffer.isBuffer(bytes)||bytes.length>4_000_000||!expected||expected.size<1||expected.size>144)
  throw Error('SOURCE_PACK_BOUNDS');
 let cursor=0;const files=new Map();
 while(cursor+30<=bytes.length&&bytes.readUInt32LE(cursor)===0x04034b50){
  const flags=bytes.readUInt16LE(cursor+6),method=bytes.readUInt16LE(cursor+8);
  const packed=bytes.readUInt32LE(cursor+18),size=bytes.readUInt32LE(cursor+22);
  const namesize=bytes.readUInt16LE(cursor+26),extrasize=bytes.readUInt16LE(cursor+28);
  const at=cursor+30+namesize+extrasize,end=at+packed;
  if(flags!==0||method!==0||packed!==size||namesize>16||extrasize!==0||size<25||size>200_000||end>bytes.length)
   throw Error('SOURCE_PACK_ENTRY');
  const name=bytes.toString('ascii',cursor+30,cursor+30+namesize);
  if(!ID.test(name)||!expected.has(name)||files.has(name))throw Error('SOURCE_PACK_FILENAME');
  const data=bytes.subarray(at,end);
  if(sha(data)!==expected.get(name)||data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,16)!=='WEBPVP8L'||data[20]!==0x2f)
   throw Error('SOURCE_PACK_IMAGE');
  const dim=data.readUInt32LE(21);
  if((dim&0x3fff)+1!==96||((dim>>>14)&0x3fff)+1!==96)throw Error('SOURCE_PACK_DIMENSIONS');
  files.set(name,data);cursor=end;
 }
 if(files.size!==expected.size||cursor+4>bytes.length||bytes.readUInt32LE(cursor)!==0x02014b50)
  throw Error('SOURCE_PACK_COVERAGE');
 // Pack SHA-256 is checked by the caller, including ZIP directory bytes.
 return files;
}
export function unpackSourceColorways(root){
 const out=join(root,'public/source-colorways'),packDir=join(root,'data/source-colorway-packs');
 const index=JSON.parse(readFileSync(join(out,'index.json'),'utf8'));
 if(index.schema!=='HKIA.NamedNativeColorwaySprite.1'||index.version!=='3.0.1'||index.runtimeUiIconReferenceMatches!==false||
  !Array.isArray(index.atlasOriginalPacks)||index.atlasOriginalPacks.length>64)
  throw Error('SOURCE_PACK_INDEX');
 const packs=new Map(),expected=new Map(),files=new Map();
 for(const p of index.atlasOriginalPacks){
  if(!PACK.test(p.file)||!HASH.test(p.sha256)||!Number.isInteger(p.count)||p.count<1||p.count>144||packs.has(p.file))
   throw Error('SOURCE_PACK_METADATA');
  packs.set(p.file,p);expected.set(p.file,new Map());
 }
 for(const [id,r] of Object.entries(index.records)){
  if(r.file!==id+'.webp'||!ID.test(r.file)||!HASH.test(r.sha256))throw Error('SOURCE_PACK_RECORD');
  if(r.pack===undefined){
   if(sha(readFileSync(join(out,r.file)))!==r.sha256)throw Error('SOURCE_PACK_EXISTING_IMAGE');
   continue;
  }
  if(r.sourceSpriteBundle!=='atlas_global'||r.sourceKind!=='atlas'||!expected.has(r.pack))
   throw Error('SOURCE_PACK_PROVENANCE');
  expected.get(r.pack).set(r.file,r.sha256);
 }
 const listed=readdirSync(packDir).filter(name=>name.endsWith('.zip'));
 if(listed.length!==packs.size||listed.some(name=>!packs.has(name)))throw Error('SOURCE_PACK_ORPHAN');
 for(const [name,p] of packs){
  const bytes=readFileSync(join(packDir,name)),entries=expected.get(name);
  if(sha(bytes)!==p.sha256||entries.size!==p.count)throw Error('SOURCE_PACK_HASH');
  for(const [file,data] of readStoredIconPack(bytes,entries)){
   if(files.has(file))throw Error('SOURCE_PACK_DUPLICATE');
   files.set(file,data);
  }
 }
 // Refuse any pre-existing unmanaged or altered image before materializing.
 for(const file of readdirSync(out).filter(name=>name.endsWith('.webp'))){
  const r=index.records[file.slice(0,-5)];
  if(!r||sha(readFileSync(join(out,file)))!==r.sha256)throw Error('SOURCE_PACK_UNTRACKED_OR_CHANGED');
 }
 mkdirSync(out,{recursive:true});
 for(const [file,data] of files)if(!existsSync(join(out,file)))writeFileSync(join(out,file),data,{flag:'wx'});
 console.log('HKIA_ORIGINAL_COLORWAY_PACKS '+files.size+' materialized; '+Object.keys(index.records).length+' original sprites');
 return files.size;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 unpackSourceColorways(fileURLToPath(new URL('..',import.meta.url)));
