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
const parentAchievement=doc(16,arr([2],hash(2,0,0,1),arr([0xc2],f32(2),[0xc0])));
const counter=doc(17,arr([1],hash(1,0,0,2),arr(f32(2),[0xc0],[0x90])));
const model=arr([0],[4],arr(doc(18,arr([0],u32(87),str(ver))),achievement,parentAchievement,counter,object));
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
// Read-only source-v3.0.1 native click plan: unknown IDs and invalid clock
// are rejected without modifying the original session or its history.
assert.ok(e.hkia_achievement_toggle_plan,'missing Rust-only achievement planner ABI');
const verifiedGuid=[15182560,1296854392,3253409457,3976879535];
assert.equal(e.hkia_achievement_toggle_plan(...verifiedGuid,1795251723456n),0);
{
 const p=e.hkia_reply_ptr(),n=e.hkia_reply_len();
 assert.equal(n,18);
 const v=new DataView(e.memory.buffer,p,n);
 assert.equal(v.getUint8(0),1);
 assert.equal(v.getFloat32(1,true),12,'source goal must come from Rust native facts');
 assert.equal(v.getUint8(5),1);
 assert.equal(v.getBigInt64(6,true),1795251723n);
 assert.equal(v.getUint32(14,true),456000000);
}
assert.equal(snapshot().dirty,0,'planning must not edit the loaded save');
// Synthetic pre-existing unmapped GUID: preserve the native float progress,
// unlike creating an unverified/absent achievement (which must fail closed).
assert.equal(e.hkia_achievement_toggle_plan(1,0,0,1,1795251723456n),0);
{
 const v=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
 assert.equal(v.getUint8(0),1);
 assert.equal(v.getFloat32(1,true),1);
 assert.equal(v.getBigInt64(6,true),1795251723n);
}
assert.equal(snapshot().dirty,0);
assert.equal(e.hkia_achievement_toggle_plan(0,0,0,0,1795251723456n),1);
assert.equal(e.hkia_achievement_toggle_plan(...verifiedGuid,-1n),1);
assert.equal(e.hkia_achievement_snapshot(),0);
assert.equal(e.hkia_reply_len(),72);
const ag=[1,0,0,1];
// The UI-facing Rust parent-aware operation must be atomic even when a
// v3.0.1 save already contains a legitimate but source-unmapped record.
assert.ok(e.hkia_achievement_edit_auto,'missing native parent-aware edit ABI');
assert.equal(e.hkia_achievement_edit_auto(...ag,
 1,0,1,0n,0,0, 1,2,1750000000n,123456700,1),0);
assert.equal(snapshot().dirty,1);
assert.equal(e.hkia_undo(),0,'a native edit is exactly one Undo');
assert.equal(snapshot().dirty,0);
assert.equal(e.hkia_undo(),1,'no hidden parent or duplicate history event');
// Unknown absent GUIDs fail without inventing saved achievement documents.
assert.equal(e.hkia_achievement_edit_auto(0,0,0,0,
 0,0,0,0n,0,0, 1,1,1750000000n,123456700,1),1);
assert.equal(snapshot().dirty,0);
// Source-verified, absent v3.0.1 children can be created only by the Rust
// allowlist. Missing source siblings cannot imply a category completion.
const verifiedChild=[15182560,1296854392,3253409457,3976879535];
assert.equal(e.hkia_achievement_edit_auto(...verifiedChild,
 0,0,0,0n,0,0, 1,12,1750000000n,123456700,1),0);
assert.equal(snapshot().dirty,1);
assert.equal(e.hkia_undo(),0);
assert.equal(snapshot().dirty,0);
assert.equal(e.hkia_achievement_change(...ag,0,1,0n,0,0,1,2,1750000000n,123456700,1),0);
assert.equal(e.hkia_achievement_change(...ag,0,1,0n,0,0,1,2,1750000000n,123456700,1),1);
assert.equal(e.hkia_export(),0);
const achievementOutput=new Uint8Array(e.memory.buffer,e.hkia_output_ptr(),e.hkia_output_len()).slice();
e.hkia_clear();load(achievementOutput);
assert.equal(e.hkia_achievement_snapshot(),0);
const achBytes=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
assert.equal(achBytes.getUint32(0,true),2);
assert.equal(achBytes.getUint8(20),1);
assert.equal(achBytes.getFloat32(21,true),2);
assert.equal(achBytes.getUint8(25),1);
assert.equal(achBytes.getBigInt64(26,true),1750000000n);
assert.equal(achBytes.getUint32(34,true),123456700);
e.hkia_clear();load(slot);
// An existing parent and its last child change together or not at all.
assert.ok(e.hkia_achievement_pair_change,'missing atomic two-achievement ABI');
const childArgs=[1,0,0,1,0,1,0n,0,0,1,1,1750000000n,123456700,1];
const parentArgs=[2,0,0,1,0,2,0n,0,0,1,2,1750000000n,123456700,1];
assert.equal(e.hkia_achievement_pair_change(...childArgs,...[2,0,0,1,0,999,0n,0,0,1,2,1750000000n,123456700,1]),1,'stale parent fails entire pair');
assert.equal(snapshot().dirty,0);
assert.equal(e.hkia_achievement_pair_change(...childArgs,...parentArgs),0);
function states(){
 assert.equal(e.hkia_achievement_snapshot(),0);
 const buf=new DataView(e.memory.buffer,e.hkia_reply_ptr(),e.hkia_reply_len());
 assert.equal(buf.getUint32(0,true),2);
 return [buf.getUint8(20),buf.getUint8(54)];
}
assert.deepEqual(states(),[1,1]);
assert.equal(e.hkia_undo(),0);
assert.deepEqual(states(),[0,0]);
assert.equal(e.hkia_undo(),1,'one undo rolls back both achievements');
assert.equal(e.hkia_redo(),0);
assert.deepEqual(states(),[1,1]);
assert.equal(e.hkia_export(),0);
const pairOutput=new Uint8Array(e.memory.buffer,e.hkia_output_ptr(),e.hkia_output_len()).slice();
e.hkia_clear();load(pairOutput);
assert.deepEqual(states(),[1,1]);
e.hkia_clear();load(slot);
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
console.log('Rust/WASM ABI synthetic open/change/atomic-parent-pair/CAS/allowlist/undo/redo/export/reopen PASS');
