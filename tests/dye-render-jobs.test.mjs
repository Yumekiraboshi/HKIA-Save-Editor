import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareDyeRender,originalJobInputs} from '../scripts/prepare-dye-render.mjs';

const read=(name)=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
const families=read('../data/dye-render-families.json');
const recipes=read('../data/dye-render-recipes.json');
const archer=read('../data/unityfs-audit/archer-costume.v3.0.1.json');
const shirt=read('../data/unityfs-audit/komiyashirt.v3.0.1.json');
const original=originalJobInputs();

test('Archer family points to an audited real serialized GameObject, not a guessed prefab',()=>{
 const f=families.families[0];
 assert.equal(familyCount(),1);
 assert.equal(f.originalGameObject,'BasicStyle_FullBody_ImaginationArcher');
 assert.equal(f.originalUnityFS.bundle,'l_basicstyle_fullbody_imaginationarcher');
 assert.equal(f.originalUnityFS.sha256,archer.sha256);
 assert.equal(archer.serialized.version,22);
 assert.equal(archer.serialized.objectCount,105);
 assert.equal(archer.serialized.classCounts.SkinnedMeshRenderer,1);
 assert.equal(archer.serialized.classCounts.GameObject,49);
 assert.equal(archer.serialized.hasEmbeddedMaterial,false);
 assert.equal(archer.serialized.hasEmbeddedTexture2D,false);
 assert.equal(f.rendererStatus,'blocked-unresolved-materials');
 assert.deepEqual(f.verifiedMaterialDependencies,[]);
 assert.equal(f.verifiedShaderPaletteMask,false);
 assert.equal(recipes.recipes[0].publishable,false);
});
function familyCount(){return families.families.length;}

test('a different original garment bundles 1 Material, 3 textures, and an .resS',()=>{
 assert.equal(shirt.bundle,'l_nisetamastyle_shirt_komiyashirt');
 assert.equal(shirt.nodes[0].objectCount,123);
 assert.equal(shirt.nodes[0].classCounts.Material,1);
 assert.equal(shirt.nodes[0].classCounts.Texture2D,3);
 assert.equal(shirt.nodes[1].kind,'externalTextureStream');
 assert.equal(shirt.nodes[1].bytes,873888);
 assert.notEqual(shirt.sha256,archer.sha256);
});

test('both real game dye variants resolve exact palette and blocked UnityFS 3D job',()=>{
 for(const [id,first,second] of [
  [1286846063,'#ffbbfa','#c2feff'],
  [935642973,'#feffbd','#ffb337']
 ]){
  const job=prepareDyeRender(id,original);
  assert.equal(job.itemId,id);
  assert.match(job.itemKey,/^item_c_dyeable_icarcheroutfit_/);
  assert.equal(job.originalUnityFS.sha256,archer.sha256);
  assert.equal(job.prefabGameObject,'BasicStyle_FullBody_ImaginationArcher');
  assert.equal(job.palette.colors.length,5);
  assert.equal(job.palette.colors[0],first);
  assert.equal(job.palette.colors[1],second);
  assert.equal(job.outputRelative,'staging/variant-art/'+id+'.png');
  assert.equal(job.publishable,false);
  assert.equal(job.renderer.ready,false);
 }
});

test('prepareDyeRender rejects unsupported id, missing palettes, or mismatched provenance',()=>{
 assert.throws(()=>prepareDyeRender('0001',original),/DYE_JOB_DATA_INVALID/);
 assert.throws(()=>prepareDyeRender('2147483648',original),/DYE_JOB_ID_NOT_IN_ORIGINAL_CATALOG/);
 const noPalette={...original,palettes:{...original.palettes,records:{}}};
 assert.throws(()=>prepareDyeRender('1286846063',noPalette),/DYE_JOB_MISSING_GAME_PALETTE/);
 const corruptAudit={...archer,sha256:'0'.repeat(64)};
 assert.throws(()=>prepareDyeRender('1286846063',{...original,audits:{
  imagination_archer_costume:corruptAudit
 }}),/DYE_JOB_SOURCE_AUDIT_MISMATCH/);
});

test('CLI emits valid JSON jobs but intentionally refuses publication',()=>{
 const script=fileURLToPath(new URL('../scripts/prepare-dye-render.mjs',import.meta.url));
 const safe=spawnSync(process.execPath,[script,'--item-id','1286846063'],{encoding:'utf8'});
 assert.equal(safe.status,0,safe.stderr);
 assert.equal(JSON.parse(safe.stdout).palette.colors.length,5);
 const unsafe=spawnSync(process.execPath,[script,'--item-id','1286846063','--require-ready'],
  {encoding:'utf8'});
 assert.equal(unsafe.status,2);
 assert.match(unsafe.stderr,/DYE_RENDER_BLOCKED/);
});

test('Python UnityFS LZ4 parser has no third-party modules and passes its own fixtures',()=>{
 const path=fileURLToPath(new URL('../scripts/unityfs-audit.py',import.meta.url));
 const source=readFileSync(path,'utf8');
 assert.doesNotMatch(source,/import UnityPy|import lz4/);
 const result=spawnSync(process.platform==='win32'?'python':'python3',
  [path,'--self-test'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/UNITYFS_AUDIT_SELFTEST_OK/);
});

test('original game data is not embedded in repository and is never replaced by wiki images',()=>{
 const job=prepareDyeRender('1286846063',original);
 assert.equal(job.renderer.publishable,false);
 assert.equal(job.originalUnityFS.bundle,'l_basicstyle_fullbody_imaginationarcher');
 assert.equal(read('../public/variant-art/index.json').schema,'HKIA.DyeVariantArt.1');
 assert.deepEqual(read('../public/variant-art/index.json').records,{});
});
