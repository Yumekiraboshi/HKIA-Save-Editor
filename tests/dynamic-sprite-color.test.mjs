import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:"export * from './dynamic-sprite-color'; export * from './flower-appearance';",resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});
const {dynamicSpritePixel,adjustMaskOuterUV,composeDynamicSpriteSamples,resolveFlowerAppearance}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const json=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const evidence=json('../data/unityfs-audit/dynamic-sprite-color.v3.0.1.json');
const index=json('../public/inventory-flower-art/index.json');
const defs=json('../public/inventory-ui/flowers.json');
const tints=[[1,0,0,0],[0,1,0,0],[0,0,1,0]];
test('native shader uses sequential RGB lerps; alpha is independent of mask and tint alpha',()=>{
 const base=[.5,.25,.75,.8];
 assert.deepEqual(dynamicSpritePixel(base,[0,0,0,1],tints),base);
 assert.deepEqual(dynamicSpritePixel(base,[1,0,0,0],tints),[.5,0,0,.8]);
 assert.deepEqual(dynamicSpritePixel(base,[1,1,0,0],tints),[0,.25,0,.8]);
 assert.deepEqual(dynamicSpritePixel(base,[1,1,1,0],tints),[0,0,.75,.8]);
 assert.deepEqual(dynamicSpritePixel(base,[.5,.5,.5,0],tints),[.125,.09375,.46875,.8]);
 assert.deepEqual(dynamicSpritePixel([1,1,1,.5],[0,0,0,0],tints,[.5,1,.25,.5]),[.5,1,.25,.25]);
});
test('native mask UV maps outer source bounds relative to source inner bounds',()=>{
 assert.deepEqual(adjustMaskOuterUV([.25,.25,.75,.75],[0,0,1,1],[.25,.25,.75,.75]),[0,0,1,1]);
 assert.deepEqual(adjustMaskOuterUV([0,0,1,1],[0,0,1,1],[.2,.3,.6,.7]),[.2,.3,.6,.7]);
 assert.equal(adjustMaskOuterUV([0,0,0,1],[0,0,1,1],[0,0,1,1]),null);
});
test('runtime sample composition is deterministic and does not change input alpha',()=>{
 const base=new Float32Array([1,1,1,.5,.5,.25,.75,0]),mask=new Float32Array([1,0,0,1,0,0,1,1]);
 const out=composeDynamicSpriteSamples(base,mask,tints);
 assert.deepEqual([...out],[1,0,0,.5,0,0,.75,0]);
 assert.deepEqual(out,composeDynamicSpriteSamples(base,mask,tints));
 assert.equal(base[0],1);assert.throws(()=>composeDynamicSpriteSamples(base,new Float32Array(4),tints),/DYNAMIC_ART_INPUT/);
});
test('all 25 base flower tiles have recorded native geometry; all explicit pattern bindings resolve',()=>{
 assert.equal(evidence.flowerBase.records.length,25);
 assert.equal(evidence.flowerBase.alphaExactCount,25);
 for(const item of index.items){
  const rec=evidence.flowerBase.records.find(r=>r.itemId===item.itemId);
  assert.ok(rec);
  const [l,t,r,b]=rec.sourceRectTopLeft;assert.ok(l>=0&&t>=0&&r<=256&&b<=256&&l<r&&t<b);
  for(const pat of item.patterns){
   const f={growState:6,baseColor:1,pattern:pat.patternIndex,patternColor:2};
   const result=resolveFlowerAppearance(item.itemId,f,defs,index);
   assert.ok(result);assert.equal(result.maskGuid,pat.maskGuid);
   assert.deepEqual(result.tints,[defs.colors['1'].rgba,defs.colors[pat.patternIndex===0?'1':'2'].rgba,defs.colors['1'].rgba]);
   assert.equal(resolveFlowerAppearance(item.itemId,{...f,growState:0},defs,index),null);
   assert.equal(resolveFlowerAppearance(item.itemId,{...f,pattern:9999},defs,index),null);
  }
 }
});

test('native UI falls back to each species null-pattern mask for known patterns, including all eight effects',()=>{
 const effects=Object.entries(defs.patterns).filter(([,d])=>d.effect).map(([k])=>Number(k));
 assert.deepEqual(effects,[3,4,5,6,7,8,9,15]);
 let explicit=0,fallback=0;
 for(const item of index.items){
  const defaultMask=item.patterns.find(p=>p.patternIndex===0);
  assert.ok(defaultMask);
  for(const pattern of [0,...Object.keys(defs.patterns).map(Number)]){
   const exact=item.patterns.find(p=>p.patternIndex===pattern);
   const result=resolveFlowerAppearance(item.itemId,{growState:6,baseColor:1,pattern,patternColor:0},defs,index);
   assert.ok(result);
   assert.equal(result.maskGuid,(exact??defaultMask).maskGuid);
   assert.deepEqual(result.tints,[defs.colors['1'].rgba,pattern===0?defs.colors['1'].rgba:[1,1,1,1],defs.colors['1'].rgba]);
   if(exact)explicit++;else fallback++;
   if(effects.includes(pattern))assert.equal(exact,undefined);
  }
  assert.equal(resolveFlowerAppearance(item.itemId,{growState:6,baseColor:1,pattern:9999,patternColor:0},defs,index),null);
  assert.equal(resolveFlowerAppearance(item.itemId,{growState:6,baseColor:9999,pattern:3,patternColor:0},defs,index),null);
  assert.equal(resolveFlowerAppearance(item.itemId,{growState:6,baseColor:1,pattern:3,patternColor:9999},defs,index),null);
  // Missing or broken null-pattern references still fail closed.
  const broken={...index,items:[{...item,patterns:item.patterns.filter(p=>p.patternIndex!==0)}]};
  assert.equal(resolveFlowerAppearance(item.itemId,{growState:6,baseColor:1,pattern:3,patternColor:0},defs,broken),null);
 }
 assert.equal(explicit,161);assert.equal(fallback,264);
});

test('all source-known flower tint inputs resolve every base/accent/pattern combination',()=>{
 const colors=Object.keys(defs.colors).map(Number),patterns=[0,...Object.keys(defs.patterns).map(Number)];
 assert.equal(colors.length,30);assert.equal(patterns.length,17);
 let combinations=0;const missing=[],wrong=[];
 for(const item of index.items){
  const defaults=item.patterns.find(p=>p.patternIndex===0);
  for(const pattern of patterns){
   const binding=item.patterns.find(p=>p.patternIndex===pattern)??defaults;
   for(const color of colors)for(const accent of [0,...colors]){
    const result=resolveFlowerAppearance(item.itemId,{growState:6,baseColor:color,pattern,patternColor:accent},defs,index);
    combinations++;
    if(!result){missing.push([item.itemId,color,pattern,accent]);continue;}
    const primary=defs.colors[color].rgba,secondary=pattern===0?primary:accent===0?[1,1,1,1]:defs.colors[accent].rgba;
    if(result.maskGuid!==binding.maskGuid||result.baseSpritePathId!==item.baseSpritePathId||
     result.tints.some((t,i)=>t.some((v,j)=>v!==[primary,secondary,primary][i][j])))
     wrong.push([item.itemId,color,pattern,accent]);
   }
  }
 }
 assert.equal(combinations,395250);
 assert.deepEqual(missing,[]);assert.deepEqual(wrong,[]);
 // This is the display input domain, not a claim that all combinations can
 // occur in the game, or that the full cartesian product was rasterized.
});
