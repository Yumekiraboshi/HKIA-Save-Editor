/** Original CustomLitFurniture ForwardLit (no quality/interior/shadow keywords).
 * Shader-space samples and uniforms only. No lighting, camera, texture decoding,
 * save validation, or claim of final game-icon equivalence. */
export type Vec2=readonly [number,number];
export type Vec3=readonly [number,number,number];
export type Vec4=readonly [number,number,number,number];
export type FurnitureSurfaceUniforms={baseColor:Vec4;patternTint:Vec4;useBaseMapMask:boolean;smoothnessShift:number;metallicShift:number;patternSmoothnessShift:number;patternMetallicShift:number;occlusionStrength:number};
const finite=(a:readonly number[])=>{if(!a.every(Number.isFinite))throw Error('FURNITURE_SURFACE_NONFINITE');};
const sat=(v:number)=>Math.max(0,Math.min(1,v));
const mix=(a:number,b:number,t:number)=>a+t*(b-a);
/** Vertex block 291–443 of original program 0f0cfe2d…; distinct UV0 and UV1.
 * World UV mode uses world XZ/4 for both and forces rotation center zero. */
export function furnitureTextureCoordinates(uv0:Vec2,uv1:Vec2,world:Vec3,baseST:Vec4,patternST:Vec4,worldUV:boolean,rotationTurns:number,center:Vec2):{base:Vec2;pattern:Vec2}{
 finite([...uv0,...uv1,...world,...baseST,...patternST,rotationTurns,...center]);
 const a=worldUV?[world[0]/4,world[2]/4]:uv0,b=worldUV?a:uv1,c=worldUV?[0,0]:center;
 const x=b[0]*patternST[0]+patternST[2]-c[0],y=b[1]*patternST[1]+patternST[3]-c[1];
 const angle=rotationTurns*2*Math.PI,s=Math.sin(angle),co=Math.cos(angle);
 return {base:[a[0]*baseST[0]+baseST[2],a[1]*baseST[1]+baseST[3]],pattern:[co*x+s*y+c[0],-s*x+co*y+c[1]]};
}
/** Original pixel program cde2be6d… token ranges 171–203 and 375–472.
 * The BaseColor alpha is a positive/zero gate, NOT an opacity or a blend factor.
 * Preserve two distinct saturation steps in the combo-map calculation. */
export function furnitureSurface(base:Vec4,pattern:Vec4,combo:Vec4,u:FurnitureSurfaceUniforms){
 finite([...base,...pattern,...combo,...u.baseColor,...u.patternTint,u.smoothnessShift,u.metallicShift,u.patternSmoothnessShift,u.patternMetallicShift,u.occlusionStrength]);
 const w=u.baseColor[3]>0?1+(u.useBaseMapMask?1:0)*(base[3]-1):0;
 const albedo:Vec3=[0,1,2].map(i=>mix(pattern[i]*u.patternTint[i],base[i]*u.baseColor[i],w)) as unknown as Vec3;
 return {albedo,weight:w,perceptualRoughness:sat(sat(combo[0]-u.smoothnessShift)-mix(u.patternSmoothnessShift,u.smoothnessShift,w)),metallic:sat(sat(combo[1]+u.metallicShift)+mix(u.patternMetallicShift,u.metallicShift,w)),occlusion:1+u.occlusionStrength*(combo[2]-1)};
}
/** Original normal map block 203–275. The face sign is provided explicitly;
 * tangent-to-world transform and final lighting are deliberately excluded. */
export function furnitureTangentNormal(sample:Vec4,frontFace:boolean):Vec3{
 finite(sample);const x=sample[0]*sample[3]*2-1,y=sample[1]*2-1,z=Math.sqrt(Math.max(0,1-Math.min(1,x*x+y*y))),sign=frontFace?1:-1;
 return [x*sign,y*sign,z*sign];
}
