import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const catalog=JSON.parse(read('../public/catalog.json'));
const app=read('../src/App.svelte');
async function compiled(path){
 const b=await build({entryPoints:[fileURLToPath(new URL(path,import.meta.url))],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 return import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
}
const {collectionDisplayName,filterCollectionItems,searchAllCollectionItems}=
 await compiled('../src/collection-search.ts');
const {listSubcategories,recordedFamilies}=await compiled('../src/subcategories.ts');
const ja=item=>collectionDisplayName(item,undefined,true,'名称未確認');
const en=item=>collectionDisplayName(item,undefined,false,'Unverified item name');
const empty=Object.freeze({});

test('Floor Plans contains source-defined parent items even in a fully unrecorded save',()=>{
 const group='collection_group_floorplans';
 const floor=catalog.items.filter(item=>item[3]===group);
 const parents=floor.filter(item=>item[0]===item[7]);
 const unnamed=floor.filter(item=>!item[5]&&!item[6]);
 assert.ok(floor.length>0,'Floor Plans source group missing');
 assert.ok(parents.length>0,'Floor Plans base items missing');
 const subgroups=listSubcategories(catalog.items,group,empty,'ja');
 assert.ok(subgroups.length>0,'floor-plan subcategory missing');
 const total=subgroups.reduce((sum,sub)=>sum+sub.total,0);
 assert.equal(total,parents.length,'every floor-plan base item is counted by the source');
 assert.ok(subgroups.every(sub=>sub.count===0),'zero-record collection must start at 0/X');
 const rendered=subgroups.flatMap(sub=>filterCollectionItems(
  catalog.items,group,sub.key,empty,recordedFamilies(catalog.items,empty),
  false,'all','','ja',ja));
 assert.equal(rendered.length,parents.length,'every floor-plan base item must be visible at 0/X');
 assert.ok(rendered.every(item=>Boolean(ja(item))));
 for(const item of unnamed){
  assert.match(ja(item),/^名称未確認 \(ID \d+\)$/);
  assert.match(en(item),/^Unverified item name \(ID \d+\)$/);
 }
 console.log('Floor Plans source: all='+floor.length+', base='+parents.length+
  ', unnamed='+unnamed.length+', subcategories='+subgroups.length);
});

test('zero-progress and unknown-name items remain visible, while optional filters remain honest',()=>{
 const base=[99,'some_internal_key','collection_floorplans_floorplans',
  'collection_group_floorplans',0,null,null,99];
 const named=[100,'key2','collection_floorplans_floorplans',
  'collection_group_floorplans',0,'Verified floor plan','確認済み間取り',100];
 const saved={};
 const all=filterCollectionItems([base,named],base[3],base[2],saved,empty,false,'all','','ja',ja);
 assert.deepEqual(all.map(item=>item[0]),[100,99].sort((a,b)=>ja(a===99?base:named).localeCompare(ja(b===99?base:named),'ja')||a-b));
 assert.equal(all.length,2);
 assert.equal(filterCollectionItems([base,named],base[3],base[2],saved,empty,false,'unrecorded','','ja',ja).length,2);
 assert.equal(filterCollectionItems([base,named],base[3],base[2],saved,empty,false,'recorded','','ja',ja).length,0);
 assert.equal(filterCollectionItems([base,named],base[3],base[2],saved,empty,false,'all','99','ja',ja).length,1);
 assert.ok(searchAllCollectionItems([base,named],'99','ja',ja).some(item=>item[0]===99));
 const owned={'99':621355968000000000n};
 const families=recordedFamilies([base,named],owned);
 assert.equal(filterCollectionItems([base,named],base[3],base[2],owned,families,false,'recorded','','ja',ja).length,1);
 assert.equal(filterCollectionItems([base,named],base[3],base[2],owned,families,false,'unrecorded','','ja',ja).length,1);
});

test('verified Babel and source names still take priority over ID-only placeholder',()=>{
 const item=[123,'anything','collection_floorplans_floorplans',
  'collection_group_floorplans',0,'Verified room','確認済みの部屋',123];
 assert.equal(collectionDisplayName(item,'ゲーム原文',true,'名称未確認'),'ゲーム原文');
 assert.equal(collectionDisplayName(item,undefined,true,'名称未確認'),'確認済みの部屋');
 assert.equal(collectionDisplayName(item,undefined,false,'Unverified item name'),'Verified room');
 assert.equal(collectionDisplayName({...item,5:null,6:null},undefined,true,'名称未確認'),'名称未確認 (ID 123)');
});

test('UI does not gate native collection display on label verification or saved history',()=>{
 assert.match(app,/filterCollectionItems\(/);
 assert.match(app,/collectionDisplayName\(/);
 assert.doesNotMatch(app,/!nameFor\(item\)/);
 assert.match(app,/const has=showVariants\?direct:recordIds\.length>0/);
 assert.match(app,/recorded\[String\(item\[0\]\)\]/);
 assert.match(app,/item\[4\]===0/,'existing source safety gate is unchanged');
 assert.match(app,/\{#if matching\.length===0\}/);
 const copy=read('../src/ui-copy.ts');
 assert.match(copy,/"unverifiedItem": "名称未確認"/);
 assert.match(copy,/元データのIDで区別して表示/);
});
