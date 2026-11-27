import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url));
test('parsed material bundle cache is bounded, exact-path keyed and invalidates changed sources',()=>{
 const py=String.raw`
import importlib.util, tempfile, os
from pathlib import Path
spec=importlib.util.spec_from_file_location('base','scripts/extract-furniture-base-material-source.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
    root=Path(d)
    a=root/'a';b=root/'b';c=root/'c';large=root/'large'
    for p in (a,b,c):p.write_bytes(b'1234')
    large.write_bytes(b'123456789')
    calls=[]
    def parse(p):
        calls.append(p.name);raw=p.read_bytes()
        return 'CAB-same',{'sha256':m.sha(raw),'bundle':p.name},len(raw)
    cache=m.MaterialBundleCache(8,2)
    first=cache.get(a,parse)
    assert cache.get(a,parse)==first and calls==['a']
    assert cache.get(b,parse)[1]['bundle']=='b'
    cache.get(a,parse);cache.get(c,parse)
    assert calls==['a','b','c'] and cache.bytes==8
    cache.get(b,parse);assert calls[-1]=='b' and len(cache.entries)==2
    a.write_bytes(b'new');fresh=cache.get(a,parse)
    assert fresh[1]['sha256']==m.sha(b'new') and fresh!=first
    cache.get(large,parse);cache.get(large,parse)
    assert calls[-2:]==['large','large'] and cache.bytes<=8
    def changed(p):
        p.write_bytes(b'mutated')
        return parse(p)
    try:
        m.MaterialBundleCache().get(c,changed)
        raise AssertionError('changing source accepted')
    except ValueError as e:assert 'changed during parse' in str(e)
    uncached=m.MaterialBundleCache(0,0)
    uncached.get(b,parse);uncached.get(b,parse)
    assert not uncached.entries and uncached.bytes==0 and calls[-2:]==['b','b']
`;
 execFileSync(process.env.PYTHON_BIN||'python3',['-c',py],{cwd:repo});
});
test('cached CAB entries still require the current model catalog resolver and exact scene hash',()=>{
 const py=String.raw`
import importlib.util, tempfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('base','scripts/extract-furniture-base-material-source.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
    path=Path(d)/'shared';path.write_bytes(b'original')
    cab='CAB-'+'a'*32
    calls=[]
    def parse(p,mesh,audit):
        calls.append(p);return cab,{'bundle':'shared','sha256':m.sha(p.read_bytes()),'externals':[]},8
    m.parse_material_bundle=parse
    row={'cab':cab,'bundleSha256':m.sha(b'original'),'itemId':1,'nodes':[]}
    cache=m.MaterialBundleCache()
    resolvers=[]
    def allowed(c):
        resolvers.append(c);return path
    first=m.extract([],{'rows':[row]},None,None,None,resolve_cab=allowed,bundle_cache=cache)
    second=m.extract([],{'rows':[row]},None,None,None,resolve_cab=allowed,bundle_cache=cache)
    assert first==second and calls==[path] and resolvers==[cab,cab]
    for scene,resolver,error in [({'rows':[row]},lambda c:None,'scene bundle hash'),
        ({'rows':[{**row,'bundleSha256':'bad'}]},allowed,'scene bundle hash'),
        ({'rows':[{**row,'cab':'CAB-'+'b'*32}]},allowed,'resolved CAB mismatch')]:
        try:m.extract([],scene,None,None,None,resolve_cab=resolver,bundle_cache=cache);raise AssertionError('invalid identity accepted')
        except ValueError as e:assert error in str(e)
`;
 execFileSync(process.env.PYTHON_BIN||'python3',['-c',py],{cwd:repo});
});
