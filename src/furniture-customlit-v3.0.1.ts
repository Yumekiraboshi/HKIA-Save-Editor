/** Original CustomLit rim-only pixel blob 673, Steam 3.0.1.
 * Shares verified ForwardLit lighting with CustomLitFurniture, but not its
 * pattern/alpha surface. Fixed opaque GIVE25 and SCHO furniture source gates.
 * Underwater, animation and other unverified variants remain unsupported. */
import type {Vec3,Vec4} from './furniture-surface-v3.0.1';
import type {FurnitureForwardMaterial} from './furniture-forwardlit-gpu';
import type {RugNativeSources} from './furniture-rug-source';
import {furnitureRimFromMaterial} from './furniture-rim-v3.0.1';
const sat=(v:number)=>Math.min(1,Math.max(0,v));
const finite=(v:readonly number[],n:number)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
export type CustomLitSurfaceInput={base:Vec4;combo:Vec4;normal:Vec4;baseColor:Vec4;smoothnessShift:number;metallicShift:number;occlusionStrength:number;materialAlpha:number;frontFacing:boolean};
export function customLitSurface(u:CustomLitSurfaceInput){
 if(![u.base,u.combo,u.normal,u.baseColor].every(v=>finite(v,4))||![u.smoothnessShift,u.metallicShift,u.occlusionStrength,u.materialAlpha].every(Number.isFinite)||typeof u.frontFacing!=='boolean')throw Error('CUSTOM_LIT_SURFACE');
 const x=2*u.normal[0]*u.normal[3]-1,y=2*u.normal[1]-1,z=Math.max(Math.sqrt(1-Math.min(1,x*x+y*y)),Math.fround(1e-16)),sign=u.frontFacing?1:-1;
 return {albedo:[u.base[0]*u.baseColor[0],u.base[1]*u.baseColor[1],u.base[2]*u.baseColor[2]] as Vec3,
  roughness:sat(u.combo[0]-u.smoothnessShift),metallic:sat(u.combo[1]+u.metallicShift),occlusion:1+u.occlusionStrength*(u.combo[2]-1),emissionMask:u.combo[3],
  alpha:(1+u.materialAlpha*(u.base[3]-1))*u.baseColor[3],normal:[x*sign,y*sign,z*sign] as Vec3};
}
export const customLitSurfaceGLSL=`
struct CustomLitSurface {vec3 albedo;float roughness;float metallic;float occlusion;float emissionMask;float alpha;vec3 normal;};
CustomLitSurface customLitSurface(vec4 b,vec4 c,vec4 nm,vec4 tint,float ss,float ms,float occ,float ma,bool frontFacing){
 vec2 xy=vec2(nm.r*nm.a,nm.g)*2.-1.;
 vec3 tn=vec3(xy,max(sqrt(1.-min(1.,dot(xy,xy))),1e-16))*(frontFacing?1.:-1.);
 return CustomLitSurface(b.rgb*tint.rgb,clamp(c.r-ss,0.,1.),clamp(c.g+ms,0.,1.),1.+occ*(c.b-1.),c.a,(1.+ma*(b.a-1.))*tint.a,tn);
}
`;
export type CustomLitBlendState={queue:3000;srcBlend:5;dstBlend:10;zWrite:false;cull:0};
export function resolveCustomLitFixedMaterial(base:RugNativeSources['base'],id:string){
 const shader='CAB-46b8f8fe122147493b3113f7c1c8cd0f:-6681258383375895387',m=base.materials[id];
 const bannerAlpha=id==='CAB-6c0f768e2ed4ce159a88e4d10c87130c:-532235555454519552';
 const trellisLeaf=id==='CAB-6df9b7d36015f1762383468832407e58:-6080070135784173191';
 const sourceHash=trellisLeaf?'ab66b7d885664065bc047cd4f756db30c365827cee8281d565133d1c560e6e16':bannerAlpha?'c999d000910a1cd7a947323d5d55ba205a3365cbac45d740927a7da57edc9210':
  id==='CAB-6c0f768e2ed4ce159a88e4d10c87130c:6239858323994365581'?'02edfece5fd39fa1edf984d80ee4758d6bfa180794dd929556d29eada5d8ab46':
  id==='CAB-6c0f768e2ed4ce159a88e4d10c87130c:4614022325940026044'?'1a66af5ceb1a495b3faea68fcbdc06337b04d082a006d16b5a15133b3d635c56':
  id==='CAB-6c0f768e2ed4ce159a88e4d10c87130c:7677975864228729985'?'c234b16c48caeb781dc6c9a8603cd69dcc437e8ed7d12479cfddb0d8d34efc94':
  '14c115bce50ad2c24a5372fd37abebc9f6fb2c535a5216685a79335b75a8c61d';
 if(!m||m.shader!==shader||m.objectSha256!==sourceHash||base.shaders[shader]?.objectSha256!=='7c32f4b3f7c0c0d580af1e22584952aa29d266dfbe98de3b916c3fecb7339931'||(trellisLeaf?m.validKeywords.length!==0:m.validKeywords.length!==1||m.validKeywords[0]!=='CUSTOM_RIMLIGHT_ON'))throw Error('FURNITURE_MULTI_SHADER_UNSUPPORTED');
 const f=m.floats,c=m.colors;
 // The banner has one source-pinned transparent range; preserve its blend and depth state.
 const blendState:CustomLitBlendState|undefined=bannerAlpha?{queue:3000,srcBlend:5,dstBlend:10,zWrite:false,cull:0}:undefined;
 if(bannerAlpha&&(m.renderQueue!==3000||f._Material_SrcBlend!==5||f._Material_DstBlend!==10||f._ZTest!==4||f._StencilCompare!==0||f._StencilOverride!==0))throw Error('FURNITURE_MULTI_SHADER_UNSUPPORTED');
 if(!bannerAlpha&&sourceHash!=='14c115bce50ad2c24a5372fd37abebc9f6fb2c535a5216685a79335b75a8c61d'&&(m.renderQueue!==-1||f._Material_SrcBlend!==1||f._Material_DstBlend!==0||f._ZTest!==4))throw Error('FURNITURE_MULTI_SHADER_UNSUPPORTED');
 if(f._Material_Alpha!==(bannerAlpha?1:0)||f._AlphaClip!==0||f._ZWrite!==(bannerAlpha?0:1)||f._Cull!==((bannerAlpha||trellisLeaf)?0:2)||f._Lighting_Fog!==1||f._Lighting_Medium_Underwater!==0||f._Material_VertexAnimation!==0||f._Surface_Effect!==0||f._Clip_Offset!==0||f.GLIMMER!==0||f.UV_WORLD!==0||m.textures._AnimTex?.texture!==null||m.textures._Surface_EffectMap?.texture!==null||!finite(c._BaseColor,4)||c._BaseColor[3]!==1||!finite(c._EmissionColor,4))throw Error('FURNITURE_MULTI_SHADER_UNSUPPORTED');
 if(trellisLeaf&&(f.CUSTOM_RIMLIGHT!==0||f._StencilCompare!==0||f._StencilOverride!==0))throw Error('FURNITURE_MULTI_SHADER_UNSUPPORTED');
 const tex=(name:string)=>{
  const link=m.textures[name];if(!link||!link.texture||link.scale.join(',')!=='1,1'||link.offset.join(',')!=='0,0')throw Error('CUSTOM_LIT_TEXTURE');
  const t=base.textures[link.texture];if(!t)throw Error('CUSTOM_LIT_TEXTURE');return t;
 };
 const material:FurnitureForwardMaterial={baseColor:c._BaseColor,baseST:[1,1,0,0],patternST:[1,1,0,0],patternTint:[1,1,1,1],useBaseMapMask:false,worldUV:false,rotationTurns:0,rotationCenter:[0,0],smoothnessShift:f._Smoothness_Shift,metallicShift:f._Metallic_Shift,patternSmoothnessShift:0,patternMetallicShift:0,occlusionStrength:f._OcclusionStrength,rim:furnitureRimFromMaterial(m.validKeywords,f),customLit:{materialAlpha:bannerAlpha?1:0}};
 return {material,blendState,reflectionStrength:f._ReflectionStrength,emissionColor:c._EmissionColor.slice(0,3) as unknown as Vec3,textures:{baseMap:tex('_BaseMap'),normalMap:tex('_BumpMap'),comboMap:tex('_MetallicGlossMap')}};
}
