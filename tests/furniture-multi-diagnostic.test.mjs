import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './src/furniture-multi-diagnostic';export * from './src/native-texture-upload';export * from './src/furniture-renderer-bounds';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {resolveFurnitureMultiDiagnostic,fitFurnitureMultiStaticBounds,mergeStaticRendererBounds,drawFurnitureMultiDiagnostic,furnitureForwardAttributeLocations,nativeBaseIsOpaque,verifyNativeTexturePayload,validateNativeTextureLayout}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const sha=b=>createHash('sha256').update(b).digest('hex');
const additionalPath='data/furniture-chair-pattern-sources-v3.0.1.json';
function sources(){return {catalog:read('public/inventory-ui/furniture-customization-v3.0.1.json'),geometry:read('data/furniture-mesh-source-sample-v3.0.1.json'),base:read('data/furniture-base-material-source-v3.0.1.json'),variants:read('data/furniture-material-render-source-v3.0.1.json'),patterns:read('data/furniture-pattern-texture-sample-v3.0.1.json'),additionalPatterns:read(additionalPath)};}
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function request(d,itemId=90163601,indices=[0,0,0]){
 const cubes=Object.values(read('data/furniture-light-region-source-v3.0.1.json').cubemaps).map(source=>({source,orientation:{sourceSha256:source.sha256,sourceFaceForTarget:[0,1,2,3,4,5],texelOrientation:'native-webgl',evidence:'Explicit diagnostic orientation only'},bc1Mode:'rgb'}));
 const bc1Modes=Object.fromEntries([...Object.values(d.base.textures),...d.patterns.rows,...d.additionalPatterns.rows].filter(t=>t.format===10).map(t=>[t.sha256,'rgb']));
 return {itemId,indices,mountWorld:identity,runtimeRoot:{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},fit:{extents:[.4,.5,.4],lossyScale:[1,1,1],maxObjectSize:2,considerLossyScale:false},bc1Modes,reflectionPrimary:cubes[0],reflectionSecondary:cubes[1],scene:{viewProjection:identity,cameraPosition:[2,1.65,3],mainLightDirection:[.4,.8,.447213595499958],mainLightColor:[1,.9,.8],ambient:[.5,.5,.5],ambientMain:[0,0,0],ambientFill:[0,0,0],screenOcclusion:1,screenOcclusionStrength:0,reflectionBlendWeight:.5,reflectionIntensity:1,emissionMask:0,fogVarying:0,fogMultiplier:0}};
}
test('all six exact chair pattern textures are indexed; original white ARGB32 is the only supported format 5',async()=>{
 const raw=readFileSync(new URL('../'+additionalPath,import.meta.url));
 assert.equal(sha(raw),'608cbcd744fed8de9a1c6a557296ab669cd2f40b44dd8ae6800355a6aec5f10f');
 const d=sources(),rows=d.additionalPatterns.rows;
 assert.equal(rows.length,6);assert.equal(rows.reduce((n,r)=>n+r.bytes,0),23767736);
 for(const r of rows)validateNativeTextureLayout(r);
 const white=rows.find(r=>r.format===5),bytes=new Uint8Array(20).fill(255);
 await verifyNativeTexturePayload(white,bytes.buffer);
 assert.throws(()=>validateNativeTextureLayout({...white,sha256:'0'.repeat(64)}),/ARGB_UNSUPPORTED/);
 bytes[0]=0;await assert.rejects(verifyNativeTexturePayload(white,bytes.buffer),/HASH/);
});
test('all 1394 chair slot combinations resolve all three actual meshes and preserve fixed feet',()=>{
 const d=sources(),item=d.catalog.items.find(r=>r[0]===90163601),sets=new Map(d.catalog.sets.map(r=>[r[0],r[2]]));
 const allowed=item[4].map(s=>[...new Set([s[2],...s[3].flatMap(id=>sets.get(id))])]);
 assert.deepEqual(allowed.map(a=>a.length),[41,34]);
 const r=request(d),patterns=new Set();let count=0;
 for(const seat of allowed[0])for(const frame of allowed[1]){
  const resolved=resolveFurnitureMultiDiagnostic(d,{...r,indices:[seat,frame,0]});
  assert.equal(resolved.plans.length,3);const [a,b,c]=resolved.plans;
  assert.deepEqual([a.slot,b.slot,c.slot],[0,1,null]);
  assert.deepEqual([a.selectedIndex,b.selectedIndex,c.selectedIndex],[seat,frame,null]);
  for(const [p,index] of [[a,seat],[b,frame]]){
   const row=d.variants.rows.find(x=>x[0]===index);
   assert.equal(p.patternMap.guid,row[5]);assert.deepEqual(p.material.patternTint,row[8]);
   patterns.add(p.patternMap.guid);
  }
  assert.equal(c.patternMap,null);assert.deepEqual(c.material.baseColor,[.5,.5,.5,1]);
  assert.ok(c.material.useBaseMapMask);assert.equal(c.meshPathId,'3240858883678970606');
  assert.equal(c.scene.model[14],.16599999368190765);assert.equal(c.scene.tangentParity,1);count++;
 }
 assert.equal(count,1394);assert.equal(patterns.size,6);
 const defaults=resolveFurnitureMultiDiagnostic(d,r);
 assert.deepEqual(defaults.plans.map(p=>p.selectedIndex),[364,532,null]);
});
test('all six rug choices reuse multi renderer selection; other shaders and missing assets refuse',()=>{
 const d=sources();
 for(let i=207;i<=212;i++){const p=resolveFurnitureMultiDiagnostic(d,request(d,32709745,[i,0,0]));assert.equal(p.plans.length,1);assert.equal(p.plans[0].selectedIndex,i);}
 assert.throws(()=>resolveFurnitureMultiDiagnostic(d,request(d,34770598)),/SHADER_UNSUPPORTED/);
 assert.throws(()=>resolveFurnitureMultiDiagnostic(d,request(d,61381969)),/SHADER_UNSUPPORTED/);
 const bad=structuredClone(d);bad.additionalPatterns.rows=bad.additionalPatterns.rows.filter(p=>p.guid!=='7bebf58b5f8604c39a34e774c87ced5c');
 assert.throws(()=>resolveFurnitureMultiDiagnostic(bad,request(bad)),/PATTERN_UNAVAILABLE/);
 assert.throws(()=>resolveFurnitureMultiDiagnostic(d,{...request(d),bc1Modes:{}}),/BC1_MODE/);
});
test('missing native pattern may alias base only when all alpha samples are opaque',()=>{
 const s={format:10,bytes:8};
 assert.equal(nativeBaseIsOpaque(s,Uint8Array.of(0,0,0,0,0,0,0,0).buffer),true);
 assert.equal(nativeBaseIsOpaque(s,Uint8Array.of(0,0,0,0,3,0,0,0).buffer),false);
 assert.equal(nativeBaseIsOpaque(s,Uint8Array.of(1,0,0,0,255,255,255,255).buffer),true);
 assert.equal(nativeBaseIsOpaque({format:4,bytes:4},Uint8Array.of(1,2,3,255).buffer),true);
 assert.equal(nativeBaseIsOpaque({format:4,bytes:4},Uint8Array.of(1,2,3,254).buffer),false);
 assert.equal(nativeBaseIsOpaque({format:12,bytes:16},new ArrayBuffer(16)),false);
});
test('preflight refuses incomplete geometry payload before GPU work',async()=>{
 const d=sources(),r=request(d),requests=[];
 await assert.rejects(drawFurnitureMultiDiagnostic({},d,r,async ref=>{requests.push(ref);return new ArrayBuffer(0);}),/PAYLOAD_LENGTH/);
 assert.deepEqual(requests,[{kind:'geometry',sha256:'61dc9dd44080824cccfd2966032eb21db1ada7d141418a4a590e0e58cc7c0810',bytes:64436}]);
});

test('geometry reader rejection and corrupt equal-length payload never touch GPU',async()=>{
 const d=sources(),r=request(d),gpu=new Proxy({},{get(_target,key){throw Error('UNEXPECTED_GPU_ACCESS '+String(key));}});
 const error=new Error('ORIGINAL_SOURCE_UNAVAILABLE');
 await assert.rejects(drawFurnitureMultiDiagnostic(gpu,d,r,async()=>{throw error;}),e=>e===error);
 await assert.rejects(drawFurnitureMultiDiagnostic(gpu,d,r,async ref=>new ArrayBuffer(ref.bytes)),/NATIVE_MESH_HASH/);
});

test('static fit includes the fixed chair feet and uses source bounds instead of guessed extents',()=>{
 const d=sources(),r=request(d),result=fitFurnitureMultiStaticBounds(d,r);
 const [x,y,z]=result.bounds.extents;
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,JSON.stringify({a,b}));
 const s=1.356777548789978;
 near(x,.25681284070014954*s);
 near(y,((.4151645004749298+.22238728404045105)-(.030684608966112137-.03068464621901512))*s/2);
 near(z,((-.06262940913438797+.30255961418151855)-(-.10265617072582245-.3110705018043518))*s/2);
 assert.deepEqual(result.request.fit.extents,result.bounds.extents);
 assert.deepEqual(r.fit.extents,[.4,.5,.4]);
 const rug=fitFurnitureMultiStaticBounds(d,request(d,32709745,[207,0,0]));
 near(rug.bounds.extents[0],3.024627208709717);
 near(rug.bounds.extents[2],3.0246262550354004);
 const fitted=resolveFurnitureMultiDiagnostic(d,rug.request);
 assert.ok(Math.abs(fitted.plans[0].scene.model[0])<.3);
 assert.equal(result.renderFidelity,'unverified');
});

test('world bounds union preserves rotation, translation and mirrored axes; rejects invalid inputs',()=>{
 const first={model:identity,localBounds:[0,0,0,1,2,3]};
 const second={model:[0,-2,0,0,-1,0,0,0,0,0,1,0,5,4,0,1],localBounds:[0,0,0,1,2,1]};
 assert.deepEqual(mergeStaticRendererBounds([first,second]),{center:[3,2,0],extents:[4,4,3]});
 assert.throws(()=>mergeStaticRendererBounds([]),/STATIC_BOUNDS/);
 assert.throws(()=>mergeStaticRendererBounds([{...first,localBounds:[0,0,0,-1,2,3]}]),/STATIC_BOUNDS/);
 assert.throws(()=>mergeStaticRendererBounds([{...first,model:[...identity.slice(0,15),2]}]),/STATIC_BOUNDS/);
});
test('the extracted podium GUID matches the authored camera mount without inferring item placement',()=>{
 const mount=read('data/furniture-preview-mount-v3.0.1.json'),camera=read('data/furniture-preview-camera-v3.0.1.json');
 assert.equal(mount.guid,camera.mountGuid);
 assert.equal(mount.bundleSha256,'0ac369f7549cf6ed5f410b9a4fb3e2a479b7725f34ffdfda571f3fa4a327ed1a');
 const [a,b,c]=mount.nodes;
 assert.equal(a.gameObjectPathId,mount.rootGameObjectPathId);
 assert.equal(a.parent,null);assert.equal(b.parent,a.pathId);assert.equal(c.parent,b.pathId);
 assert.deepEqual(a.position,[0,0,0]);assert.deepEqual(a.rotation,[0,0,0,1]);assert.deepEqual(a.scale,[1,1,1]);
 assert.equal(c.rendererPathId,'4695806416409439665');assert.equal(c.meshFilterPathId,'-1995439662326436431');
});

test('UV1 is optional only for world UV, exact original white pattern or proven-unused null pattern',()=>{
 const d=sources(),p=resolveFurnitureMultiDiagnostic(d,request(d,32709745,[207,0,0])).plans[0];
 const mesh=structuredClone(d.geometry.rows.find(x=>x.itemId===32709745).meshes[p.meshPathId]);
 assert.deepEqual(furnitureForwardAttributeLocations(mesh,p.material,p.patternMap),{0:0,1:1,2:2,4:4,5:5});
 mesh.channels[5]=[0,0,0,0];
 assert.throws(()=>furnitureForwardAttributeLocations(mesh,p.material,p.patternMap),/MESH_CHANNEL/);
 const white=d.additionalPatterns.rows.find(x=>x.guid==='507ffd4fc696e458c96231e026f49923');
 const expected={0:0,1:1,2:2,4:4};
 assert.deepEqual(furnitureForwardAttributeLocations(mesh,p.material,white),expected);
 assert.throws(()=>furnitureForwardAttributeLocations(mesh,p.material,{...white,sha256:'0'.repeat(64)}),/MESH_CHANNEL/);
 assert.throws(()=>furnitureForwardAttributeLocations(mesh,p.material,{...white,width:3}),/ARGB_UNSUPPORTED/);
 assert.deepEqual(furnitureForwardAttributeLocations(mesh,{...p.material,worldUV:true},p.patternMap),expected);
 assert.deepEqual(furnitureForwardAttributeLocations(mesh,{...p.material,baseColor:[1,1,1,1]},null),expected);
 assert.throws(()=>furnitureForwardAttributeLocations(mesh,{...p.material,baseColor:[1,1,1,0]},null),/MESH_CHANNEL/);
 mesh.channels[4]=[0,0,0,0];assert.throws(()=>furnitureForwardAttributeLocations(mesh,p.material,white),/MESH_CHANNEL/);
});
