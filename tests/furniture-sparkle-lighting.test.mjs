import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/furniture-sparkle-lighting-v3.0.1.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {sparkleLighting}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const fixture={"input":{"albedo":[0.7011842550594889,0.28551915208496126,0.13248869348191594],"roughness":0.7305614813662905,"metallic":0.8286264232290229,"occlusion":0.11251125787274563,"alpha":0.4118549461372609,"emissionMask":0.2766262678006892,"emissionColor":[0.5920345580145729,0.9772465632536339,0.9966370929471644],"normal":[0.19881816564184612,0.6652913576073098,-0.7196240313551473],"noiseNormal":[-0.5823663372109495,-0.4241540936079071,0.693500363488843],"view":[-0.2628942032465778,-0.7383407418133313,0.6210793724459756],"lightDirection":[0.11786338057546579,-0.416471251855518,-0.9014765220998384],"lightColor":[0.5169371663412927,0.445906375731687,0.19132767603559542],"ambient":[0.7698781780355282,0.7718280798632605,0.29829553934509945],"screenOcclusion":0.9841467076585498,"screenOcclusionStrength":0.8829399717423618,"reflectionBlendWeight":0,"reflectionIntensity":0.15769739597777654,"reflectionStrength":0.30841076572518433,"noiseReflectionStrength":0.8179354130082624,"noiseRoughness":0.07917515179750878,"noiseMetal":0.24420184634668152,"sparkleTint":[0.29889532645466366,0.5126691792301219,0.28134138016660737],"primary":[0.9999078443419278,0.11162889019792799,0.10469087524841181],"secondary":[0.9233393654827659,0.1862251299886185,0.4419032318872522],"noisePrimary":[0.5228062726803716,0.567146698549232,0.07258618202505629],"noiseSecondary":[0.9969856946038108,0.1968351639944469,0.8718906320325864],"rim":[2.080627440619665,0.014068191236849548,2.0605295138295627,0.9137841654073857],"fogVarying":0.10659965316256048,"fogMultiplier":0.7627193924518619,"ambientMain":[0.4087841271653224,0.27385478266064056,0.5514910668445716],"ambientFill":[0.704171871724461,0.5276827357142917,0.8490046751565555],"materialAlpha":0},"expected":{"pre":[0.17053739035602108,0.09572844833670088,0.03959517511219205],"color":[0.3229704170202777,0.2030461753211035,0.10406223513755641],"baseReflection":{"direction":[-0.130934163526167,-0.5794996474119601,0.8043857305243034],"lod":4.247545058020499},"noiseReflection":{"direction":[-0.7818590705579125,-0.022583009406033305,0.6230460668943225],"lod":0.07943115458328975},"alpha":1}};
function close(a,b){
 if(Array.isArray(b)){assert.equal(a.length,b.length);b.forEach((x,i)=>close(a[i],x));}
 else if(typeof b==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());for(const k of Object.keys(b))close(a[k],b[k]);}
 else assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
}
test('Sparkle original full rim-only pixel lighting and two cube coordinates',()=>{
 const u=fixture.input;close(sparkleLighting(u),fixture.expected);
 const a=sparkleLighting({...u,materialAlpha:1});close(a.alpha,u.alpha);close(a.color,fixture.expected.color);
 close(sparkleLighting({...u,secondary:[0,0,0],noiseSecondary:[0,0,0]}),fixture.expected);
 const b={...u,reflectionBlendWeight:1};
 close(sparkleLighting(b),sparkleLighting({...b,primary:[0,0,0],noisePrimary:[0,0,0]}));
 assert.notDeepEqual(sparkleLighting({...u,rim:[...u.rim.slice(0,2),0,u.rim[3]]}).color,fixture.expected.color);
 assert.throws(()=>sparkleLighting({...u,noiseRoughness:NaN}),/SPARKLE_LIGHTING_INPUT/);
 assert.throws(()=>sparkleLighting({...u,view:[0,0,0]}),/SPARKLE_LIGHTING_DIRECTION/);
});
