import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const readJson=(name)=>JSON.parse(readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const shirt=readJson('data/unityfs-audit/pajama-shirt.v3.0.1.json');
const pants=readJson('data/unityfs-audit/pajama-pants.v3.0.1.json');
const archer=readJson('data/unityfs-audit/archer-costume.v3.0.1.json');
const dyes=readJson('public/native-dye-palettes.json');
const CAB=/^CAB-[0-9a-f]{32}$/;
const integer64=/^-?[0-9]{1,20}$/;

// The shipped original game 96px UiIcon pack is a stored ZIP. Verify its
// metadata without extracting or publishing any private model/texture bytes.
function originalIconIndex(){
 const zip=readFileSync(new URL('../public/item-packs/collections_group_clothing.zip',import.meta.url));
 let offset=0;
 while(offset+30<=zip.length&&zip.readUInt32LE(offset)===0x04034b50){
  const method=zip.readUInt16LE(offset+8);
  const packed=zip.readUInt32LE(offset+18);
  const length=zip.readUInt16LE(offset+26);
  const extra=zip.readUInt16LE(offset+28);
  const name=zip.toString('utf8',offset+30,offset+30+length);
  const start=offset+30+length+extra;
  assert.equal(method,0,'source ZIP must contain stored entries');
  assert.ok(start+packed<=zip.length);
  if(name==='index.json')return JSON.parse(zip.toString('utf8',start,start+packed));
  offset=start+packed;
 }
 throw Error('ORIGINAL_PAJAMA_ICON_INDEX_NOT_FOUND');
}

test('original Steam v3.0.1 pajama UnityFS manifests preserve full external Material PPtrs',()=>{
 for(const a of [shirt,pants]){
  assert.equal(a.schema,'HKIA.UnityFSAudit.1');
  assert.equal(a.version,'3.0.1');
  assert.equal(a.source,'original-game-unityfs');
  assert.match(a.sha256,/^[0-9a-f]{64}$/);
  assert.ok(a.compressedBytes>1000);
  assert.equal(a.unityfs.format,8);
  assert.equal(a.serialized.version,22);
  assert.equal(a.serialized.hasEmbeddedMaterial,false);
  assert.equal(a.serialized.hasEmbeddedTexture2D,false);
  assert.match(a.serialized.nodeName,CAB);
  assert.ok(a.serialized.classCounts.MeshRenderer>=1);
  assert.equal(a.relationToColorwayItemIDs.startsWith('unverified-candidate'),true);
  assert.ok(a.blocker.includes('not publishable'));
  let count=0;
  for(const renderer of a.serialized.rendererMaterialReferences){
   assert.ok(['MeshRenderer','SkinnedMeshRenderer'].includes(renderer.class));
   assert.match(renderer.objectPathId,integer64);
   for(const ref of renderer.materials){
    assert.match(ref.externalCAB,CAB);
    assert.match(ref.pathId,integer64);
    assert.ok(Number.isInteger(ref.fileId)&&ref.fileId>0);
    assert.equal(ref.externalCAB,a.serialized.externalCABs[ref.fileId-1]);
    count++;
   }
  }
  assert.ok(count>0);
 }
 assert.equal(shirt.bundle,'l_basicstyle_shirt_pajamaoutfit');
 assert.equal(pants.bundle,'l_basicstyle_pants_pajamaoutfit');
 assert.equal(shirt.serialized.verifiedGameObject,'BasicStyle_Shirt_PajamaOutfit');
 assert.equal(pants.serialized.verifiedGameObject,'BasicStyle_Pants_PajamaOutfit');
});

test('source-confirmed shared pajama material reference is the same object used by Archer',()=>{
 const common='CAB-46b8f8fe122147493b3113f7c1c8cd0f';
 const s=shirt.serialized.rendererMaterialReferences.find(r=>r.class==='SkinnedMeshRenderer');
 const a=archer.serialized.rendererMaterialReferences.find(r=>r.class==='SkinnedMeshRenderer');
 assert.deepEqual(s.materials.map(x=>[x.externalCAB,x.pathId]),[[common,'6824069125264728142']]);
 assert.deepEqual(a.materials.map(x=>[x.externalCAB,x.pathId]),[[common,'6824069125264728142']]);
 assert.notEqual(pants.serialized.rendererMaterialReferences[0].materials[0].externalCAB,common);
});

test('original game icon atlas associates 22 native dyeable IDs with each neutral pajama cell',()=>{
 const icons=originalIconIndex();
 assert.equal(icons.schema,'HKIA.SheetIcons.1');
 assert.equal(icons.group,'collections_group_clothing');
 assert.equal(icons.size,96);
 const idsFor=(cell)=>icons.records.filter(r=>r[1]===0&&r[2]===cell).map(r=>r[0]);
 const shirtIds=idsFor(77),pantsIds=idsFor(44);
 assert.equal(shirtIds.length,22);
 assert.equal(pantsIds.length,22);
 assert.equal(new Set([...shirtIds,...pantsIds]).size,44);
 for(const id of [...shirtIds,...pantsIds]){
  assert.ok(dyes.records[String(id)],'every UI icon ID must carry a game-original native dye palette');
 }
 // A matching prefab name is not sufficient to infer a shader/material mask.
 assert.equal(shirt.relationToColorwayItemIDs.startsWith('unverified-candidate'),true);
 assert.equal(pants.relationToColorwayItemIDs.startsWith('unverified-candidate'),true);
});

test('do not publish inferred striped icon renders as verified images',()=>{
 const index=readJson('public/variant-art/index.json');
 const originals=originalIconIndex();
 const itemIds=new Set(originals.records.filter(r=>r[1]===0&&(r[2]===44||r[2]===77)).map(r=>String(r[0])));
 for(const id of itemIds)assert.equal(Object.hasOwn(index.records,id),false);
});
