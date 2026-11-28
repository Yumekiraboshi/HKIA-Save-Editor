import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {deflateRawSync} from 'node:zlib';
import {readNativeZip,losslessDimensions,unpackNativeArt,verifyNativeParts} from '../scripts/unpack-native-art.mjs';
function zip(name,data,method=0){
 const filename=Buffer.from(name),body=method===8?deflateRawSync(data):data;
 const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(method,8);h.writeUInt32LE(body.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(filename.length,26);
 return Buffer.concat([h,filename,body,Buffer.from([0x50,0x4b,1,2])]);
}
test('reviewed transport accepts stored WebP and bounded deflated JSON, never traversal or alternate file formats',()=>{
 const name='native-art/'+'a'.repeat(64)+'.webp',image=Buffer.from('fixture'),metadata=Buffer.from('{}');
 assert.deepEqual([...readNativeZip(zip(name,image))],[[name,image]]);
 assert.deepEqual([...readNativeZip(zip('distribution.json',metadata,8))],[['distribution.json',metadata]]);
 for(const name of ['../distribution.json','native-art/../x.webp','raw/definitions','native-art/x.png'])
  assert.throws(()=>[...readNativeZip(zip(name,image))],/ZIP member/);
 assert.throws(()=>[...readNativeZip(zip(name,image,8))],/ZIP method/);
 const invalid=zip('distribution.json',metadata,8);invalid.writeUInt32LE(100000000,22);
 assert.throws(()=>[...readNativeZip(invalid)],/ZIP method/);
});
test('VP8L header retains rectangular native dimensions, rejects a lossy chunk',()=>{
 const b=Buffer.alloc(26);b.write('RIFF',0);b.writeUInt32LE(18,4);b.write('WEBPVP8L',8);b.writeUInt32LE(5,16);b[20]=0x2f;b.writeUInt32LE((127)|(255<<14),21);
 assert.deepEqual(losslessDimensions(b),[128,256]);
 b.write('VP8 ',12);assert.throws(()=>losslessDimensions(b),/non-lossless/);
});
test('null release pin does not activate or fetch any original assets',()=>{
 const root=mkdtempSync(join(tmpdir(),'hkia-native-art-test-'));
 try{
  mkdirSync(join(root,'src'));writeFileSync(join(root,'src/native-art-release-pin.json'),'null');
  assert.equal(unpackNativeArt(root),false);
  mkdirSync(join(root,'public/native-art-releases/3.0.1-steam'),{recursive:true});
  assert.throws(()=>unpackNativeArt(root),/stale generated artwork/);
  mkdirSync(join(root,'parts'));mkdirSync(join(root,'out'));
  writeFileSync(join(root,'parts/parts.json'),JSON.stringify({schema:'HKIA.NativeArtDeliveryParts.1',version:'3.0.1',distributionSha256:'a'.repeat(64),parts:[]}));
  assert.throws(()=>verifyNativeParts(join(root,'parts'),'b'.repeat(64),join(root,'out')),/parts index/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
