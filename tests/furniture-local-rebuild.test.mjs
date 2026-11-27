import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
test('local rebuild resolves pinned source paths, orchestrates extraction and never publishes partial results',()=>{
 const py=String.raw`
import importlib.util,tempfile,json
from pathlib import Path
s=importlib.util.spec_from_file_location('rebuild','scripts/rebuild-furniture-source-pack.py')
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory() as td:
 p=Path(td);root=p/'game';root.mkdir()
 for name in ('catalog.bin','scenes_interior_furniturecustomizer_vis_d3967c85','networkedprototypes'):
  (root/name).write_bytes(name.encode())
 plan={'catalogSha256':m.source.sha(root/'catalog.bin'),'models':[{'itemId':1}],'patterns':[{'guid':'p'}],'counts':{'models':1,'patterns':1}}
 m.batch.make_plan=lambda:plan
 m.source.read=lambda _: {'sceneSha256':m.source.sha(root/'scenes_interior_furniturecustomizer_vis_d3967c85'),'presetBundleSha256':m.source.sha(root/'networkedprototypes')}
 assert m.discover(root)[1]==root/'catalog.bin'
 def reject(fn,code):
  try:fn()
  except ValueError as e:assert code in str(e),(code,str(e))
  else:raise AssertionError(code)
 reject(lambda:m.rebuild(root,root/'out'),'new output')
 reject(lambda:m.rebuild(root,p/'wrong',catalog=root/'networkedprototypes'),'wrong original catalog')
 assert not (p/'wrong').exists()
 calls=[]
 out=p/'out'
 def run(name,*args):
  calls.append(name)
  if name=='batch-furniture-native-source.py':
   assert '--limit' in args and args[-1]==2
   d=out/'batch';d.mkdir();(d/'report.json').write_text(json.dumps({'results':[{'kind':'geometry','status':'extracted'}]}))
  elif name=='batch-furniture-base-materials.py':(out/'materials').mkdir()
  elif name=='extract-furniture-light-region-source.py':(out/'lighting').mkdir()
  else:raise AssertionError(name)
 def pack(plan,src,materials,path,prior,prior_sha,lighting):
  assert materials==out/'materials' and lighting==out/'lighting'
  path.write_bytes(b'pack');return {'models':1}
 def stage(path,dest,pin):
  assert pin==m.source.sha(path);dest.mkdir();return {'manifestPin':{'bytes':1,'sha256':'a'*64}}
 m.packer.pack_batches=pack;m.stager.stage=stage
 result=m.rebuild(root,out,limit=2,run_stage=run)
 assert calls==['batch-furniture-native-source.py','batch-furniture-base-materials.py','extract-furniture-light-region-source.py']
 assert result['renderFidelity']=='unverified' and (out/'result.json').is_file()
 reject(lambda:m.rebuild(root,out),'new output')
 out2=p/'failed'
 def fail(*args):raise ValueError('failure')
 reject(lambda:m.rebuild(root,out2,run_stage=fail),'failure')
 assert out2.is_dir() and not (out2/'result.json').exists()
`;
 execFileSync(process.env.PYTHON_BIN||'python3',['-c',py],{cwd,stdio:'pipe'});
});
