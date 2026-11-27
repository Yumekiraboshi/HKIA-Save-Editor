import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
test('batch plan covers all original customizable models and referenced pattern GUIDs',()=>{
 const plan=JSON.parse(execFileSync(process.env.PYTHON_BIN||'python3',['scripts/batch-furniture-native-source.py','--plan'],{cwd:repo,encoding:'utf8',maxBuffer:16*1024*1024}));
 assert.deepEqual(plan.counts,{models:649,ordinaryFurniture:621,homeCustomization:28,customizerOverrides:44,modelFirstBundles:523,patternFirstBundles:148,patterns:274,materials:861,slotChoices:26274});
 assert.equal(new Set(plan.models.map(r=>r.guid)).size,649);
 assert.ok(plan.models.some(r=>r.bundles.includes('ga_plugins_tayx_graphy - ultimate stats monitor_textures')));
 assert.equal(new Set(plan.patterns.map(r=>r.guid)).size,274);
 const original=read('data/furniture-visual-source-v3.0.1.json'),items=new Map(original.rows.map(r=>[r[0],r]));
 for(const row of plan.models){const r=items.get(row.itemId);assert.equal(row.guid,r[6]||r[4]);assert.equal(row.customizerOverride,!!r[6]);assert.ok(row.bundles.length);}
 for(const row of read('data/furniture-mesh-source-sample-v3.0.1.json').rows){
  const p=plan.models.find(x=>x.itemId===row.itemId);
  assert.equal(p.guid,row.visualGuid);assert.equal(p.bundles[0],row.bundle);
 }
 const chair=plan.models.find(r=>r.itemId===90163601);assert.deepEqual(chair.slots.map(s=>s.choices.length),[41,34]);
 const rug=plan.models.find(r=>r.itemId===32709745);assert.deepEqual(rug.slots[0].choices,[207,208,209,210,211,212]);
});

test('static mesh extraction resolves repeated MonoBehaviour types by original object index',()=>{
 const py=String.raw`
import struct, importlib.util
spec=importlib.util.spec_from_file_location('mesh','scripts/extract-furniture-mesh-source.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
b=bytearray(48);struct.pack_into('>I',b,8,22)
b.extend(b'2022.3\0'+struct.pack('<iBI',19,1,2))
for name in (b'first\0',b'second\0'):
    b.extend(struct.pack('<iBh',114,0,0)+bytes(32))
    b.extend(struct.pack('<II',1,len(name)))
    b.extend(struct.pack('<HBBIIiiiQ',1,0,0,0,0,4,0,0,0)+name+struct.pack('<I',0))
b.extend(struct.pack('<I',2));b.extend(bytes((-len(b))%4))
b.extend(struct.pack('<qqIi',101,0,4,0));b.extend(struct.pack('<qqIi',102,4,4,1));b.extend(struct.pack('<II',0,0))
try:
    m.type_trees(bytes(b))
    raise AssertionError('ambiguous legacy class schema accepted')
except ValueError as e:
    assert 'multiple class schemas' in str(e)
trees,ext,types=m.type_trees(bytes(b),indexed=True)
assert types=={'101':0,'102':1} and ext==[]
assert trees[types['101']][2]=='first' and trees[types['102']][2]=='second'
`;
 execFileSync(process.env.PYTHON_BIN||'python3',['-c',py],{cwd:repo});
});

test('original uint16 triangle submeshes preserve ordered ranges and reject gaps, bad topology and out-of-range vertices',()=>{
 const py=String.raw`
import struct,importlib.util
spec=importlib.util.spec_from_file_location('mesh','scripts/extract-furniture-mesh-source.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def row(first,count,top=0,base=0,fv=0,vc=3):
    return struct.pack('<6I6f',first,count,top,base,fv,vc,0,0,0,1,1,1)
indices=struct.pack('<6H',0,1,2,3,4,5)
def sm(a,b):return struct.pack('<I',2)+a+b
a=row(0,3);b=row(6,3,fv=3)
r=m.native_submeshes(sm(a,b),0,6,indices)
assert [(x['firstByte'],x['indexCount'],x['firstVertex'],x['vertexCount']) for x in r]==[(0,3,0,3),(6,3,3,3)]
for data,fmt,ib in [(sm(a,row(4,3,fv=3)),0,indices),(sm(a,row(6,3,top=1,fv=3)),0,indices),(sm(a,row(6,3,base=1,fv=3)),0,indices),(sm(a,b),1,indices),(sm(a,b),0,indices[:-2]),(sm(a,b),0,struct.pack('<6H',0,1,2,2,4,5))]:
    try:m.native_submeshes(data,fmt,6,ib);raise AssertionError('invalid submesh accepted')
    except ValueError:pass
`;
 execFileSync(process.env.PYTHON_BIN||'python3',['-c',py],{cwd:repo});
});

test('batch resolves exact missing GUIDs through remaining catalog owners, but never hides ambiguous or invalid owners',()=>{
 const py=String.raw`
import importlib.util
spec=importlib.util.spec_from_file_location('batch','scripts/batch-furniture-native-source.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def model(i):return {'itemId':i,'guid':str(i)}
jobs=[('geometry',model(1),['missing','a','b']),('geometry',model(2),['a','b']),('geometry',model(3),['a','b']),
      ('geometry',model(4),['missing']),('pattern',{'guid':'p'},['a','b']),('geometry',model(5),['a'])]
found={'a':['source-a'],'b':['source-b']}
calls=[]
def attempt(bundle,rows):
    calls.append((bundle,[(t,r['guid']) for t,r in rows]))
    replies=[]
    for t,r in rows:
        key=r.get('itemId',r['guid'])
        receipt={'kind':t,'key':key,'guid':r['guid'],'bundle':bundle}
        if bundle=='a' and key in (1,'p',5):
            replies.append(({**receipt,'status':'unresolved','reason':'missing exact GUID'},True))
        elif bundle=='a' and key==2:
            replies.append(({**receipt,'status':'unresolved','reason':'ambiguous native prefab key'},False))
        else:replies.append(({**receipt,'status':'extracted'},False))
    return replies
rows=m.candidate_rounds(jobs,found,attempt)
assert calls==[('a',[('geometry','1'),('geometry','2'),('geometry','3'),('pattern','p'),('geometry','5')]),('b',[('geometry','1'),('pattern','p')])]
assert len(rows)==6
by={r['key']:r for r in rows}
assert by[1]['bundle']=='b' and by[1]['status']=='extracted' and len(by[1]['attempts'])==2
assert by[2]['status']=='unresolved' and by[2]['bundle']=='a' and 'attempts' not in by[2]
assert by[3]['status']=='extracted' and by[3]['bundle']=='a'
assert by[4]['status']=='unresolved' and by[4]['bundle']=='missing'
assert by[5]['status']=='unresolved' and by[5]['bundle']=='a'
assert by['p']['bundle']=='b' and by['p']['status']=='extracted'
try:m.candidate_rounds(jobs,found,lambda b,r:[]);raise AssertionError('missing receipt accepted')
except ValueError:pass
`;
 execFileSync(process.env.PYTHON_BIN||'python3',['-c',py],{cwd:repo});
});

test('duplicate furniture visual slots require exact authored identities and matching empty component',()=>{
 const py=String.raw`
import struct,importlib.util
spec=importlib.util.spec_from_file_location('mesh','scripts/extract-furniture-mesh-source.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
pin='d9369ec54b220d739a32e161dee90c6f44e78f86341c60a04a1e561b308fcd1e'
assert set(m.SCHOOL_DUPLICATE_VISUAL_SLOTS)=={309658643,679070378,925764558}
root,first,fh,empty,eh=m.SCHOOL_DUPLICATE_VISUAL_SLOTS[309658643]
# Exercise the identity gate with a synthetic object witness; actual source
# hashes and serialized component arrays were checked separately on the game.
objects={first:b'first',empty:b'empty'}
m.SCHOOL_DUPLICATE_VISUAL_SLOTS[309658643]=(root,first,m.sha(objects[first]),empty,m.sha(objects[empty]))
common={'m_GameObject':struct.pack('<iq',0,int(root)),'m_Enabled':bytes([1,0,0,0]),'CustomizedPreviewId':bytes(4)}
fields={first:{**common,'VisualSlots':struct.pack('<I',1)+bytes(20)},empty:{**common,'VisualSlots':bytes(4)}}
obj=lambda p,c:objects[p]
f=lambda p,c:fields[p]
assert m.select_visual_slot_object(309658643,root,pin,[first,empty],obj,f)==(first,{'pathId':empty,'objectSha256':m.sha(objects[empty])})
assert m.select_visual_slot_object(99,root,pin,[first],obj,f)==(first,None)
def reject(id=309658643,r=root,h=pin,s=None):
    try:
        m.select_visual_slot_object(id,r,h,[first,empty] if s is None else s,obj,f)
        raise AssertionError('unverified duplicate accepted')
    except ValueError:pass
reject(id=99);reject(r='0');reject(h='0'*64);reject(s=[empty,first]);reject(s=[first,empty,first]);reject(s=[])
objects[empty]=b'changed';reject();objects[empty]=b'empty'
fields[empty]['VisualSlots']=struct.pack('<I',1)+bytes(20);reject();fields[empty]['VisualSlots']=bytes(4)
fields[empty]['CustomizedPreviewId']=struct.pack('<I',1);reject()
`;
 execFileSync(process.env.PYTHON_BIN||'python3',['-c',py],{cwd:repo});
});
