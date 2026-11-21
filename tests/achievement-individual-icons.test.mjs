import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=(path)=>readFileSync(new URL(path,import.meta.url));
const manifest=JSON.parse(read('../public/achievement-individual-atlas.json').toString('utf8'));
const categoryManifest=JSON.parse(read('../public/achievement-category-atlas.json').toString('utf8'));
const indexData=JSON.parse(read('../public/achievement-index.json').toString('utf8'));
const image=read('../public/achievement-individual-atlas.webp');
const index=new Map(indexData.records.map(([guid,key,titleId])=>[guid,{key,titleId}]));
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/achievement-individual-icons.ts',import.meta.url))],
 bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const icons=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

test('source-verified icon coverage: 198 individual + 63 category + 559 native null = 820 achievements',()=>{
 const result=icons.decodeAchievementIndividualAtlas(manifest,index,'/HKIA-Save-Editor/');
 const categoryKeys=new Set(categoryManifest.categories.map(x=>x.sourceKey));
 const saveByKey=new Map([...index].map(([guid,{key}])=>[key,guid]));
 assert.equal(index.size,820);
 assert.equal(manifest.schema,'HKIA.AchievementIndividualAtlas.1');
 assert.equal(manifest.gameVersion,'3.0.1');
 assert.equal(manifest.layout.columns,14);
 assert.equal(manifest.layout.rows,15);
 assert.equal(manifest.layout.cellPx,112);
 assert.equal(manifest.icons.length,198);
 assert.equal(manifest.categoryIconCount,63);
 assert.equal(manifest.sourceNullCount,559);
 assert.equal(categoryKeys.size,63);
 assert.equal(result.bySaveGuid.size,198);
 assert.equal(result.url,'/HKIA-Save-Editor/achievement-individual-atlas.webp');
 const knownKeys=new Set();
 for(let i=0;i<manifest.icons.length;i++){
  const row=manifest.icons[i];
  assert.equal(row.index,i);
  assert.ok(saveByKey.has(row.sourceKey),row.sourceKey);
  assert.ok(!categoryKeys.has(row.sourceKey),row.sourceKey);
  assert.ok(!knownKeys.has(row.sourceKey),row.sourceKey);
  knownKeys.add(row.sourceKey);
  const guid=saveByKey.get(row.sourceKey);
  const entry=result.bySaveGuid.get(guid);
  assert.ok(entry,'missing save GUID mapping for '+row.sourceKey);
  assert.equal(entry.index,i);
  assert.equal(entry.sourceKey,row.sourceKey);
  assert.equal(entry.spritePathId,row.spritePathId);
  assert.match(row.sourceGuid,/^[0-9a-f]{32}$/);
  assert.match(row.sourceSha256,/^[0-9a-f]{64}$/);
  assert.ok(row.originalSize.every(n=>Number.isInteger(n)&&n>0&&n<=8192));
 }
 assert.equal(new Set(manifest.icons.map(x=>x.sourceGuid)).size,198);
 assert.equal(new Set(manifest.icons.map(x=>x.spritePathId)).size,166);
 assert.equal(result.bySaveGuid.has(saveByKey.get('achievement_BestBrother')),true);
 const categoryGuids=categoryManifest.categories.map(x=>saveByKey.get(x.sourceKey));
 assert.ok(categoryGuids.every(guid=>!result.bySaveGuid.has(guid)));
 const unknown=indexData.records.filter(([guid])=>!result.bySaveGuid.has(guid)&&!categoryGuids.includes(guid));
 assert.equal(unknown.length,559);
});

test('atlas WebP bytes match original extraction manifest and source image-map digest',()=>{
 assert.equal(image.toString('ascii',0,4),'RIFF');
 assert.equal(image.toString('ascii',8,12),'WEBP');
 assert.equal(createHash('sha256').update(image).digest('hex'),manifest.atlasSha256);
 assert.equal(manifest.atlasSha256,'0fc03993f61444404b895b73128e40262fa283282ff02d269fb9fdd1e061f6e0');
 assert.equal(manifest.sourceImageMapSha256,categoryManifest.sourceImageMapSha256);
 assert.equal(indexData.sourceSha256,'ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0');
 assert.ok(image.length>1000000&&image.length<2300000,'unexpected atlas size');
 const atlas=icons.decodeAchievementIndividualAtlas(manifest,index,'/');
 assert.equal(atlas.bySaveGuid.get([...index].find(([g,x])=>x.key==='achievement_BestBrother')[0]).x,'0%');
 assert.equal(atlas.bySaveGuid.get([...index].find(([g,x])=>x.key===manifest.icons[14].sourceKey)[0]).y,100/14+'%');
 assert.equal(atlas.bySaveGuid.get([...index].find(([g,x])=>x.key===manifest.icons[197].sourceKey)[0]).y,'100%');
});

test('corrupt identity, mismatched version and conflicting Sprite ID are rejected without false icons',()=>{
 const forged=structuredClone(manifest);
 forged.icons[0].sourceKey='achievement_nonexistent';
 assert.throws(()=>icons.decodeAchievementIndividualAtlas(forged,index,'/'),/ACH_INDIVIDUAL_ICONS_MAPPING_INVALID/);
 const swapped=structuredClone(manifest);
 swapped.icons[1].sourceKey=swapped.icons[0].sourceKey;
 assert.throws(()=>icons.decodeAchievementIndividualAtlas(swapped,index,'/'),/ACH_INDIVIDUAL_ICONS_MAPPING_INVALID/);
 const wrongDigest=structuredClone(manifest);
 wrongDigest.atlasSha256='0'.repeat(64);
 assert.throws(()=>icons.decodeAchievementIndividualAtlas(wrongDigest,index,'/'),/ACH_INDIVIDUAL_ICONS_INVALID/);
 const wrongVersion=structuredClone(manifest);
 wrongVersion.gameVersion='3.0.0';
 assert.throws(()=>icons.decodeAchievementIndividualAtlas(wrongVersion,index,'/'),/ACH_INDIVIDUAL_ICONS_INVALID/);
 const samePath=structuredClone(manifest);
 const duplicate=manifest.icons.find((a,i)=>i>0&&a.spritePathId===manifest.icons[0].spritePathId);
 if(duplicate){
  const pos=samePath.icons.findIndex(x=>x.sourceKey===duplicate.sourceKey);
  samePath.icons[pos].sourceSha256='f'.repeat(64);
  assert.throws(()=>icons.decodeAchievementIndividualAtlas(samePath,index,'/'),/ACH_INDIVIDUAL_ICONS_SPRITE_CONFLICT/);
 }
 const duplicateIndex=new Map(index);
 const duplicateGuid=[...index.keys()][0],sourceName=index.get(duplicateGuid).key;
 duplicateIndex.set(duplicateGuid,{key:sourceName,titleId:'1'});
 assert.equal(duplicateIndex.size,820);
});

test('individual cards use exact sprites and missing rows retain placeholder; category art, sorting and editing stay unchanged',()=>{
 const app=read('../src/App.svelte').toString('utf8');
 const css=read('../src/style.css').toString('utf8');
 for(const part of [
  'loadAchievementIndividualAtlas(import.meta.env.BASE_URL,index)',
  'achievementIndividualAtlas?.bySaveGuid.get(item.guid)',
  '{#if individualArt}', '<span class="achievement-individual-sprite"',
  '{:else if art}', '<span class="achievement-category-sprite"',
  '<span class="item-art-empty">✧</span>',
  'nativeAchievementOrder(achievementGroupHierarchy,sourceAchievementRows,achievementFacts)',
  'groupRows(achievementGroupHierarchy,achievementGroupSelection,sourceAchievementRows,achievementFacts)',
  'if(item.row)void quickToggleAchievement(item.row)',
  'if(item.row)void openAchievement(item.row'
 ])assert.ok(app.includes(part),part);
 assert.match(css,/\.achievement-individual-sprite\{[^}]*background-size:1400% 1500%/);
 assert.match(css,/\.achievement-tile\{height:224px;min-height:224px\}/);
 assert.match(css,/\.achievement-tile\{height:211px;min-height:211px\}/);
});
