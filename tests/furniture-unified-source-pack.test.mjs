import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../scripts/assemble-furniture-source-pack.py',import.meta.url));
test('offline assembler deduplicates exact bytes and refuses inconsistent, corrupt, extra or overwritten payloads',()=>{
 const py=`
import importlib.util, tempfile, json, zipfile
from pathlib import Path
s=importlib.util.spec_from_file_location('pack',r'${script.replaceAll("\\","/")}');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory() as td:
 p=Path(td);b=bytes([255,0,100,255]);h=m.sha(b);entry='texture/'+h+'.bin'
 t={'guid':'1'*32,'width':1,'height':1,'format':4,'bytes':4,'sha256':h,'mips':[[1,1,0,4,h]]}
 def pack(name,row,payload=b,extra=False):
  meta={'schema':'HKIA.LocalFurnitureSourceStage.1','version':m.VERSION,'catalogSha256':m.CATALOG,'renderFidelity':'unverified','models':[],'patterns':[row]}
  q=p/name
  with zipfile.ZipFile(q,'w') as z:
   z.writestr('local-source-manifest.json',json.dumps(meta));z.writestr(entry,payload)
   if extra:z.writestr('private-save.bin',b)
  return q
 a=pack('a.zip',t);c=pack('c.zip',{**t,'guid':'2'*32});out=p/'merged.zip'
 r=m.assemble([a,c],out);assert r['patterns']==2 and r['payloads']==1 and r['bytes']==4
 with zipfile.ZipFile(out) as z:
  assert z.read(entry)==b
  assert len(json.loads(z.read('sources.json'))['additionalPatterns']['rows'])==2
 r=m.assemble([out,a],p/'again.zip');assert r['payloads']==1 and r['patterns']==2
 def reject(inputs,out,code):
  try:m.assemble(inputs,out)
  except ValueError as e:assert code in str(e),(code,str(e))
  else:raise AssertionError(code)
 reject([a],out,'OUTPUT_EXISTS');assert out.exists()
 reject([a,pack('conflict.zip',{**t,'colorSpace':1})],p/'bad.zip','CONFLICT');assert not (p/'bad.zip').exists()
 reject([pack('hash.zip',t,b[::-1])],p/'bad.zip','PAYLOAD_HASH')
 reject([pack('extra.zip',t,extra=True)],p/'bad.zip','UNREFERENCED_PAYLOAD')
 reject([pack('mip.zip',{**t,'mips':[[1,1,1,4,h]]})],p/'bad.zip','PAYLOAD_RANGE')
 assert not (p/'bad.zip').exists()
`;
 execFileSync(process.env.PYTHON||'python3',['-c',py],{stdio:'pipe'});
});
