/** Build-only transport for reviewed original-size Lossless WebP artwork.
 * A null committed pin is intentionally inactive. No network access, original
 * bundles, player data, or automatic candidate activation. */
import {readFileSync,writeFileSync,readdirSync,mkdirSync,mkdtempSync,renameSync,rmSync,existsSync,statSync,lstatSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const POLICY='native-resolution-lossless-webp-v1',SHA=/^[a-f0-9]{64}$/;
const JSON_FILES=new Set(['distribution.json','release-candidate.json','family-bindings.json','collection-catalog.json','achievement-art.json','category-art.json','native-art/index.json','dynamic-source-pages/index.json','auxiliary-source-pages/index.json']);
const IMAGE=/^(?:native-art\/[a-f0-9]{64}|(?:dynamic-source-pages|auxiliary-source-pages)\/source-[a-f0-9]{64})\.webp$/;
const MAX_PART=32*1024*1024,MAX_JSON=16*1024*1024,MAX_FILES=100000;
const sha=b=>createHash('sha256').update(b).digest('hex');
const check=(v,msg)=>{if(!v)throw Error('NATIVE_ART_DELIVERY '+msg);};
const json=b=>JSON.parse(b.toString('utf8'));
const safeName=n=>JSON_FILES.has(n)||IMAGE.test(n);
const positive=n=>Number.isSafeInteger(n)&&n>0;
function exactFile(path){check(lstatSync(path).isFile(),'not a regular file: '+path);return readFileSync(path);}
function exactMeta(b,m,name){check(m&&positive(m.bytes)&&SHA.test(m.sha256)&&b.length===m.bytes&&sha(b)===m.sha256,'digest/size '+name);}
export function* readNativeZip(bytes){
 check(Buffer.isBuffer(bytes)&&bytes.length<=MAX_PART,'archive size');
 let p=0,count=0;const seen=new Set();
 while(p+30<=bytes.length&&bytes.readUInt32LE(p)===0x04034b50){
  const flags=bytes.readUInt16LE(p+6),method=bytes.readUInt16LE(p+8),packed=bytes.readUInt32LE(p+18),size=bytes.readUInt32LE(p+22),n=bytes.readUInt16LE(p+26),extra=bytes.readUInt16LE(p+28);
  const at=p+30+n+extra,end=at+packed;
  check(flags===0&&extra===0&&n>0&&n<=128&&positive(size)&&positive(packed)&&end<=bytes.length,'ZIP header');
  const name=bytes.toString('ascii',p+30,p+30+n),isJson=JSON_FILES.has(name);
  check(safeName(name)&&!seen.has(name)&&++count<=MAX_FILES,'ZIP member '+name);
  check(size<=(isJson?MAX_JSON:MAX_PART)&&(method===0&&packed===size||isJson&&method===8),'ZIP method/bounds '+name);
  const b=method===0?bytes.subarray(at,end):inflateRawSync(bytes.subarray(at,end),{maxOutputLength:size});
  check(b.length===size,'ZIP size '+name);seen.add(name);yield [name,b];p=end;
 }
 check(count>0&&p+4<=bytes.length&&bytes.readUInt32LE(p)===0x02014b50,'ZIP directory');
}
export function losslessDimensions(b){
 check(b.length>=25&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'&&b.readUInt32LE(4)+8===b.length,'WebP header');
 let p=12,dim;
 while(p<b.length){
  check(p+8<=b.length,'WebP chunk header');const k=b.toString('ascii',p,p+4),n=b.readUInt32LE(p+4),start=p+8;
  check(start+n<=b.length&&!['VP8 ','ANIM','ANMF','ALPH'].includes(k),'non-lossless/animated WebP');
  if(k==='VP8L'){check(!dim&&n>=5&&b[start]===0x2f,'VP8L header');const v=b.readUInt32LE(start+1);check((v>>>29)===0,'VP8L version');dim=[(v&0x3fff)+1,((v>>>14)&0x3fff)+1];}
  p=start+n+(n&1);
 }
 check(dim&&p===b.length,'VP8L missing');return dim;
}
function readParts(dir,expected){
 const raw=exactFile(join(dir,'parts.json')),p=json(raw);
 check(SHA.test(expected)&&p.schema==='HKIA.NativeArtDeliveryParts.1'&&p.distributionSha256===expected&&/^\d+\.\d+\.\d+$/.test(p.version)&&Array.isArray(p.parts)&&p.parts.length>0&&p.parts.length<=256,'parts index');
 const names=new Set();for(const [i,m] of p.parts.entries()){
  check(m.file==='part-'+String(i).padStart(2,'0')+'.zip'&&!names.has(m.file)&&positive(m.bytes)&&m.bytes<=MAX_PART&&SHA.test(m.sha256)&&positive(m.count)&&m.count<=MAX_FILES,'part descriptor');names.add(m.file);
 }
 check(readdirSync(dir).filter(n=>n.endsWith('.zip')).length===names.size,'part census');return {raw,p};
}
function verifyManifest(raw,expected){
 check(sha(raw)===expected,'distribution pin');const d=json(raw);
 check(d.schema==='HKIA.NativeArtDistribution.1'&&d.artworkPolicy===POLICY&&d.automaticReleaseActivationAuthorized===false&&/^\d+\.\d+\.\d+$/.test(d.version)&&['steam','switch'].includes(d.platform),'distribution identity');
 const names=Object.keys(d.files??{});check(names.length>0&&names.length<=MAX_FILES&&!names.includes('distribution.json')&&names.every(safeName)&&[...JSON_FILES].every(n=>n==='distribution.json'||names.includes(n)),'distribution census');
 check(names.every(n=>positive(d.files[n].bytes)&&d.files[n].bytes<=(IMAGE.test(n)?MAX_PART:MAX_JSON)&&SHA.test(d.files[n].sha256))&&names.reduce((n,k)=>n+d.files[k].bytes,0)===d.totalBytes,'distribution bytes');
 return d;
}
function derivePin(dir,d,expected,partsHash){
 const read=n=>json(exactFile(join(dir,n))),release=read('release-candidate.json'),family=read('family-bindings.json'),ach=read('achievement-art.json'),cat=read('category-art.json'),catalog=read('collection-catalog.json'),native=read('native-art/index.json');
 const dynamic=read('dynamic-source-pages/index.json'),auxiliary=read('auxiliary-source-pages/index.json'),version=d.version,platform=d.platform;
 const hash=n=>d.files[n].sha256,definition=release.sourceBundles?.definitions;
 const same=v=>v.version===version&&v.platform===platform&&v.automaticReleaseActivationAuthorized===false;
 check(release.schema==='HKIA.IconReleaseCandidate.1'&&release.approval==='review-required'&&same(release)&&release.artworkPolicy===POLICY&&SHA.test(definition)&&SHA.test(release.snapshotSha256),'item release');
 for(const key of ['unresolvedInventorySourceItemIds','missingCollectionBaseItemIds','unresolvedOriginalUiIconItemIds','missingInventoryBaseItemIds'])check(Array.isArray(release[key])&&release[key].length===0,key);
 check(release.routes.length===release.definitionCount&&release.routes.every(r=>Array.isArray(r.sourceBlockers)&&r.sourceBlockers.length===0),'item routes');
 check(release.collectionOwnRoutes.length===catalog.items.length&&release.collectionOwnRoutes.every(r=>r[2]===false)&&catalog.schema==='HKIA.CollectionDisplayCatalog.2'&&catalog.version===version,'collection routes');
 check(Object.entries(release.outputFiles).every(([n,m])=>d.files[n]?.sha256===m.sha256&&d.files[n]?.bytes===m.bytes),'item file binding');
 check(family.schema==='HKIA.IconFamilyBindingsCandidate.1'&&same(family)&&family.definitionSnapshotSha256===release.snapshotSha256&&family.dynamicIndexSha256===hash('dynamic-source-pages/index.json')&&family.auxiliaryIndexSha256===hash('auxiliary-source-pages/index.json')&&family.unresolvedSwatches.length===0,'family binding');
 check(ach.schema==='HKIA.AchievementArtCandidate.2'&&cat.schema==='HKIA.CategoryArtCandidate.2'&&[ach,cat].every(v=>same(v)&&v.artworkPolicy===POLICY&&v.definitionsSha256===definition&&v.unresolvedCount===0),'view bindings');
 check(native.schema==='HKIA.NativeResolutionItemArt.1'&&native.version===version&&native.artworkPolicy===POLICY,'static index');
 const expectedImages=new Map();function bindImage(n,a){
  check(IMAGE.test(n)&&d.files[n]?.sha256===a.sha256&&d.files[n]?.bytes===a.bytes&&positive(a.width)&&positive(a.height),'image binding '+n);
  const old=expectedImages.get(n);check(!old||old[0]===a.width&&old[1]===a.height,'image dimensions conflict');expectedImages.set(n,[a.width,a.height]);
 }
 for(const a of Object.values(native.assets))bindImage('native-art/'+a.file,a);
 for(const [v,field] of [[ach,'icon'],[cat,'native']])for(const row of v.rows){const x=row[field];if(x.kind==='sprite')bindImage('native-art/'+x.asset.file,x.asset);}
 for(const [v,folder] of [[dynamic,'dynamic-source-pages'],[auxiliary,'auxiliary-source-pages']]){
  check(v.schema==='HKIA.DynamicSourcePageCandidate.1'&&v.version===version&&v.renderer==='guarded-native-rgb-alpha-v1'&&v.unresolved.length===0,'dynamic pages');
  for(const a of v.pages)bindImage(folder+'/'+a.file,a);
 }
 const names=Object.keys(d.files).filter(n=>IMAGE.test(n));check(names.length===expectedImages.size&&names.every(n=>expectedImages.has(n)),'image partition');
 const statics=names.filter(n=>n.startsWith('native-art/'));check(statics.length===d.staticImageCount&&statics.reduce((n,k)=>n+d.files[k].bytes,0)===d.staticImageBytes,'static image census');
 for(const [n,dim] of expectedImages){const actual=losslessDimensions(exactFile(join(dir,n)));check(actual[0]===dim[0]&&actual[1]===dim[1],'image dimensions '+n);}
 const renderer='guarded-native-rgb-alpha-v1',pagePin=n=>({version,indexSha256:hash(n),renderer,resolution:'native'}),viewPin=n=>({version,platform,definitionsSha256:definition,manifestFileSha256:hash(n)});
 return {root:'native-art-releases/'+version+'-'+platform+'/',distributionSha256:expected,partsFileSha256:partsHash,pins:{item:{version,receiptFileSha256:hash('release-candidate.json'),family:{version,bindingsSha256:hash('family-bindings.json'),dynamic:pagePin('dynamic-source-pages/index.json'),auxiliary:pagePin('auxiliary-source-pages/index.json')}},achievement:viewPin('achievement-art.json'),category:viewPin('category-art.json')}};
}
/** Stream one verified archive at a time into a fresh directory; no extraction
 * path is taken from a ZIP without an exact pinned manifest entry. */
export function verifyNativeParts(partsDir,expected,out){
 const {raw,p}=readParts(partsDir,expected);check(readdirSync(out).length===0,'empty staging directory');let d;
 const seen=new Set();
 for(const part of p.parts){const b=exactFile(join(partsDir,part.file));exactMeta(b,part,part.file);let count=0;
  for(const [n,data] of readNativeZip(b)){
   check(!seen.has(n),'duplicate member '+n);seen.add(n);count++;
   if(n==='distribution.json'){check(!d,'duplicate distribution');d=verifyManifest(data,expected);check(d.version===p.version,'parts version');}
   else{check(d,'manifest must precede files');exactMeta(data,d.files[n],n);}
   const target=join(out,n);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,data,{flag:'wx'});
  }check(count===part.count,'part entry count');
 }
 check(d&&seen.size===Object.keys(d.files).length+1&&Object.keys(d.files).every(n=>seen.has(n)),'complete file census');
 return derivePin(out,d,expected,sha(raw));
}
function validateExisting(out,expected,partsHash){
 const raw=exactFile(join(out,'distribution.json')),d=verifyManifest(raw,expected),seen=new Set();
 function walk(dir,prefix=''){for(const e of readdirSync(dir,{withFileTypes:true})){const n=prefix+e.name,path=join(dir,e.name);check(!e.isSymbolicLink(),'symbolic link');if(e.isDirectory())walk(path,n+'/');else{check(e.isFile()&&safeName(n)&&!seen.has(n),'unexpected file '+n);seen.add(n);if(n!=='distribution.json')exactMeta(exactFile(path),d.files[n],n);}}}
 walk(out);check(seen.size===Object.keys(d.files).length+1,'existing output census');return derivePin(out,d,expected,partsHash);
}
export function unpackNativeArt(root){
 const pin=json(exactFile(join(root,'src/native-art-release-pin.json'))),publicRoot=join(root,'public/native-art-releases');
 if(pin===null){check(!existsSync(publicRoot)||readdirSync(publicRoot).length===0,'inactive pin has stale generated artwork');return false;}
 check(/^native-art-releases\/\d+\.\d+\.\d+-(?:steam|switch)\/$/.test(pin.root)&&SHA.test(pin.distributionSha256)&&SHA.test(pin.partsFileSha256),'reviewed pin');
 const dir=join(root,'data',pin.root),out=join(root,'public',pin.root),{raw,p}=readParts(dir,pin.distributionSha256);check(sha(raw)===pin.partsFileSha256,'part index pin');
 // The generated directory is dedicated to the one installed release.
 mkdirSync(publicRoot,{recursive:true});check(readdirSync(publicRoot).every(n=>n===pin.root.split('/')[1]),'stale release directory');
 if(existsSync(out)){
  for(const part of p.parts)exactMeta(exactFile(join(dir,part.file)),part,part.file);
  check(JSON.stringify(validateExisting(out,pin.distributionSha256,pin.partsFileSha256))===JSON.stringify(pin),'existing release pin');
 }else{
  const stage=mkdtempSync(join(root,'.native-art-build-'));
  try{check(JSON.stringify(verifyNativeParts(dir,pin.distributionSha256,stage))===JSON.stringify(pin),'candidate release pin');renameSync(stage,out);}finally{rmSync(stage,{recursive:true,force:true});}
 }
 console.log('HKIA_NATIVE_ART_DELIVERY '+pin.root+' verified');return true;
}
/** Explicit local preparation only. Caller provides the reviewed distribution
 * digest; this command does not push, publish, or change repository settings. */
export function installNativeArt(root,partsDir,expected){
 const stage=mkdtempSync(join(tmpdir(),'hkia-native-art-verify-'));
 try{
  const pin=verifyNativeParts(partsDir,expected,stage),dest=join(root,'data',pin.root),pinPath=join(root,'src/native-art-release-pin.json');
  const old=json(exactFile(pinPath));check(old===null||JSON.stringify(old)===JSON.stringify(pin),'different release already installed');
  check(!existsSync(dest),'delivery directory already exists');mkdirSync(dirname(resolve(dest)) ,{recursive:true});
  const {p}=readParts(partsDir,expected),temp=mkdtempSync(join(root,'.native-art-parts-'));
  try{for(const n of ['parts.json',...p.parts.map(x=>x.file)])copyFileSync(join(partsDir,n),join(temp,n));renameSync(temp,dest);}finally{rmSync(temp,{recursive:true,force:true});}
  writeFileSync(pinPath,JSON.stringify(pin,null,2)+'\n');return pin;
 }finally{rmSync(stage,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');const [mode,dir,expected]=process.argv.slice(2);
 if(mode==='--verify'){const stage=mkdtempSync(join(tmpdir(),'hkia-native-art-verify-'));try{console.log(JSON.stringify(verifyNativeParts(resolve(dir),expected,stage),null,2));}finally{rmSync(stage,{recursive:true,force:true});}}
 else if(mode==='--install'){console.log(JSON.stringify(installNativeArt(root,resolve(dir),expected),null,2));}
 else if(mode===undefined)unpackNativeArt(root);else throw Error('Usage: unpack-native-art.mjs [--verify|--install PARTS_DIR REVIEWED_DISTRIBUTION_SHA256]');
}
