import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readStoredIconPack} from '../scripts/unpack-source-colorways.mjs';
const index=JSON.parse(readFileSync(new URL('../public/source-colorways/index.json',import.meta.url),'utf8'));
const pack=index.atlasOriginalPacks[0];
const bytes=readFileSync(new URL('../data/source-colorway-packs/'+pack.file,import.meta.url));
const expected=new Map(Object.values(index.records).filter(r=>r.pack===pack.file).map(r=>[r.file,r.sha256]));
test('bounded stored ZIP exposes exactly the registered source-original WebPs',()=>{
 const files=readStoredIconPack(bytes,expected);
 assert.equal(files.size,46);
 for(const [name,data] of files){
  assert.deepEqual(data,readFileSync(new URL('../public/source-colorways/'+name,import.meta.url)));
 }
});
test('source pack rejects a modified or unregistered file, compressed entries and truncation',()=>{
 const changed=Buffer.from(bytes);changed[100]^=1;
 assert.throws(()=>readStoredIconPack(changed,expected),/SOURCE_PACK_IMAGE/);
 const wrong=new Map(expected);wrong.delete(wrong.keys().next().value);
 assert.throws(()=>readStoredIconPack(bytes,wrong),/SOURCE_PACK_FILENAME/);
 const compressed=Buffer.from(bytes);compressed.writeUInt16LE(8,8);
 assert.throws(()=>readStoredIconPack(compressed,expected),/SOURCE_PACK_ENTRY/);
 assert.throws(()=>readStoredIconPack(bytes.subarray(0,100),expected),/SOURCE_PACK_ENTRY/);
});
