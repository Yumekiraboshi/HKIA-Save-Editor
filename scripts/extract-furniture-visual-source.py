#!/usr/bin/env python3
"""Extract source-only furniture visual references, not rendered icons.
Requires the canonical repository's existing UnityFS audit helpers.
"""
import argparse, hashlib, importlib.util, json, re, struct
from pathlib import Path

SHA='ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0'

def parse(rows):
    objects={int(pid):(cls,b,e) for cls,pid,b,e in rows}
    result=[]
    def read_string(b,p):
        n=struct.unpack_from('<I',b,p)[0]
        if n>512 or p+4+n>len(b): raise ValueError('string bounds')
        return b[p+4:p+4+n].decode('utf8'),(p+4+n+3)&~3
    def ref(b,p):
        v,p=read_string(b,p);name,p=read_string(b,p);kind,p=read_string(b,p)
        if (v and not re.fullmatch('[0-9a-f]{32}',v)) or name or kind: raise ValueError('unsupported reference')
        return v or None,p
    for pid,(cls,b,endian) in objects.items():
        if cls!=114 or len(b)<32: continue
        if endian!='<': raise ValueError('source endian')
        try: key,at=read_string(b,28)
        except (ValueError,UnicodeError,struct.error): continue
        if not key.endswith('.InventoryItemDefinitionAsset'): continue
        for kind,typename in enumerate(('FurnitureItemDetails','HomeCustomizeItemDetails')):
            marker=struct.pack('<I',len(typename))+typename.encode()
            pos=b.find(marker)
            if pos<0: continue
            if b.find(marker,pos+len(marker))!=-1: raise ValueError('ambiguous details')
            t,p=read_string(b,pos);ns,p=read_string(b,p);assembly,p=read_string(b,p)
            if (t,ns,assembly)!=(typename,'Sunblink.Game','Assembly-CSharp'): raise ValueError('details identity')
            if kind==0: p+=20
            prototype,p=ref(b,p)
            if kind==1: flag=struct.unpack_from('<I',b,p)[0];p+=4
            preview,p=ref(b,p)
            if kind==0: flag=struct.unpack_from('<I',b,p)[0];p+=4
            if flag not in (0,1): raise ValueError('invalid customizable flag')
            if not flag: continue
            item=struct.unpack_from('<I',b,at+36)[0]
            file,sprite=struct.unpack_from('<iq',b,at+80)
            dynamic=struct.unpack_from('<I',b,at+92)[0]
            mask,q=ref(b,at+96);visual,q=ref(b,q)
            if file!=0 or objects.get(sprite,(0,))[0]!=213 or dynamic!=0 or mask is not None or not prototype: raise ValueError('unexpected base icon reference')
            result.append([item,str(pid),kind,str(sprite),visual,prototype,preview,hashlib.sha256(b).hexdigest()])
    result.sort()
    if len(result)!=649 or len({r[0] for r in result})!=649 or sum(r[2]==0 for r in result)!=621 or sum(r[6] is not None for r in result)!=44: raise ValueError('source coverage changed')
    return {'schema':'HKIA.FurnitureVisualSource.1','version':'3.0.1','definitionsSha256':SHA,'columns':['itemId','definitionPathId','detailsType','baseSpritePathId','visual3DGuid','prototypeOrFloorplanAssetSetGuid','customizer3DVisualGuid','definitionSha256'],'rows':result}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('bundle',type=Path);p.add_argument('--out',type=Path,required=True);args=p.parse_args()
    raw=args.bundle.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=SHA: raise ValueError('wrong original version')
    spec=importlib.util.spec_from_file_location('audit',Path(__file__).with_name('audit-native-dye-materials.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    _,nodes=m.auditor.extract_nodes(raw);cab=dict(nodes)['CAB-46b8f8fe122147493b3113f7c1c8cd0f'];d=parse(m.serialized_objects(cab,classes=(114,213)))
    args.out.write_text(json.dumps(d,separators=(',',':'))+'\n',encoding='utf8')
if __name__=='__main__': main()
