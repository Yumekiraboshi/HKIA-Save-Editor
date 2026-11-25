/** Raw authored light settings, not evaluated game lighting or shader constants.
 * The caller must explicitly select a source preset and time; no automatic region,
 * weather, time, gradient color-space, or shader binding is inferred here. */
type Tangent = number | 'Infinity' | '-Infinity';
type Curve = {kind:'curve'; keys: readonly (readonly [number,number,Tangent,Tangent,number,number,number])[]; wrap: readonly number[]};
type Gradient = {kind:'gradient'; keys: readonly (readonly number[])[]; colorTimes: readonly number[]; alphaTimes: readonly number[]; colorKeyCount:number; alphaKeyCount:number; mode:number; colorSpaceRaw:number};
type Asset = Curve | Gradient;
type Preset = {name:string; polar:number; vignetteEnabled:boolean; links:Readonly<Record<string,string>>};
type Cube = {name:string; sha256:string; faceOrder:string};
export type FurnitureLightSource = {schema:string; version:string; presets:Readonly<Record<string,Preset>>; assets:Readonly<Record<string,Asset>>; cubemaps:Readonly<Record<string,Cube>>};
type Sample<T> = {status:'sampled'; value:T} | {status:'unresolved'; reason:string};
const sampled=<T>(value:T):Sample<T>=>({status:'sampled',value});
const unresolved=(reason:string):Sample<never>=>({status:'unresolved',reason});
const own=<T>(record:Readonly<Record<string,T>>,id:string):T|undefined=>Object.prototype.hasOwnProperty.call(record,id)?record[id]:undefined;
const validTime=(t:number)=>Number.isFinite(t)&&t>=0&&t<=1;

/** Unweighted Hermite interpolation of the serialized curve in its authored
 * domain. No extrapolation/wrap assumptions or infinite-tangent step semantics. */
export function sampleAuthoredCurve(curve:Curve,t:number):Sample<number>{
 if(!validTime(t))return unresolved('invalid-time');
 const k=curve.keys;
 if(!k.length||k.some((x,i)=>!validTime(x[0])||!Number.isFinite(x[1])||(i>0&&x[0]<=k[i-1][0])))return unresolved('invalid-curve');
 if(k.length===1)return sampled(k[0][1]);
 const exact=k.find(x=>x[0]===t);if(exact)return sampled(exact[1]);
 const j=k.findIndex(x=>x[0]>t);
 if(j<=0)return unresolved('wrap-unverified');
 const a=k[j-1],b=k[j];
 if(a[4]!==0||b[4]!==0)return unresolved('weighted-curve');
 if(typeof a[3]!=='number'||typeof b[2]!=='number'||!Number.isFinite(a[3])||!Number.isFinite(b[2]))return unresolved('step-tangent-unverified');
 const dt=b[0]-a[0],u=(t-a[0])/dt,u2=u*u,u3=u2*u;
 const value=(2*u3-3*u2+1)*a[1]+(u3-2*u2+u)*dt*a[3]+(-2*u3+3*u2)*b[1]+(u3-u2)*dt*b[2];
 return Number.isFinite(value)?sampled(value):unresolved('nonfinite-result');
}
/** The raw gradient's color-space byte is unverified. Resolve exact keys and
 * constant segments only, and do not convert serialized HDR colors to RGB. */
export function sampleAuthoredGradient(g:Gradient,t:number):Sample<readonly [number,number,number,number]>{
 if(!validTime(t))return unresolved('invalid-time');
 const tick=t*65535;
 const channel=(times:readonly number[],count:number,components:readonly number[]):Sample<readonly number[]>=>{
  if(!Number.isInteger(count)||count<1||count>8||count>times.length||count>g.keys.length)return unresolved('invalid-gradient-count');
  const rows=times.slice(0,count).map((x,i)=>({time:x,values:components.map(c=>g.keys[i][c])}));
  if(rows.some((x,i)=>!Number.isInteger(x.time)||x.time<0||x.time>65535||x.values.some(v=>!Number.isFinite(v))||(i>0&&x.time<=rows[i-1].time)))return unresolved('invalid-gradient-keys');
  const exact=rows.find(x=>Math.abs(x.time-tick)<1e-9);if(exact)return sampled(exact.values);
  const j=rows.findIndex(x=>x.time>tick);
  if(j<=0)return unresolved('gradient-boundary-unverified');
  const a=rows[j-1].values,b=rows[j].values;
  return a.every((v,i)=>v===b[i])?sampled(a):unresolved('gradient-interpolation-unverified');
 };
 const rgb=channel(g.colorTimes,g.colorKeyCount,[0,1,2]),alpha=channel(g.alphaTimes,g.alphaKeyCount,[3]);
 if(rgb.status==='unresolved')return rgb;
 if(alpha.status==='unresolved')return alpha;
 return sampled([rgb.value[0],rgb.value[1],rgb.value[2],alpha.value[0]]);
}
export function sampleFurnitureAuthoredPreset(source:FurnitureLightSource,presetId:string,t:number){
 if(source.schema!=='HKIA.FurnitureLightRegionSource.1'||source.version!=='3.0.1'||!validTime(t)||! /^-?[0-9]+$/.test(presetId))throw Error('FURNITURE_LIGHT_SOURCE');
 const preset=own(source.presets,presetId);if(!preset)throw Error('FURNITURE_LIGHT_PRESET');
 const fields:Record<string,{assetId:string;sample:Sample<number|readonly number[]>}>=Object.create(null);
 const reflectionId=preset.links.ReflectionMap;
 const reflection=reflectionId&&own(source.cubemaps,reflectionId);
 if(!reflection)throw Error('FURNITURE_LIGHT_REFLECTION');
 for(const [key,assetId] of Object.entries(preset.links)){
  if(key==='ReflectionMap')continue;
  const asset=own(source.assets,assetId);if(!asset)throw Error('FURNITURE_LIGHT_ASSET');
  const sample=asset.kind==='curve'?sampleAuthoredCurve(asset,t):asset.kind==='gradient'?sampleAuthoredGradient(asset,t):unresolved('unknown-asset');
  fields[key]={assetId,sample};
 }
 return {presetId,name:preset.name,normalizedTime:t,polar:preset.polar,vignetteEnabled:preset.vignetteEnabled,fields,reflection:{assetId:reflectionId,...reflection},runtimeBinding:'unverified' as const};
}
