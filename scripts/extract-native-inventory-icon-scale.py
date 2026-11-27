#!/usr/bin/env python3
"""Read icon scale providers and BaseBindings from pinned Switch 3.0.1 originals."""
import argparse, collections, hashlib, json, struct
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

def module(name):
    spec=spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=module_from_spec(spec);spec.loader.exec_module(m);return m

def sha(b):return hashlib.sha256(b).hexdigest()
def require(ok,msg):
    if not ok:raise ValueError(msg)

DEFS='660aba36ab6da5964180fe0d474696fc22dd806b2f5b19ce601222cb5a631afa'
RES='366df4673a2dd4a5a6a425d18a0435bf52cdb0936934875d5a4aa145afb4a776'
BIND='b00099242b328d18c69314a65491ee7a0c27b74f954d9692212437ab57b6bdfe'
ROWS='6a2df4f79198eb5730422a4379130f8cf98b95378d06a7c45aac0931e295e8c2'
CLASSES={'InventoryItemIconScaleDetails':4,'FishItemDetails':16}

def extract(defs,res):
    require(sha(defs)==DEFS and sha(res)==RES,'source hashes')
    audit=module('unityfs-audit');typed=module('extract-furniture-preview-camera')
    mesh=module('extract-furniture-mesh-source');helpers=module('extract-native-result-icons')
    objects,_=typed.load(dict(audit.extract_nodes(defs)[1])['CAB-191652df9468c684714b3b89a22974ec'],mesh)
    rows=[];counts=collections.Counter();total=0
    for pid,(cl,t,b) in objects.items():
        if cl!=114 or not {'Id','UiIcon','SerializedGuid'}<=set(n[2] for n in t[-1]):continue
        total+=1
        if not any(c.encode() in b for c in CLASSES):continue
        f=helpers.fields(t,b,mesh);ref=f['references']
        require(struct.unpack_from('<II',ref)==(2,1) and ref[8:16]==f['Details'],'managed reference')
        cls,p=mesh.string(ref,16);ns,p=mesh.string(ref,p);asm,p=mesh.string(ref,p)
        require(cls in CLASSES and ns=='Sunblink.Game' and asm=='Assembly-CSharp' and len(ref)-p==CLASSES[cls],'provider type')
        size=mesh.u(ref,p);item=mesh.u(f['Id']);require(size in (0,1,2) and item>0,'provider fields')
        rows.append((item,size));counts[cls,size]+=1
    rows.sort()
    require(total==12163 and len(rows)==262 and len({r[0] for r in rows})==262,'definition closure')
    require([counts['InventoryItemIconScaleDetails',i] for i in range(3)]==[32,22,22] and [counts['FishItemDetails',i] for i in range(3)]==[62,62,62],'type counts')
    require(sha(b''.join(struct.pack('<II',*r) for r in rows))==ROWS,'provider rows')
    # Pinned v22 SerializedFile, type trees disabled. Locate exact object via object table.
    require(struct.unpack_from('>I',res,8)[0]==22,'serialized version')
    p=res.index(b'\x00',48)+5;require(res[p]==0,'type tree flag');p+=1
    n=mesh.u(res,p);p+=4;require(n==219,'serialized types')
    types=[]
    for _ in range(n):
        cl,_,script=struct.unpack_from('<iBh',res,p);p+=7+16+(16 if cl==114 or cl<0 else 0)
        types.append((cl,script))
    n=mesh.u(res,p);p=mesh.align(p+4);require(n==4337,'object count')
    data=struct.unpack_from('>Q',res,32)[0];binding=None
    for _ in range(n):
        pid,start,length,ti=struct.unpack_from('<qqIi',res,p);p+=24
        if pid==2655:
            require(types[ti]==(114,29) and start>=0 and data+start+length<=len(res),'binding object')
            binding=res[data+start:data+start+length]
    require(binding is not None and sha(binding)==BIND,'binding fingerprint')
    name,p=mesh.string(binding,28);require(name=='BaseBindings','binding name')
    n=mesh.u(binding,p);p+=4;require(n==109,'binding row count');values={}
    for _ in range(n):
        row,p=mesh.string(binding,p)
        if row.startswith('iconsize.'):
            key,value=row.split(':',1);require(key not in values,'duplicate binding');values[key]=value
    version,p=mesh.string(binding,p);require(p==len(binding),'binding tail')
    keys=['iconsize.large','iconsize.medium','iconsize.small']
    require(set(values)==set(keys),'binding keys')
    encoded=[key+':'+values[key] for key in keys]
    scales=[float(values[key]) for key in keys];require(scales==[1,.8,.6],'binding values')
    groups=[[item for item,size in rows if size==i] for i in range(3)]
    return {'schema':'HKIA.InventoryIconScale.1','version':'3.0.1','definitionsSha256':DEFS,'resourcesSha256':RES,
        'baseBindings':{'pathId':'2655','objectSha256':BIND,'gameDataVersion':version,'encodedRows':encoded},
        'enumCounts':[len(g) for g in groups],'rowsSha256':ROWS,'scales':scales,'groups':groups}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('definitions',type=Path);p.add_argument('resources',type=Path);p.add_argument('--out',required=True,type=Path);a=p.parse_args()
    a.out.write_text(json.dumps(extract(a.definitions.read_bytes(),a.resources.read_bytes()),ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf8')
    print('HKIA_NATIVE_INVENTORY_ICON_SCALE_OK 262 providers')
