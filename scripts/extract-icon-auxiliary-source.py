#!/usr/bin/env python3
"""Extract original auxiliary icon bindings for a reviewed game release.

Uses typed original definitions, not copied previous-release IDs or colors.
Swatch values live in a separate dye-config asset; retain exact references,
never substitute missing colors. This is candidate source metadata only.
"""
import argparse
import importlib.util
import math
import struct
from pathlib import Path

def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

source=module('icon-source-update')
helpers=module('extract-native-result-icons')
mesh=helpers.module('extract-furniture-mesh-source')
typed=helpers.module('extract-furniture-preview-camera')
audit=helpers.module('unityfs-audit')
require,sha=source.require,source.digest
LAYOUT='native-icon-auxiliary-v1'

def array_rows(node,data,p=0):
    require(len(node[-1])==1 and node[-1][0][1]=='Array','unsupported typed array')
    array=node[-1][0]
    require(len(array[-1])==2,'unsupported array element tree')
    n=mesh.u(data,p);p+=4
    require(n<=100000,'array count bound')
    out=[]
    for _ in range(n):
        q=helpers.walk(array[-1][1],data,p,mesh)
        require(q>p,'empty array element')
        out.append(data[p:q]);p=q
    return out,p

def map_rows(node,data):
    require([x[2] for x in node[-1]]==['keyData','valueData'],'unsupported typed map')
    a,b=node[-1]
    keys,p=array_rows(a,data)
    vals,p=array_rows(b,data,p)
    require(p==len(data) and len(keys)==len(vals) and all(len(k)==4 for k in keys),'map boundary')
    ids=[mesh.u(k) for k in keys]
    require(len(set(ids))==len(ids) and all(i>0 for i in ids),'duplicate/invalid map key')
    return list(zip(ids,vals)),b[-1][0][-1][1]

def rgba(raw):
    values=struct.unpack('<4f',raw)
    require(all(math.isfinite(v) and 0<=v<=1 for v in values),'unsupported source color')
    return list(values)

def reference(raw):
    import re
    g,p=mesh.string(raw);name,p=mesh.string(raw,p);kind,p=mesh.string(raw,p)
    require(p==len(raw) and bool(re.fullmatch('[a-f0-9]{32}',g)),'invalid source asset GUID')
    return g,name,kind

def sprite_binding(ref,objects,externals):
    f,pid=ref
    require(pid!='0' and 0<=f<=len(externals),'invalid Sprite PPtr')
    if f==0:
        require(pid in objects and objects[pid][0]==213,'invalid local Sprite')
    return {'fileId':f,'pathId':pid,'external':externals[f-1] if f else None,
            'objectSha256':sha(objects[pid][2]) if not f else None}

def extract(snapshot,path,reviewed):
    rows=source.validate_snapshot(snapshot)
    baseline=snapshot['version']=='3.0.1' and snapshot['platform']=='switch'
    require(baseline or reviewed==LAYOUT,'review original auxiliary layout')
    require(path.stat().st_size<=audit.MAX_INPUT,'definition bundle bound')
    raw=path.read_bytes()
    require(sha(raw)==snapshot['sourceBundleSha256']['definitions'],'definition fingerprint')
    data=dict(audit.extract_nodes(raw)[1])[snapshot['definitionsCab']]
    require(sha(data)==snapshot['definitionsCabSha256'],'definition CAB fingerprint')
    objects,externals=typed.load(data,mesh)
    configs={}
    for pid,(cls,tree,blob) in objects.items():
        if cls!=114:continue
        ns={n[2]:n for n in tree[-1]}
        role=('characteristics' if {'Characteristics','ColorCharacteristicToSwatchReferenceMapping',
              'FleckCharacteristicToMaterialReferenceMapping'}<=set(ns) else
              'wandDisplay' if {'MagicCharacteristicToDisplay','DefaultGemstone'}<=set(ns) else None)
        if not role:continue
        require(role not in configs,'ambiguous configuration')
        configs[role]=(pid,ns,helpers.fields(tree,blob,mesh),sha(blob))
    require(set(configs)=={'characteristics','wandDisplay'},'missing native configurations')
    cp,cn,cf,ch=configs['characteristics']
    wp,wn,wf,wh=configs['wandDisplay']
    values,end=array_rows(cn['Characteristics'],cf['Characteristics'])
    require(end==len(cf['Characteristics']),'characteristic array boundary')
    characteristics=[]
    for v in values:
        i=mesh.u(v)
        key,p=mesh.string(v,4)
        group,p=mesh.string(v,p)
        require(i>0 and bool(key) and len(v)-p==16,'characteristic element layout')
        characteristics.append([i,key,group])
    known={r[0] for r in characteristics}
    require(len(known)==len(characteristics) and len({r[1] for r in characteristics})==len(known),
            'duplicate native characteristic')
    values,_=map_rows(cn['ColorCharacteristicToSwatchReferenceMapping'],cf['ColorCharacteristicToSwatchReferenceMapping'])
    swatches=[]
    for i,v in values:
        require(i in known and len(v)==4 and mesh.u(v)>0,'invalid color swatch mapping')
        swatches.append([i,mesh.u(v)])
    values,node=map_rows(cn['FleckCharacteristicToMaterialReferenceMapping'],cf['FleckCharacteristicToMaterialReferenceMapping'])
    flecks=[]
    for i,v in values:
        f=helpers.fields(node,v,mesh)
        g,name,kind=reference(f['Material'])
        require(i in known,'unknown Fleck characteristic')
        flecks.append({'characteristicId':i,'materialGuid':g,'subObjectName':name,'subObjectType':kind,
                      'rgba':rgba(f['Color'])})
    values,node=map_rows(wn['MagicCharacteristicToDisplay'],wf['MagicCharacteristicToDisplay'])
    magic=[]
    for i,v in values:
        f=helpers.fields(node,v,mesh)
        require(i in known,'unknown Magic characteristic')
        magic.append({'characteristicId':i,'magicType':mesh.u(f['MagicType']),
                      'sprite':sprite_binding(mesh.ptr(f['Icon']),objects,externals),'rgba':rgba(f['Color'])})
    flowers=[];wands=[]
    for i,row in sorted(rows.items()):
        if not row['dynamicColor']:continue
        cls,tree,blob=objects[row['definitionPathId']]
        require(cls==114 and sha(blob)==row['definitionSha256'],'dynamic definition identity')
        f=helpers.fields(tree,blob,mesh)
        ref=f['references']
        if len(ref)<20:continue
        # The two supported leaf details are single managed records. Skip
        # unrelated registries; never interpret their child bytes as a root.
        if not any(k in ref for k in (b'FlowerItemDetails',b'WandItemDetails')):continue
        require(struct.unpack_from('<II',ref)==(2,1) and ref[8:16]==f['Details'],'managed root identity')
        name,p=mesh.string(ref,16);ns,p=mesh.string(ref,p);asm,p=mesh.string(ref,p)
        require(name in ('FlowerItemDetails','WandItemDetails') and ns=='Sunblink.Game' and
                asm=='Assembly-CSharp','native auxiliary detail type')
        if name=='FlowerItemDetails':
            # Reviewed layout ends in the two growth Sprite PPtrs followed
            # by two Vector2 fields. These are not dynamic recolor masks.
            require(len(ref)-p>=40,'flower growth payload')
            seed=sprite_binding(mesh.ptr(ref,len(ref)-40),objects,externals)
            grown=sprite_binding(mesh.ptr(ref,len(ref)-28),objects,externals)
            require(seed!=grown,'ambiguous growth Sprite')
            flowers.append({'itemId':i,'seed':seed,'grownTroweled':grown})
        else:
            # Reviewed WandItemDetails layout: type at +108, authored
            # SubIconDetails at +112, traversal-effects list at +128.
            require(len(ref)-p>=132,'wand detail layout')
            wand_type=mesh.u(ref,p+108)
            scale,x,y,rotation=struct.unpack_from('<4f',ref,p+112)
            require(all(math.isfinite(v) for v in (scale,x,y,rotation)) and scale>=0,
                    'invalid native overlay transform')
            n=mesh.u(ref,p+128);end=p+132
            require(n<=1024,'traversal count')
            for _ in range(n):
                count=mesh.u(ref,end);end+=4
                require(count<=1024 and end+12*count+16<=len(ref),'traversal entry bounds')
                end+=12*count+16
            require(end==len(ref),'wand traversal boundary')
            wands.append({'itemId':i,'wandType':wand_type,'scale':scale,'offsetPercent':[x,y],'rotation':rotation})
    if baseline:
        # Compare projections to the existing verified production manifests.
        expected=source.read_json(source.ROOT/'public/dynamic-chef-art/chef-runtime-source-v3.0.1.json')
        require(sorted(swatches)==sorted([r['characteristicId'],r['swatchId']] for r in expected['colors']),
                'baseline chef color references')
        expected=source.read_json(source.ROOT/'public/dynamic-wand-art/wand-runtime-source-v3.0.1.json')
        require(sorted([r['characteristicId'],r['magicType'],r['sprite']['pathId'],r['rgba']] for r in magic)==
                sorted([r['characteristicId'],r['magicType'],r['iconPathId'],r['rgba']] for r in expected['magic']),
                'baseline magic display')
        require(sorted([r['characteristicId'],r['materialGuid'],r['rgba']] for r in flecks)==
                sorted([r['characteristicId'],r['materialGuid'],r['rgba']] for r in expected['flecks']),
                'baseline Fleck display')
        growth=source.read_json(source.ROOT/'public/inventory-flower-art/flower-growth-source-v3.0.1.json')
        require(sorted([r['itemId'],state,r[field]['pathId']] for r in flowers
                       for state,field in ((0,'seed'),(7,'grownTroweled')))==
                sorted([r['itemId'],r['state'],r['spritePathId']] for r in growth['rows']),
                'baseline growth Sprites')
        transforms=source.read_json(source.ROOT/'public/dynamic-wand-art/wand-subicon-source-v3.0.1.json')
        require(wands==[{k:r[k] for k in ('itemId','wandType','scale','offsetPercent','rotation')}
                         for r in transforms['wands']], 'baseline wand transforms')
        require(len(known)==132,'baseline characteristic census')
    result={'schema':'HKIA.IconAuxiliarySourceCandidate.1','approval':'review-required',
            'version':snapshot['version'],'platform':snapshot['platform'],
            'definitionSnapshotSha256':snapshot['snapshotSha256'],'layout':LAYOUT,
            'configurations':{'characteristics':{'pathId':cp,'sha256':ch},
                              'wandDisplay':{'pathId':wp,'sha256':wh}},
            'characteristics':sorted(characteristics),'colorSwatchReferences':sorted(swatches),
            'magic':sorted(magic,key=lambda r:r['characteristicId']),
            'flecks':sorted(flecks,key=lambda r:r['characteristicId']),
            'flowerGrowth':flowers,'wandTransforms':wands,
            'unresolvedSwatchIds':sorted({v for _,v in swatches}),
            'automaticReleaseActivationAuthorized':False}
    result['receiptSha256']=sha(source.stable(result))
    return result

def self_test():
    # Synthetic typed uint map: two equal-length parallel arrays.
    field=[0,'Map','test',-1,0,[
      [1,'vector','keyData',-1,0,[[2,'Array','Array',-1,0,[
        [3,'int','size',4,0,[]],[3,'int','data',4,0,[]]]]]],
      [1,'vector','valueData',-1,0,[[2,'Array','Array',-1,0,[
        [3,'int','size',4,0,[]],[3,'int','data',4,0,[]]]]]]]]
    raw=struct.pack('<6I',2,6,7,2,237,216)
    rows,_=map_rows(field,raw)
    assert [(k,mesh.u(v)) for k,v in rows]==[(6,237),(7,216)]
    for bad in [struct.pack('<6I',2,6,6,2,237,216),raw[:-4],raw+bytes(4)]:
        try:map_rows(field,bad)
        except (ValueError,struct.error):pass
        else:raise AssertionError('accepted invalid map')
    assert rgba(struct.pack('<4f',.25,.5,.75,1))==[.25,.5,.75,1]
    try:rgba(struct.pack('<4f',float('nan'),0,0,1))
    except ValueError:pass
    else:raise AssertionError('accepted nonfinite color')
    print('HKIA_ICON_AUXILIARY_SOURCE_SELF_TEST_OK')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--snapshot',type=Path)
    p.add_argument('--definitions',type=Path)
    p.add_argument('--reviewed-layout',choices=[LAYOUT])
    p.add_argument('--out',type=Path)
    p.add_argument('--self-test',action='store_true')
    a=p.parse_args()
    if a.self_test:self_test()
    elif a.snapshot and a.definitions and a.out:
        result=extract(source.read_json(a.snapshot),a.definitions,a.reviewed_layout)
        source.write_new(a.out,result)
        print('HKIA_ICON_AUXILIARY_SOURCE',len(result['characteristics']),len(result['colorSwatchReferences']),
              len(result['magic']),len(result['flecks']),len(result['flowerGrowth']),len(result['wandTransforms']))
    else:p.error('provide snapshot, definitions and out')
