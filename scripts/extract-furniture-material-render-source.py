#!/usr/bin/env python3
"""Extract original furniture material rendering values and pattern locations.
No UI swatch substitution, completed renders, or edit eligibility inference.
"""
import argparse, hashlib, importlib.util, json, math, re, struct
from pathlib import Path
DEFS_SHA='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0'
CAT_SHA='555a82bf7e8a6f0b6c9fee7d179988f54015e7b354902f13937198115e9ff52a'
CAB='CAB-46b8f8fe122147493b3113f7c1c8cd0f'
PID=-7028284721756550088
PREFIX='{UnityEngine.AddressableAssets.Addressables.RuntimePath}\\StandaloneWindows64\\'
def sha(b):return hashlib.sha256(b).hexdigest()
def require(ok,msg):
    if not ok:raise ValueError(msg)
def material_rows(b):
    p=142568
    def get(fmt):
        nonlocal p
        size=struct.calcsize('<'+fmt);require(p+size<=len(b),'material bounds')
        v=struct.unpack_from('<'+fmt,b,p);p+=size;return v
    def string():
        nonlocal p
        n,=get('I');require(n<=512 and p+n<=len(b),'string bounds');v=b[p:p+n].decode();p=(p+n+3)&~3;return v
    def guid(v,optional=False):
        require((optional and not v) or re.fullmatch('[0-9a-f]{32}',v),'GUID');return v or None
    require(struct.unpack_from('<I',b,p-4)[0]==877,'material count')
    rows=[]
    for _ in range(877):
        start=p;g=guid(string());name=string();idx,=get('i');color=get('4f');mask,=get('I');tex=guid(string(),True)
        require(not string() and not string(),'pattern sub-object reference')
        v=get('17f');mirror,=get('I');store=guid(string())
        require(mask in (0,1) and mirror in (0,1) and all(math.isfinite(x) for x in color+v),'invalid material property')
        rows.append([idx,g,name,color,bool(mask),tex,v[:2],v[2:4],v[4:8],v[8],v[9:13],*v[13:17],bool(mirror),store,sha(b[start:p])])
    require(p==350720 and struct.unpack_from('<I',b,p)[0]==780,'store list boundary')
    require(len({r[0] for r in rows})==877 and len({r[1] for r in rows})==877,'duplicate material')
    return sorted(rows)
def pattern_locations(b,expected):
    require(sha(b)==CAT_SHA,'catalog SHA')
    def u(p):return struct.unpack_from('<I',b,p)[0]
    def unpack(fmt,p):
        require(0<=p<=len(b)-struct.calcsize(fmt),'catalog bounds');return struct.unpack_from(fmt,b,p)
    def array(p,stride):
        require(p>=4,'array pointer');n=u(p-4);require(n%stride==0 and p+n<=len(b),'array bounds');return range(p,p+n,stride)
    def string(p):
        require(p>=4,'string pointer');n=u(p-4);require(n<=2048 and p+n<=len(b),'string bounds');return b[p:p+n].decode()
    magic,version,keys=unpack('<3I',0);require(magic==0x0de38942 and version==1,'catalog version')
    resolved={}
    for p in array(keys,8):
        key,ls=unpack('<2I',p);kt,rem=unpack('<2I',key)
        if kt!=0x7f167c:continue
        ident,sep=unpack('<2I',rem)
        if sep or ident>>30 or ident<4 or u(ident-4)!=32:continue
        g=string(ident)
        if g not in expected:continue
        locs=[u(q) for q in array(ls,4)];require(len(locs)==1 and g not in resolved,'ambiguous pattern key');loc=locs[0]
        primary,internal,provider,dep,dh,extra,typ=unpack('<7I',loc)
        require(primary==internal==ident and provider==0x4006df70 and typ==0x40a9dd,'not native texture location')
        names=[]
        for q in array(dep,4):
            pk,ip,pr,de,dh,ex,ty=unpack('<7I',u(q));name=string(pk)
            require(pr==0x4006dedb and de==0xffffffff and ty==0x6e149 and re.fullmatch('[a-zA-Z0-9_. -]+',name) and string(ip)==PREFIX+name,'bundle binding')
            names.append(name)
        require(names and len(names)==len(set(names)),'invalid dependencies');resolved[g]=[loc,typ,names]
    require(set(resolved)==expected,'missing pattern location');names=sorted({n for _,_,ns in resolved.values() for n in ns});indices={n:i for i,n in enumerate(names)}
    return names,[[g,loc,typ,[indices[n] for n in ns]] for g,(loc,typ,ns) in sorted(resolved.items())]
def extract(payload,catalog):
    rows=material_rows(payload);names,patterns=pattern_locations(catalog,{r[5] for r in rows if r[5]})
    require(len(patterns)==278 and len(names)==193,'pattern coverage')
    return {'schema':'HKIA.FurnitureMaterialRenderSource.1','version':'3.0.1','definitionsSha256':DEFS_SHA,'catalogSha256':CAT_SHA,'payloadPathId':str(PID),'payloadSha256':sha(payload),'columns':['index','guid','sourceName','baseColor','useBaseMapMask','patternMapGuid','patternTiling','patternOffset','patternTint','patternRotation','patternRotationCenter','patternSmoothnessShift','patternMetallicShift','smoothnessShift','metallicShift','mirrored','storeGuid','recordSha256'],'rows':rows,'bundleNames':names,'patternColumns':['guid','locationOffset','typeOffset','orderedBundleIndices'],'patterns':patterns}
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('definitions',type=Path);p.add_argument('catalog',type=Path);p.add_argument('--out',required=True,type=Path);a=p.parse_args()
    raw=a.definitions.read_bytes();require(sha(raw)==DEFS_SHA,'definitions SHA')
    spec=importlib.util.spec_from_file_location('audit',Path(__file__).with_name('audit-native-dye-materials.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    _,nodes=m.auditor.extract_nodes(raw);cab=dict(nodes)[CAB];payloads=[b for cls,pid,b,e in m.serialized_objects(cab,classes=(114,)) if int(pid)==PID and e=='<'];require(len(payloads)==1,'payload identity')
    a.out.write_text(json.dumps(extract(payloads[0],a.catalog.read_bytes()),separators=(',',':'))+'\n',encoding='utf8')
if __name__=='__main__':main()
