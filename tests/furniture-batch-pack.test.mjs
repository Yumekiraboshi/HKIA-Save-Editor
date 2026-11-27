import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
test('batch resume and pack use exact original identities and refuse incomplete or corrupt inputs',()=>{
 const py=String.raw`
import importlib.util,tempfile,json,zipfile
from pathlib import Path
s=importlib.util.spec_from_file_location('pack','scripts/pack-furniture-batches.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
a=m.assembler
def dump(p,v):p.write_text(json.dumps(v))
with tempfile.TemporaryDirectory() as td:
 p=Path(td);src=p/'batch';src.mkdir();(src/'pattern').mkdir()
 g1='1'*32;g2='2'*32;g3='3'*32
 plan={'version':a.VERSION,'catalogSha256':a.CATALOG,'models':[{'itemId':1,'guid':g3,'bundles':['model']}],'patterns':[{'guid':g,'bundles':['original']} for g in (g1,g2)]}
 def receipt(g,data):
  h=a.sha(data)
  t={'guid':g,'bundle':'original','bundleSha256':'a'*64,'width':1,'height':1,'format':4,'bytes':4,'sha256':h,'mips':[[1,1,0,4,h]]}
  dump(src/'pattern'/(g+'.json'),t);(src/'pattern'/(g+'.texture.bin')).write_bytes(data)
  return {'kind':'pattern','key':g,'guid':g,'bundle':'original','bundleSha256':'a'*64,'status':'extracted','bytes':4,'sha256':h}
 def report(rows):
  dump(src/'report.json',{'schema':'HKIA.FurnitureBatchExtraction.1','version':a.VERSION,'catalogSha256':a.CATALOG,'renderFidelity':'unverified','results':rows})
 def reject(fn,code):
  try:fn()
  except ValueError as e:assert code in str(e),(code,str(e))
  else:raise AssertionError(code)
 r1=receipt(g1,bytes([1,2,3,4]));r2=receipt(g2,bytes([1,2,3,4]))
 report([r1,{'kind':'geometry','key':1,'status':'unresolved'}])
 first=p/'first.zip';v=m.pack_batches(plan,src,None,first)
 assert v['addedPatterns']==1 and v['addedModels']==0 and len(v['omitted'])==1
 pin=a.sha(first.read_bytes())
 remaining=m.batch.remaining_plan(plan,first,pin)
 assert [x['guid'] for x in remaining['patterns']]==[g2] and len(remaining['models'])==1
 reject(lambda:m.batch.remaining_plan(plan,first,'0'*64),'prior pack hash mismatch')
 altered={**plan,'patterns':[{'guid':g1,'bundles':['other']},plan['patterns'][1]]}
 reject(lambda:m.batch.remaining_plan(altered,first,pin),'prior pattern source')
 report([r2]);second=p/'second.zip'
 v=m.pack_batches(plan,src,None,second,first,pin)
 assert v['patterns']==2 and v['payloads']==1 and v['addedPatterns']==1
 reject(lambda:m.pack_batches(plan,src,None,second,first,pin),'OUTPUT_EXISTS')
 report([r1]);reject(lambda:m.pack_batches(plan,src,None,p/'bad.zip',first,pin),'RECEIPT_IDENTITY')
 report([r2]);(src/'pattern'/(g2+'.texture.bin')).write_bytes(bytes(4))
 reject(lambda:m.pack_batches(plan,src,None,p/'bad.zip',first,pin),'BATCH_PAYLOAD_HASH')
 assert not (p/'bad.zip').exists()
 report([{'kind':'geometry','key':1,'status':'extracted'}])
 reject(lambda:m.pack_batches(plan,src,None,p/'bad.zip'),'NO_NEW_COMPLETE_SOURCE')
 # Geometry is admitted only after the exact material receipt and bytes close.
 import struct
 (src/'mesh').mkdir();mat=p/'materials';mat.mkdir();(mat/'items').mkdir();(mat/'texture').mkdir()
 cab='CAB-'+'a'*32;key=cab+':8';sh=cab+':9';data=bytes(12)+struct.pack('<3H',0,1,2);h=a.sha(data)
 g={'schema':'HKIA.FurnitureStaticMeshSource.1','version':a.VERSION,'itemId':1,'visualGuid':g3,'bundle':'model','bundleSha256':'b'*64,'cab':cab,'externals':[],'geometrySha256':h,'geometryBytes':len(data),'nodes':[{'rendererPathId':'7','meshPathId':'6','material':'0:8','slot':None}],'materials':{'0:8':{'objectSha256':'c'*64}},'meshes':{'6':{'vertexCount':3,'indexCount':3,'stride':4,'vertexBytes':[0,12,a.sha(data[:12])],'indexBytes':[12,6,a.sha(data[12:])]}}}
 base={'schema':'HKIA.FurnitureBaseMaterialSource.1','version':a.VERSION,'rows':[{'itemId':1,'bindings':[['7',key,None]]}],'bundles':{cab:['model','b'*64]},'materials':{key:{'objectSha256':'c'*64,'shader':sh,'textures':{}}},'textures':{},'shaders':{sh:{}},'unresolved':[]}
 dump(src/'mesh'/'1.json',g);(src/'mesh'/'1.geometry.bin').write_bytes(data)
 dump(mat/'items'/'1.json',base)
 dump(mat/'report.json',{'schema':'HKIA.FurnitureBatchMaterials.1','version':a.VERSION,'catalogSha256':a.CATALOG,'renderFidelity':'unverified','items':[{'itemId':1,'status':'extracted'}]})
 report([{'kind':'geometry','key':1,'guid':g3,'bundle':'model','bundleSha256':'b'*64,'status':'extracted','bytes':len(data),'sha256':h}])
 third=p/'third.zip';v=m.pack_batches(plan,src,mat,third,second,a.sha(second.read_bytes()))
 assert v['models']==1 and v['patterns']==2 and v['payloads']==2
 assert not m.batch.remaining_plan(plan,third,a.sha(third.read_bytes()))['models']
 base['rows'][0]['bindings'][0][1]=cab+':999';dump(mat/'items'/'1.json',base)
 reject(lambda:m.pack_batches(plan,src,mat,p/'bad.zip'),'MATERIAL_BINDING')
 assert not (p/'bad.zip').exists()

`;
 execFileSync(process.env.PYTHON_BIN||'python3',['-c',py],{cwd,stdio:'pipe'});
});

test('standalone batch pack carries both independently pinned original cubemap payloads',()=>{
 const py=String.raw`
import importlib.util,tempfile,json,zipfile
from pathlib import Path
s=importlib.util.spec_from_file_location('pack','scripts/pack-furniture-batches.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
a=m.assembler
def dump(p,v):p.write_text(json.dumps(v))
with tempfile.TemporaryDirectory() as td:
 p=Path(td);src=p/'batch';src.mkdir();(src/'pattern').mkdir();light=p/'light';light.mkdir()
 g='1'*32;data=bytes([1,2,3,4]);h=a.sha(data)
 plan={'version':a.VERSION,'catalogSha256':a.CATALOG,'models':[],'patterns':[{'guid':g,'bundles':['original']}]}
 t={'guid':g,'bundle':'original','bundleSha256':'a'*64,'width':1,'height':1,'format':4,'bytes':4,'sha256':h,'mips':[[1,1,0,4,h]]}
 dump(src/'pattern'/(g+'.json'),t);(src/'pattern'/(g+'.texture.bin')).write_bytes(data)
 dump(src/'report.json',{'schema':'HKIA.FurnitureBatchExtraction.1','version':a.VERSION,'catalogSha256':a.CATALOG,'renderFidelity':'unverified','results':[{'kind':'pattern','key':g,'guid':g,'bundle':'original','bundleSha256':'a'*64,'status':'extracted','bytes':4,'sha256':h}]})
 cubes={}
 for id,n in [('1',1),('2',2)]:
  raw=bytes([n])*48;dig=a.sha(raw)
  cubes[id]={'width':1,'height':1,'format':10,'imageCount':6,'faceOrder':'unverified','mipCount':1,'faceMipRanges':[[1,0,8]],'faceBytes':8,'bytes':48,'sha256':dig}
  (light/(dig+'.cubemap.bin')).write_bytes(raw)
 manifest={'schema':'HKIA.FurnitureLightRegionSource.1','version':a.VERSION,'cubemaps':cubes}
 # Synthetic independent expected manifest only for this test, not production.
 m.batch.read=lambda _:manifest
 mf=light/'furniture-light-region-source-v3.0.1.json';dump(mf,manifest)
 out=p/'out.zip';v=m.pack_batches(plan,src,None,out,lighting_stage=light)
 assert v['payloads']==3 and v['patterns']==1
 with zipfile.ZipFile(out) as z:
  assert json.loads(z.read('sources.json'))['cubemaps']==cubes
  for cube in cubes.values():
   assert a.sha(z.read('cube/'+cube['sha256']+'.bin'))==cube['sha256']
 def reject(code):
  try:m.pack_batches(plan,src,None,p/'bad.zip',lighting_stage=light)
  except ValueError as e:assert code in str(e),(code,str(e))
  else:raise AssertionError(code)
  assert not (p/'bad.zip').exists()
 dump(mf,{**manifest,'version':'wrong'});reject('LIGHT_SOURCE');dump(mf,manifest)
 (light/(cubes['1']['sha256']+'.cubemap.bin')).write_bytes(bytes(48));reject('BATCH_PAYLOAD_HASH')
`;
 execFileSync(process.env.PYTHON_BIN||'python3',['-c',py],{cwd,stdio:'pipe'});
});
