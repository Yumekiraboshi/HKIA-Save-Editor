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
