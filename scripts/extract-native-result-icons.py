#!/usr/bin/env python3
"""Recover exact recipe and schematic result PPtrs from pinned Switch definitions."""
import argparse, collections, hashlib, importlib.util, json, struct
from pathlib import Path

DEFINITIONS='660aba36ab6da5964180fe0d474696fc22dd806b2f5b19ce601222cb5a631afa'
CAB='CAB-191652df9468c684714b3b89a22974ec'
ROWS_SHA='893db74189a6e33cdd710031d9649e7ff7854799b9d15a36a3e406f475c92bb8'
PAIRS_SHA='99bae02e336d0957bedffab3b05b4c66c96b8d66ef0f685f2be8089744809be0'
CLASSES=('SchematicDetails','RecipeItemDetails')
def sha(b):return hashlib.sha256(b).hexdigest()
def require(ok,msg):
    if not ok:raise ValueError(msg)
def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def has_align(node):
    return bool(node[4]&0x4000) or any(has_align(n) for n in node[-1])
def walk(node,b,p,mesh,depth=0):
    _,ty,name,size,flags,children=node
    require(depth<=64,'tree depth')
    if ty=='TypelessData':p+=4+mesh.u(b,p)
    elif ty=='Array':
        n=mesh.u(b,p);p+=4;d=children[1]
        require(n<=1000000,'array bound')
        if d[3]>=0 and not has_align(d):p+=n*d[3]
        else:
            for _ in range(n):p=walk(d,b,p,mesh,depth+1)
    elif size>=0 and not any(has_align(n) for n in children):p+=size
    elif children:
        for n in children:p=walk(n,b,p,mesh,depth+1)
    else:raise ValueError('unsupported node '+name)
    if flags&0x4000:p=mesh.align(p)
    require(p<=len(b),'field bound '+name)
    return p
def fields(tree,b,mesh):
    out={};p=0
    for node in tree[-1]:
        name=node[2]
        if name=='references':
            out[name]=b[p:];break
        q=walk(node,b,p,mesh);out[name]=b[p:q];p=q
    return out
def extract(raw,audit,typed,mesh):
    require(sha(raw)==DEFINITIONS,'original fingerprint')
    nodes=dict(audit.extract_nodes(raw)[1]);objects,_=typed.load(nodes[CAB],mesh)
    definitions={}
    for pid,(cls,t,b) in objects.items():
        if cls!=114 or not {'Id','UiIcon','SerializedGuid'}<=set(n[2] for n in t[-1]):continue
        name,p=mesh.string(b,28);item=mesh.u(b,p+36);f,sprite=mesh.ptr(b,p+80)
        require(name.startswith('item_') and f==0 and objects[sprite][0]==213,'definition identity')
        definitions[pid]=(item,sprite)
    require(len(definitions)==12163 and len({r[0] for r in definitions.values()})==12163,'definition closure')
    rows=[];counts=collections.Counter()
    for pid,(item,sprite) in definitions.items():
        _,t,b=objects[pid];classes=[c for c in CLASSES if c.encode() in b]
        if not classes:continue
        require(len(classes)==1,'ambiguous class')
        f=fields(t,b,mesh);ref=f['references']
        require(mesh.u(f['Id'])==item and mesh.ptr(f['UiIcon'])==[0,sprite],'definition fields')
        require(struct.unpack_from('<II',ref)==(2,1) and ref[8:16]==f['Details'],'managed reference identity')
        name,p=mesh.string(ref,16);ns,p=mesh.string(ref,p);asm,p=mesh.string(ref,p)
        require(name==classes[0] and ns=='Sunblink.Game' and asm=='Assembly-CSharp','managed class')
        if name=='SchematicDetails':
            require(len(ref)-p==12,'schematic payload')
            file,craft=mesh.ptr(ref,p);require(file==0 and objects[craft][0]==114,'craft reference')
            _,ct,cb=objects[craft];require('CraftableItem' in {n[2] for n in ct[-1]},'craftable schema')
            _,at=mesh.string(cb,28);_,at=mesh.string(cb,at);file,target=mesh.ptr(cb,at)
        else:
            n=mesh.u(ref,p+16);require(len(ref)-p==48+n*16,'recipe payload')
            file,target=mesh.ptr(ref,p+32+n*16)
        require(file==0 and target in definitions,'result definition')
        target_id,target_sprite=definitions[target];require(sprite!=target_sprite,'result icon difference')
        rows.append([item,target_id,pid,target,sprite,target_sprite,name]);counts[name]+=1
    rows.sort()
    require(counts=={'SchematicDetails':480,'RecipeItemDetails':282},'result class closure')
    require(sha((json.dumps(rows,separators=(',',':'))+'\n').encode())==ROWS_SHA,'source rows identity')
    pairs=[r[:2] for r in rows];require(sha(b''.join(struct.pack('<II',*r) for r in pairs))==PAIRS_SHA,'pair identity')
    return {'version':'3.0.1','switchDefinitionsSha256':DEFINITIONS,'sourceRowsSha256':ROWS_SHA,'pairBytesSha256':PAIRS_SHA,'count':762,'schematics':480,'recipes':282,'rows':pairs}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('definitions',type=Path);p.add_argument('--out',required=True,type=Path);a=p.parse_args()
    data=extract(a.definitions.read_bytes(),module('unityfs-audit'),module('extract-furniture-preview-camera'),module('extract-furniture-mesh-source'))
    a.out.write_text(json.dumps(data,separators=(',',':'))+'\n')
    print('HKIA_NATIVE_RESULT_ICON_OK 480 schematics, 282 recipes')
