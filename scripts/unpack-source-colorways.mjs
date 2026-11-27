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
/** Build-only validation and extraction of the actual per-item dynamic sprites.
 * Keep the full provenance index private to the build and ship only digests.
 */
export function unpackDynamicColorways(root){
 const dir=join(root,'data/dynamic-colorway-packs'),out=join(root,'public/dynamic-colorways');
 const read=p=>JSON.parse(readFileSync(p,'utf8'));
 const index=read(join(dir,'index.json')),native=read(join(root,'public/native-dye-palettes.json'));
 const originals=read(join(root,'public/source-colorways/index.json'));
 const catalog=read(join(root,'public/catalog.json'));
 const overrideSource=read(join(root,'data/native-icon-override-source-v3.0.1.json'));
 if(overrideSource.schema!=='HKIA.NativeIconOverrideSource.1'||overrideSource.version!=='3.0.1'||overrideSource.steamDefinitionsSha256!==index.definitionsSha256||overrideSource.dynamicRoutesVerifiedByContainer!==true||overrideSource.directDefinitionRoutesVerifiedByContainer!==true||overrideSource.rows.length!==5384)throw Error('NATIVE_OVERRIDE_SOURCE');
 const overrides=new Map(overrideSource.rows.map(row=>[String(row[0]),row]));
 if(overrides.size!==5384)throw Error('NATIVE_OVERRIDE_DUPLICATE');
 const direct=overrideSource.rows.filter(row=>row[2]===0);
 if(direct.length!==39||sha(JSON.stringify(direct))!=='bf5b8aefa8f6da5f97c912684c319bcbecc412f28af0f4f941f35f6597d2774c')throw Error('NATIVE_OVERRIDE_DIRECT_SOURCE');
 for(const [id,, ,sprite,texture] of direct){
  const r=originals.records[String(id)];
  if(!r||r.sourceKind!=='direct'||r.sourceSpritePathId!==sprite||r.texturePathId!==texture)throw Error('NATIVE_OVERRIDE_DIRECT_PPTR '+id);
 }
 const itemKeys=new Map(catalog.items.map(r=>[String(r[0]),r[1]]));
 const sourceBundles=Array.from({length:11},(_,i)=>'dynamicinventory_icons_'+String(i+1).padStart(2,'0'));
 const shards=Array.from({length:11},(_,i)=>'index-'+String(i+1).padStart(2,'0')+'.json');
 if(index.schema!=='HKIA.DynamicOriginalColorways.1'||index.version!=='3.0.1'||
    index.definitionsSha256!==native.definitions_sha256||index.definitionsSha256!==originals.definitionsSha256||
    index.runtimeUiIconReferenceMatches!==false||index.coveredDyeItemCount!==5383||
    index.originalDynamicCount!==5344||index.existingOriginalCount!==362||
    JSON.stringify(index.recordFiles)!==JSON.stringify(shards)||
    !Array.isArray(index.sourceBundles)||index.sourceBundles.length!==11||
    !Array.isArray(index.packs)||index.packs.length!==35)throw Error('DYNAMIC_SOURCE_INDEX');
 const sources=new Map(),packs=new Map(),expected=new Map(),records=new Map(),fileBytes=new Map();
 for(const [i,b] of index.sourceBundles.entries()){
  if(b.name!==sourceBundles[i]||!HASH.test(b.sha256)||!/^CAB-[0-9a-f]{32}$/.test(b.cab)||
   !Number.isInteger(b.count)||b.count<1||b.count>500)throw Error('DYNAMIC_SOURCE_BUNDLE');
  sources.set(b.name,b);
 }
 if(index.sourceBundles.reduce((sum,b)=>sum+b.count,0)!==5345)throw Error('DYNAMIC_SOURCE_COUNT');
 for(const [i,p] of index.packs.entries()){
  if(p.file!=='dynamic-colorways-'+String(i).padStart(2,'0')+'.zip'||!HASH.test(p.sha256)||
     !Number.isInteger(p.count)||p.count<1||p.count>144)throw Error('DYNAMIC_SOURCE_PACK');
  packs.set(p.file,p);expected.set(p.file,new Map());
 }
 const i64=/^-?[1-9][0-9]{0,18}$/;
 const spriteIds=new Set(),textureIds=new Set(),definitionIds=new Set();
 for(const [i,shard] of shards.entries()){
  const data=read(join(dir,shard));
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length>500)throw Error('DYNAMIC_SOURCE_SHARD');
  for(const [id,r] of Object.entries(data)){
   const b=sources.get(r.sourceSpriteBundle);
   const override=overrides.get(id);
   if(!override||override[2]!==i+1||override[3]!==r.sourceSpritePathId||override[4]!==r.texturePathId)throw Error('NATIVE_OVERRIDE_PPTR '+id);
   if(!Object.hasOwn(native.records,id)||Object.hasOwn(originals.records,id)||records.has(id)||
      !ID.test(r.file)||r.file!==id+'.webp'||Number(id)>0x7fffffff||!HASH.test(r.sha256)||
      !HASH.test(r.textureSha256)||r.sourceKind!=='dynamic'||r.sourceSpriteBundle!==sourceBundles[i]||
      !b||r.sourceBundleSha256!==b.sha256||!expected.has(r.pack)||
      r.itemKey!==itemKeys.get(id)||!/^item_c_dyeable_[a-z0-9_]+$/.test(r.itemKey)||
      r.sourceSpriteName!=='icon_'+r.itemKey||r.textureName!==r.sourceSpriteName||
      ![r.definitionPathId,r.sourceSpritePathId,r.sharedUiIconPathId,r.texturePathId].every(x=>typeof x==='string'&&i64.test(x))||
      r.sourceSpritePathId===r.sharedUiIconPathId)throw Error('DYNAMIC_SOURCE_RECORD '+id);
   const sprite=b.name+':'+r.sourceSpritePathId,texture=b.name+':'+r.texturePathId;
   if(spriteIds.has(sprite)||textureIds.has(texture)||definitionIds.has(r.definitionPathId))throw Error('DYNAMIC_SOURCE_DUPLICATE');
   spriteIds.add(sprite);textureIds.add(texture);definitionIds.add(r.definitionPathId);
   records.set(id,r.sha256);expected.get(r.pack).set(r.file,r.sha256);
  }
 }
 if(records.size!==5021||Object.keys(originals.records).length!==362||
    Object.keys(native.records).length!==5383||
    Object.keys(native.records).some(id=>!records.has(id)&&!Object.hasOwn(originals.records,id)))
    throw Error('DYNAMIC_SOURCE_COVERAGE');
 const listed=readdirSync(dir).filter(x=>x.endsWith('.zip'));
 if(listed.length!==packs.size||listed.some(x=>!packs.has(x)))throw Error('DYNAMIC_SOURCE_ORPHAN');
 for(const [name,p] of packs){
  const bytes=readFileSync(join(dir,name)),entries=expected.get(name);
  if(sha(bytes)!==p.sha256||entries.size!==p.count)throw Error('DYNAMIC_SOURCE_PACK_HASH');
  for(const [file,data] of readStoredIconPack(bytes,entries)){
   if(fileBytes.has(file))throw Error('DYNAMIC_SOURCE_DUPLICATE_FILE');fileBytes.set(file,data);
  }
 }
 // The older atlas-derived images remain independently available as fallback.
 // Native IconOverride points to these completed source images instead.
 const upgradeDir=join(root,'data/native-override-colorway-packs');
 const upgradeRaw=readFileSync(join(upgradeDir,'index.json'));
 if(sha(upgradeRaw)!=='e485ce586175539605526175f88ddb7a6987879908d1a48fc428e91e54e1c8b7')throw Error('NATIVE_OVERRIDE_UPGRADE_INDEX_HASH');
 const upgrade=JSON.parse(upgradeRaw.toString('utf8'));
 if(upgrade.schema!=='HKIA.NativeIconOverrideUpgrade.1'||upgrade.version!=='3.0.1'||upgrade.definitionsSha256!==index.definitionsSha256||
   !Array.isArray(upgrade.bundles)||upgrade.bundles.length!==11||!Array.isArray(upgrade.packs)||upgrade.packs.length!==3||
   Object.keys(upgrade.records).length!==323)throw Error('NATIVE_OVERRIDE_UPGRADE_INDEX');
 const upgradeExpected=new Map();
 for(const [i,p] of upgrade.packs.entries()){
  if(p.file!=='override-colorways-'+String(i).padStart(2,'0')+'.zip'||!HASH.test(p.sha256)||p.count<1||p.count>144)throw Error('NATIVE_OVERRIDE_UPGRADE_PACK');
  upgradeExpected.set(p.file,new Map());
 }
 const routes=overrideSource.rows.filter(r=>r[2]>0&&Object.hasOwn(originals.records,String(r[0])));
 if(routes.length!==323||sha(JSON.stringify(routes))!=='74004c2d7911bb047203966739af86b658fee8cd53f08d828e7de198be43c16e')throw Error('NATIVE_OVERRIDE_UPGRADE_ROUTES');
 for(const [id,guid,n,sprite,texture] of routes){
  const key=String(id),r=upgrade.records[key],b=index.sourceBundles[n-1],group=r&&upgradeExpected.get(r.pack);
  if(!r||!group||records.has(key)||r.file!==key+'.webp'||!HASH.test(r.sha256)||!HASH.test(r.textureSha256)||
   r.itemKey!==itemKeys.get(key)||r.assetGuid!==guid||r.bundleNumber!==n||r.sourceSpritePathId!==sprite||r.texturePathId!==texture||
   r.sourceBundleSha256!==b.sha256)throw Error('NATIVE_OVERRIDE_UPGRADE_RECORD '+key);
  records.set(key,r.sha256);group.set(r.file,r.sha256);
 }
 const upgradeListed=readdirSync(upgradeDir).filter(x=>x.endsWith('.zip'));
 if(upgradeListed.length!==upgradeExpected.size||upgradeListed.some(x=>!upgradeExpected.has(x)))throw Error('NATIVE_OVERRIDE_UPGRADE_ORPHAN');
 for(const p of upgrade.packs){
  const bytes=readFileSync(join(upgradeDir,p.file)),entries=upgradeExpected.get(p.file);
  if(sha(bytes)!==p.sha256||entries.size!==p.count)throw Error('NATIVE_OVERRIDE_UPGRADE_HASH');
  for(const [name,data] of readStoredIconPack(bytes,entries)){
   if(fileBytes.has(name))throw Error('NATIVE_OVERRIDE_UPGRADE_DUPLICATE');
   fileBytes.set(name,data);
  }
 }
 if(records.size!==5344||fileBytes.size!==5344)throw Error('NATIVE_OVERRIDE_UPGRADE_COVERAGE');
 mkdirSync(out,{recursive:true});
 for(const name of readdirSync(out).filter(x=>x.endsWith('.webp'))){
  if(!fileBytes.has(name)||sha(readFileSync(join(out,name)))!==records.get(name.slice(0,-5)))
   throw Error('DYNAMIC_SOURCE_UNTRACKED_OR_CHANGED');
 }
 for(const [file,data] of fileBytes)if(!existsSync(join(out,file)))writeFileSync(join(out,file),data,{flag:'wx'});
 writeFileSync(join(out,'index.json'),JSON.stringify({schema:'HKIA.DynamicColorwayDisplay.1',version:'3.0.1',
  definitionsSha256:index.definitionsSha256,records:Object.fromEntries(records)}));
 console.log('HKIA_DYNAMIC_ORIGINAL_COLORWAYS '+fileBytes.size+' materialized; 5383/5383 combined source-original icons');
 return fileBytes.size;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=fileURLToPath(new URL('..',import.meta.url));
 unpackSourceColorways(root);unpackDynamicColorways(root);
}
