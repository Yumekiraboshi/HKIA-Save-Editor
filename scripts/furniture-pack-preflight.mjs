/** Shared diagnostic inputs. Explicit synthetic scene, not a native icon claim. */
export function furniturePackDiagnosticCommon(api,sources,cubemaps,authored){
 const cube=source=>({source,orientation:{sourceSha256:source.sha256,sourceFaceForTarget:[0,1,2,3,4,5],texelOrientation:'native-webgl',evidence:'Explicit diagnostic orientation; native face parity unverified'},bc1Mode:'rgb'});
 const cubes=Object.values(cubemaps).map(cube);
 const bc1Modes=Object.fromEntries([...Object.values(sources.base.textures),...sources.additionalPatterns.rows].filter(t=>t.format===10).map(t=>[t.sha256,'rgb']));
 const preview=api.authoredPreviewCamera(authored,1);
 return {mountWorld:preview.mountWorld,runtimeRoot:{position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]},fit:{extents:[0,0,0],lossyScale:[1,1,1],maxObjectSize:authored.rig.maxObjectSize,considerLossyScale:authored.rig.considerLossyScale},bc1Modes,reflectionPrimary:cubes[0],reflectionSecondary:cubes[1],scene:{viewProjection:preview.viewProjection,cameraPosition:preview.cameraPosition,mainLightDirection:[.4,.8,.447213595499958],mainLightColor:[1,.9,.8],ambient:[.5,.5,.5],ambientMain:[0,0,0],ambientFill:[0,0,0],screenOcclusion:1,screenOcclusionStrength:0,reflectionBlendWeight:.5,reflectionIntensity:1,emissionMask:0,fogVarying:0,fogMultiplier:0}};
}
/** The canonical reader verifies every content-addressed payload before
 * evaluating the requested cases. A rejected draw plan is not a frame. */
export async function furniturePackPreflight(api,pack,cases,authored){
 const {sources,read,cubemaps}=pack;
 const refs=[...new Map(api.furniturePayloadReferences(sources,Object.values(cubemaps)).map(r=>[r.kind+'/'+r.sha256,r])).values()];
 let verifiedBytes=0;
 for(const ref of refs){const b=await read(ref);if(b.byteLength!==ref.bytes)throw Error('FURNITURE_PREFLIGHT_PAYLOAD');verifiedBytes+=b.byteLength;}
 const common=furniturePackDiagnosticCommon(api,sources,cubemaps,authored),result=[],opacityProofs=new Map();
 for(const c of cases){
  try{
   const fit=api.fitFurnitureMultiStaticBounds(sources,{...common,...c});
   const plan=api.resolveFurnitureMultiDiagnostic(sources,fit.request);
   for(const draw of plan.plans){
    if(draw.kind!=='forward'||!api.furnitureNullPatternRequiresOpacity(draw))continue;
    const t=draw.baseMap,key=t.format+'/'+t.sha256+'/'+t.bytes;
    // Cache only proof promises, never the (potentially large) source bytes.
    // All referenced payloads were independently verified above.
    let proof=opacityProofs.get(key);
    if(!proof){proof=api.verifyFurnitureNullPatternOpacity(draw,read);opacityProofs.set(key,proof);}
    await proof;
   }
   result.push({...c,status:'prepared',draws:plan.plans.length});
  }
  catch(e){result.push({...c,status:'rejected',reason:String(e instanceof Error?e.message:e).slice(0,300)});}
 }
 const reasonCounts=Object.create(null);for(const r of result)if(r.status==='rejected')reasonCounts[r.reason]=(reasonCounts[r.reason]??0)+1;
 return {verifiedPayloads:refs.length,verifiedBytes,prepared:result.filter(r=>r.status==='prepared').length,rejected:result.filter(r=>r.status==='rejected').length,reasonCounts,result,renderFidelity:'not-rendered'};
}
