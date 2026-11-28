#!/usr/bin/env python3
"""Category artwork staging using reviewed native pointers, not inferred names.

The reviewed census binds the category catalogs, explicitly chosen navigation
representatives and native category references to exact original bundle hashes.
The same Sprite/texture decoder used by item art handles all source categories.
"""
import argparse
import collections
import importlib.util
import io
import re
import struct
import tempfile
from pathlib import Path

spec=importlib.util.spec_from_file_location('native_atlas',Path(__file__).with_name('stage-native-icon-atlas.py'))
atlas=importlib.util.module_from_spec(spec);spec.loader.exec_module(atlas)
source=atlas.source
require,sha=source.require,source.digest
KEY=re.compile(r'[a-z][a-z0-9_-]{0,127}')
PATH=re.compile(r'-?[1-9][0-9]{0,18}')
SCHEMA='HKIA.CategoryArtCandidate.1'


def validate(census,scope):
    version,platform=census['version'],census['platform']
    source.checked_release(version,platform)
    require(census.get('schema')=='HKIA.CategoryArtPointerCensus.1' and
            census.get('reviewedLayout')=='native-category-pointers-v1' and
            source.SHA.fullmatch(census['definitionsSha256']) and
            source.SHA.fullmatch(census['scopeFileSha256']) and
            scope.get('schema')=='HKIA.CategoryArtScope.1' and
            scope['version']==version and scope['platform']==platform and
            scope['definitionsSha256']==census['definitionsSha256'],'source scope mismatch')
    domains={}
    for domain in ('collection','inventory'):
        keys=scope[domain+'Keys']
        require(isinstance(keys,list) and all(isinstance(k,str) and KEY.fullmatch(k) for k in keys)
                and len(set(keys))==len(keys),'invalid category keys')
        domains[domain]=set(keys)
    ids=scope['itemIds']
    require(isinstance(ids,list) and all(type(i) is int and 0<i<=0x7fffffff for i in ids)
            and len(ids)==len(set(ids)),'invalid item IDs')
    ids=set(ids)
    rows={}
    for row in census['rows']:
        domain,key=row['domain'],row['key']
        require(domain in domains and key in domains[domain] and (domain,key) not in rows,'category identity mismatch')
        rep,fb=row['representativeItemId'],row['collectionFallback']
        require((rep is None or type(rep) is int and rep in ids) and
                (fb is None or fb in domains['collection']) and
                (domain!='collection' or rep is None and fb is None),'invalid reviewed fallback')
        ref=row['nativePPtr']
        require(isinstance(ref,list) and len(ref)==2 and type(ref[0]) is int and 0<=ref[0]<=0x7fffffff and
                isinstance(ref[1],str) and (ref==[0,'0'] or PATH.fullmatch(ref[1])) and
                source.BUNDLE.fullmatch(row['ownerBundle']),'invalid native reference')
        rows[domain,key]=row
    require(set(rows)=={(d,k) for d,keys in domains.items() for k in keys},'incomplete category census')
    return rows


def stage(census_path,scope_path,bundles_path,out):
    census,scope,manifest=map(source.read_json,(census_path,scope_path,bundles_path))
    rows=validate(census,scope)
    require(source.file_digest(scope_path)==census['scopeFileSha256'] and
            manifest.get('schema')=='HKIA.CategoryArtBundleInput.1' and
            manifest['censusFileSha256']==source.file_digest(census_path) and
            manifest['version']==census['version'] and manifest['platform']==census['platform'],
            'reviewed input fingerprints')
    entries=manifest['bundles']
    require(entries and len({e['name'] for e in entries})==len(entries),'duplicate bundle')
    cabs,loaded,hashes={},{},{}
    for e in entries:
        require(source.BUNDLE.fullmatch(e['name']) and source.SHA.fullmatch(e['sha256']),'source bundle identity')
        b=atlas.load_bundle(bundles_path.parent/e['file'],e['sha256'])
        require(b['cab'] not in cabs,'ambiguous source CAB')
        cabs[b['cab']]=b;loaded[e['name']]=b;hashes[b['cab']]=e['sha256']
    require(next((e['sha256'] for e in entries if e['name']=='definitions'),None)==census['definitionsSha256'],
            'original definition fingerprint')
    require(out.resolve()!=source.ROOT and source.ROOT not in out.resolve().parents and not out.exists(),
            'new staging directory outside repository required')
    routes={k:{'domain':r['domain'],'key':r['key'],'representativeItemId':r['representativeItemId'],
               'collectionFallback':r['collectionFallback'],
               'native':{'kind':'null' if r['nativePPtr']==[0,'0'] else 'unresolved'}} for k,r in rows.items()}
    groups=collections.defaultdict(list)
    cache={}
    for k,r in rows.items():
        if r['nativePPtr']==[0,'0'] or r['ownerBundle'] not in loaded:continue
        try:
            sprite=atlas.resolve(loaded[r['ownerBundle']],r['nativePPtr'],cabs,213)
            logical,rect,offset,texture,binding=atlas.geometry(sprite,cabs,cache)
            groups[texture[0]['cab'],texture[1]].append((k,sprite,logical,rect,offset,texture,binding))
        except (atlas.Unsupported,KeyError,StopIteration,struct.error):
            continue
    out.parent.mkdir(parents=True,exist_ok=True)
    from PIL import Image
    with tempfile.TemporaryDirectory(prefix='hkia-category-art-',dir=out.parent) as temp:
        folder=Path(temp)/'candidate';folder.mkdir()
        resolved={}
        for jobs in groups.values():
            try:image,tex=atlas.texture_data(jobs[0][5])
            except (atlas.Unsupported,KeyError,StopIteration,struct.error):continue
            for k,sprite,logical,rect,offset,texture,binding in jobs:
                sb,pid,_,raw=sprite;identity=(sb['cab'],pid)
                if identity not in resolved:
                    try:tile=atlas.crop_tile(image,logical,rect,offset)
                    except atlas.Unsupported:continue
                    buf=io.BytesIO();tile.save(buf,format='WEBP',lossless=True,method=6,exact=True)
                    data=buf.getvalue()
                    require(len(data)<=200000,'category artwork delivery bound')
                    with Image.open(io.BytesIO(data)) as decoded:
                        require(decoded.size==tile.size and atlas.visible_hash(decoded.convert('RGBA'))==atlas.visible_hash(tile),
                                'lossless category image mismatch')
                    digest=sha(data);file=digest+'.webp'
                    if not (folder/file).exists():(folder/file).write_bytes(data)
                    resolved[identity]={'kind':'sprite','file':file,'sha256':digest,'bytes':len(data),
                        'sourceBundleSha256':hashes[sb['cab']],'spritePathId':pid,
                        'sourceSha256':sha(source.stable({'spriteSha256':sha(raw),'logicalSize':logical,
                           'rect':rect,'offset':offset,**binding,**tex,'renderer':atlas.RENDERER}))}
                routes[k]['native']=resolved[identity]
            del image
        result={'schema':SCHEMA,'version':census['version'],'platform':census['platform'],
                'definitionsSha256':census['definitionsSha256'],'sourceBundles':{e['name']:e['sha256'] for e in entries},
                'sourceCensusFileSha256':source.file_digest(census_path),'rows':[routes[k] for k in sorted(routes)],
                'unresolvedCount':sum(r['native']['kind']=='unresolved' for r in routes.values()),
                'automaticReleaseActivationAuthorized':False}
        source.write_new(folder/'category-art.json',result)
        require(not out.exists(),'candidate already exists');folder.rename(out)
    return result


def self_test():
    h='a'*64
    scope={'schema':'HKIA.CategoryArtScope.1','version':'9.1.0','platform':'steam','definitionsSha256':h,
           'collectionKeys':['collections_group_food'],'inventoryKeys':['food'],'itemIds':[1]}
    rows=[{'domain':'collection','key':'collections_group_food','representativeItemId':None,'collectionFallback':None,
           'ownerBundle':'definitions','nativePPtr':[0,'123']},
          {'domain':'inventory','key':'food','representativeItemId':1,'collectionFallback':'collections_group_food',
           'ownerBundle':'l_inventoryview','nativePPtr':[1,'456']}]
    census={'schema':'HKIA.CategoryArtPointerCensus.1','version':'9.1.0','platform':'steam','definitionsSha256':h,
            'scopeFileSha256':h,'reviewedLayout':'native-category-pointers-v1','rows':rows}
    assert len(validate(census,scope))==2
    for field,bad in [('nativePPtr',[1,'0']),('representativeItemId',2),('collectionFallback','missing'),('key','unknown')]:
        old=rows[1][field];rows[1][field]=bad
        try:validate(census,scope)
        except ValueError:pass
        else:raise AssertionError('accepted '+field)
        rows[1][field]=old
    print('HKIA_CATEGORY_ART_STAGE_SELF_TEST_OK')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--self-test',action='store_true')
    for name in ('census','scope','bundles','out'):p.add_argument('--'+name,type=Path)
    a=p.parse_args()
    if a.self_test:self_test()
    elif all(getattr(a,k) for k in ('census','scope','bundles','out')):
        r=stage(a.census,a.scope,a.bundles,a.out)
        print('HKIA_CATEGORY_ART_CANDIDATE',len(r['rows']),'routes',r['unresolvedCount'],'unresolved')
    else:p.error('provide --census, --scope, --bundles, --out')
