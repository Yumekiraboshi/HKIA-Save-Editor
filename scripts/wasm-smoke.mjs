import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const bytes=readFileSync('target/wasm32-unknown-unknown/release/hkia_web_editor.wasm');
const {instance}=await WebAssembly.instantiate(bytes,{});
const e=instance.exports;
for(const key of ['memory','hkia_stage','hkia_open','hkia_change','hkia_snapshot','hkia_export','hkia_output_ptr','hkia_output_len','hkia_reply_ptr','hkia_reply_len','hkia_undo','hkia_redo','hkia_reset','hkia_clear'])assert.ok(e[key],key);
const append=(...xs)=>Uint8Array.from(xs.flatMap(x=>Array.from(x)));
const u32=n=>append([0xce],Array.from({length:4},(_,i)=>n>>>(24-8*i)&255));
const f32=n=>{const v=new Uint8Array(5);v[0]=0xca;new DataView(v.buffer).setFloat32(1,n);return v};
const i64=n=>{const v=new Uint8Array(9);v[0]=0xd3;new DataView(v.buffer).setBigInt64(1,n,false);return v};
const arr=(...xs)=>{assert.ok(xs.length<16);return append([0x90|xs.length],...xs)};
const map=(...xs)=>{assert.ok(xs.length%2===0&&xs.length/2<16);return append([0x80|(xs.length/2)],...xs)};
const hash=(...xs)=>append(...xs.map(u32));
const doc=(tag,body)=>arr([tag],body);
const str=s=>append([0xa0|s.length],new TextEncoder().encode(s));
const ver='3.0.1';
const collection=doc(39,arr(map(),map([2],i64(638000000000000001n),[3],i64(9n))));
const object=doc(32,arr([3],hash(0,0,0,3),[0],arr(collection)));
const achievement=doc(16,arr([1],hash(1,0,0,1),arr([0xc2],f32(1),[0xc0])));
const counter=doc(17,arr([1],hash(1,0,0,2),arr(f32(2),[0xc0],[0x90])));
const model=arr([0],[4],arr(doc(18,arr([0],u32(87),str(ver))),achievement,counter,object));
const prefix=Uint8Array.from('135b4aa4f702a45d1cc562aeb5a386ed5d17e1fd588f424dcfc59d2e140cf597'.match(/../g).map(x=>parseInt(x,16)));
const magic=Uint8Array.from('a1a2f8333c66ec455baa2dfc6325c2437a779c9906eecff0c022e5f6b6ca73b8'.match(/../g).map(x=>parseInt(x,16)));
const literalLen=model.length-15;const lit=[0xf0];let remaining=literalLen;while(remaining>=255){lit.push(255);remaining-=255}lit.push(remaining);
const compressed=append(lit,model);
const u32be=n=>Array.from({length:4},(_,i)=>n>>>(24-8*i)&255);
const slot=append(prefix,[0x98],u32(0),u32(0),u32(0),u32(0),str(ver),u32(30001),
 [0x92,0xd6,0xff],u32be(1750000000),[0,0,0x80,0x90,0x91,9],magic,[0x92,0xc8,0,3,98,0xcd,model.length>>8,model.length&255],
 [0xc6],u32be(compressed.length),compressed);
const copy=slot.slice();
function load(raw){
 const p=e.hkia_stage(raw.length);assert.ok(p>0);
 new Uint8Array(e.memory.buffer,p,raw.length).set(raw);
 assert.equal(e.hkia_open(),0);
}
function snapshot(){
 assert.equal(e.hkia_snapshot(),0);const p=e.hkia_reply_ptr(),n=e.hkia_reply_len();
 const b=new Uint8Array(e.memory.buffer,p,n);const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 assert.equal(b[0],2);const count=v.getUint32(13,true);assert.equal(n,17+count*12);
 const entries=new Map;for(let i=0;i<count;i++){const pos=17+i*12;entries.set(v.getInt32(pos,true),v.getBigInt64(pos+4,true))}
 return {entries,dirty:b[2],canUndo:b[3],canRedo:b[4]};
}
load(slot);
assert.equal(snapshot().entries.get(2),638000000000000001n);
assert.equal(e.hkia_change(2,1,638000000000000001n,1,638000000010000001n),0);
assert.equal(e.hkia_change(2,1,638000000000000001n,1,638000000020000001n),1);
assert.equal(e.hkia_change(999999,0,0n,1,638000000000000000n),1);
assert.equal(e.hkia_change(315822,0,0n,1,638000000000000000n),0);
assert.equal(snapshot().entries.size,3);
assert.equal(e.hkia_undo(),0);assert.equal(snapshot().entries.has(315822),false);
assert.equal(e.hkia_redo(),0);assert.equal(snapshot().entries.has(315822),true);
assert.equal(e.hkia_export(),0);
const output=new Uint8Array(e.memory.buffer,e.hkia_output_ptr(),e.hkia_output_len()).slice();
assert.notDeepEqual(output,copy);assert.deepEqual(slot,copy);
e.hkia_clear();load(output);
assert.equal(snapshot().entries.get(2),638000000010000001n);
assert.equal(snapshot().entries.get(315822),638000000000000000n);
assert.equal(e.hkia_export(),2);
e.hkia_clear();
console.log('Rust/WASM ABI synthetic open/change/CAS/allowlist/undo/redo/export/reopen PASS');
