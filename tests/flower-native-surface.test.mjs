import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/flower-native-surface.ts',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {evaluateFlowerSurface}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
// Captured by interpreting exact original CUSTOM_RIMLIGHT_ON DXBC token
// ranges 245..259, 758..797, 1000..1129 with Surface_Effect=0.
// Inputs are synthetic linear-space texture samples, not game screenshots.
const rows=[
[[.787,.067,.37,0],0,[.937,.673,.582,.138],[.731,.436,.337,0],[.152,.325,.932],[.161,.693,.295],[.343,.262,.146,-.412,.703],[.161,.693,.295,0,.448,.523,.706146]],
[[.715,.451,.718,.2],.25,[.338,.932,.372,.361],[.6,.204,.02,.1],[.992,.04,.238],[.329,.248,.226],[.329,-.452,.24,.234,.845],[.4816,.1752008,.186072,.2,0,.5768,.46934]],
[[.205,.446,.565,.7],1,[.639,.227,.298,.726],[.531,.591,.814,1],[.416,.902,.249],[.665,.677,.761],[.224,.289,-.269,.464,.322],[.2009985,.4551102,.396637,.7,.3389,.8575,.773956]],
[[.237,.91,.024,1],.75,[.306,.149,.178,.043],[.247,.023,.652,0],[.995,.75,.882],[.704,.509,.174],[-.042,.184,-.097,-.324,.248],[.92225,.68975,.705,0,.445,.009,.796144]],
[[.392,.505,.896,0],0,[.592,.805,.677,.008],[.658,.817,.8,.1],[.291,.743,.44],[.824,.686,.791],[-.378,.325,-.206,.26,.391],[.824,.686,.791,0,1,1,.873707]],
[[.461,.103,.763,.2],.25,[.78,.134,.047,.361],[.158,.155,.186,1],[.471,.791,.525],[.484,.126,.913],[.309,.071,-.428,.282,.447],[.3991676,.236993,.6811836,.2,.7516,.4448,.574009]],
[[.545,.023,.961,.7],1,[.828,.249,.694,.651],[.871,.609,.69,0],[.268,.922,.624],[.379,.078,.319],[-.301,.169,.331,.087,.025],[.268,.922,.624,0,.669,.505,.99235]],
[[.463,.937,.146,1],.75,[.355,.121,.214,.255],[.088,.84,.736,.1],[.876,.171,.945],[.75,.391,.823],[.319,-.342,-.019,-.324,.826],[.040744,.78708,.107456,1,0,0,.350764]],
[[.26,.291,.285,0],0,[.875,.137,.223,.014],[.841,.286,.453,1],[.232,.797,.031],[.63,.477,.427],[.014,-.454,.207,.147,.689],[.63,.477,.427,0,.654,.147,.464647]],
[[.3,.456,.02,.2],.25,[.716,.167,.093,.621],[.815,.561,.869,0],[.614,.88,.543],[.006,.831,.909],[-.401,.074,-.451,.137,.543],[.158,.84325,.8175,0,1,.378,.507499]],
[[.187,.858,.525,.7],1,[.102,.913,.285,.485],[.976,.376,.899,.1],[.264,.121,.282],[.409,.386,.964],[.252,-.127,.319,-.422,.209],[.2069584,.2621256,.4149825,.7,0,.5705,.850565]],
[[.993,.85,.41,1],.75,[.139,.904,.334,.304],[.283,.498,.305,1],[.694,.331,.138],[.563,.41,.488],[.308,-.406,-.167,-.155,.169],[.281019,.4233,.12505,1,0,.092,.887446]]
];
test('native flower no-effect surface matches original shader instruction evaluation',()=>{
 for(const [base,patternRed,combo,baseColor,patternColor1,patternColor2,shifts,expected] of rows){
  const [smoothnessShift,metallicShift,patternSmoothnessShift,patternMetallicShift,occlusionStrength]=shifts;
  const uniforms={baseColor,patternColor1,patternColor2,smoothnessShift,metallicShift,patternSmoothnessShift,patternMetallicShift,occlusionStrength,surfaceEffect:0};
  const s=evaluateFlowerSurface(base,patternRed,combo,uniforms),actual=[...s.albedo,s.weight,s.perceptualRoughness,s.metallic,s.occlusion];
  actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-6,JSON.stringify({actual,expected,i})));
  assert.throws(()=>evaluateFlowerSurface(base,patternRed,combo,{...uniforms,surfaceEffect:1}),/UNSUPPORTED/);
 }
});
test('six original external texture refs have exact source identities and complete mip sizes',()=>{
 const {rows}=JSON.parse(readFileSync(new URL('../data/flower-external-material-source-v3.0.1.json',import.meta.url)));
 assert.equal(rows.length,6);assert.equal(new Set(rows.map(r=>r.cab+':'+r.pathId)).size,6);
 assert.equal(rows.reduce((sum,r)=>sum+r.bytes,0),1117052);
 for(const row of rows){
  assert.match(row.cab,/^CAB-[a-f0-9]{32}$/);assert.match(row.pathId,/^-?\d+$/);
  for(const h of [row.bundleSha256,row.objectSha256,row.sha256])assert.match(h,/^[a-f0-9]{64}$/);
  let bytes=0;for(let i=0;i<row.mips;i++){
   const w=Math.max(1,row.width>>i),h=Math.max(1,row.height>>i);
   bytes+=row.format===4?w*h*4:Math.ceil(w/4)*Math.ceil(h/4)*(row.format===10?8:16);
  }
  assert.equal(bytes*(row.classId===89?6:1),row.bytes);
 }
});
