import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {webcrypto,createHash} from 'node:crypto';
import {build} from 'esbuild';

const read=path=>readFileSync(new URL(path,import.meta.url));
const entry=fileURLToPath(new URL('../src/achievement-atlas-image.ts',import.meta.url));
const {outputFiles}=await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {loadVerifiedAchievementImage,loadVerifiedAchievementManifest}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const catalog=[
 ['achievement-individual-atlas.webp','achievement-individual-atlas.json'],
 ['achievement-category-atlas.webp','achievement-category-atlas.json']
];
const app=read('../src/App.svelte').toString('utf8');

test('the browser verifies each original WebP payload before creating a display URL',async()=>{
 const previous=globalThis.fetch;
 const cryptoBefore=globalThis.crypto;
 if(!globalThis.crypto)globalThis.crypto=webcrypto;
 try{
  for(const [filename,manifestName] of catalog){
   const raw=read('../public/'+filename);
   const hash=JSON.parse(read('../public/'+manifestName).toString('utf8')).atlasSha256;
   let calls=0;
   globalThis.fetch=async(url,options)=>{
    calls++;
    assert.equal(url,'/HKIA-Save-Editor/'+filename);
    assert.equal(options.cache,'no-cache');
    return new Response(new Uint8Array(raw),{status:200});
   };
   const image=await loadVerifiedAchievementImage('/HKIA-Save-Editor/',filename,hash);
   assert.equal(calls,1);
   assert.match(image.url,/^blob:/);
   image.dispose();
   image.dispose(); // double release is harmless
  }
 }finally{
  globalThis.fetch=previous;
  if(!cryptoBefore)delete globalThis.crypto;
 }
});

test('altered or absent WebP bytes never become a displayable image',async()=>{
 const previous=globalThis.fetch;
 const cryptoBefore=globalThis.crypto;
 if(!globalThis.crypto)globalThis.crypto=webcrypto;
 const raw=read('../public/achievement-individual-atlas.webp');
 const hash=JSON.parse(read('../public/achievement-individual-atlas.json').toString('utf8')).atlasSha256;
 const altered=new Uint8Array(raw);
 altered[300]^=1;
 try{
  globalThis.fetch=async()=>new Response(altered,{status:200});
  await assert.rejects(
   loadVerifiedAchievementImage('/','achievement-individual-atlas.webp',hash),
   /ACH_ATLAS_HASH_MISMATCH/
  );
  globalThis.fetch=async()=>new Response('missing',{status:404});
  await assert.rejects(
   loadVerifiedAchievementImage('/','achievement-individual-atlas.webp',hash),
   /ACH_ATLAS_FETCH_FAILED/
  );
  globalThis.fetch=async()=>new Response('not a WebP',{status:200});
  await assert.rejects(
   loadVerifiedAchievementImage('/','achievement-individual-atlas.webp',hash),
   /ACH_ATLAS_SIZE_INVALID|ACH_ATLAS_FORMAT_INVALID/
  );
  await assert.rejects(
   loadVerifiedAchievementImage('/','achievement-individual-atlas.webp','bad-sha'),
   /ACH_ATLAS_SHA_INVALID/
  );
 }finally{
  globalThis.fetch=previous;
  if(!cryptoBefore)delete globalThis.crypto;
 }
});

test('achievement image downloads begin only for an opened save and use failure-safe placeholders',()=>{
 assert.match(app,/if\(achievementImagesFailed\|\|!snapshot\|\|activeTool!=='achievements'\|\|achievementIndex\.size!==820/);
 assert.match(app,/achievementImagesStarted=true;/);
 assert.match(app,/if\(!achievementIndividualAtlas\)void loadAchievementIndividualAtlas\(/);
 assert.match(app,/if\(!achievementCategoryAtlas\)void loadAchievementCategoryAtlas\(/);
 assert.match(app,/if\(achievementImagesFailed\)\{[^}]*achievementImagesStarted=false;[^}]*achievementImagesFailed=false;/);
 assert.match(app,/onclick=\{openAchievementsTab\}/);
 assert.match(app,/achievementImagesFailed=true/);
 assert.match(app,/achievementImagesEpoch\+\+;/);
 assert.match(app,/achievementIndividualAtlas\?\.dispose\?\.\(\)/);
 assert.match(app,/achievementCategoryAtlas\?\.dispose\?\.\(\)/);
 assert.match(app,/\{#if achievementImagesFailed\}/);
 assert.match(app,/<span class="item-art-empty">✧<\/span>/);
 assert.match(app,/\{#if !snapshot\}/);
 assert.doesNotMatch(app,/セーブなしで実績を見る/);
});

test('original icon mapping manifests match the recovered Steam definitions and reject swapped valid identities',async()=>{
 const previous=globalThis.fetch;
 const cryptoBefore=globalThis.crypto;
 if(!globalThis.crypto)globalThis.crypto=webcrypto;
 try{
  for(const [filename,field,hash,sourceHash] of [
   ['achievement-individual-atlas.json','icons','e168c1ca10fe7a0d7cb4107cdb6454ddd73c5d94e3b36bfb2be2802b4e487e9a','c9814816daa068ce878802e51c559340301af84d00f3a07277dd13e530a654fd'],
   ['achievement-category-atlas.json','categories','b8a264ddde3cdb34b80d3b47816961d9b5534fd8c791f0286881740b1c091415','69d1d55acda59caf1b2cddfe17c69b5ba007481be0bebced6221290751e23873']
  ]){
   const raw=read('../public/'+filename);
   assert.equal(createHash('sha256').update(raw).digest('hex'),hash);
   const parsed=JSON.parse(raw.toString('utf8'));
   const rows=parsed[field].map(r=>[r.sourceKey,r.sourceGuid,r.spritePathId].join('|')).sort().join('\n')+'\n';
   assert.equal(createHash('sha256').update(rows).digest('hex'),sourceHash);
   globalThis.fetch=async(url,options)=>{
    assert.equal(url,'/editor/'+filename);
    assert.equal(options.cache,'no-cache');
    return new Response(new Uint8Array(raw));
   };
   assert.deepEqual(await loadVerifiedAchievementManifest('/editor/',filename,hash),parsed);
   const entries=parsed[field];
   [entries[0].sourceKey,entries[1].sourceKey]=[entries[1].sourceKey,entries[0].sourceKey];
   globalThis.fetch=async()=>new Response(JSON.stringify(parsed));
   await assert.rejects(loadVerifiedAchievementManifest('/editor/',filename,hash),/ACH_ATLAS_MANIFEST_HASH_MISMATCH/);
  }
 }finally{
  globalThis.fetch=previous;
  if(!cryptoBefore)delete globalThis.crypto;
 }
});
