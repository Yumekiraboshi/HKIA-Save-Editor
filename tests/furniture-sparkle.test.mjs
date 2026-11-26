import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-sparkle-v3.0.1.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {sparkleSurface,sparkleCombine}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const fixture={"layer":{"input":{"noiseIndirect":[0.635200293567589,0.3980135355121047,0.47604808248569797],"baseIndirect":[0.6995915483899608,0.759294726109269,0.7795279164850316],"sparkleTint":[0.3344665858918672,0.9676371538599604,0.7630395061449436],"noiseSpecular":[0.27059958136195583,0.17197313708510986,0.430116177152956],"noiseSpec":26.05847788498491,"directBase":[0.8775896247277115,0.009312623608554005,0.8179556265825352],"directLight":[0.16187202612307128,0.8118317241819726,0.43273970805201645],"emissionColor":[0.13178906974061932,0.9853620958541313,0.41899397031117047],"albedo":[0.3732852321896437,0.020711607549710978,0.4738121850383498],"alpha":0.11717418799126365,"occlusion":0.9697618727025388,"emissionMask":0.6394956144427328},"expected":{"indirect":[0.7025785007626375,0.7800981107199072,0.7972321953409155],"lit":[0.888200503039208,0.8716477976219766,1.4646699821062759]}},"input":{"base":[0.414743999308679,0.2877001726198135,0.8447123409803766,0.44377102299371884],"combo":[0.5287265587083821,0.5512591967494214,0.3389030681989278,0.6394956144427328],"baseColor":[0.9000376926775521,0.07199025068740816,0.560915428900259,0.26404199895882374],"smoothnessShift":0.31134434749686246,"metallicShift":0.24676066182700374,"occlusionStrength":0.04573932481441323,"normal":[0.11290250837191795,0.5283496285730391,0.8586548576898659,0.7976692295510386],"noise":[0.8238899642579794,0.13705500729483044,0.3505491492713546],"noiseIntensity":0.5769182715742165,"baseUV":[0.3664684118155933,0.2306628300410647],"noiseScale":9.228647116760683,"frontFacing":false},"expected":{"albedo":[0.3732852321896437,0.020711607549710978,0.4738121850383498],"alpha":0.11717418799126365,"rawRoughness":0.21738221121151968,"rawMetallic":0.7980198585764251,"occlusion":0.9697618727025388,"emissionMask":0.6394956144427328,"baseNormal":[0.8198822862651851,-0.056699257146078264,-0.5697176764921867],"noiseNormal":[-0.6460344718935012,-0.5062783720960892,0.5712457186474302],"noiseUV":[3.382007652085842,2.1287058614023313]}};
function close(a,b){
 if(Array.isArray(b)){assert.equal(a.length,b.length);b.forEach((x,i)=>close(a[i],x));}
 else if(typeof b==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());for(const k of Object.keys(b))close(a[k],b[k]);}
 else assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
}
test('original Sparkle token samples preserve two distinct normal layers, mask and compositing',()=>{
 close(sparkleSurface(fixture.input),fixture.expected);close(sparkleCombine(fixture.layer.input),fixture.layer.expected);
 const x=sparkleSurface({...fixture.input,frontFacing:true});
 close(x.baseNormal,fixture.expected.baseNormal.map(v=>-v));close(x.noiseNormal,fixture.expected.noiseNormal);
 const z=sparkleCombine({...fixture.layer.input,alpha:0});
 close(z.indirect,fixture.layer.input.baseIndirect.map(v=>v*fixture.layer.input.occlusion));
 assert.throws(()=>sparkleSurface({...fixture.input,noise:[.5,.5,.5]}),/SPARKLE_NORMAL/);
 assert.throws(()=>sparkleSurface({...fixture.input,noiseScale:NaN}),/SPARKLE_SURFACE_INPUT/);
 assert.throws(()=>sparkleCombine({...fixture.layer.input,alpha:NaN}),/SPARKLE_LAYER_INPUT/);
});
