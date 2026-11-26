import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
test('CAB lookup opens only the catalog-authorized exact native source and rejects conflicting copies',()=>{
 const py=String.raw`
import importlib.util,tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('batch','scripts/batch-furniture-base-materials.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
cab='CAB-'+'a'*32
with tempfile.TemporaryDirectory() as d:
 root=Path(d)
 for sub in ('a','b','c'):(root/sub).mkdir()
 (root/'a'/'valid.bin').write_bytes(b'one')
 (root/'b'/'valid').write_bytes(b'one')
 (root/'c'/'other.bin').write_bytes(b'two')
 (root/'unrelated').write_bytes(b'no')
 called=[]
 def nodes(p):
  called.append(p.name)
  return [cab,cab+'.resS']
 idx=m.CabIndex(root,{'valid','other'},nodes)
 assert 'unrelated' not in called
 assert idx.resolve(cab,{'valid'})==root/'a'/'valid.bin'
 assert idx.resolve(cab,{'unrelated'}) is None
 assert idx.resolve('CAB-'+'b'*32,{'valid'}) is None
 try:idx.resolve(cab,{'valid','other'})
 except ValueError as e:assert 'ambiguous' in str(e)
 else:raise AssertionError('conflicting copies accepted')
`;
 execFileSync(process.env.PYTHON_BIN||'python3',['-c',py],{cwd,encoding:'utf8'});
});
