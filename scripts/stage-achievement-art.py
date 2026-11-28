#!/usr/bin/env python3
"""Offline original achievement atlas candidate staging.

Requires a separately reviewed, complete LocalAchievementDefinition pointer
census for this exact definition bundle. This is not a managed-reference
layout extractor: no offsets, asset GUIDs or null references are guessed.
Reuse the native Sprite/texture decoder and source fingerprint verification.
"""
import argparse
import collections
import importlib.util
import json
import re
import struct
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('native_atlas', HERE/'stage-native-icon-atlas.py')
atlas = importlib.util.module_from_spec(spec)
spec.loader.exec_module(atlas)
source = atlas.source
require, sha = source.require, source.digest
ROUTING = 'native-local-achievement-direct-parent-v1'
RENDERER = atlas.RENDERER
GUID = re.compile(r'[0-9a-f]{8}(?::[0-9a-f]{8}){3}')
ASSET_GUID = re.compile(r'[0-9a-f]{32}')
PATH_ID = re.compile(r'-?[1-9][0-9]{0,18}')
KEY = re.compile(r'[A-Za-z0-9_-]{1,128}')
SCHEMA = 'HKIA.AchievementArtCandidate.1'


def validate_census(census, index, hierarchy):
    version, platform = census['version'], census['platform']
    source.checked_release(version, platform)
    require(census.get('schema') == 'HKIA.AchievementPointerCensus.1' and
            census.get('reviewedRouting') == ROUTING and
            source.SHA.fullmatch(census['definitionsSha256']) and
            source.SHA.fullmatch(census['catalogIndexFileSha256']) and
            source.SHA.fullmatch(census['catalogHierarchyFileSha256']), 'unreviewed source census')
    require(index.get('schema') == 'HKIA.AchievementKeyIndex.1' and index['version'] == version and
            index['sourceSha256'] == census['definitionsSha256'] and
            hierarchy.get('schema') == 'HKIA.AchievementGroups.1' and hierarchy['version'] == version,
            'catalog source version mismatch')
    keys = {}
    for guid, key, _ in index['records']:
        require(GUID.fullmatch(guid) and KEY.fullmatch(key) and guid not in keys, 'invalid save identity')
        keys[guid] = key
    require(keys and len(set(keys.values())) == len(keys), 'ambiguous achievement source keys')
    parents = {}
    for guid, children in hierarchy['groups']:
        require(guid in keys and guid not in parents and children, 'invalid category')
        parents[guid] = None
        for child in children:
            require(child in keys and child not in parents, 'invalid child')
            parents[child] = guid
    require(set(parents) == set(keys) and all(p is None or parents[p] is None for p in parents.values()),
            'incomplete/direct-parent hierarchy required')
    rows, source_guids = {}, set()
    for row in census['rows']:
        guid, key, asset_guid = row['saveGuid'], row['sourceKey'], row['sourceGuid']
        require(guid in keys and keys[guid] == key and guid not in rows and
                ASSET_GUID.fullmatch(asset_guid) and asset_guid not in source_guids and
                row['parent'] == parents[guid], 'source/census identity mismatch')
        ref = row['iconPPtr']
        require(isinstance(ref,list) and len(ref)==2 and type(ref[0]) is int and
                0 <= ref[0] <= 0x7fffffff and isinstance(ref[1],str) and
                ((ref == [0,'0']) or bool(PATH_ID.fullmatch(ref[1]))), 'invalid native icon PPtr')
        rows[guid] = row
        source_guids.add(asset_guid)
    require(len(rows) == len(keys) == census['definitionCount'], 'incomplete pointer census')
    if version=='3.0.1' and platform=='steam':
        require(census['definitionsSha256']==source.known_baseline(version,platform)['definitions'], 'baseline source mismatch')
        require(len(rows)==820 and sum(r['iconPPtr']==[0,'0'] for r in rows.values())==559, 'baseline source census mismatch')
    return rows


def stage(census_path,index_path,hierarchy_path,bundles_path,out):
    census,index,hierarchy,manifest = map(source.read_json,(census_path,index_path,hierarchy_path,bundles_path))
    rows = validate_census(census,index,hierarchy)
    require(source.file_digest(index_path)==census['catalogIndexFileSha256'] and
            source.file_digest(hierarchy_path)==census['catalogHierarchyFileSha256'],
            'catalog file fingerprints')
    version,platform=census['version'],census['platform']
    require(manifest.get('schema')=='HKIA.AchievementArtBundleInput.1' and manifest['version']==version and
            manifest['platform']==platform and manifest['censusFileSha256']==source.file_digest(census_path),
            'bundle input does not bind reviewed census')
    entries=manifest['bundles']
    require(entries and len({e['name'] for e in entries})==len(entries),'duplicate source bundles')
    cabs,loaded,cab_hashes={},{},{}
    for e in entries:
        require(source.BUNDLE.fullmatch(e['name']) and source.SHA.fullmatch(e['sha256']),'source bundle identity')
        bundle=atlas.load_bundle(bundles_path.parent/e['file'],e['sha256'])
        cab=bundle['cab']
        require(cab not in cabs,'ambiguous original CAB')
        cabs[cab]=bundle;loaded[e['name']]=bundle;cab_hashes[cab]=e['sha256']
        if e['name']=='definitions':
            require(e['sha256']==census['definitionsSha256'],'definitions fingerprint')
    require('definitions' in loaded,'missing original definitions')
    definitions=loaded['definitions']
    require(out.resolve()!=source.ROOT and source.ROOT not in out.resolve().parents and not out.exists(),
            'new output outside repository required')
    routes={guid:{'saveGuid':guid,'sourceKey':r['sourceKey'],'parent':r['parent'],
                  'icon':{'kind':'null'} if r['iconPPtr']==[0,'0'] else
                  {'kind':'unresolved','sourceGuid':r['sourceGuid'],'fileId':r['iconPPtr'][0],
                   'spritePathId':r['iconPPtr'][1]}} for guid,r in rows.items()}
    grouped=collections.defaultdict(list)
    for guid,r in rows.items():
        if r['iconPPtr']!=[0,'0']:
            grouped[tuple(r['iconPPtr'])].append(guid)
    by_texture=collections.defaultdict(list)
    cache={}
    for ref,guids in sorted(grouped.items()):
        try:
            sprite=atlas.resolve(definitions,ref,cabs,213)
            logical,rect,offset,texture,binding=atlas.geometry(sprite,cabs,cache)
            by_texture[(texture[0]['cab'],texture[1])].append((guids,sprite,logical,rect,offset,texture,binding))
        except (atlas.Unsupported,KeyError,StopIteration,struct.error):
            continue
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='hkia-achievement-art-',dir=out.parent) as tmp:
        folder=Path(tmp)/'candidate';folder.mkdir()
        pending=[];pages=[];resolved={}
        def page_name():
            return 'achievement-individual-atlas-%03d.webp'%len(pages)
        def flush():
            if not pending:return
            p=atlas.write_sheet(folder,len(pages),pending)
            name=page_name()
            (folder/p['name']).rename(folder/name)
            pages.append({'file':name,'sha256':p['sha256'],'bytes':p['bytes'],'columns':atlas.COLS,
                          'rows':(len(pending)+atlas.COLS-1)//atlas.COLS,'cellPx':atlas.SIDE})
            pending.clear()
        for _,jobs in sorted(by_texture.items()):
            try:
                image,tex=atlas.texture_data(jobs[0][5])
            except (atlas.Unsupported,KeyError,StopIteration,struct.error):
                continue
            for guids,sprite,logical,rect,offset,texture,binding in jobs:
                sb,pid,_,raw=sprite
                identity=(sb['cab'],pid)
                if identity not in resolved:
                    try:
                        tile=atlas.crop_tile(image,logical,rect,offset)
                    except atlas.Unsupported:
                        continue
                    resolved[identity]={'sourceBundleSha256':cab_hashes[sb['cab']],
                                        'spritePathId':pid,'sourceSha256':sha(source.stable({
                                            'spriteSha256':sha(raw),'logicalSize':logical,'rect':rect,'offset':offset,
                                            **binding,**tex,'renderer':RENDERER})),
                                        'page':page_name(),'cell':len(pending)}
                    pending.append(tile)
                    if len(pending)==atlas.PER:flush()
                for guid in guids:
                    routes[guid]['icon']={'kind':'sprite','sourceGuid':rows[guid]['sourceGuid'],**resolved[identity]}
            del image
        flush()
        result={'schema':SCHEMA,'version':version,'platform':platform,'definitionsSha256':census['definitionsSha256'],
                'reviewedRouting':ROUTING,'definitionCount':len(rows),'pages':pages,
                'rows':[routes[g] for g in sorted(routes)],'nativeNullCount':sum(r['icon']['kind']=='null' for r in routes.values()),
                'unresolvedCount':sum(r['icon']['kind']=='unresolved' for r in routes.values()),
                'sourceCensusFileSha256':source.file_digest(census_path),'sourceBundles':{e['name']:e['sha256'] for e in entries},
                'renderer':RENDERER,'automaticReleaseActivationAuthorized':False}
        source.write_new(folder/'achievement-art.json',result)
        require(not out.exists(),'candidate output already exists')
        folder.rename(out)
    return result


def self_test():
    h='a'*64
    a,b='00000001:00000002:00000003:00000004','00000005:00000006:00000007:00000008'
    index={'schema':'HKIA.AchievementKeyIndex.1','version':'9.1.0','sourceSha256':h,'records':[[a,'parent','1'],[b,'child','2']]}
    hierarchy={'schema':'HKIA.AchievementGroups.1','version':'9.1.0','groups':[[a,[b]]]}
    rows=[{'saveGuid':a,'sourceKey':'parent','parent':None,'sourceGuid':'a'*32,'iconPPtr':[1,'123']},
          {'saveGuid':b,'sourceKey':'child','parent':a,'sourceGuid':'b'*32,'iconPPtr':[0,'0']}]
    census={'schema':'HKIA.AchievementPointerCensus.1','version':'9.1.0','platform':'steam','reviewedRouting':ROUTING,
            'definitionsSha256':h,'catalogIndexFileSha256':h,'catalogHierarchyFileSha256':h,'definitionCount':2,'rows':rows}
    assert len(validate_census(census,index,hierarchy))==2
    for bad in ([1,'0'],[-1,'123'],[0,'unknown']):
        rows[1]['iconPPtr']=bad
        try:validate_census(census,index,hierarchy)
        except ValueError:pass
        else:raise AssertionError('invalid null or pointer accepted')
    print('HKIA_ACHIEVEMENT_ART_STAGE_SELF_TEST_OK')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--self-test',action='store_true')
    for name in ('census','index','hierarchy','bundles','out'):p.add_argument('--'+name,type=Path)
    a=p.parse_args()
    if a.self_test:self_test()
    elif all(getattr(a,k) for k in ('census','index','hierarchy','bundles','out')):
        r=stage(a.census,a.index,a.hierarchy,a.bundles,a.out)
        print('HKIA_ACHIEVEMENT_ART_CANDIDATE',r['definitionCount'],'definitions',r['nativeNullCount'],'native null',r['unresolvedCount'],'unresolved')
    else:p.error('provide --census, --index, --hierarchy, --bundles, --out')
