/** Exact isolated screen-sampling/composition stage of Steam 3.0.1
 * CustomLitRefractive high-quality REFRACTION_ON ForwardLit blob 192.
 * Input displacement, facing factor, opaque camera buffer, lighting and
 * alpha must come from their own verified native stages. Not an icon renderer.
 */
export type RefractiveVec2=readonly [number,number];
export type RefractiveVec3=readonly [number,number,number];
export type RefractiveScreenInput={
 screenUv:RefractiveVec2;viewDisplacement:RefractiveVec2;
 facingFactor:number;chromatism:number;
};
const saturate=(x:number)=>Math.min(1,Math.max(0,x));
export function refractiveScreenCoordinates(u:RefractiveScreenInput){
 const delta=u.chromatism*.02500000037252903;
 const at=(shift:number):RefractiveVec2=>[
  saturate(u.screenUv[0]+u.viewDisplacement[0]*(1-u.facingFactor)+shift),
  saturate(u.screenUv[1]+u.viewDisplacement[1]*(1-u.facingFactor)+shift)
 ];
 return {red:at(-delta),green:at(delta),blue:at(0)};
}
export function composeRefractiveScreen(lit:RefractiveVec3,channels:RefractiveVec3,baseColor:RefractiveVec3,tint:number,facingFactor:number,intensity:number):RefractiveVec3{
 const gain=facingFactor*intensity;
 const channel=(i:0|1|2)=>lit[i]+channels[i]*(1+(baseColor[i]-1)*tint)*gain;
 return [channel(0),channel(1),channel(2)];
}
/** Call in a verified high-quality fragment pipeline only after the opaque
 * camera color texture exists. Sampler bias and per-channel positions are
 * native; do not approximate refraction by a translucent flat tint. */
export const NATIVE_REFRACTIVE_SCREEN_GLSL=`
vec3 nativeRefractiveScreen(
 sampler2D opaqueCamera, vec2 screenUV, vec2 viewDisplacement,
 float facingFactor, float chromatism, float mipBias,
 vec3 lit, vec3 baseColor, float tint, float intensity
) {
 vec2 center = screenUV + viewDisplacement * (1.0 - facingFactor);
 float shift = chromatism * 0.025;
 vec2 redUV = clamp(center - vec2(shift), 0.0, 1.0);
 vec2 greenUV = clamp(center + vec2(shift), 0.0, 1.0);
 vec2 blueUV = clamp(center, 0.0, 1.0);
 vec3 channels = vec3(texture(opaqueCamera, redUV, mipBias).r,
                      texture(opaqueCamera, greenUV, mipBias).g,
                      texture(opaqueCamera, blueUV, mipBias).b);
 return lit + channels * mix(vec3(1.0), baseColor, tint) * (facingFactor * intensity);
}
`;
