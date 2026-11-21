import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const {outputFiles}=await build({
 entryPoints:[fileURLToPath(new URL('../src/floorplan-names.ts',import.meta.url))],
 bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'
});
const {FLOORPLAN_ITEM_IDS,FLOORPLAN_BABEL_IDS,verifiedFloorplanName}=
 await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const LOC=["ar","de","en","en-GB","es","fr","fr-CA","it","ja","ko","nl","pt-BR","ru","tr","zh-Hans","zh-Hant"];
const HASH={
 ar:"1edf2c2fab205c9afd77fdf03f6f7ff09f167c8caa214a2ace8b9e110eff698f",
 de:"85ec426e62ab731dddb6fc06c423fd58c813889820bec345020499be9f9fc46e",
 en:"3f05e71c40c26025fc68cfdaf95d57bb0d40eb008336cc7919a051d7f15018f9",
 "en-GB":"b95bda00336682d0ffc8c19d77a2fc4e51082a8e50298b39994f62332e5da1e3",
 es:"3648745027f7bc5fd712cf5c4d673709fe7dca07609ecbef3a065b4173b3bd42",
 fr:"a2938f8692b8815582f578c29322f137619ef404a6f021b78ff5c10cf4d1a475",
 "fr-CA":"189f244636dd3d732fbd94c9ee3cdc161cdcd5035f4a222ff6f85a6d97a30b61",
 it:"ca63a0692cec0966fcbcc01e9d73fc57759bbbd560d8c7e48127b78849f29db1",
 ja:"29cbe0e1989d6528ab0287e00c1c241bbb6c49b57c1ee1a6d0bd0d23955c329c",
 ko:"170696163226140324db503d21eae05165ea975faf613275130e51d5d197e486",
 nl:"44dda3c9463544880ba09e76d25e372784c6bd77c41bf9e02a75d3d57798a9b7",
 "pt-BR":"8ae634d583b0d161c00a17ccf2b73faf4853c6eaa74494c344adc527ac3fe313",
 ru:"0d33a1ec472a842250c3480ae0b3c7f6307397cbd2041cf0af624d0eee4b80ac",
 tr:"2fae494da0cbe6f5ce74b287e7a05150e0e1396f9569724fef39f9565402e16c",
 "zh-Hans":"fc14a4be9a21d93a686a35c3d7ab1161b403181c8e78ef0d0bb15c7e394c4822",
 "zh-Hant":"cd07ad01c0d6200c2f443024e29968a08562caaa86fef196d74a52ff8b62b20e"
};
const ID_BABEL={
 259795663:"558501416132435976",290094351:"558501419408187392",
 300918892:"558501416132435968",464377127:"558124727507345414",
 559890359:"558501416132435974",618271257:"558501416132435972",
 619281290:"558501416132435971",754411213:"558124727507345409",
 768707764:"558124727507345423",1287138344:"558501416094687232",
 1386807800:"558124727507345410",1436147020:"558501416132435970",
 1517287020:"558501416132435977",1611086920:"558124727507345415",
 1709307148:"558124727507345418",1834332337:"558501416132435969",
 2124133713:"562895356075991040",2146463597:"558501416132435973"
};
function zipStored(buffer){
 const entries=new Map();let p=0;
 while(p+30<=buffer.length&&buffer.readUInt32LE(p)===0x04034b50){
  assert.equal(buffer.readUInt16LE(p+8),0,'uncompressed icon ZIP');
  const n=buffer.readUInt16LE(p+26),extra=buffer.readUInt16LE(p+28),
   len=buffer.readUInt32LE(p+18),name=buffer.toString('utf8',p+30,p+30+n);
  const start=p+30+n+extra;
  assert.ok(start+len<=buffer.length);
  entries.set(name,buffer.subarray(start,start+len));
  p=start+len;
 }
 return entries;
}

test('18 source-defined floorplans have 18 distinct pinned ItemIds and Babel IDs',()=>{
 assert.equal(FLOORPLAN_ITEM_IDS.length,18);
 assert.equal(new Set(FLOORPLAN_ITEM_IDS).size,18);
 assert.equal(FLOORPLAN_BABEL_IDS.length,18);
 assert.equal(new Set(FLOORPLAN_BABEL_IDS).size,18);
 assert.deepEqual(FLOORPLAN_ITEM_IDS.map((id,i)=>[id,FLOORPLAN_BABEL_IDS[i]]),
  Object.entries(ID_BABEL).map(([id,babel])=>[Number(id),babel]).sort((a,b)=>a[0]-b[0]));
 assert.equal(verifiedFloorplanName(0,'ja'),null);
 assert.equal(verifiedFloorplanName(616161,'en'),null);
});

test('all 16×18 labels match original Steam v3.0.1 Babel strings byte-for-byte',()=>{
 for(const locale of LOC){
  const text=FLOORPLAN_ITEM_IDS.map(id=>{
   const value=verifiedFloorplanName(id,locale);
   assert.ok(value&&value.trim(),'missing '+locale+'/'+id);
   return value;
  }).join('\n');
  assert.equal(createHash('sha256').update(text).digest('hex'),HASH[locale],
   'Original Babel table 300 text mismatch: '+locale);
 }
 assert.equal(verifiedFloorplanName(768707764,'ja'),'小さな部屋の間取り図');
 assert.equal(verifiedFloorplanName(1517287020,'ja'),'ジグザグの間取り図');
 assert.equal(verifiedFloorplanName(259795663,'en'),'Zag Zig Floorplan');
 assert.equal(verifiedFloorplanName(290094351,'en-GB'),'Long Room Centre Loft Floorplan');
});

test('all 18 original floorplan icon IDs are present exactly once in the existing shipped local WebP sheet',()=>{
 const src=readFileSync(new URL('../public/item-packs/collection_group_floorplans.zip',import.meta.url));
 const files=zipStored(src);
 const idx=JSON.parse(files.get('index.json').toString('utf8'));
 assert.equal(idx.schema,'HKIA.SheetIcons.1');
 assert.equal(idx.group,'collection_group_floorplans');
 assert.equal(idx.size,96);
 const ids=idx.records.map(row=>row[0]);
 assert.equal(ids.length,18);
 assert.deepEqual([...ids].sort((a,b)=>a-b),[...FLOORPLAN_ITEM_IDS]);
 assert.equal(new Set(ids).size,18);
 for(const [,sheet,cell] of idx.records){
  assert.ok(Number.isInteger(cell)&&cell>=0&&cell<144);
  const name='sheet-'+String(sheet).padStart(3,'0')+'.webp';
  const image=files.get(name);
  assert.ok(image,'missing source-verified local sheet '+name);
  assert.equal(image.toString('ascii',0,4),'RIFF');
  assert.equal(image.toString('ascii',8,12),'WEBP');
 }
});

test('localized Floorplan labels take priority over old unmatched catalog names in all collection contexts',()=>{
 const app=read('../src/App.svelte');
 assert.match(app,/import \{verifiedFloorplanName\} from '\.\/floorplan-names'/);
 assert.match(app,/verifiedFloorplanName\(item\[0\],locale\)\?\?/);
 assert.match(app,/collectionDisplayName\(item,gameLabels\.names\[String\(item\[0\]\)\]/);
 assert.match(app,/const matching=\$derived\(filterCollectionItems\(/);
 assert.match(app,/class="item-sprite"/);
 assert.match(app,/iconPack\?\.group===selectedGroup\?iconPack\.entries\[String\(item\[0\]\)\]/);
 assert.match(app,/verifiedFloorplanName\(x\[0\],locale\)/,'unverified count excludes exact game names');
});
