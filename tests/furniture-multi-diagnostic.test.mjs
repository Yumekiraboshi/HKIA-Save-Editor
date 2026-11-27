import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './src/furniture-multi-diagnostic';export * from './src/native-texture-upload';export * from './src/furniture-renderer-bounds';export * from './src/furniture-native-builtin-textures-v3.0.1';",resolveDir:fileURLToPath(new URL('../',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {resolveFurnitureMultiDiagnostic,fitFurnitureMultiStaticBounds,mergeStaticRendererBounds,drawFurnitureMultiDiagnostic,furnitureForwardAttributeLocations,nativeBaseIsOpaque,verifyNativeTexturePayload,validateNativeTextureLayout,furnitureNativeBuiltinTexture,furnitureNativeBuiltinBytes}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
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
test('all six rug choices reuse multi renderer selection; unsupported features and missing assets refuse',()=>{
 const d=sources();
 for(let i=207;i<=212;i++){const p=resolveFurnitureMultiDiagnostic(d,request(d,32709745,[i,0,0]));assert.equal(p.plans.length,1);assert.equal(p.plans[0].selectedIndex,i);}
 assert.throws(()=>resolveFurnitureMultiDiagnostic(d,request(d,34770598)),/PATTERN_UNAVAILABLE|MESH_CHANNEL|NULL_PATTERN_CONTRIBUTES|BASE_UV|SHADER_UNSUPPORTED/);
 assert.throws(()=>resolveFurnitureMultiDiagnostic(d,request(d,61381969)),/SHADER_UNSUPPORTED|PATTERN_UNAVAILABLE|MESH_CHANNEL|NULL_PATTERN_CONTRIBUTES|BASE_UV/);
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

test('combined plans preflight all three fixed/customized material ranges and refuse an unsupported fixed shader',()=>{
 const d=sources(),id=90163601,g=d.geometry.rows.find(x=>x.itemId===id),b=d.base.rows.find(x=>x.itemId===id),n=g.nodes.find(x=>x.rendererPathId&&!x.slot),mesh=g.meshes[n.meshPathId],old=b.bindings.find(x=>x[0]===n.rendererPathId),other=g.nodes.find(x=>x.rendererPathId&&x.slot),second=b.bindings.find(x=>x[0]===other.rendererPathId);
 // Synthetic split of existing geometry: tests only the mixed preflight,
 // never claim these synthetic material hashes/geometry are an actual item.
 const materialId=old[1],base=d.base.materials[materialId],originalTexture=base.textures._BaseMap.texture;
 const shader='CAB-46b8f8fe122147493b3113f7c1c8cd0f:-6681258383375895387';
 const sparkShader='CAB-2b27edbfe7f08bad1cd631865ee4eb15:-2527260696058741820';
 const nativeHash='14c115bce50ad2c24a5372fd37abebc9f6fb2c535a5216685a79335b75a8c61d',sparkHash='6f14880f811a3c74f9b44374a5482e1652849144b672c43b14623ccd47dfd6c6';
 const newRef='0:9999999',newId=g.cab+':9999999';
 g.materials[n.material].objectSha256=nativeHash;g.materials[newRef]={objectSha256:sparkHash};
 n.materialSlots=[newRef,n.material];delete n.material;
 mesh.submeshes=[{firstByte:0,indexCount:3,firstVertex:0,vertexCount:mesh.vertexCount,bounds:mesh.bounds[0]},{firstByte:6,indexCount:mesh.indexCount-3,firstVertex:0,vertexCount:mesh.vertexCount,bounds:mesh.bounds[0]}];
 b.bindings=b.bindings.filter(x=>x[0]!==n.rendererPathId);b.submeshBindings=[{rendererPathId:n.rendererPathId,materials:[newId,materialId],slot:null}];
 const link=texture=>({texture,scale:[1,1],offset:[0,0]});
 const common={...base,validKeywords:['CUSTOM_RIMLIGHT_ON'],floats:{...base.floats,CUSTOM_RIMLIGHT:1,GLIMMER:0,UV_WORLD:0,_Lighting_Fog:1,_Lighting_Medium_Underwater:0,_Material_VertexAnimation:0,_Clip_Offset:0,_Lighting_RimPower:1,_Lighting_RimFeathering:.1,_Lighting_RimIntensity:1,_Lighting_RimColoring:1,_Cull:2,_Material_Alpha:0,_AlphaClip:0,_ZWrite:1,_Surface_Effect:0},colors:{...base.colors,_BaseColor:[1,1,1,1],_EmissionColor:[0,0,0,1],_SparkleTint:[1,1,1,1]},textures:{_BaseMap:link(originalTexture),_BumpMap:link(base.textures._BumpMap.texture),_MetallicGlossMap:link(base.textures._MetallicGlossMap.texture),_Surface_EffectMap:link(null),_AnimTex:link(null)}};
 d.base.materials[materialId]={...common,objectSha256:nativeHash,shader};
 d.base.shaders[shader]={objectSha256:'7c32f4b3f7c0c0d580af1e22584952aa29d266dfbe98de3b916c3fecb7339931'};
 d.base.shaders[sparkShader]={objectSha256:'1d7fcbcf451083bffb545d5490fa8a894cf373f0f7b03dd834a89f21e07e7e9a'};
 const noiseKey='synthetic-noise',noiseHash='32a69f4556559ad246668292638068e0e352cfe2415c4314df9778c352573c20';
 d.base.textures[noiseKey]={...d.base.textures[originalTexture],sha256:noiseHash};
 d.base.materials[newId]={...common,objectSha256:sparkHash,shader:sparkShader,floats:{...common.floats,_Cull:0,_NoiseIntensity:.717,_NoiseScale:5.28,_NoiseRoughness:.091,_NoiseMetal:.403,_NoiseReflectionStrength:.17},textures:{...common.textures,_NoiseMap:link(noiseKey)}};
 for(const row of b.bindings)d.base.materials[row[1]].floats._Cull=0;
 const p=resolveFurnitureMultiDiagnostic(d,request(d,id)),parts=p.plans.filter(x=>x.rendererPathId===n.rendererPathId);
 assert.equal(p.mixed,true);assert.deepEqual(parts.map(x=>[x.kind,x.submeshIndex,x.cull]),[['sparkle',0,0],['forward',1,2]]);
 assert.equal(parts[1].material.customLit.materialAlpha,0);assert.equal(parts[0].noiseMap.sha256,noiseHash);
 assert.equal(p.locations[n.meshPathId][0],0);
 d.base.materials[materialId].floats._Lighting_Medium_Underwater=1;
 assert.throws(()=>resolveFurnitureMultiDiagnostic(d,request(d,id)),/SHADER_UNSUPPORTED/);
});

test('original UnityPlayer constant maps retain the exact bytes and verify through the native texture validator',async()=>{
 const shader='cdb64e92e92cbc2b88b3ce48c8a3ed302a16972a23528c27e766b7a646d852d0';
 for(const [name,pixel,digest] of [['_BaseMap',[255,255,255,255],'8667e718294e9e0df1d30600ba3eeb201f764aad2dad72748643e4a285e1d1f7'],['_BumpMap',[127,127,255,255],'33869922b91375cf2b77363e8858a3aee06bae988641ad07f99e817b272d2c35']]){
  const t=furnitureNativeBuiltinTexture(shader,name),b=furnitureNativeBuiltinBytes(t);
  assert.equal(t.sha256,digest);assert.equal(sha(Buffer.from(b)),digest);
  assert.deepEqual([...new Uint8Array(b)],Array.from({length:16},()=>pixel).flat());
  await verifyNativeTexturePayload(t,b);
  assert.equal(furnitureNativeBuiltinBytes({...t}),undefined);
  new Uint8Array(b)[0]=1;
  assert.equal(new Uint8Array(furnitureNativeBuiltinBytes(t))[0],pixel[0]);
 }
 assert.equal(furnitureNativeBuiltinTexture(shader,'_BaseMap'),furnitureNativeBuiltinTexture(shader,'_MetallicGlossMap'));
 assert.throws(()=>furnitureNativeBuiltinTexture('0'.repeat(64),'_BaseMap'),/BUILTIN_SHADER/);
 assert.throws(()=>furnitureNativeBuiltinTexture(shader,'_PatternMap'),/BUILTIN_PROPERTY/);
 const d=sources(),id=32709745,r=request(d,id,[207,0,0]),bind=d.base.rows.find(x=>x.itemId===id).bindings[0],m=d.base.materials[bind[1]];
 m.textures._BumpMap.texture=null;m.textures._MetallicGlossMap.texture=null;
 const plan=resolveFurnitureMultiDiagnostic(d,r).plans[0];
 assert.equal(plan.normalMap,furnitureNativeBuiltinTexture(shader,'_BumpMap'));
 assert.equal(plan.comboMap,furnitureNativeBuiltinTexture(shader,'_MetallicGlossMap'));
 m.textures._BumpMap.texture='missing-source-normal';
 assert.throws(()=>resolveFurnitureMultiDiagnostic(d,r),/FURNITURE_MULTI_TEXTURE/);
});


test('exact null BaseMap aliases unused pattern or uses verified original white, never a dangling reference',()=>{
 const d=sources(),id=32709745,r=request(d,id,[207,0,0]);
 const g=d.geometry.rows.find(x=>x.itemId===id),node=g.nodes.find(x=>x.rendererPathId);
 const bind=d.base.rows.find(x=>x.itemId===id).bindings[0],m=d.base.materials[bind[1]];
 const original=resolveFurnitureMultiDiagnostic(d,r).plans[0];
 const row=d.variants.rows.find(x=>x[0]===207);
 // Synthetic null pointer test: not a new source record or material identity.
 row[3]=[1,1,1,0];m.textures._BaseMap.texture=null;
 const p=resolveFurnitureMultiDiagnostic(d,r).plans[0];
 assert.equal(p.baseMap,p.patternMap);
 assert.deepEqual(p.material.baseST,original.material.baseST);
 assert.equal(p.normalMap,original.normalMap);assert.equal(p.comboMap,original.comboMap);
 assert.equal(p.material.baseColor[3],0);
 row[3]=[1,1,1,1];
 const white=resolveFurnitureMultiDiagnostic(d,r).plans[0].baseMap;
 assert.equal(white,furnitureNativeBuiltinTexture(d.base.shaders[m.shader].objectSha256,'_BaseMap'));
 row[3]=[1,1,1,0];m.textures._BaseMap.texture='absent-source-texture';
 assert.throws(()=>resolveFurnitureMultiDiagnostic(d,r),/FURNITURE_MULTI_TEXTURE/);
 m.textures._BaseMap.texture=null;d.additionalPatterns.rows=[];d.patterns.rows=[];
 assert.throws(()=>resolveFurnitureMultiDiagnostic(d,r),/PATTERN_UNAVAILABLE/);
});

test('single source-pinned transparent CustomLit range is permitted only after verified opaque ranges',()=>{
 const d=sources(),id=90163601,g=d.geometry.rows.find(x=>x.itemId===id),b=d.base.rows.find(x=>x.itemId===id),n=g.nodes.find(x=>x.rendererPathId&&!x.slot);
 const bind=b.bindings.find(x=>x[0]===n.rendererPathId),old=d.base.materials[bind[1]];
 const cab='CAB-6c0f768e2ed4ce159a88e4d10c87130c',pid='-532235555454519552',key=cab+':'+pid,ref='1:'+pid,shader='CAB-46b8f8fe122147493b3113f7c1c8cd0f:-6681258383375895387';
 // Synthetic geometry binding to exercise the real source gate, not original geometry evidence.
 n.material=ref;g.materials[ref]={externalCab:'archive:/'+cab+'/'+cab,pathId:pid};bind[1]=key;
 const link=texture=>({texture,scale:[1,1],offset:[0,0]});
 d.base.materials[key]={...old,shader,objectSha256:'c999d000910a1cd7a947323d5d55ba205a3365cbac45d740927a7da57edc9210',renderQueue:3000,validKeywords:['CUSTOM_RIMLIGHT_ON'],
 floats:{...old.floats,_Material_Alpha:1,_AlphaClip:0,_ZWrite:0,_Cull:0,_Lighting_Fog:1,_Lighting_Medium_Underwater:0,_Material_VertexAnimation:0,_Surface_Effect:0,_Clip_Offset:0,GLIMMER:0,UV_WORLD:0,_Material_SrcBlend:5,_Material_DstBlend:10,_ZTest:4,_StencilCompare:0,_StencilOverride:0,CUSTOM_RIMLIGHT:1,_Lighting_RimPower:1.5,_Lighting_RimFeathering:.16699999570846558,_Lighting_RimIntensity:1,_Lighting_RimColoring:0,_Smoothness_Shift:0,_Metallic_Shift:0,_OcclusionStrength:0,_ReflectionStrength:1},
 colors:{...old.colors,_BaseColor:[1,1,1,1],_EmissionColor:[0,0,0,1]},
 textures:{_BaseMap:link(old.textures._BaseMap.texture),_BumpMap:link(old.textures._BumpMap.texture),_MetallicGlossMap:link(old.textures._MetallicGlossMap.texture),_AnimTex:link(null),_Surface_EffectMap:link(null)}};
 d.base.shaders[shader]={objectSha256:'7c32f4b3f7c0c0d580af1e22584952aa29d266dfbe98de3b916c3fecb7339931'};
 const other=b.bindings.filter(x=>x!==bind);
 for(const row of other){const m=d.base.materials[row[1]];m.renderQueue=-1;Object.assign(m.floats,{_Cull:2,_ZWrite:1,_Material_SrcBlend:1,_Material_DstBlend:0});}
 const p=resolveFurnitureMultiDiagnostic(d,request(d,id));
 assert.equal(p.hasTransparent,true);assert.equal(p.hasGlass,false);assert.equal(p.mixed,true);
 const alpha=p.plans.find(x=>x.rendererPathId===n.rendererPathId);
 assert.equal(alpha.customLitBlendState.srcBlend,5);assert.equal(alpha.material.customLit.materialAlpha,1);assert.equal(alpha.opaque,false);
 d.base.materials[other[0][1]].floats._Material_SrcBlend=5;
 assert.throws(()=>resolveFurnitureMultiDiagnostic(d,request(d,id)),/TRANSPARENT_ORDER_UNVERIFIED/);
});
