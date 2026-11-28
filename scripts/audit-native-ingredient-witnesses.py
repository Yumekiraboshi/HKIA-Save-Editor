#!/usr/bin/env python3
"""Verify the full material witness census against original v3.0.1 definitions."""
import argparse, collections, json, re
from pathlib import Path
def extract(raw):
    import importlib.util
    spec=importlib.util.spec_from_file_location('common',Path(__file__).with_name('extract-native-result-icons.py'))
    common=importlib.util.module_from_spec(spec);spec.loader.exec_module(common)
    audit=common.module('unityfs-audit');typed=common.module('extract-furniture-preview-camera');mesh=common.module('extract-furniture-mesh-source')
    req=common.require
    req(common.sha(raw)==common.DEFINITIONS,'original fingerprint')
    objects,_=typed.load(dict(audit.extract_nodes(raw)[1])[common.CAB],mesh)
    def chars(b):
        p=4;rows=[]
        for _ in range(mesh.u(b)):
            i=mesh.u(b,p);name,p=mesh.string(b,p+4);group,p=mesh.string(b,p);p+=16
            rows.append((i,name,group))
        req(p==len(b),'characteristic array boundary')
        return rows
    _,t,b=objects['-4611181262773290741']
    f=common.fields(t,b,mesh)
    db={i:(n,g) for i,n,g in chars(f['Characteristics'])}
    req(len(db)==132,'characteristic census')
    flavor_group=db[mesh.u(f['FlavorGroupCharacteristic'])][0]
    color_group=db[mesh.u(f['ColorGroupCharacteristic'])][0]
    items=[];rows=[];cafe=[];boba=[]
    for _,(cls,t,b) in objects.items():
        if cls!=114:continue
        names={n[2] for n in t[-1]}
        if {'Id','UiIcon','SerializedGuid'}<=names:
            f=common.fields(t,b,mesh);item=mesh.u(f['Id']);items.append(item)
            c=chars(f['<Characteristics>k__BackingField'])
            req(all(db.get(i)==(n,g) for i,n,g in c),'characteristic identity')
            flavors=[i for i,n,g in c if g==flavor_group];colors=[i for i,n,g in c if g==color_group]
            if flavors:
                req(len(flavors)==len(colors)==1,'flavor/color pair cardinality')
                rows.append([item,flavors[0],colors[0]])
        elif {'FlavorCharacteristics','ColorCharacteristics'}<=names:
            f=common.fields(t,b,mesh)
            def ids(a):
                req(len(a)==4+4*mesh.u(a),'authored list boundary')
                return [mesh.u(a,p) for p in range(4,len(a),4)]
            flavors=ids(f['FlavorCharacteristics']);colors=ids(f['ColorCharacteristics'])
            req(len(flavors)==len(colors),'authored pair lengths')
            cafe.append(list(zip(flavors,colors)))
        elif {'ColorCharacteristic','FlavorCharacteristic','HasBobaCharacteristic','HasMilkCharacteristic','SweetnessCharacteristic'}<=names:
            f=common.fields(t,b,mesh);boba.append((mesh.u(f['FlavorCharacteristic']),mesh.u(f['ColorCharacteristic'])))
    rows.sort()
    req(len(items)==len(set(items))==12163,'definition closure')
    req(len(rows)==48 and len(cafe)==67 and len(boba)==23,'recipe census')
    pairs={tuple(r[1:]) for r in rows}
    req(len(pairs)==47 and {r[1] for r in rows}=={i for i,(n,g) in db.items() if g==flavor_group},'flavor closure')
    req(collections.Counter(p for recipe in cafe for p in recipe if p not in pairs)=={(54,9):2},'authored mismatch census')
    req(all(p in pairs for p in boba),'authored Boba closure')
    req(common.sha((json.dumps(rows,separators=(',',':'))+'\n').encode())=='584604fa1159b9aa7f76178c4a4f83352316856d273e27550fb86ef1aab0ddb1','source rows fingerprint')
    return rows
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('definitions',type=Path);args=p.parse_args()
    rows=extract(args.definitions.read_bytes())
    native=(Path(__file__).parent.parent/'core/src/inventory_source.rs').read_text()
    table=re.search(r'const CAFE_INGREDIENT_WITNESSES:[\s\S]*?=\s*&\[([\s\S]*?)\];',native)[1]
    assert rows==[list(map(int,m)) for m in re.findall(r'\((\d+),(\d+),(\d+)\)',table)]
    print('HKIA_NATIVE_INGREDIENT_WITNESSES_OK 12163 definitions, 48 materials, 32 flavors, 47 pairs, 2 authored mismatches')
