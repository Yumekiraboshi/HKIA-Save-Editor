#!/usr/bin/env python3
"""Read source-pinned Addressables binary catalog key/location/dependency records.
No name-based model selection or source-bundle publication.
"""
import argparse, hashlib, json, re, struct
from pathlib import Path
SHA='555a82bf7e8a6f0b6c9fee7d179988f54015e7b354902f13937198115e9ff52a'
PREFIX='{UnityEngine.AddressableAssets.Addressables.RuntimePath}\\StandaloneWindows64\\'

def extract(b,visual):
    if hashlib.sha256(b).hexdigest()!=SHA: raise ValueError('unexpected original catalog')
    def unpack(fmt,p):
        if p<0 or p+struct.calcsize(fmt)>len(b): raise ValueError('catalog bounds')
        return struct.unpack_from(fmt,b,p)
    def u(p): return unpack('<I',p)[0]
    def array(p,stride):
        n=u(p-4)
        if n%stride or n>len(b)-p: raise ValueError('invalid array')
        return range(p,p+n,stride)
    def string(p):
        n=u(p-4)
        if n>2048 or p+n>len(b): raise ValueError('string bounds')
        return b[p:p+n].decode('utf8')
    magic,version,keys,*_=unpack('<8I',0)
    if magic!=0x0de38942 or version!=1: raise ValueError('unsupported catalog')
    expected={r[4] for r in visual['rows']}|{r[5] for r in visual['rows'] if r[2]==1}|{r[6] for r in visual['rows'] if r[6] is not None}
    resolved={}
    for p in array(keys,8):
        key,location_set=unpack('<2I',p)
        key_type,remap=unpack('<2I',key)
        if key_type!=0x7f167c: continue
        ident,sep=unpack('<2I',remap)
        if sep or ident>>30 or ident<4 or u(ident-4)!=32: continue
        guid=string(ident)
        if guid not in expected: continue
        if guid in resolved: raise ValueError('duplicate key')
        locations=[u(q) for q in array(location_set,4)]
        if len(locations)!=1: raise ValueError('ambiguous location')
        loc=locations[0]
        primary,internal,provider,dep,dep_hash,extra,typ=unpack('<7I',loc)
        if primary!=ident or internal!=ident or provider!=0x4006df70 or typ not in (0x40aaf9,0x410600):
            # type identity offsets are pinned below; do not infer from a name
            raise ValueError(f'unexpected location fields {guid} {typ:#x}')
        bundles=[]
        for q in array(dep,4):
            dep_loc=u(q);pk,ip,pr,de,dh,ex,ty=unpack('<7I',dep_loc)
            if pr!=0x4006dedb or de!=0xffffffff or ty!=0x6e149: raise ValueError('not a bundle location')
            name=string(pk);internal_id=string(ip)
            if not re.fullmatch('[a-zA-Z0-9_. -]+',name) or internal_id!=PREFIX+name: raise ValueError(f'bundle identity mismatch {name!r} {internal_id!r}')
            bundles.append(name)
        if not bundles or len(bundles)!=len(set(bundles)): raise ValueError('invalid dependencies')
        resolved[guid]=[loc,typ,bundles]
    if set(resolved)!=expected or len(resolved)!=719: raise ValueError('missing original location')
    names=sorted({n for _,_,bs in resolved.values() for n in bs})
    indices={n:i for i,n in enumerate(names)}
    return {'schema':'HKIA.FurnitureAddressablesSource.1','version':'3.0.1','catalogSha256':SHA,'visualDefinitionsSha256':visual['definitionsSha256'],'bundleNames':names,'columns':['guid','locationOffset','typeOffset','orderedBundleIndices'],'rows':[[g,loc,typ,[indices[n] for n in bs]] for g,(loc,typ,bs) in sorted(resolved.items())]}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('catalog',type=Path);p.add_argument('visual',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    d=extract(a.catalog.read_bytes(),json.loads(a.visual.read_text()));a.out.write_text(json.dumps(d,separators=(',',':'))+'\n',encoding='utf8')
if __name__=='__main__': main()
