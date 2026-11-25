/** Display transforms from original prefab TRS. No inferred runtime mount pose,
 * icon camera or lighting. All matrices are column-major, WebGL compatible.
 * Keep Unity world axes; only the view converts +Z-forward to clip -Z. */
import type {Vec3,Vec4} from './furniture-surface-v3.0.1';
import {fitFurniturePreviewScale} from './furniture-preview-scale';
export type TransformTRS={position:Vec3;rotation:Vec4;scale:Vec3};
type CameraNode=TransformTRS&{pathId:string;parent:string|null};
type ModelNode=TransformTRS&{transformPathId:string;parentPathId:string|null;active:boolean;rendererPathId?:string;enabled?:boolean};
export type AuthoredCameraSource={schema:string;version:string;bundleSha256:string;textureSize:number;transformChain:readonly CameraNode[];mount:CameraNode;rig:{maxObjectSize:number;considerLossyScale:boolean};camera:{projectionMatrixMode:number;near:number;far:number;fov:number;orthographic:boolean;lensShift:readonly number[];viewport:readonly number[]}};
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const finite=(v:readonly number[],n:number)=>v.length===n&&v.every(Number.isFinite);
const fail=():never=>{throw Error('FURNITURE_AUTHORED_TRANSFORM');};
export function multiplyTransforms(a:readonly number[],b:readonly number[]){
 if(!finite(a,16)||!finite(b,16))fail();
 return Array.from({length:16},(_,i)=>{const col=Math.floor(i/4),row=i%4;return [0,1,2,3].reduce((v,k)=>v+a[k*4+row]*b[col*4+k],0);});
}
export function authoredTRS(t:TransformTRS){
 if(!finite(t.position,3)||!finite(t.rotation,4)||!finite(t.scale,3)||t.scale.some(x=>x===0))fail();
 const qlen=Math.hypot(...t.rotation);if(Math.abs(qlen-1)>1e-5)fail();
 const [x,y,z,w]=t.rotation.map(v=>v/qlen),[a,b,c]=t.scale;
 return [(1-2*y*y-2*z*z)*a,(2*x*y+2*z*w)*a,(2*x*z-2*y*w)*a,0,
 (2*x*y-2*z*w)*b,(1-2*x*x-2*z*z)*b,(2*y*z+2*x*w)*b,0,
 (2*x*z+2*y*w)*c,(2*y*z-2*x*w)*c,(1-2*x*x-2*y*y)*c,0,...t.position,1];
}
export function transformPoint(m:readonly number[],p:Vec3):Vec3{
 if(!finite(m,16)||!finite(p,3))fail();
 return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
}
function inverseAffine(m:readonly number[]){
 if(!finite(m,16)||m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1)fail();
 const [a,d,g,,b,e,h,,c,f,i]=m;
 const det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
 if(!Number.isFinite(det)||Math.abs(det)<1e-12)fail();
 const x=[(e*i-f*h)/det,(f*g-d*i)/det,(d*h-e*g)/det,0,(c*h-b*i)/det,(a*i-c*g)/det,(b*g-a*h)/det,0,(b*f-c*e)/det,(c*d-a*f)/det,(a*e-b*d)/det,0,0,0,0,1];
 const p=transformPoint(x,[-m[12],-m[13],-m[14]]);x[12]=p[0];x[13]=p[1];x[14]=p[2];
 return {matrix:x,determinant:det};
}
export function modelNormalBasis(model:readonly number[]){
 const {matrix:i,determinant}=inverseAffine(model);
 return {normalMatrix:[i[0],i[4],i[8],i[1],i[5],i[9],i[2],i[6],i[10]],tangentParity:determinant<0?-1 as const:1 as const};
}
function chainWorld(nodes:readonly CameraNode[]){
 if(!nodes.length||nodes.length>64||new Set(nodes.map(n=>n.pathId)).size!==nodes.length||nodes.at(-1)?.parent!==null)fail();
 const world=new Map<string,number[]>();let m=identity();
 for(let i=nodes.length-1;i>=0;i--){
  const n=nodes[i];if(i<nodes.length-1&&n.parent!==nodes[i+1].pathId)fail();
  m=multiplyTransforms(m,authoredTRS(n));world.set(n.pathId,m);
 }
 return world;
}
export function authoredPreviewCamera(source:AuthoredCameraSource,aspect:number){
 const c=source.camera;
 if(source.schema!=='HKIA.FurniturePreviewCamera.1'||source.version!=='3.0.1'||source.bundleSha256!=='c0ada5696936537ecd874bb7f936c7775c2b6110be3a568b44e43f00ea769795'||
 source.textureSize!==512||c.orthographic||c.projectionMatrixMode!==1||c.lensShift.join(',')!=='0,0'||c.viewport.join(',')!=='0,0,1,1'||
 ![aspect,c.near,c.far,c.fov].every(Number.isFinite)||aspect<=0||c.near<=0||c.far<=c.near||c.fov<=0||c.fov>=180)fail();
 const world=chainWorld(source.transformChain);
 const cameraWorld=world.get(source.transformChain[0].pathId)!;
 const mountParent=world.get(source.mount.parent??'');if(!mountParent)throw Error('FURNITURE_AUTHORED_MOUNT');
 const mountWorld=multiplyTransforms(mountParent,authoredTRS(source.mount));
 // +Z-forward Unity camera, -Z-forward OpenGL camera, clip depth [-1,1].
 const flip=identity();flip[10]=-1;
 const view=multiplyTransforms(flip,inverseAffine(cameraWorld).matrix);
 const f=1/Math.tan(c.fov*Math.PI/360),n=c.near,far=c.far;
 const projection=[f/aspect,0,0,0,0,f,0,0,0,0,(far+n)/(n-far),-1,0,0,2*far*n/(n-far),0];
 return {cameraPosition:transformPoint(cameraWorld,[0,0,0]),cameraWorld,mountWorld,view,projection,viewProjection:multiplyTransforms(projection,view),renderFidelity:'unverified' as const};
}
/** Exact authored child chain with explicit runtime item-root TRS. The caller
 * supplies the actual displayed bounds and lossy scale for the native fit step,
 * not a guessed bounding sphere or a fitted camera. */
export function authoredRendererModel(nodes:readonly ModelNode[],rendererPathId:string,mountWorld:readonly number[],runtimeRoot:TransformTRS,fit:{extents:Vec3;lossyScale:Vec3;maxObjectSize:number;considerLossyScale:boolean}){
 if(!nodes.length||nodes.length>512||new Set(nodes.map(n=>n.transformPathId)).size!==nodes.length)fail();
 const lookup=new Map(nodes.map(n=>[n.transformPathId,n]));
 const matches=nodes.filter(n=>n.rendererPathId===rendererPathId);
 if(matches.length!==1||matches[0].enabled!==true)fail();
 const chain:ModelNode[]=[];let node:ModelNode|undefined=matches[0];const seen=new Set<string>();
 while(node){if(seen.has(node.transformPathId)||!node.active)fail();seen.add(node.transformPathId);chain.push(node);
  if(node.parentPathId===null)break;
  const parent=lookup.get(node.parentPathId);if(!parent)fail();node=parent;
 }
 const root=chain.at(-1);if(!root||root.parentPathId!==null||nodes.filter(n=>n.parentPathId===null).length!==1)fail();
 const fittedScale=fitFurniturePreviewScale(fit.extents,fit.lossyScale,runtimeRoot.scale,fit.maxObjectSize,fit.considerLossyScale);
 let model=multiplyTransforms(mountWorld,authoredTRS({...runtimeRoot,scale:fittedScale}));
 for(let i=chain.length-2;i>=0;i--)model=multiplyTransforms(model,authoredTRS(chain[i]));
 return {model,...modelNormalBasis(model),fittedScale,renderFidelity:'unverified' as const};
}
