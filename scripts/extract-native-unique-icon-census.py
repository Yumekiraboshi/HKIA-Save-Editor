#!/usr/bin/env python3
"""Scan the pinned Switch definition flags, independent of saved-item eligibility."""
import argparse, collections, hashlib, json, struct
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

def module(name):
    s=spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=module_from_spec(s);s.loader.exec_module(m);return m

def require(ok,msg):
    if not ok:raise ValueError(msg)

D='660aba36ab6da5964180fe0d474696fc22dd806b2f5b19ce601222cb5a631afa'
ROWS='a2bf75de886bde1d8501439565d4a0335ccc126887483a8663346297a922f187'
ORDER=[('FlowerTreatedItemDetails',1,0),('OutfitItemDetails',1,0),('FlowerItemDetails',1,1),('CafeFoodItemDetails',1,1),('WandItemDetails',1,1),('CreationStationInstructionItemDetails',0,1),('CreationStationAnyItemCondition',0,1),('',1,1),('',1,0)]

def extract(data):
    require(hashlib.sha256(data).hexdigest()==D,'source fingerprint')
    audit=module('unityfs-audit');typed=module('extract-furniture-preview-camera')
    mesh=module('extract-furniture-mesh-source');helpers=module('extract-native-result-icons')
    objects,_=typed.load(dict(audit.extract_nodes(data)[1])['CAB-191652df9468c684714b3b89a22974ec'],mesh)
    ids=set();groups=collections.defaultdict(list);rows=[]
    for pid,(cl,t,b) in objects.items():
        if cl!=114 or not {'Id','UiIcon','SerializedGuid'}<=set(n[2] for n in t[-1]):continue
        f=helpers.fields(t,b,mesh);i=mesh.u(f['Id'])
        require(i>0 and i not in ids,'definition identity');ids.add(i)
        u,d=f['RequiresUniqueData'][0],f['UiIconUsesDynamicColor'][0]
        require(u in (0,1) and d in (0,1),'flag range')
        if not (u or d):continue
        ref=f['references'];cls=''
        if len(ref)>8:
            require(struct.unpack_from('<II',ref)==(2,1) and ref[8:16]==f['Details'],'managed reference')
            cls,p=mesh.string(ref,16)
            if cls:
                ns,p=mesh.string(ref,p);asm,p=mesh.string(ref,p)
                require(ns=='Sunblink.Game' and asm=='Assembly-CSharp','managed type')
        groups[(cls,u,d)].append(i);rows.append((i,u,d))
    require(len(ids)==12163 and len(rows)==143 and set(groups)==set(ORDER),'catalog closure')
    require([len(groups[k]) for k in ORDER]==[52,39,25,10,9,3,2,1,2],'class closure')
    require(hashlib.sha256(b''.join(struct.pack('<IBB',*r) for r in sorted(rows))).hexdigest()==ROWS,'flag rows fingerprint')
    return {'version':'3.0.1','definitionsSha256':D,'scannedDefinitionCount':12163,'rowsLittleEndianSha256':ROWS,'columns':['detailsClass','requiresUniqueData','uiIconUsesDynamicColor','itemIds'],'groups':[[*k,sorted(groups[k])] for k in ORDER]}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('definitions',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    a.out.write_text(json.dumps(extract(a.definitions.read_bytes()),separators=(',',':'))+'\n')
    print('HKIA_NATIVE_UNIQUE_ICON_CENSUS_OK 12163 definitions, 143 flagged rows')
