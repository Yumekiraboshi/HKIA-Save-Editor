import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const raw=JSON.parse(readFileSync(new URL('../public/achievement-category-atlas.json',import.meta.url),'utf8'));
const iconData=readFileSync(new URL('../public/achievement-category-atlas.webp',import.meta.url));
const groupsData=JSON.parse(readFileSync(new URL('../public/achievement-groups.json',import.meta.url),'utf8'));
const indexData=JSON.parse(readFileSync(new URL('../public/achievement-index.json',import.meta.url),'utf8'));
const index=new Map(indexData.records.map(([guid,key,titleId])=>[guid,{key,titleId}]));
const entries=[fileURLToPath(new URL('../src/achievement-category-icons.ts',import.meta.url)),fileURLToPath(new URL('../src/achievement-groups.ts',import.meta.url))];
const buildModule=async entry=>{
 const r=await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
};
const [icons,groups]=await Promise.all(entries.map(buildModule));
const hierarchy=groups.decodeAchievementGroups(groupsData,index);

test('63 source-verified Sprite images match exactly 63 root achievement categories',()=>{
 const image=icons.decodeAchievementCategoryAtlas(raw,index,hierarchy,'/HKIA-Save-Editor/');
 assert.equal(image.bySaveGuid.size,63);
 assert.equal(raw.categories.length,63);
 assert.equal(raw.layout.columns,8);
 assert.equal(raw.layout.rows,8);
 assert.equal(raw.layout.cellPx,112);
 assert.equal(image.url,'/HKIA-Save-Editor/achievement-category-atlas.webp');
 const rows=hierarchy.groups.map((g,i)=>{
  const item=image.bySaveGuid.get(g.guid);
  assert.ok(item, 'missing category icon for '+g.guid);
  assert.equal(item.index,i);
  assert.equal(item.sourceKey,index.get(g.guid).key);
  assert.equal(item.spritePathId,raw.categories[i].spritePathId);
  assert.equal(raw.categories[i].index,i);
  return item;
 });
 assert.equal(new Set(rows.map(x=>x.spritePathId)).size,63);
 assert.deepEqual(rows[0],{
  index:0,saveGuid:hierarchy.groups[0].guid,
  sourceKey:'collection_islandMystery',
  spritePathId:raw.categories[0].spritePathId,x:'0%',y:'0%'
 });
 assert.equal(rows[1].x,100/7+'%');
 assert.equal(rows[8].x,'0%');
 assert.equal(rows[8].y,100/7+'%');
 assert.equal(rows[62].x,600/7+'%');
 assert.equal(rows[62].y,'100%');
});

test('the committed original-source icon atlas bytes match the audited manifest',()=>{
 assert.equal(iconData.toString('ascii',0,4),'RIFF');
 assert.equal(iconData.toString('ascii',8,12),'WEBP');
 assert.equal(createHash('sha256').update(iconData).digest('hex'),raw.atlasSha256);
 assert.ok(iconData.length>20000 && iconData.length<1000000);
 assert.equal(raw.sourceImageMapSha256,'555c8fa663cb1462fa455f804d98580aaac0ff58628cc601fa6c25532632771b');
 for(const c of raw.categories){
  assert.match(c.sourceSha256,/^[0-9a-f]{64}$/);
  assert.match(c.sourceGuid,/^[0-9a-f]{32}$/);
  assert.deepEqual(c.originalSize,[512,512]);
 }
});

test('tampered icon identity and source mismatches are rejected rather than showing another category art',()=>{
 const forged=structuredClone(raw);
 forged.categories[3].sourceKey='collection_invalid';
 assert.throws(()=>icons.decodeAchievementCategoryAtlas(forged,index,hierarchy,'/'),/ACH_CATEGORY_ICONS_MAPPING_INVALID/);
 const reordered=structuredClone(raw);
 [reordered.categories[0],reordered.categories[1]]=[reordered.categories[1],reordered.categories[0]];
 assert.throws(()=>icons.decodeAchievementCategoryAtlas(reordered,index,hierarchy,'/'),/ACH_CATEGORY_ICONS_MAPPING_INVALID/);
 const duplicated=structuredClone(raw);
 duplicated.categories[6].spritePathId=duplicated.categories[5].spritePathId;
 assert.throws(()=>icons.decodeAchievementCategoryAtlas(duplicated,index,hierarchy,'/'),/ACH_CATEGORY_ICONS_MAPPING_INVALID/);
 const wrongDigest=structuredClone(raw);wrongDigest.atlasSha256='f'.repeat(64);
 assert.throws(()=>icons.decodeAchievementCategoryAtlas(wrongDigest,index,hierarchy,'/'),/ACH_CATEGORY_ICONS_INVALID/);
});

test('original icons render for group cards and category parents without alphabetic sorting',()=>{
 const app=readFileSync(new URL('../src/App.svelte',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 for(const token of ['loadAchievementCategoryAtlas(', 'achievementCategoryAtlas?.bySaveGuid.get(stat.guid)',
   'achievementCategoryAtlas?.bySaveGuid.get(item.guid)', 'achievement-category-sprite',
   'style:background-position', 'nativeAchievementOrder(achievementGroupHierarchy,sourceAchievementRows,achievementFacts)',
   'groupRows(achievementGroupHierarchy,achievementGroupSelection,sourceAchievementRows,achievementFacts)'
 ]) assert.ok(app.includes(token),token);
 assert.ok(css.includes('background-size:800% 800%'));
 assert.ok(css.includes('.achievement-category-art-small'));
});
