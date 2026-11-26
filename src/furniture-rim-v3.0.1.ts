/** Original CustomLitFurniture CUSTOM_RIMLIGHT_ON (no other keywords).
 * Pixel DXBC words 1015..1222, SHA-256 e317fc095ebc9e798079f84695e178de997a16a9269928231b6287d87c322eaf.
 * All inputs are shader-space; v6 is the explicit ambient varying. No scene
 * selection, postprocessing, or material/save mutations. */
import type {Vec3} from './furniture-surface-v3.0.1';
export type FurnitureRimParameters={power:number;feathering:number;intensity:number;coloring:number};
const f=Math.fround,sat=(v:number)=>Math.min(1,Math.max(0,v));
export function validateFurnitureRim(r:FurnitureRimParameters){
 if(!r||![r.power,r.feathering,r.intensity,r.coloring].every(Number.isFinite)||r.power<0||r.power>5||r.feathering<0||r.feathering>1||r.intensity<0||r.intensity>5||r.coloring<0||r.coloring>1)throw Error('FURNITURE_RIM_PARAMETERS');
}
export function furnitureRimFromMaterial(keywords:readonly string[],floats:Readonly<Record<string,number>>):FurnitureRimParameters|undefined{
 if(floats.CUSTOM_RIMLIGHT===0&&keywords.length===0)return;
 if(floats.CUSTOM_RIMLIGHT!==1||keywords.length!==1||keywords[0]!=='CUSTOM_RIMLIGHT_ON')throw Error('FURNITURE_MULTI_SHADER_UNSUPPORTED');
 const r={power:floats._Lighting_RimPower,feathering:floats._Lighting_RimFeathering,intensity:floats._Lighting_RimIntensity,coloring:floats._Lighting_RimColoring};
 validateFurnitureRim(r);return r;
}
export function furnitureRimLighting(albedo:Vec3,roughness:number,normalViewDot:number,occlusion:number,ambient:Vec3,lit:Vec3,r:FurnitureRimParameters):Vec3{
 validateFurnitureRim(r);
 if(![...albedo,roughness,normalViewDot,occlusion,...ambient,...lit].every(Number.isFinite)||albedo.some(x=>x<0)||roughness<0||roughness>1)throw Error('FURNITURE_RIM_INPUT');
 const q=(sat(1-normalViewDot)+f(.2))*f(5/6);
 const power=roughness*(1-r.power)+r.power;
 const t=sat((q**power-f(.15))/(Math.max(r.feathering,f(.01))*10));
 const weight=t*t*(3-2*t)*q*occlusion*r.intensity;
 const gray=sat(lit[0])*f(.2126729)+sat(lit[1])*f(.7151522)+sat(lit[2])*f(.072175);
 const v=(i:number)=>lit[i]+weight*(gray+r.coloring*(albedo[i]**f(.45)-gray))*ambient[i];
 return [v(0),v(1),v(2)];
}
export const furnitureRimGLSL=`
vec3 evaluateFurnitureRim(vec3 albedo,float rough,float nv,float occlusion,vec3 ambient,vec3 lit,vec4 rim){
 float q=(clamp(1.-nv,0.,1.)+.2)*.8333333333333333;
 float p=rough*(1.-rim.x)+rim.x;
 float t=clamp((pow(q,p)-.15)/(max(rim.y,.01)*10.),0.,1.);
 float w=t*t*(3.-2.*t)*q*occlusion*rim.z;
 float gray=dot(clamp(lit,0.,1.),vec3(.2126729,.7151522,.072175));
 return lit+w*mix(vec3(gray),pow(albedo,vec3(.45)),rim.w)*ambient;
}
`;
