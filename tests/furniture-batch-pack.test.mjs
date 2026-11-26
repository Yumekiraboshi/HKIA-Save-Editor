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
`;
 execFileSync(process.env.PYTHON_BIN||'python3',['-c',py],{cwd,stdio:'pipe'});
});
