import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const load=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const catalog=JSON.parse(load('../public/catalog.json'));
const app=load('../src/App.svelte');
const {outputFiles}=await build({
 entryPoints:[fileURLToPath(new URL('../src/collection-search.ts',import.meta.url))],
 bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'
});
const {searchAllCollectionItems}=await import('data:text/javascript;base64,'+
 Buffer.from(outputFiles[0].text).toString('base64'));
const en=item=>item[5]??item[6]??'';
const ja=item=>item[6]??item[5]??'';

test('global collection search matches item names from every source category and subcategory',()=>{
 const allGroups=new Set(catalog.groups.map(group=>group[0]));
 const examples=[];
 for(const group of allGroups){
  const item=catalog.items.find(x=>x[3]===group&&x[5]&&x[6]);
  if(item)examples.push(item);
 }
 assert.ok(examples.length>=20,'most native source groups have at least one verified item name');
 for(const item of examples){
  for(const [term,locale,display] of [[item[5],'en',en],[item[6],'ja',ja]]){
   const hits=searchAllCollectionItems(catalog.items,term,locale,display);
   assert.ok(hits.some(x=>x[0]===item[0]),'missing item '+item[0]);
  }
 }
});

test('global search preserves bilingual fallback and does not list unknown or unverified item names',()=>{
 const known=catalog.items.find(x=>x[5]&&x[6]);
 const withoutLabel=catalog.items.find(x=>!x[5]&&!x[6]);
 assert.ok(known&&withoutLabel);
 const englishInJapanese=searchAllCollectionItems(catalog.items,known[5],'ja',ja);
 assert.ok(englishInJapanese.some(x=>x[0]===known[0]));
 const japaneseInEnglish=searchAllCollectionItems(catalog.items,known[6],'en',en);
 assert.ok(japaneseInEnglish.some(x=>x[0]===known[0]));
 assert.deepEqual(searchAllCollectionItems(catalog.items,'  ','en',en),[]);
 const matches=searchAllCollectionItems(catalog.items,'a','en',en);
 assert.ok(matches.every(item=>en(item)));
 const synthetic=[known,withoutLabel];
 const unique='__definitely_no_match_unlabeled_entry__';
 assert.deepEqual(searchAllCollectionItems(synthetic,unique,'en',()=>''),[]);
});

test('collection global search is visible on root, subcategory, and item pages and opens the original sprite editor',()=>{
 assert.match(app,/\{:else\}\s*<div class="collection-controls collection-search-controls">/);
 assert.match(app,/\{#if showingGlobalCollectionSearch\}/);
 assert.match(app,/\{:else if !selectedGroup\}/);
 assert.match(app,/\{:else if !activeSubgroup\}/);
 assert.match(app,/function jumpToCollectionItem\(item:Item\)/);
 assert.match(app,/selectedGroup=item\[3\];selectedSubgroup=item\[2\]/);
 assert.match(app,/showVariants=item\[0\]!==item\[7\]/);
 assert.match(app,/collectionSearchDrilldown=true/);
 assert.match(app,/void fetchImages\(item\[3\]\)/);
 assert.match(app,/searchAllCollectionItems\(\(catalog as Catalog\|null\)\?\.items\?\?\[\],query,locale,nameFor\)/);
 assert.match(app,/bind:value=\{query\}[\s\S]{0,100}collectionSearchDrilldown=false/);
 assert.equal((app.match(/placeholder=\{copy\.search\}/g)||[]).length,1,'one shared search control for all collection pages');
 assert.match(app,/iconPack\.entries\[String\(sub\.previewId\)\]/);
 assert.match(app,/iconPack\.entries\[String\(item\[0\]\)\]/);
});

test('global search renders exact item artwork from the bounded shared pack cache',()=>{
 const section=app.slice(app.indexOf('<div class="collection-search-results editor-virtual-grid"'),app.indexOf('{:else if !selectedGroup}'));
 assert.ok(section.includes('inventoryIconPacks[item[3]]?.entries'));
 assert.ok(section.includes('originalArtUrl={originalVariantArt[String(item[0])]}'));
 assert.ok(section.includes('class="collection-search-art"'));
 assert.ok(section.includes('<DyeSprite'));
 assert.ok(section.includes('class="item-sprite"'));
 assert.match(app,/const groups=new Set\(renderedCollectionSearch\.map\(item=>item\[3\]\)\)/);
 assert.match(app,/if\(inventoryIconPending\.size>=3\)break/);
});

test('achievement and collection lists use a shared full-range virtual window without manual paging',()=>{
 const achievements=app.slice(app.indexOf("{:else if activeTool==='achievements'}"),app.indexOf('<dialog class="achievement-dialog"'));
 assert.match(achievements,/bind:value=\{achievementQuery\}/);
 assert.doesNotMatch(achievements,/class="status-filter"/);
 assert.doesNotMatch(achievements,/showEveryAchievement|achievementFilter|class="variation-button"/);
 assert.match(achievements,/bind:this=\{editorGridEl\}/);
 assert.match(achievements,/data-total=\{achievementRows.length\}/);
 assert.match(achievements,/\{#each renderedAchievements as item \(item.guid\)\}/);
 for(const [window,rows] of [['collectionWindow','matching'],['searchWindow','collectionSearchResults'],['achievementWindow','achievementRows']]){
  assert.ok(app.includes('const '+window+'=$derived(inventoryVirtualWindow('+rows+'.length,editorViewport))'));
  assert.ok(app.includes('style:padding-block-start={'+window+".before+'px'}"));
  assert.ok(app.includes('style:padding-block-end={'+window+".after+'px'}"));
 }
 assert.doesNotMatch(app,/achievementLoadMoreSentinel|loadMoreSentinel|visibleLimit|achievementLimit|inventoryLimit/);
 assert.doesNotMatch(app,/achievementShowAll/);
});

test('collection navigation and date dialogs reuse verified packs without revoking shared URLs',()=>{
 assert.match(app,/const pack=await fetchInventoryIcons\(key\)/);
 assert.match(app,/const cached=inventoryIconPacks\[group\];if\(cached\)return Promise.resolve\(cached\)/);
 assert.match(app,/const existing=inventoryIconRequests.get\(group\);if\(existing\)return existing/);
 assert.doesNotMatch(app,/iconPack\?\.dispose\(/);
 assert.match(app,/inventoryIconPacks\[dateDialogItem\[3\]\]\?\.entries/);
 assert.match(app,/for\(const pack of Object.values\(inventoryIconPacks\)\)pack.dispose\(\)/);
});
