/** Isolated original CustomLitRefractive high quality ForwardLit arithmetic.
 * The samples and basis must be supplied by the matching original vertex and
 * texture stages. This is not production icon fidelity or a save rule.
 */
import type {RefractiveVec2 as V2,RefractiveVec3 as V3} from './furniture-refractive-screen-v3.0.1';
type V4=readonly [number,number,number,number];
type Basis=readonly [V3,V3,V3];
type ViewColumns=readonly [V2,V2,V2];
const dot=(a:V3,b:V3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const normal=(v:V3):V3=>{const n=Math.sqrt(dot(v,v));return [v[0]/n,v[1]/n,v[2]/n];};
export function refractiveNormalLod(smoothness:number){return 5*smoothness;}
export function refractiveNormal(sample:V4,smoothness:number,tangentRows:Basis):V3{
 const x=2*sample[0]*sample[3]-1,y=2*sample[1]-1,z=Math.sqrt(1-Math.min(1,x*x+y*y));
 const t:V3=[x*(1-smoothness),y*(1-smoothness),z+(1-z)*smoothness];
 return normal([dot(tangentRows[0],t),dot(tangentRows[1],t),dot(tangentRows[2],t)]);
}
export function refractiveNoiseUv(uv:V2,scale:number):V2{return [uv[0]*scale,uv[1]*scale];}
export type RefractionDisplacementInput={
 refractionNormal:V3;view:V3;index:number;fresnel:number;
 noiseSample:V2;noisePower:number;viewColumns:ViewColumns;
};
export function refractiveDisplacement(u:RefractionDisplacementInput){
 const n=u.refractionNormal,v=u.view,c=dot(n,v);
 // The original uses log2(c), not abs(c) or a clamped dot. Do not
 // manufacture a result for nonpositive/undefined facing inputs.
 if(!(c>0)||!Number.isFinite(c)||!Number.isFinite(u.fresnel))throw Error('REFRACTIVE_FACING_UNVERIFIED');
 const f=Math.min(Math.pow(c,u.fresnel),1),eta=u.index;
 const k=1-eta*eta*(1-c*c),q=k>=0?eta*c+Math.sqrt(k):0;
 const d:V3=k>=0?[eta*v[0]-q*n[0],eta*v[1]-q*n[1],eta*v[2]-q*n[2]]:[0,0,0];
 const x=d[0]+(2*u.noiseSample[0]-1)*u.noisePower,y=d[1]+(2*u.noiseSample[1]-1)*u.noisePower;
 const [a,b,g]=u.viewColumns;
 const viewDisplacement:V2=[a[0]*x+b[0]*y+g[0]*d[2],a[1]*x+b[1]*y+g[1]*d[2]];
 return {facingFactor:f,viewDisplacement,totalInternalReflection:k<0};
}
/** Native arithmetic for verified positive-facing inputs. Caller supplies
 * sampled normal at 5*smoothness LOD and noise at uv*noiseScale with mip bias.
 * Explicit zero refraction on negative discriminant preserves noise only. */
export const NATIVE_REFRACTIVE_DISPLACEMENT_GLSL=`
vec3 nativeRefractiveNormal(vec4 bump, float smoothness, mat3 tangentBasis) {
 vec2 xy = vec2(bump.r * bump.a, bump.g) * 2.0 - 1.0;
 float z = sqrt(1.0 - min(1.0, dot(xy, xy)));
 return normalize(tangentBasis * mix(vec3(xy,z), vec3(0.0,0.0,1.0), smoothness));
}
vec2 nativeRefractiveDisplacement(vec3 n, vec3 v, float eta, float fresnel,
 vec2 noiseSample, float noisePower, mat3 viewMatrix, out float facing) {
 float c = dot(n,v);
 facing = min(exp2(log2(c)*fresnel),1.0);
 float k = 1.0 - eta*eta*(1.0-c*c);
 vec3 d = k >= 0.0 ? eta*v-(eta*c+sqrt(k))*n : vec3(0.0);
 d.xy += (noiseSample*2.0-1.0)*noisePower;
 return (viewMatrix*d).xy;
}
`;
