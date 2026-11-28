#!/usr/bin/env python3
"""Extract verified v3.0.1 ordinary cooking recipes, not player consumption history."""
import argparse, json, struct, collections, hashlib, importlib.util
from pathlib import Path

def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def canonical(value):
    return (json.dumps(value,separators=(',',':'),ensure_ascii=False)+'\n').encode()

def extract(raw):
    common=module('extract-native-result-icons')
    audit=common.module('unityfs-audit')
    typed=common.module('extract-furniture-preview-camera')
    mesh=common.module('extract-furniture-mesh-source')
    require=common.require
    require(common.sha(raw)==common.DEFINITIONS,'original fingerprint')
    objects,_=typed.load(dict(audit.extract_nodes(raw)[1])[common.CAB],mesh)
    definitions={}
    for pid,(cls,t,b) in objects.items():
        if cls!=114 or not {'Id','UiIcon','SerializedGuid'}<=set(n[2] for n in t[-1]):continue
        name,p=mesh.string(b,28);item=mesh.u(b,p+36)
        require(name.startswith('item_'),'definition identity')
        definitions[pid]=item
    require(len(definitions)==12163 and len(set(definitions.values()))==12163,'definition closure')
    def item_at(b,p):
        f,pid=mesh.ptr(b,p);require(f==0 and pid in definitions,'item PPtr')
        return definitions[pid]
    stations={}
    for pid,(cls,t,b) in objects.items():
        if cls!=114 or not {'BaseIngredients','StationImage','ExcludeList'}<=set(n[2] for n in t[-1]):continue
        fields=common.fields(t,b,mesh);base=fields['BaseIngredients']
        require(len(base)==28 and mesh.u(base)==1,'single station base/catch-all')
        stations[pid]=[mesh.string(b,28)[0].split('.')[0],item_at(base,4),item_at(base,16)]
    require(len(stations)==9,'station closure')
    rows=[]
    for pid,item in definitions.items():
        _,t,b=objects[pid]
        if b'RecipeItemDetails' not in b:continue
        fields=common.fields(t,b,mesh);ref=fields['references']
        require(mesh.u(fields['Id'])==item,'recipe identity')
        require(struct.unpack_from('<II',ref)==(2,1) and ref[8:16]==fields['Details'],'managed reference identity')
        name,p=mesh.string(ref,16);ns,p=mesh.string(ref,p);asm,p=mesh.string(ref,p)
        require((name,ns,asm)==('RecipeItemDetails','Sunblink.Game','Assembly-CSharp'),'managed class')
        n=mesh.u(ref,p+16);require(n in (1,2) and len(ref)-p==48+n*16,'recipe payload')
        payload=ref[p:]
        offsets=[0]+[20+16*i for i in range(n)]
        require(all(mesh.u(payload,at+12)==1 for at in offsets),'ingredient quantity changed; update schema')
        ingredients=[item_at(payload,at) for at in offsets]
        f,station=mesh.ptr(payload,20+16*n)
        require(f==0 and station in stations and stations[station][1]==ingredients[0],'station/base identity')
        result=item_at(payload,32+16*n)
        rows.append([item,result,*ingredients])
    rows.sort();stations=sorted(stations.values())
    counts=(len(rows),len({r[1] for r in rows}),len({i for r in rows for i in r[2:]}))
    require(counts==(282,232,64) and len({r[0] for r in rows})==282,'recipe closure')
    require(collections.Counter(map(len,rows))=={4:158,5:124},'recipe lengths')
    require(common.sha(canonical(rows))=='4c70fe0cc2cfdf2378ddd848a0b85c7d94ff89e987eaa1e667c568c9b54c7e83','recipe source identity')
    require(common.sha(canonical(stations))=='663b3ad61589d32ba598dcafd28dc41249d1f73c2ac8e53813cb5f4126161914','station source identity')
    return {'schema':'HKIA.NativeCookingRecipes.1','version':'3.0.1','switchDefinitionsSha256':common.DEFINITIONS,
            'rowsSha256':common.sha(canonical(rows)),'stationsSha256':common.sha(canonical(stations)),
            'recipeCount':counts[0],'resultCount':counts[1],'ingredientCount':counts[2],'stations':stations,'rows':rows}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('definitions',type=Path);p.add_argument('--out',required=True,type=Path);a=p.parse_args()
    a.out.write_bytes(canonical(extract(a.definitions.read_bytes())))
    print('HKIA_NATIVE_COOKING_RECIPES_OK 282 recipes, 232 results, 64 ingredients')
