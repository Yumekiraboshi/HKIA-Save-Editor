/** Original CustomLit rim-only pixel blob 673, Steam 3.0.1.
 * Shares verified ForwardLit lighting with CustomLitFurniture, but not its
 * pattern/alpha surface. Fixed opaque GIVE25 and SCHO furniture source gates.
 * Underwater, animation and other unverified variants remain unsupported. */
import type {Vec3,Vec4} from './furniture-surface-v3.0.1';
import type {FurnitureForwardMaterial} from './furniture-forwardlit-gpu';
import type {RugNativeSources} from './furniture-rug-source';
import {furnitureNativeBuiltinTexture} from './furniture-native-builtin-textures-v3.0.1';
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
export type CustomLitBlendState={queue:3000;srcBlend:5;dstBlend:10;zWrite:false;cull:0|2};
// Exact source object SHA, cull, rim keyword and transparent mode.
const extra:Readonly<Record<string,readonly [string,0|2,0|1,0|1]>>={
 'CAB-80143f8385dbc1ffc5569bdd27b3c5c5:7360047341139011972':['4dcc89a9999c7f7d4ec5d1d298d323fa20376b7731eb11b7a63c7314e1603cbf',2,0,0],
 'CAB-1439ecb4e3aec07edf439376f0ff48b7:6875419335993937146':["fe7c1d68a979a90755b8ecd8f6ddd6d0507455af2052d9c6e2c6df3e1a6a2bca",2,1,0],
 'CAB-1c1b859afeb3ce121c65bd4d940f64a3:8021757393813074012':["dd32afd94fc5c46bc05221db41fdbda2ddbf1ec4ea82e2659967b0a4f4ab9c7b",0,0,0],
 'CAB-26b78ef50cd0102f819c80ce76b0e84a:-8751875142509439319':["40184e152d561c9995165acbe812f3e56da79625aac194f612d2e6ceecb47013",2,1,0],
 'CAB-326430791305264b72b217604f631d01:8956617032269294769':["08194347d6edec88a736cae1dac2cbfe64f48fe5c6e141f70124341701fbb2ce",2,1,1],
 'CAB-33bc600e7fae418c9769544f1e5f05d2:5873890289002783234':["ba070631622075a6b8858e0b2e1c9d59acdad009666ecc152b375703e5807e45",2,1,0],
 'CAB-4cbb188f16e193d9bfbdc1f756a7075f:5006645151548219416':["a8467a6b9baced830e965e1078bd5a0978ce415f351bdc78e51e11ef06ba820d",2,1,1],
 'CAB-5adefa5259bf77974773f1a45f661f73:4239319393969375369':["c61132de1dce5b1d5955d7f67904a20e589b0304a87a3c71223e0ed5ecbfe9b1",2,1,0],
 'CAB-6d11532fc68f7b4cb891d1c834aa5158:4239319393969375369':["2235c20ed5276ba36c84259dccf84caa4555fe2d0db06a08f9daf3b9bb82b8b9",2,1,0],
 'CAB-73835266a195e40d140153efd7f1158d:-3532526916947604860':["fad92deea0c524374498984df044f1b68b2b7058d574949fc99e86f599fdf833",2,1,0],
 'CAB-73835266a195e40d140153efd7f1158d:-4011883226903426342':["188175dbad2892f3b504fe6839967c2042568899431b73ea967d003bdafb20d7",2,1,0],
 'CAB-73835266a195e40d140153efd7f1158d:1785596979502785932':["dee6b450d1987552480d8844a20d25b45ddfb9788256e92d41e7d374c03e4218",2,1,0],
 'CAB-73835266a195e40d140153efd7f1158d:3913939513852248152':["40df42e2ebb7593a1af28c66f2cfdf023b19d76be7571e13d2385c724c48baf3",2,1,0],
 'CAB-73835266a195e40d140153efd7f1158d:4199956011791383284':["d8678de264bf23569ad616210e67baf8fb23cccc839fa854caf6f025d15ce0f9",2,1,0],
 'CAB-73835266a195e40d140153efd7f1158d:4239319393969375369':["f49a88c0d27bc896b4e29e7bd0c7c4424ac1cdbf24e6c7f831db62de9e9db92a",2,1,0],
 'CAB-73835266a195e40d140153efd7f1158d:493915374724310081':["771b1bb537e77fcc94c3a8d84286d422c875092e10e6311eef4378fee7b9854b",2,1,0],
 'CAB-73835266a195e40d140153efd7f1158d:5962445236911637713':["78e392620ce1e627ae8c4036ae6601a2ae18ecd01df55fc2161996feba3e4eaa",2,1,0],
 'CAB-739c310574b04f80c73dc9bcbce7b5a6:-6459101295544685820':["24b47eeaeeaa611d985eec0af4a87d70a4e464cb20ec72d3814c5a454c012ef0",2,1,1],
 'CAB-73c2544405ea19bc6b0e6e3c697cdf3a:-2145339595968911544':["0c9f17486d04ac011d53d7af00713d75fc18d1d953354985df10bfafe0e766e7",2,1,0],
 'CAB-73c2544405ea19bc6b0e6e3c697cdf3a:-740010890970367087':["824c6736801c3e82b167415c8a94eb2d72306fe80ace62cc89a33acb18eeafd9",2,1,0],
 'CAB-73c2544405ea19bc6b0e6e3c697cdf3a:8635216688364837206':["6d2e5c1c2c771a6f98d76b191a0c114898cbefb0b13f480113e145538bd94247",2,0,0],
 'CAB-75d62aea5e760f726633c5193da9e44f:-7813672276148275753':["449d8ae5fe4d7eca1f18124f22fb36c8d154dff8a1ff7f0285191fbee1054576",2,0,1],
 'CAB-77b4d466cba978b8d21f2677ba9c072c:6619394934813481110':["ed31a29df1f710687009a83303e6de72eebd38930639c42905838103a8ac28e3",2,1,0],
 'CAB-8b270d641718a9750b3162a6d7a8fa58:3649081133865875251':["342350d0a6ce74936a7b3577964587e1c93be01cf7520e01bac20bc1c0f43bf0",2,1,1],
 'CAB-92d332698b260ccb0ebe4b727c4ee438:-8610936547380561021':["8e610e83be83173de854562262eeea880354f1230a9435e823e94472a8fb8927",2,1,0],
 'CAB-cd65c191db860a8da2d63322561f9184:-7077824350659111235':["4d05e4effe9bfec2df681680bc28648455632f0fd5b4496c443d6670314cf3a0",2,1,0],
 'CAB-dfce5aa155a7778c534c64f350e65fc2:-6900618558525068163':["4fd299964a4aebc251c8b9656d956aa9c8b723252056148ca43ae3a0d2b4f064",2,1,0],
 'CAB-edde5a06cbc2839ee42b4b8883d57d4f:3365990827015722336':["0de7bf0df7f5500253f7137b81ca6943d45054eda9d13ffdf2d58deea7317636",0,0,0],
 'CAB-f73d61053072c31e477b89e0600e2d74:2747074911116870100':["dc78dc143fd7f356c197d82fa1cd0520c7cfc0b072c89ffd58be6318f541a241",2,1,0],
};
export function resolveCustomLitFixedMaterial(base:RugNativeSources['base'],id:string){
 const shader='CAB-46b8f8fe122147493b3113f7c1c8cd0f:-6681258383375895387',m=base.materials[id];
 const bannerAlpha=id==='CAB-6c0f768e2ed4ce159a88e4d10c87130c:-532235555454519552';
 const trellisLeaf=id==='CAB-6df9b7d36015f1762383468832407e58:-6080070135784173191';
 const plantLeaf=id==='CAB-727becbe455791108d05c4e036482727:7716668811824500502';
 const carOpaque=id==='CAB-4cb7373ba004738e2471a644a799f890:6471817753889870274'||id==='CAB-4cb7373ba004738e2471a644a799f890:709974708372506574';
 const native=Object.hasOwn(extra,id)?extra[id]:undefined;
 const alpha=bannerAlpha||native?.[3]===1;
 const cull=native?.[1]??((bannerAlpha||trellisLeaf||plantLeaf)?0:2);
 const keywordFree=trellisLeaf||plantLeaf||carOpaque||native?.[2]===0;
 const additionalOpaqueHashes:Readonly<Record<string,string>>={
  'CAB-5ef6817f21189d51a1959442b2f74051:-7047482495623742839':'46792fb6732c4f6891287c3f4adf9454f03bf4e332645d2385b88d60e9c362a3',
  'CAB-727becbe455791108d05c4e036482727:7716668811824500502':'1f5785fed9b1d2f3b8a90bdd46353f754fe7ca46bae247c309b19318768f76ed',
  'CAB-4cb7373ba004738e2471a644a799f890:6471817753889870274':'e16c6bbb1062ac1acdde8d94024609e9691db4be970812d8edbd46216e2d5f93',
  'CAB-4cb7373ba004738e2471a644a799f890:709974708372506574':'0b3ce9b28eaf6ecabda17e848e2e01c4a132a3d6756d1ea62a074ee72d56fe19',
  'CAB-6ef96dd92514d121449bf26b3df2f0e4:-4094287017633679692':'a95c9bc23890d6021dcc50d3835d1453278342b0ec9444dd9ed50b591db675ef',
  'CAB-d61f0eabee36bcd36932688765a94472:5316780692551889377':'db71ba2d2ef4a0625a42141f3a9477d8696c055ab347da4acf05062fde348fe8',
 };
 const sourceHash=native?.[0]??additionalOpaqueHashes[id]??(trellisLeaf?'ab66b7d885664065bc047cd4f756db30c365827cee8281d565133d1c560e6e16':bannerAlpha?'c999d000910a1cd7a947323d5d55ba205a3365cbac45d740927a7da57edc9210':
  id==='CAB-6c0f768e2ed4ce159a88e4d10c87130c:6239858323994365581'?'02edfece5fd39fa1edf984d80ee4758d6bfa180794dd929556d29eada5d8ab46':
  id==='CAB-6c0f768e2ed4ce159a88e4d10c87130c:4614022325940026044'?'1a66af5ceb1a495b3faea68fcbdc06337b04d082a006d16b5a15133b3d635c56':
  id==='CAB-6c0f768e2ed4ce159a88e4d10c87130c:7677975864228729985'?'c234b16c48caeb781dc6c9a8603cd69dcc437e8ed7d12479cfddb0d8d34efc94':
  '14c115bce50ad2c24a5372fd37abebc9f6fb2c535a5216685a79335b75a8c61d');
 if(!m||m.shader!==shader||m.objectSha256!==sourceHash||base.shaders[shader]?.objectSha256!=='7c32f4b3f7c0c0d580af1e22584952aa29d266dfbe98de3b916c3fecb7339931'||(keywordFree?m.validKeywords.length!==0:m.validKeywords.length!==1||m.validKeywords[0]!=='CUSTOM_RIMLIGHT_ON'))throw Error('FURNITURE_MULTI_SHADER_UNSUPPORTED');
 const f=m.floats,c=m.colors;
 // The banner has one source-pinned transparent range; preserve its blend and depth state.
 const blendState:CustomLitBlendState|undefined=alpha?{queue:3000,srcBlend:5,dstBlend:10,zWrite:false,cull}:undefined;
 if(alpha&&(m.renderQueue!==3000||f._Material_SrcBlend!==5||f._Material_DstBlend!==10||f._ZTest!==4||f._StencilCompare!==0||f._StencilOverride!==0))throw Error('FURNITURE_MULTI_SHADER_UNSUPPORTED');
 if(!alpha&&sourceHash!=='14c115bce50ad2c24a5372fd37abebc9f6fb2c535a5216685a79335b75a8c61d'&&(m.renderQueue!==-1||f._Material_SrcBlend!==1||f._Material_DstBlend!==0||f._ZTest!==4))throw Error('FURNITURE_MULTI_SHADER_UNSUPPORTED');
 if(f._Material_Alpha!==(alpha?1:0)||f._AlphaClip!==0||f._ZWrite!==(alpha?0:1)||f._Cull!==cull||f._Lighting_Fog!==1||f._Lighting_Medium_Underwater!==0||f._Material_VertexAnimation!==0||f._Surface_Effect!==0||f._Clip_Offset!==0||f.GLIMMER!==0||f.UV_WORLD!==0||m.textures._AnimTex?.texture!==null||m.textures._Surface_EffectMap?.texture!==null||!finite(c._BaseColor,4)||(!native?.[3]?c._BaseColor[3]!==1:c._BaseColor[3]<0||c._BaseColor[3]>1)||!finite(c._EmissionColor,4))throw Error('FURNITURE_MULTI_SHADER_UNSUPPORTED');
 if((keywordFree&&(f.CUSTOM_RIMLIGHT!==0||f._StencilCompare!==0||f._StencilOverride!==0))||(native&&(f.CUSTOM_RIMLIGHT!==native[2]||f._StencilCompare!==0||f._StencilOverride!==0)))throw Error('FURNITURE_MULTI_SHADER_UNSUPPORTED');
 const tex=(name:string)=>{
  const link=m.textures[name];if(!link||link.scale.join(',')!=='1,1'||link.offset.join(',')!=='0,0')throw Error('CUSTOM_LIT_TEXTURE');
  if(link.texture===null){if(!native)throw Error('CUSTOM_LIT_TEXTURE');return furnitureNativeBuiltinTexture(base.shaders[shader].objectSha256,name);}
  const t=base.textures[link.texture];if(!t)throw Error('CUSTOM_LIT_TEXTURE');return t;
 };
 const material:FurnitureForwardMaterial={baseColor:c._BaseColor,baseST:[1,1,0,0],patternST:[1,1,0,0],patternTint:[1,1,1,1],useBaseMapMask:false,worldUV:false,rotationTurns:0,rotationCenter:[0,0],smoothnessShift:f._Smoothness_Shift,metallicShift:f._Metallic_Shift,patternSmoothnessShift:0,patternMetallicShift:0,occlusionStrength:f._OcclusionStrength,rim:furnitureRimFromMaterial(m.validKeywords,f),customLit:{materialAlpha:alpha?1:0}};
 return {material,blendState,reflectionStrength:f._ReflectionStrength,emissionColor:c._EmissionColor.slice(0,3) as unknown as Vec3,textures:{baseMap:tex('_BaseMap'),normalMap:tex('_BumpMap'),comboMap:tex('_MetallicGlossMap')}};
}
