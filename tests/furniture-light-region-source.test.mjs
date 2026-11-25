import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('native furniture room connects both lighting regions and six presets to complete original dependencies',()=>{
 const raw=readFileSync(new URL('../data/furniture-light-region-source-v3.0.1.json',import.meta.url)),d=JSON.parse(raw);
 assert.equal(createHash('sha256').update(raw).digest('hex'),'07549e76699d096d4fde3d95ef11246ec20518aafe3314af5a98658f5be13b90');
 assert.equal(d.version,'3.0.1');assert.equal(d.renderFidelity,'unverified');
 assert.equal(d.regions.length,2);assert.deepEqual(d.regions.map(r=>r.pathId),['664','665']);
 assert.deepEqual(d.regions.map(r=>r.collider.radius),[10,15]);
 assert.deepEqual(d.regions.map(r=>d.presets[r.settings.Settings].name),['LightRegion_UI_Static','LightRegion_DefaultInterior']);
 for(const r of d.regions){assert.equal(r.enabled,true);assert.equal(r.priority,0);assert.equal(r.blendDistance,0);assert.equal(r.settings.FlourfallSettings,null);assert.ok(r.collider.isTrigger);for(const p of Object.values(r.settings))if(p!==null)assert.ok(d.presets[p]);for(let i=0;i<r.transformChain.length;i++)assert.equal(r.transformChain[i].parent,r.transformChain[i+1]?.pathId??null);}
 assert.deepEqual(new Set(Object.values(d.presets).map(p=>p.name)),new Set(['LightRegion_UI_Static','LightRegion_DefaultInterior','LightRegion_Default_Rain','LightRegion_Default_Starfall','LightRegion_Default_Steam','LightRegion_Default_Snow']));
 const deps=new Set();
 for(const p of Object.values(d.presets)){assert.equal(Object.keys(p.links).length,25);assert.match(p.guid,/^[a-f0-9]{32}$/);for(const [key,id] of Object.entries(p.links)){assert.match(id,/^-?[0-9]+$/);assert.ok(key==='ReflectionMap'?d.cubemaps[id]:d.assets[id]);deps.add(id);}}
 assert.equal(deps.size,66);assert.equal(Object.keys(d.assets).length,64);assert.equal(Object.keys(d.cubemaps).length,2);
 const ui=d.presets[d.regions[0].settings.Settings];assert.equal(ui.polar,140);assert.equal(ui.vignetteEnabled,false);
 const curve=k=>d.assets[ui.links[k]].keys.map(x=>x[1]);assert.deepEqual(curve('Elevation'),[95,95]);assert.deepEqual(curve('Tilt'),[130,130]);assert.deepEqual(curve('ReflectionIntensity'),[1,1]);
 assert.equal(d.assets[ui.links.SunColor].name,'UI_Static_Settings_SunColor');assert.notDeepEqual(d.assets[ui.links.SunColor].keys[0],d.assets[ui.links.SunColor].keys[1]);assert.equal(d.cubemaps[ui.links.ReflectionMap].name,'Cubemap_Interior');
 const values=Object.values(d.assets);assert.equal(values.filter(a=>a.kind==='curve').length,51);assert.equal(values.filter(a=>a.kind==='gradient').length,13);
 for(const a of values){assert.match(a.objectSha256,/^[a-f0-9]{64}$/);if(a.kind==='curve'){for(const k of a.keys){assert.equal(k.length,7);for(const i of [0,1,4,5,6])assert.ok(Number.isFinite(k[i]));for(const i of [2,3])assert.ok(Number.isFinite(k[i])||['Infinity','-Infinity'].includes(k[i]));}assert.ok(a.keys.every((k,i)=>!i||k[0]>a.keys[i-1][0]));}else{assert.equal(a.keys.length,8);assert.ok(a.keys.every(k=>k.length===4&&k.every(Number.isFinite)));assert.equal(a.colorTimes.length,8);assert.equal(a.alphaTimes.length,8);assert.ok(a.colorKeyCount>0&&a.colorKeyCount<=8&&a.alphaKeyCount>0&&a.alphaKeyCount<=8);}}
 for(const c of Object.values(d.cubemaps)){assert.equal(c.width,128);assert.equal(c.height,128);assert.equal(c.format,10);assert.equal(c.colorSpace,1);assert.equal(c.imageCount,6);assert.equal(c.mipCount,8);assert.deepEqual(c.sampler,[1,2,0,1,1,1]);assert.equal(c.faceOrder,'unverified');let off=0;for(const [i,[n,start,z]] of c.faceMipRanges.entries()){assert.equal(n,128>>i);assert.equal(start,off);assert.equal(z,Math.ceil(n/4)**2*8);off+=z;}assert.equal(off,c.faceBytes);assert.equal(c.bytes,off*6);assert.match(c.sha256,/^[a-f0-9]{64}$/);}
 assert.equal(d.areaLight.pathId,'679');assert.equal(d.areaLight.meshRendererPathId,'432');assert.equal(d.areaLight.mode,0);
});
