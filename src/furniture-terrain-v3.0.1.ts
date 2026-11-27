/** Original Steam 3.0.1 Terrain Simple ForwardLit surface, pixel 84/92.
 * Three world projections; raw and tinted color remain distinct for specular.
 * No inferred UVs, baked artwork or native scene fidelity claim. */
import type {Vec2,Vec3,Vec4} from './furniture-surface-v3.0.1';
import type {RugNativeSources} from './furniture-rug-source';
import type {FurnitureForwardMaterial} from './furniture-forwardlit-gpu';
export type TerrainParameters={blend:number;topTiling:number;sideTiling:number;topTint:Vec3;sideTint:Vec3;topNormalScale:number;sideNormalScale:number;topSmoothShift:number;sideSmoothShift:number};
export type TerrainSurfaceInput=TerrainParameters&{position:Vec3;normal:Vec3;time:number;speed:number;mipBias:number;occlusionStrength:number};
export type TerrainSampler=(slot:0|1|2|3|4|5,uv:Vec2,bias:number)=>Vec4;
const sat=(v:number)=>Math.max(0,Math.min(1,v));
const dot=(a:readonly number[],b:readonly number[])=>a.reduce((n,x,i)=>n+x*b[i],0);
const norm=(v:Vec3):Vec3=>{const d=Math.sqrt(dot(v,v));if(!(d>0))throw Error('FURNITURE_TERRAIN_NORMAL');return v.map(x=>x/d) as unknown as Vec3;};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const mix3=(a:Vec3,b:Vec3,t:number):Vec3=>[mix(a[0],b[0],t),mix(a[1],b[1],t),mix(a[2],b[2],t)];
const finite=(a:readonly number[],n:number)=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite);
export function validateTerrainParameters(u:TerrainParameters){
 if(!u||!finite(u.topTint,3)||!finite(u.sideTint,3)||![u.blend,u.topTiling,u.sideTiling,u.topNormalScale,u.sideNormalScale,u.topSmoothShift,u.sideSmoothShift].every(Number.isFinite)||u.blend<=0||u.blend>1||u.topTiling<=0||u.sideTiling<=0)throw Error('FURNITURE_TERRAIN_PARAMETERS');
}
export function nativeTerrainSurface(u:TerrainSurfaceInput,sample:TerrainSampler){
 validateTerrainParameters(u);
 if(!finite(u.position,3)||!finite(u.normal,3)||!dot(u.normal,u.normal)||![u.time,u.speed,u.mipBias,u.occlusionStrength].every(Number.isFinite))throw Error('FURNITURE_TERRAIN_INPUT');
 const n=u.normal,p:Vec3=[u.position[0]+u.time*u.speed,u.position[1],u.position[2]],rawWeights=n.map(x=>x*x*x*x),sum=rawWeights.reduce((a,b)=>a+b,0),w=rawWeights.map(x=>x/sum);
 const low=.8509035110473633*(1-u.blend),high=.8509035110473633+.14909648895263672*u.blend,tt=sat((sat(n[1])-low)/(high-low)),t=tt*tt*(3-2*tt);
 const samples=(slot:0|1|2|3|4|5,tiling:number)=>{
  const [x,y,z]=p.map(v=>v*tiling);
  const values=[sample(slot,[z,y],u.mipBias),sample(slot,[x,z],u.mipBias),sample(slot,[x,y],u.mipBias)] as const;
  if(values.some(v=>!finite(v,4)))throw Error('FURNITURE_TERRAIN_SAMPLE');return values;
 };
 const tri=(slot:0|1|2|3,tiling:number):Vec4=>{const [a,b,c]=samples(slot,tiling);return a.map((x,i)=>x*w[0]+b[i]*w[1]+c[i]*w[2]) as unknown as Vec4;};
 const unpack=(v:Vec4):Vec3=>{const x=2*v[0]*v[3]-1,y=2*v[1]-1;return [x,y,Math.max(Math.sqrt(1-Math.min(1,x*x+y*y)),Math.fround(1e-16))];};
 const normal=(slot:4|5,tiling:number,scale:number):Vec3=>{
  const [a,b,c]=samples(slot,tiling).map(unpack);
  const x:Vec3=[a[2]*n[0],a[1]*scale+n[1],a[0]*scale+n[2]],y:Vec3=[b[0]*scale+n[0],b[2]*n[1],b[1]*scale+n[2]],z:Vec3=[c[0]*scale+n[0],c[1]*scale+n[1],c[2]*n[2]];
  return norm(x.map((v,i)=>v*w[0]+y[i]*w[1]+z[i]*w[2]) as unknown as Vec3);
 };
 const sideCombo=tri(3,u.sideTiling),topCombo=tri(2,u.topTiling),combo=sideCombo.map((v,i)=>mix(v,topCombo[i],t));
 const sideColor=tri(1,u.sideTiling),topColor=tri(0,u.topTiling),rawColor=mix3(sideColor.slice(0,3) as unknown as Vec3,topColor.slice(0,3) as unknown as Vec3,t),tint=mix3(u.sideTint,u.topTint,t);
 const sideNormal=normal(5,u.sideTiling,u.sideNormalScale),topNormal=normal(4,u.topTiling,u.topNormalScale);
 return {albedo:rawColor.map((v,i)=>v*tint[i]) as unknown as Vec3,rawColor,normal:mix3(sideNormal,topNormal,t),roughness:sat(combo[0]-mix(u.sideSmoothShift,u.topSmoothShift,t)),metallic:combo[1],occlusion:1+u.occlusionStrength*(combo[2]-1),emissionMask:combo[3]};
}
export const terrainShaderId='CAB-2b27edbfe7f08bad1cd631865ee4eb15:7085089958137184873';
export const terrainShaderHash='6417c4faa59950760b14de6ae5ff53c646f780c24ac4c9b316ca2120863a5414';
export const trellisTerrainMaterialId='CAB-6df9b7d36015f1762383468832407e58:5091958838720382381';
export function resolveTrellisTerrainMaterial(base:RugNativeSources['base'],id:string){
 const m=base.materials[id],fail=():never=>{throw Error('FURNITURE_TERRAIN_SOURCE');};
 if(id!==trellisTerrainMaterialId||!m||m.objectSha256!=='ad91f98ed41af7801ff3acc5b58e838d0daacb95804c80efa6cdef9192ed83e7'||m.shader!==terrainShaderId||base.shaders[terrainShaderId]?.objectSha256!==terrainShaderHash||m.validKeywords.length!==0||m.renderQueue!==-1)return fail();
 const f=m.floats,c=m.colors;
 if(f._Cull!==0||f._ZWrite!==1||f._ZTest!==4||f._Material_SrcBlend!==1||f._Material_DstBlend!==0||f._AlphaClip!==0||f._Material_Alpha!==0||f._Hack_InfinityCart_Speed!==0||f._StencilCompare!==0||f._StencilOverride!==0||!finite(c._BaseColor,4)||c._BaseColor[3]!==1)return fail();
 const texture=(property:string)=>{
  const a=m.textures[property+'_Sides'],b=m.textures[property+'_Top'];
  if(!a||!b||!a.texture||a.texture!==b.texture||[a,b].some(v=>v.scale.join(',')!=='1,1'||v.offset.join(',')!=='0,0'))return fail();
  return base.textures[a.texture]??fail();
 };
 const terrain:TerrainParameters={blend:f._Terrain_Blend,topTiling:f._Terrain_Tiling_Top,sideTiling:f._Terrain_Tiling_Sides,topTint:c._Terrain_Tint_Top.slice(0,3) as unknown as Vec3,sideTint:c._Terrain_Tint_Sides.slice(0,3) as unknown as Vec3,topNormalScale:f._Terrain_NormalScale_Top,sideNormalScale:f._Terrain_NormalScale_Sides,topSmoothShift:f._Terrain_SmoothShift_Top,sideSmoothShift:f._Terrain_SmoothShift_Sides};
 validateTerrainParameters(terrain);
 const material:FurnitureForwardMaterial={terrain,baseColor:c._BaseColor,baseST:[1,1,0,0],patternST:[1,1,0,0],patternTint:[1,1,1,1],useBaseMapMask:false,worldUV:false,rotationTurns:0,rotationCenter:[0,0],smoothnessShift:0,metallicShift:0,patternSmoothnessShift:0,patternMetallicShift:0,occlusionStrength:f._OcclusionStrength};
 return {material,textures:{baseMap:texture('_Terrain_ColorMap'),comboMap:texture('_Terrain_ComboMap'),normalMap:texture('_Terrain_NormalMap')}};
}
/** High quality pixel 92. This fixed material shares top/side texture objects,
 * has zero time offset. Global mip bias is explicitly zero for this diagnostic.
 * Interpolated vertex normal and view vectors follow vertex 16. */
export const nativeTerrainGLSL=`
vec4 terrainTriMap(sampler2D tex,vec3 p,vec3 w){return texture(tex,p.zy)*w.x+texture(tex,p.xz)*w.y+texture(tex,p.xy)*w.z;}
vec3 terrainUnpack(vec4 b){vec2 xy=vec2(b.r*b.a,b.g)*2.-1.;return vec3(xy,max(sqrt(1.-min(1.,dot(xy,xy))),1e-16));}
vec3 terrainTriNormal(sampler2D tex,vec3 p,vec3 w,vec3 n,float scale){
 vec3 a=terrainUnpack(texture(tex,p.zy)),b=terrainUnpack(texture(tex,p.xz)),c=terrainUnpack(texture(tex,p.xy));
 return normalize(w.x*vec3(a.z*n.x,a.y*scale+n.y,a.x*scale+n.z)+w.y*vec3(b.x*scale+n.x,b.z*n.y,b.y*scale+n.z)+w.z*vec3(c.x*scale+n.x,c.y*scale+n.y,c.z*n.z));
}
vec4 nativeTerrainPixel(){
 vec3 N=terrainN,w=N*N;w*=w;w/=dot(w,vec3(1.));
 float t=smoothstep(.8509035110473633*(1.-terrainParams.x),.8509035110473633+.14909648895263672*terrainParams.x,clamp(N.y,0.,1.));
 vec3 ps=worldPosition*terrainParams.z,pt=worldPosition*terrainParams.y;
 vec4 c=mix(terrainTriMap(comboMap,ps,w),terrainTriMap(comboMap,pt,w),t);
 vec3 raw=mix(terrainTriMap(baseMap,ps,w),terrainTriMap(baseMap,pt,w),t).rgb,alb=raw*mix(terrainSideTint,terrainTopTint,t);
 vec3 nn=mix(terrainTriNormal(normalMap,ps,w,N,terrainParams2.x),terrainTriNormal(normalMap,pt,w,N,terrainParams.w),t);
 vec3 n=nn*inversesqrt(max(dot(nn,nn),.00006103515625)),v=terrainV*inversesqrt(max(dot(terrainV,terrainV),.00006103515625)),l=mainLightDirection;
 vec3 h=normalize(v+l);
 float rough=clamp(c.r-mix(terrainParams2.z,terrainParams2.y,t),0.,1.),metal=c.g,occ=1.+occlusionStrength*(c.b-1.),om=.96*(1.-metal);
 vec3 diffuse=alb*om,spec=mix(vec3(.04),raw,metal);
 float r=max(rough*rough,.0078125),r2=r*r,graz=clamp(2.-om-rough,0.,1.),fr=1.-clamp(dot(n,v),0.,1.);fr*=fr;fr*=fr;
 vec3 dir=2.*dot(n,v)*n-v;float lod=(1.7-.7*r)*r*6.;
 vec3 refl=mix(textureLod(reflectionPrimary,dir,lod).rgb,textureLod(reflectionSecondary,dir,lod).rgb,reflectionBlendWeight)*reflectionIntensity;
 float ndl=dot(n,l),ndh=sat(dot(n,h)),ldh=sat(dot(l,h));
 vec3 amb=(sat(.6*ndl+.4)*ambientMain+sat(-.6*ndl+.4)*ambientFill)*(1.+screenOcclusionStrength*(screenOcclusion-1.));
 float den=ndh*ndh*(r2-1.)+1.00001;den=den*den*max(ldh*ldh,.1)*(4.*r+2.);
 float s=clamp(r2/den-.00006103515625,0.,100.);
 vec3 lit=(diffuse+s*spec)*sat(ndl)*mainLightColor+amb*(diffuse+refl*mix(spec,vec3(graz),fr)/(1.+r2))*occ+alb*c.a;
 float ldv=-dot(l,v);
 return vec4(mix(lit,sat(.6*ldv+.4)*ambientMain+sat(-.6*ldv+.4)*ambientFill,fogVarying*fogMultiplier),baseColor.a);
}
`;
