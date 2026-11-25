import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-authored-transforms.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {authoredTRS,multiplyTransforms,transformPoint,modelNormalBasis,authoredPreviewCamera,authoredRendererModel}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const read=p=>JSON.parse(readFileSync(new URL('../data/'+p,import.meta.url)));
const near=(a,b,tol=1e-7)=>{assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<=tol,JSON.stringify({a,b,i}));};
const source=read('furniture-preview-camera-v3.0.1.json');
const rug=read('furniture-mesh-source-sample-v3.0.1.json').rows.find(r=>r.itemId===32709745);
const identityTRS={position:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1]};
const identity=authoredTRS(identityTRS);
test('authored camera chain preserves the podium 180-degree rotation, translation and mount',()=>{
 const c=authoredPreviewCamera(source,1);
 const camera=source.transformChain[0],rig=source.transformChain[1];
 const manual=authoredTRS(rig);
 near(c.cameraPosition,transformPoint(manual,camera.position));
 near(transformPoint(c.mountWorld,[0,0,0]),[0,-366.89999997615814,0]);
 near(transformPoint(c.view,c.cameraPosition),[0,0,0]);
 const ahead=transformPoint(c.cameraWorld,[0,0,2]);
 near(transformPoint(c.view,ahead),[0,0,-2]);
 assert.equal(c.renderFidelity,'unverified');
 const clip=(m,p)=>[0,1,2,3].map(i=>m[i]*p[0]+m[4+i]*p[1]+m[8+i]*p[2]+m[12+i]);
 for(const [depth,expected] of [[source.camera.near,-1],[source.camera.far,1]]){
  const world=transformPoint(c.cameraWorld,[0,0,depth]);
  const q=clip(c.viewProjection,world);near([q[0]/q[3],q[1]/q[3],q[2]/q[3]],[0,0,expected],1e-6);
 }
});
test('normal inverse transpose handles nonuniform scaling, rotation and negative determinant',()=>{
 const q=Math.SQRT1_2,trs={position:[3,5,7],rotation:[0,0,q,q],scale:[2,3,-4]};
 const m=authoredTRS(trs);near(transformPoint(m,[1,1,1]),[0,7,3]);
 const n=modelNormalBasis(m);near(n.normalMatrix,[0,.5,0,-1/3,0,0,0,0,-.25]);assert.equal(n.tangentParity,-1);
 near(multiplyTransforms(identity,m),m);near(multiplyTransforms(m,identity),m);
});
test('rug renderer composes exact child transforms with explicit runtime root and native scale fit inputs',()=>{
 const camera=authoredPreviewCamera(source,1),renderer=rug.nodes.find(n=>n.rendererPathId);
 const fit={extents:[3,0,4],lossyScale:[1,1,1],maxObjectSize:source.rig.maxObjectSize,considerLossyScale:source.rig.considerLossyScale};
 const result=authoredRendererModel(rug.nodes,renderer.rendererPathId,camera.mountWorld,identityTRS,fit);
 near(result.fittedScale,[.2,.2,.2]);const childY=rug.nodes[1].scale[1]*rug.nodes[2].scale[1];
 near(transformPoint(result.model,[0,1,0]),transformPoint(camera.mountWorld,[0,.2*childY,0]));
 assert.equal(result.tangentParity,1);assert.equal(result.renderFidelity,'unverified');
});
test('refuses invalid camera source, parent chain, transform and unresolved renderer',()=>{
 assert.throws(()=>authoredPreviewCamera({...source,camera:{...source.camera,lensShift:[.1,0]}},1),/FURNITURE_AUTHORED/);
 assert.throws(()=>authoredPreviewCamera({...source,transformChain:source.transformChain.slice(1,-1)},1),/FURNITURE_AUTHORED/);
 assert.throws(()=>authoredTRS({...identityTRS,rotation:[0,0,0,0]}),/FURNITURE_AUTHORED/);
 assert.throws(()=>authoredTRS({...identityTRS,scale:[1,0,1]}),/FURNITURE_AUTHORED/);
 const fit={extents:[1,1,1],lossyScale:[1,1,1],maxObjectSize:2,considerLossyScale:true};
 assert.throws(()=>authoredRendererModel(rug.nodes,'invalid',identity,identityTRS,fit),/FURNITURE_AUTHORED/);
 const nodes=rug.nodes.map((n,i)=>i===1?{...n,parentPathId:n.transformPathId}:n);
 assert.throws(()=>authoredRendererModel(nodes,rug.nodes[2].rendererPathId,identity,identityTRS,fit),/FURNITURE_AUTHORED/);
});
