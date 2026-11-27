import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
test('base material and texture dependencies retain original renderer identities',()=>{
 const raw=read('data/furniture-base-material-source-v3.0.1.json'),d=JSON.parse(raw),scene=JSON.parse(read('data/furniture-mesh-source-sample-v3.0.1.json'));
 assert.equal(createHash('sha256').update(raw).digest('hex'),'35c8a96007ae206dc2849234b682ae0d097ae997692c65e3ece03b5641ef5875');
 assert.equal(d.version,scene.version);assert.equal(d.renderFidelity,'unverified');
 assert.equal(Object.keys(d.materials).length,11);assert.equal(Object.keys(d.textures).length,13);
 assert.deepEqual(d.rows.map(r=>r.itemId),scene.rows.map(r=>r.itemId));
 for(const row of scene.rows){
  assert.equal(d.bundles[row.cab][1],row.bundleSha256);
  assert.deepEqual(d.rows.find(r=>r.itemId===row.itemId).bindings,row.nodes.filter(n=>n.material).map(n=>{
   const [file,pid]=n.material.split(':');const cab=Number(file)===0?row.cab:row.externals[Number(file)-1].split('/').at(-1);
   return [n.rendererPathId,cab+':'+pid,n.slot];
  }));
 }
 const missing=new Set();
 for(const m of Object.values(d.materials)){
  if(!d.shaders[m.shader])missing.add(m.shader);
  for(const t of Object.values(m.textures)){if(t.texture)assert.ok(d.textures[t.texture]);assert.equal(t.scale.length,2);assert.equal(t.offset.length,2);}
 }
 assert.deepEqual([...missing].sort(),d.unresolved);assert.deepEqual(d.unresolved,['CAB-46b8f8fe122147493b3113f7c1c8cd0f:-6681258383375895387']);
 const rug=d.materials[d.rows[0].bindings[0][1]];
 assert.equal(d.textures[rug.textures._BaseMap.texture].name,'BlankPattern_Masked');
 assert.equal(d.textures[rug.textures._BumpMap.texture].name,'Decor_COLO26_Rug_N');assert.equal(d.textures[rug.textures._MetallicGlossMap.texture].name,'Decor_COLO26_Rug_X');
 assert.equal(d.textures[rug.textures._PatternMap.texture].name,'Decor_Pattern_HelloKitty_Var3_C');assert.deepEqual(rug.textures._PatternMap.scale,[10,10]);
 assert.equal(rug.textures._PatternNormalMap.texture,null);assert.equal(rug.textures._Surface_EffectMap.texture,null);
 let total=0;
 for(const t of Object.values(d.textures)){
  let offset=0;
  for(const [i,[w,h,start,len,sha]] of t.mips.entries()){
   assert.equal(w,Math.max(1,t.width>>i));assert.equal(h,Math.max(1,t.height>>i));
   assert.equal(start,offset);assert.equal(len,t.format===4?w*h*4:Math.ceil(w/4)*Math.ceil(h/4)*(t.format===10?8:16));
   assert.match(sha,/^[a-f0-9]{64}$/);offset+=len;
  }
  assert.equal(offset,t.bytes);total+=t.bytes;
 }
 assert.equal(total,3495540);
 const s=d.shaders[rug.shader];assert.equal(s.name,'Sunblink/Lynx/CustomLitFurniture');assert.equal(s.properties.length,42);assert.equal(s.segments.length,4);
 const programs=s.segments.flatMap(s=>s.programs);assert.equal(programs.filter(p=>p.stage==='vertex').length,22);assert.equal(programs.filter(p=>p.stage==='pixel').length,123);
 for(const seg of s.segments){for(const p of seg.programs){assert.ok(p.offset>=0&&p.offset+p.bytes<=seg.bytes);assert.match(p.sha256,/^[a-f0-9]{64}$/);}}
});

test('additional furniture shader sources are keyed by exact CAB, signed Path ID and original hash',()=>{
 const py=String.raw`
import importlib.util
spec=importlib.util.spec_from_file_location('base','scripts/extract-furniture-base-material-source.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
assert len(m.SHADER_SOURCES)==10
for key,source in m.SHADER_SOURCES.items():
    assert m.shader_source(key,source[0])==source
    try:
        m.shader_source(key,'0'*64)
        raise AssertionError('modified shader accepted')
    except ValueError:
        pass
    try:
        m.shader_source(key+':1',source[0])
        raise AssertionError('wrong object accepted')
    except ValueError:
        pass
assert sorted((v[2],v[3],v[4]) for v in m.SHADER_SOURCES.values())==[
    ('Shader Graphs/FluidStream',34,1),('Shader Graphs/HK_Unlit_SoftTextured',11,1),('Shader Graphs/Standard Vertex Color',6,1),('Sunblink/Lynx/CustomLit',47,42),
    ('Sunblink/Lynx/CustomLitFurniture',42,4),('Sunblink/Lynx/CustomLitRefractive',41,7),('Sunblink/Lynx/CustomLitSparkle',36,3),('Sunblink/Lynx/CustomLitTriplanar',22,3),('Sunblink/Lynx/Fluid',24,1),
    ('Sunblink/Lynx/Terrain/Custom Lit Terrain Simple',31,4)]
`;
 execFileSync(process.env.PYTHON_BIN||'python3',['-c',py],{cwd:fileURLToPath(new URL('../',import.meta.url))});
});

test('base extraction accepts only the pinned all-white ARGB32 BlankPattern',()=>{
 const py=String.raw`
import importlib.util
s=importlib.util.spec_from_file_location('base','scripts/extract-furniture-base-material-source.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
data=bytes([255])*20
m.validate_white_argb(2,2,2,1,data)
for args in [(2,2,2,1,bytes(20)),(2,2,2,0,data),(1,5,2,1,data),(2,2,1,1,data),(2,2,2,1,data[:-1]),(2,2,2,1,data[:-1]+b'\x00')]:
    try:m.validate_white_argb(*args)
    except ValueError as e:assert 'unsupported ARGB32 texture' in str(e)
    else:raise AssertionError('unverified ARGB accepted')
`;
 execFileSync(process.env.PYTHON_BIN||'python3',['-c',py],{cwd:fileURLToPath(new URL('../',import.meta.url))});
});
