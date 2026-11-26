#!/usr/bin/env python3
"""Extract the exact original customizer podium hierarchy, not item runtime pose."""
import argparse,importlib.util,json,struct,hashlib
from pathlib import Path
SHA='0ac369f7549cf6ed5f410b9a4fb3e2a479b7725f34ffdfda571f3fa4a327ed1a'
CAB='CAB-a54fdb162f4a88b7820e64fc1729de29'
GUID='74cb0bc75b5307147bc46d39ff3e6d7a'
NAME='l_interactable_furniturecustomizer_removedprops'
def mod(name):
    s=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def require(ok,msg):
    if not ok:raise ValueError(msg)
def extract(raw):
    require(hashlib.sha256(raw).hexdigest()==SHA,'source bundle')
    m=mod('extract-furniture-mesh-source');c=mod('extract-furniture-preview-camera');audit=mod('audit-native-dye-materials')
    _,pairs=audit.auditor.extract_nodes(raw);o,_=c.load(dict(pairs)[CAB],m)
    def fields(pid,cls):
        t,r,b=o[pid];require(t==cls,'object type');return m.fields(r,b)
    def local(ref,cls):
        f,p=ref;require(f==0 and o[p][0]==cls,'local reference');return p
    containers=[b for t,_,b in o.values() if t==142];require(len(containers)==1,'container')
    b=containers[0];_,p=m.string(b);p+=4+m.u(b,p)*12;n=m.u(b,p);p+=4;matches=[]
    for _ in range(n):
        key,p=m.string(b,p);ref=m.ptr(b,p+8);p+=20
        if key==GUID:matches.append(local(ref,1))
    require(matches==['-4134900269296734799'],'mount GUID')
    root=matches[0];rows=[];seen=set()
    def components(go):
        return [p for f,p in m.array_ptr(fields(go,1)['m_Component']) if f==0]
    def walk(tid,parent):
        require(tid not in seen and len(seen)<32,'hierarchy')
        seen.add(tid);t=fields(tid,4);go=local(m.ptr(t['m_GameObject']),1)
        require(m.ptr(t['m_Father'])==[0,parent or '0'],'parent')
        row={'pathId':tid,'gameObjectPathId':go,'name':m.string(fields(go,1)['m_Name'])[0],'parent':parent,
             'position':list(struct.unpack('<3f',t['m_LocalPosition'])),'rotation':list(struct.unpack('<4f',t['m_LocalRotation'])),'scale':list(struct.unpack('<3f',t['m_LocalScale']))}
        rr=[p for p in components(go) if o[p][0]==23];mf=[p for p in components(go) if o[p][0]==33]
        require(len(rr)==len(mf)<=1,'mesh pairing')
        if rr:row.update(rendererPathId=rr[0],meshFilterPathId=mf[0])
        rows.append(row)
        for child in m.array_ptr(t['m_Children']):walk(local(child,4),tid)
    roots=[p for p in components(root) if o[p][0]==4];require(len(roots)==1,'root transform');walk(roots[0],None)
    require(len(rows)==3 and sum('rendererPathId' in x for x in rows)==1,'mount coverage')
    return {'schema':'HKIA.FurniturePreviewMount.1','version':'3.0.1','bundle':NAME,'bundleSha256':SHA,'cab':CAB,'guid':GUID,'rootGameObjectPathId':root,'nodes':rows}
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('bundle',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    a.out.write_text(json.dumps(extract(a.bundle.read_bytes()),separators=(',',':'))+'\n')
