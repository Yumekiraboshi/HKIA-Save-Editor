import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('non-clothing reference candidates exactly cover the pinned original tradeable category intersection',()=>{
 const source=JSON.parse(read('public/inventory-native-categories.json'));
 assert.equal(source.source.sha256,'ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0');
 const decoded=gunzipSync(Buffer.from(source.data,'base64'));
 assert.equal(hash(decoded),'1d9178ffead44300e89d2b600bf401d5a3914b8845104e32a8a423b0fc319fba');
 const ids=[],expected=[];let id=0,at=0;
 const rules=[...read('core/src/inventory_source_data.rs').split('pub(super) const CUSTOM_CAPS')[0].matchAll(/\((\d+),(\d+)\)/g)].map(m=>[Number(m[1]),Number(m[2])]);
 const bits=Buffer.from([...read('core/src/inventory_tradeable_data.rs').matchAll(/0x([0-9a-f]{2})\b/g)].map(m=>parseInt(m[1],16)));
 assert.equal(hash(bits),'3a9e06f1b2385881ebcd3db406a39120913b798902cdf4482876a44f7b206824');
 let tradeable=0;
 for(let i=0;i<source.count;i++){
  let n=0,shift=0,b;do{assert.ok(at<decoded.length);b=decoded[at++];n+=(b&127)*2**shift;shift+=7}while(b&128);
  assert.ok(n>0);id+=n;ids.push(id);
  assert.equal(rules[i][0],id);
  const [raw,override,ui]=source.palette[decoded[at++]];
  if(!(bits[i>>3]&(1<<(i&7))))continue;
  tradeable++;assert.equal(rules[i][1]&7,1);
  if(raw&256)continue;
  assert.ok(!(override&&ui&256));
  expected.push(id);
 }
 assert.equal(at,decoded.length);assert.equal(ids.length,12163);assert.equal(tradeable,6521);
 const rows=[...read('core/src/inventory_tradeable_reference_data.rs').matchAll(/\((\d+),0x([0-9a-f]{8})\)/g)].map(m=>[Number(m[1]),parseInt(m[2],16)]);
 assert.deepEqual(rows.map(r=>r[0]),expected);assert.equal(rows.length,2575);
 const keys=new Map(rows);
 for(const m of read('core/src/inventory_furniture_reference_data.rs').matchAll(/\((\d+),0x([0-9a-f]{8})\)/g))assert.equal(keys.get(Number(m[1])),parseInt(m[2],16));
});
