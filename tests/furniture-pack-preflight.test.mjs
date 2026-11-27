import test from 'node:test';
import assert from 'node:assert/strict';
import {furniturePackPreflight} from '../scripts/furniture-pack-preflight.mjs';
function fixture(){
 const ref={kind:'texture',sha256:'a'.repeat(64),bytes:4};
 const sources={base:{textures:{}},additionalPatterns:{rows:[]}},cubemaps={a:{sha256:'a'},b:{sha256:'b'}},authored={rig:{maxObjectSize:1,considerLossyScale:false}};
 const cases=[{itemId:1,indices:[0,0,0]},{itemId:2,indices:[0,0,0]}],calls=[];
 const api={furniturePayloadReferences:()=>[ref,ref],authoredPreviewCamera:()=>({mountWorld:[],viewProjection:[],cameraPosition:[]}),fitFurnitureMultiStaticBounds:(_s,request)=>({request}),resolveFurnitureMultiDiagnostic:(_s,r)=>{if(r.itemId===2)throw Error('UNSUPPORTED');return {plans:[{},{}]}}};
 const pack={sources,cubemaps,read:async r=>{calls.push(r);return new ArrayBuffer(4)}};
 return {api,pack,cases,authored,calls};
}
test('GPU-free preflight reuses canonical reader and separates prepared and refused plans',async()=>{
 const {api,pack,cases,authored,calls}=fixture(),r=await furniturePackPreflight(api,pack,cases,authored);
 assert.equal(calls.length,1);assert.equal(r.verifiedPayloads,1);assert.equal(r.verifiedBytes,4);assert.equal(r.prepared,1);assert.equal(r.rejected,1);assert.equal(r.renderFidelity,'not-rendered');assert.equal(r.reasonCounts.UNSUPPORTED,1);assert.equal(r.result[0].draws,2);assert.equal(r.result[1].status,'rejected');
});
test('payload verification failure aborts before drawing plans',async()=>{
 const {api,pack,cases,authored}=fixture();api.fitFurnitureMultiStaticBounds=()=>assert.fail('must not plan before verifying');
 await assert.rejects(furniturePackPreflight(api,{...pack,read:async()=>{throw Error('FURNITURE_PAYLOAD_HASH')}},cases,authored),/FURNITURE_PAYLOAD_HASH/);
 await assert.rejects(furniturePackPreflight(api,{...pack,read:async()=>new ArrayBuffer(3)},cases,authored),/FURNITURE_PREFLIGHT_PAYLOAD/);
});
