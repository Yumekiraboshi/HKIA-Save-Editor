/** Linear-space surface terms from CustomLitFlower v3.0.1, ForwardLit.
 * The same token ranges occur in the keyword-free and CUSTOM_RIMLIGHT_ON
 * pixel programs. Only _Surface_Effect == 0 is implemented. Lighting,
 * treatment-to-uniform resolution, GPU texture sampling and rim lighting
 * are separate steps. No save rules or approximate thumbnail fitting.
 */
type RGB=readonly [number,number,number];
type RGBA=readonly [number,number,number,number];
export type FlowerSurfaceUniforms={
 baseColor:RGBA;patternColor1:RGB;patternColor2:RGB;
 smoothnessShift:number;metallicShift:number;patternSmoothnessShift:number;
 patternMetallicShift:number;occlusionStrength:number;surfaceEffect:0;
};
const sat=(x:number)=>Math.max(0,Math.min(1,x));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
export function evaluateFlowerSurface(base:RGBA,patternRed:number,combo:RGBA,u:FlowerSurfaceUniforms){
 if(u.surfaceEffect!==0||base.length!==4||combo.length!==4||u.baseColor.length!==4||
  u.patternColor1.length!==3||u.patternColor2.length!==3||
  ![...base,patternRed,...combo,...u.baseColor,...u.patternColor1,...u.patternColor2,u.smoothnessShift,
  u.metallicShift,u.patternSmoothnessShift,u.patternMetallicShift,u.occlusionStrength].every(Number.isFinite)||
  ![...base,patternRed,...combo].every(x=>x>=0&&x<=1))throw Error('FLOWER_SURFACE_UNSUPPORTED');
 // Native words 245..259: alpha of base tint gates the base texture's mask.
 const weight=u.baseColor[3]>0?base[3]:0;
 // Words 758..797: pattern red selects the two pattern colors; blend
 // original base RGB times base tint over that result using base mask.
 const albedo=[0,1,2].map(i=>lerp(lerp(u.patternColor2[i],u.patternColor1[i],patternRed),base[i]*u.baseColor[i],weight)) as unknown as RGB;
 // Words 1000..1129 on the no-effect path. Preserve both native shift stages
 // and the intervening saturate; they must not be folded into one clamp.
 const perceptualRoughness=sat(sat(combo[0]-u.smoothnessShift)-lerp(u.patternSmoothnessShift,u.smoothnessShift,weight));
 const metallic=sat(sat(combo[1]+u.metallicShift)+lerp(u.patternMetallicShift,u.metallicShift,weight));
 const occlusion=lerp(1,combo[2],u.occlusionStrength);
 return {albedo,weight,perceptualRoughness,metallic,occlusion};
}
