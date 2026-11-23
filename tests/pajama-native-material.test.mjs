import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const originals={
 shirt:read('data/unityfs-audit/pajama-shirt.v3.0.1.json'),
 pants:read('data/unityfs-audit/pajama-pants.v3.0.1.json')
};
const materials={
 shirt:read('data/unityfs-audit/pajama-shirt-materials.v3.0.1.json'),
 pants:read('data/unityfs-audit/pajama-pants-materials.v3.0.1.json')
};
const shader=read('data/unityfs-audit/pajama-shader.v3.0.1.json');
const sha=/^[0-9a-f]{64}$/;

test('offline UnityFS dye material auditor has deterministic synthetic self-test',()=>{
 const python=spawnSync('python3',[
  fileURLToPath(new URL('../scripts/audit-native-dye-materials.py',import.meta.url)),
  '--self-test'
 ],{encoding:'utf8',timeout:15_000});
 assert.equal(python.status,0,python.stderr);
 assert.match(python.stdout,/NATIVE_DYE_MATERIAL_SELFTEST_OK/);
});

test('two exact source-native pajama Material objects match original Renderer PPtrs',()=>{
 for(const kind of ['shirt','pants']){
  const manifest=materials[kind],original=originals[kind];
  assert.equal(manifest.schema,'HKIA.NativeDyeMaterialAudit.1');
  assert.equal(manifest.source,'original-game-unityfs');
  assert.equal(manifest.renderFidelity,'unverified');
  assert.equal(manifest.actualGameUiIconConfirmed,false);
  assert.match(manifest.sourceSha256,sha);
  assert.match(manifest.serializedCab,/^CAB-[0-9a-f]{32}$/);
  const realRefs=original.serialized.rendererMaterialReferences.flatMap(
   r=>r.materials.filter(m=>m.externalCAB===manifest.serializedCab)
  );
  assert.equal(realRefs.length,1);
  const ids=Object.keys(manifest.materials);
  assert.deepEqual(ids,[realRefs[0].pathId]);
  const material=manifest.materials[ids[0]];
  assert.equal(material.name,original.serialized.verifiedGameObject);
  assert.equal(material.shader.pathId,shader.shader.pathId);
  assert.ok(material.shader.fileId>0);
  assert.deepEqual(Object.keys(material.textures).sort(),
   ['_BaseMap','_BumpMap','_ComboMap','_PatternMap']);
  assert.equal(Object.keys(manifest.textures).length,4);
  const suffixes={_BaseMap:'_C',_BumpMap:'_N',_ComboMap:'_X',_PatternMap:'_P'};
  for(const [property,ref] of Object.entries(material.textures)){
   assert.equal(ref.fileId,0,'verified local Texture2D PPtr');
   assert.deepEqual(ref.scale,[1,1]);
   assert.deepEqual(ref.offset,[0,0]);
   const texture=manifest.textures[ref.pathId];
   assert.ok(texture);
   assert.ok(texture.name.endsWith(suffixes[property]));
   assert.equal(texture.width,512);
   assert.equal(texture.height,512);
   assert.equal(texture.streamPath,
    'archive:/'+manifest.serializedCab+'/'+manifest.serializedCab+'.resS');
   assert.ok(['BC1/DXT1','BC3/DXT5'].includes(texture.format));
   assert.match(texture.baseMipSha256,sha);
   assert.match(texture.streamSha256,sha);
  }
 }
});

test('original game shader object and palette properties resolve without claiming icon fidelity',()=>{
 assert.equal(shader.schema,'HKIA.NativeDyeShaderAudit.1');
 assert.equal(shader.sourceBundle,'definitions');
 assert.equal(shader.sourceSha256,
  read('public/native-dye-palettes.json').definitions_sha256);
 assert.equal(shader.serializedCab,'CAB-46b8f8fe122147493b3113f7c1c8cd0f');
 assert.equal(shader.shader.classId,48);
 assert.equal(shader.shader.name,'Sunblink/Lynx/CustomLitCharacter');
 assert.equal(shader.shader.pathId,'477622052401609204');
 assert.match(shader.shader.objectSha256,sha);
 assert.equal(shader.shaderSourceCodeRecovered,false);
 assert.equal(shader.shaderColorMappingVerified,false);
 assert.equal(shader.gameUiIconCameraAndLightingVerified,false);
 assert.equal(shader.outputArtworkRegistered,false);
 for(const property of ['_BaseMap','_BumpMap','_ComboMap','_PatternMap',
  '_PaletteColor1','_PaletteColor2','_PaletteColor3','_PaletteColor4','_PaletteColor5'])
  assert.ok(shader.shader.sourcePropertyNames.includes(property));
});

test('actual stripe source textures are not represented as published game UiIcons',()=>{
 const shirt=materials.shirt,pants=materials.pants;
 const pattern=(m)=>Object.values(m.materials)[0].textures._PatternMap.pathId;
 assert.notEqual(shirt.textures[pattern(shirt)].baseMipSha256,
  pants.textures[pattern(pants)].baseMipSha256);
 const indexed=read('public/variant-art/index.json');
 assert.equal(Object.keys(indexed.records).length,0,
  'source texture recovery is not proof of finished per-Item-ID icon');
});
