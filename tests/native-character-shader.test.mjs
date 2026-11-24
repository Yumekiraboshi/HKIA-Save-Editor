import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const evidence=JSON.parse(readFileSync(new URL('../data/unityfs-audit/definitions-character-shader.v3.0.1.json',import.meta.url),'utf8'));
test('original character shader evidence links native five palette properties and exact program stages',()=>{
 assert.equal(evidence.shaderName,'Sunblink/Lynx/CustomLitCharacter');
 assert.equal(evidence.properties.filter(p=>p.startsWith('_PaletteColor')).length,5);
 assert.equal(evidence.segments.reduce((s,p)=>s+p.pixelPrograms,0),32);
 assert.equal(evidence.segments.reduce((s,p)=>s+p.vertexPrograms,0),12);
 assert.equal(evidence.summary.textureReferences,174);
 assert.equal(evidence.archerSkinMaterial.isDyeShader,false);
 assert.equal(evidence.nativeIconRenderVerified,false);
});
test('DXBC reader rejects truncated and invalid tokenized shader containers',()=>{
 const p=fileURLToPath(new URL('../scripts/audit-native-character-shader.py',import.meta.url));
 assert.match(execFileSync('python3',[p,'--self-test'],{encoding:'utf8'}),/NATIVE_CHARACTER_SHADER_SELFTEST_OK/);
});
