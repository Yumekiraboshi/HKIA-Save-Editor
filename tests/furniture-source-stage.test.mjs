import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../scripts/stage-furniture-source-pack.py',import.meta.url));
test('stages only independently pinned, verified content-addressed assets without replacing a directory',()=>{
 const py=`
import importlib.util, tempfile, json, zipfile, struct
from pathlib import Path
s=importlib.util.spec_from_file_location('stage',r'${script.replaceAll("\\","/")}');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
a=m.assembler
with tempfile.TemporaryDirectory() as td:
 p=Path(td)
 gbytes=bytes(12)+struct.pack('<3H',0,1,2);gh=a.sha(gbytes)
 g={'schema':'HKIA.FurnitureStaticMeshSource.1','version':a.VERSION,'itemId':1,'geometrySha256':gh,'geometryBytes':len(gbytes),'nodes':[],'meshes':{'1':{'vertexCount':3,'indexCount':3,'stride':4,'vertexBytes':[0,12,a.sha(gbytes[:12])],'indexBytes':[12,6,a.sha(gbytes[12:])]}}}
 cbytes=[bytes(48),bytes([1])*48]
 cubes={str(i):{'width':1,'height':1,'format':10,'imageCount':6,'faceOrder':'unverified','mipCount':1,'faceMipRanges':[[1,0,8]],'faceBytes':8,'sha256':a.sha(b),'bytes':48} for i,b in enumerate(cbytes)}
 def section(schema,rows):return {'schema':schema,'version':a.VERSION,'rows':rows}
 meta={'schema':'HKIA.FurnitureSourcePack.1','version':a.VERSION,'catalogSha256':a.CATALOG,'renderFidelity':'unverified','geometry':section('HKIA.FurnitureStaticMeshSamples.1',[g]),'base':{**section('HKIA.FurnitureBaseMaterialSource.1',[{'itemId':1,'bindings':[]}]),'bundles':{},'materials':{},'textures':{},'shaders':{},'unresolved':[]},'patterns':section('HKIA.FurniturePatternTextureSamples.1',[]),'additionalPatterns':section('HKIA.FurniturePatternTextureSources.1',[]),'cubemaps':cubes}
 def pack(name,extra=False,corrupt=False):
  zpath=p/name
  with zipfile.ZipFile(zpath,'w') as z:
   z.writestr('sources.json',json.dumps(meta))
   z.writestr('geometry/'+gh+'.bin',bytes(len(gbytes)) if corrupt else gbytes)
   for b in cbytes:z.writestr('cube/'+a.sha(b)+'.bin',b)
   if extra:z.writestr('../private-save.bin',b'not an asset')
  return zpath
 def reject(pack,out,pin,code):
  try:m.stage(pack,out,pin)
  except ValueError as e:assert code in str(e),(code,str(e))
  else:raise AssertionError(code)
 good=pack('good.zip');pin=a.sha(good.read_bytes());out=p/'http'
 result=m.stage(good,out,pin)
 assert result['models']==1 and result['payloads']==3
 assert result['manifestPin']=={'sha256':a.sha((out/'sources.json').read_bytes()),'bytes':(out/'sources.json').stat().st_size}
 assert (out/'geometry'/(gh+'.bin')).read_bytes()==gbytes
 assert result['renderFidelity']=='unverified'
 reject(good,out,pin,'OUTPUT_EXISTS')
 bad=p/'bad';reject(good,bad,'0'*64,'ZIP_HASH');assert not bad.exists()
 for q,code in [(pack('extra.zip',extra=True),'UNREFERENCED_PAYLOAD'),(pack('corrupt.zip',corrupt=True),'PAYLOAD_HASH')]:
  reject(q,bad,a.sha(q.read_bytes()),code);assert not bad.exists()
 assert not (p/'private-save.bin').exists()
`;
 execFileSync(process.env.PYTHON||'python3',['-c',py],{stdio:'pipe'});
});
