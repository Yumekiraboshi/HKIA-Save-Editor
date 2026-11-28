import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './chef-appearance'; export * from './native-characteristic-tint'; export * from './native-icon-route';",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {resolveChefTints,NATIVE_CHARACTERISTIC_IDS,CHEF_MAPPED_IDS,nativeChefInstructionBase,nativeIconRoute}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const dir=new URL('../public/dynamic-chef-art/',import.meta.url),read=n=>readFileSync(new URL(n,dir)),sha=b=>createHash('sha256').update(b).digest('hex');
const raw=read('chef-runtime-source-v3.0.1.json'),m=JSON.parse(raw);
const colors=new Map(m.colors.map(r=>[r.characteristicId,r.rgba]));
const white=[1,1,1,1],boba=m.rows.find(r=>r.kind==='boba'),cafe=m.rows.find(r=>r.kind==='cafe');
test('pinned original cooking swatches resolve through exact characteristic IDs',()=>{
 assert.equal(sha(raw),'8c73d78ef825e53777bd5042201a6290289213b0f226b27a39e72707ba1fa59c');
 assert.equal(colors.size,34);
 assert.equal(m.colors.find(r=>r.characteristicId===6).swatchId,237);
 assert.equal(m.colors.find(r=>r.characteristicId===14).swatchId,211);
 assert.equal(m.colors.find(r=>r.characteristicId===142).swatchId,496);
 assert.deepEqual(colors.get(33),colors.get(34));
 for(const row of m.colors){
  assert.ok(row.rgba.length===4&&row.rgba.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  assert.deepEqual(resolveChefTints(boba,{kind:'boba',colorId:row.characteristicId},colors),[row.rgba,white,white]);
 }
});
test('ordered Cafe Colors use first three tints, missing slots remain white; no flavor or unknown ID inference',()=>{
 assert.deepEqual(resolveChefTints(cafe,{kind:'cafe',colors:[6,14,11,19]},colors),[colors.get(6),colors.get(14),colors.get(11)]);
 assert.deepEqual(resolveChefTints(cafe,{kind:'cafe',colors:[14,6]},colors),[colors.get(14),colors.get(6),white]);
 assert.deepEqual(resolveChefTints(cafe,{kind:'cafe',colors:[]},colors),[white,white,white]);
 assert.equal(resolveChefTints(cafe,{kind:'cafe',colors:[9999]},colors),null);
 assert.equal(resolveChefTints(boba,{kind:'boba',colorId:9999},colors),null);
 assert.equal(resolveChefTints(boba,{kind:'cafe',colors:[6]},colors),null);
});
test('all ten original chef icon bindings use exact source crops and the existing mask texture',()=>{
 const audit=JSON.parse(readFileSync(new URL('../data/unityfs-audit/dynamic-uiicons.v3.0.1.json',import.meta.url),'utf8'));
 const rows=audit.rows.filter(r=>r.key.startsWith('item_chefcreation_'));
 assert.equal(rows.length,10);assert.equal(m.rows.length,10);assert.equal(new Set(m.rows.map(r=>r.itemId)).size,10);
 assert.equal(m.rows.filter(r=>r.kind==='boba').length,1);
 for(const row of m.rows){
  const a=rows.find(r=>r.itemId===row.itemId);assert.ok(a);
  assert.equal(row.definitionPathId,a.definitionPathId);assert.equal(row.base.spritePathId,a.baseSpritePathId);
  assert.equal(row.mask.spritePathId,a.maskSpritePathId);assert.equal(row.maskGuid,a.maskGuid);
  const [x,y,w,h]=row.base.sampleRect,[gx,gy,gw,gh]=row.base.guardRect;
  assert.ok(x-gx>=.5&&y-gy>=.5&&gx+gw-x-w>=.5&&gy+gh-y-h>=.5);
  assert.ok(gx+gw<=m.base.width&&gy+gh<=m.alphaOffsetY);
  assert.ok([65,67].includes(row.base.settingsRaw)&&[65,67].includes(row.mask.settingsRaw));
 }
 const b=read(m.base.file);assert.equal(b.length,m.base.bytes);assert.equal(sha(b),m.base.sha256);
 const mask=readFileSync(new URL('../public/inventory-flower-art/'+m.mask.file,import.meta.url));
 assert.equal(mask.length,m.mask.bytes);assert.equal(sha(mask),m.mask.sha256);
});

test('all 132 original characteristics use their mapped swatch or native white fallback',()=>{
 assert.equal(NATIVE_CHARACTERISTIC_IDS.length,132);
 assert.equal(new Set(NATIVE_CHARACTERISTIC_IDS).size,132);
 assert.deepEqual(new Set(colors.keys()),CHEF_MAPPED_IDS);
 for(const id of NATIVE_CHARACTERISTIC_IDS){
  const color=colors.get(id)??white;
  assert.deepEqual(resolveChefTints(boba,{kind:'boba',colorId:id},colors),[color,white,white]);
  assert.deepEqual(resolveChefTints(cafe,{kind:'cafe',colors:[6,id,14]},colors),[colors.get(6),color,colors.get(14)]);
 }
 for(const id of [0,40,45,51,70,83,155,9999,-1,1.5])assert.equal(resolveChefTints(boba,{kind:'boba',colorId:id},colors),null);
 const broken=new Map(colors);broken.delete(6);
 assert.equal(resolveChefTints(boba,{kind:'boba',colorId:6},broken),null);
});

test('all five native chef instructions share exact original base and mask identities without becoming individual color routes',()=>{
 const audit=JSON.parse(readFileSync(new URL('../data/unityfs-audit/dynamic-uiicons.v3.0.1.json',import.meta.url),'utf8'));
 const instructions=audit.rows.filter(r=>r.key.startsWith('item_instruction_chefcreation_'));
 assert.equal(instructions.length,5);
 const pairs=[];
 for(const row of instructions){
  const id=nativeChefInstructionBase(row.itemId),base=m.rows.find(r=>r.itemId===id);
  assert.ok(base);assert.equal(nativeIconRoute(row.itemId),'instruction');
  assert.equal(base.base.spritePathId,row.baseSpritePathId);
  assert.equal(base.mask.spritePathId,row.maskSpritePathId);
  assert.equal(base.maskGuid,row.maskGuid);
  pairs.push([row.itemId,id]);
 }
 assert.deepEqual(pairs.sort((a,b)=>a[0]-b[0]),[[664242277,406277059],[697059779,1237708874],[906644716,1798633565],[1711005390,1338995084],[1946811711,1053426049]]);
 for(const row of audit.rows.filter(r=>!r.key.startsWith('item_instruction_chefcreation_')))assert.equal(nativeChefInstructionBase(row.itemId),undefined);
 assert.equal(nativeChefInstructionBase(0),undefined);
});
