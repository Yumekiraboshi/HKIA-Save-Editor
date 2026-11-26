#!/usr/bin/env python3
"""Batch source extraction for every customizable v3.0.1 furniture appearance.
Offline only. Plan exact GUIDs and extract supported original layouts without
silently substituting another model. Unknown layouts remain unresolved."""
import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
import tempfile
from collections import defaultdict
from pathlib import Path

REPO=Path(__file__).resolve().parent.parent
DATA=REPO/'data'
def read(name):
    return json.loads((DATA/name).read_text(encoding='utf-8'))
def require(ok,message):
    if not ok: raise ValueError(message)
def sha(raw): return hashlib.sha256(raw).hexdigest()
def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def unique(rows,key):
    d={}
    for row in rows:
        k=key(row)
        require(k not in d,'duplicate source identity')
        d[k]=row
    return d
def candidates(doc,row):
    names=doc['bundleNames']
    require(row[3] and all(type(i) is int and 0<=i<len(names) for i in row[3]),'bundle index')
    result=list(dict.fromkeys(names[i] for i in row[3]))
    require(all(re.fullmatch('[a-zA-Z0-9_. -]+',n) and n==n.strip() and n not in ('.','..') for n in result),'bundle name')
    return result
def make_plan():
    v=read('furniture-visual-source-v3.0.1.json')
    a=read('furniture-addressables-v3.0.1.json')
    m=read('furniture-material-render-source-v3.0.1.json')
    c=json.loads((REPO/'public/inventory-ui/furniture-customization-v3.0.1.json').read_text(encoding='utf-8'))
    require([v['schema'],a['schema'],m['schema'],c['schema']]==['HKIA.FurnitureVisualSource.1','HKIA.FurnitureAddressablesSource.1','HKIA.FurnitureMaterialRenderSource.1','HKIA.FurnitureCustomizationSource.1'],'source schema')
    require(v['version']==a['version']==m['version']==c['gameVersion']=='3.0.1','source version')
    require(v['definitionsSha256']==a['visualDefinitionsSha256']==m['definitionsSha256']==c['source']['definitionSha256'] and a['catalogSha256']==m['catalogSha256'] and m['payloadPathId']==c['source']['payloadPathId'],'source identity')
    visuals=unique(v['rows'],lambda x:x[0]);locations=unique(a['rows'],lambda x:x[0]);materials=unique(m['rows'],lambda x:x[0]);catalog_mats=unique(c['materials'],lambda x:x[0]);sets=unique(c['sets'],lambda x:x[0]);items=unique(c['items'],lambda x:x[0]);patterns=unique(m['patterns'],lambda x:x[0])
    require(set(visuals)==set(items),'item coverage')
    models=[];used_patterns=defaultdict(set);used_materials=set();choice_count=0
    for item_id,i in sorted(items.items()):
        x=visuals[item_id]
        require(i[2]==x[1] and i[3]==x[2],'definition link')
        guid=x[6] or x[4]
        require(isinstance(guid,str) and re.fullmatch('[0-9a-f]{32}',guid) and guid in locations,'visual GUID')
        slots=[];seen=set()
        for slot in i[4]:
            n,_,default,set_ids=slot
            require(n in (0,1,2) and n not in seen,'slot identity');seen.add(n)
            choices=sorted({default,*(idx for k in set_ids for idx in sets[k][2])})
            choice_count+=len(choices)
            for idx in choices:
                mat=materials[idx];cm=catalog_mats[idx]
                require(mat[1]==cm[1] and mat[2]==cm[2] and mat[16]==cm[3],'material link')
                used_materials.add(idx)
                if mat[5] is not None:
                    require(mat[5] in patterns,'pattern link')
                    used_patterns[mat[5]].add(idx)
            slots.append({'slot':n,'choices':choices})
        models.append({'itemId':item_id,'detailsType':x[2],'guid':guid,'customizerOverride':x[6] is not None,'bundles':candidates(a,locations[guid]),'slots':slots})
    pats=[{'guid':g,'materialIndices':sorted(indices),'bundles':candidates(m,patterns[g])} for g,indices in sorted(used_patterns.items())]
    return {'schema':'HKIA.FurnitureBatchSourcePlan.1','version':'3.0.1','catalogSha256':a['catalogSha256'],'definitionsSha256':v['definitionsSha256'],'models':models,'patterns':pats,'counts':{'models':len(models),'ordinaryFurniture':sum(x['detailsType']==0 for x in models),'homeCustomization':sum(x['detailsType']==1 for x in models),'customizerOverrides':sum(x['customizerOverride'] for x in models),'modelFirstBundles':len({x['bundles'][0] for x in models}),'patternFirstBundles':len({x['bundles'][0] for x in pats}),'patterns':len(pats),'materials':len(used_materials),'slotChoices':choice_count}}
def locate(root,names):
    found=defaultdict(list)
    for directory,dirs,files in os.walk(root,followlinks=False):
        dirs.sort()
        for filename in sorted(files):
            name=filename.removesuffix('.bin')
            if name in names:
                p=Path(directory)/filename
                if p.is_file() and not p.is_symlink(): found[name].append(p)
    return found
def load_unique(paths):
    require(paths,'missing first catalog bundle')
    raw=paths[0].read_bytes()
    digest=sha(raw)
    for p in paths[1:]:
        with p.open('rb') as f: require(hashlib.file_digest(f,'sha256').hexdigest()==digest,'conflicting original bundle copies')
    return raw
def save_pair(out,key,suffix,meta,payload):
    require(len(payload)==meta.get('geometryBytes',meta.get('bytes')) and sha(payload)==meta.get('geometrySha256',meta.get('sha256')),'payload digest')
    # The outer stage is private and is only renamed on successful completion.
    (out/(str(key)+suffix)).write_bytes(payload)
    (out/(str(key)+'.json')).write_text(json.dumps(meta,separators=(',',':'))+'\n',encoding='utf-8')
def extract_batch(plan,root,out,kind,limit):
    model_rows=plan['models'] if kind in ('all','geometry') else []
    pattern_rows=plan['patterns'] if kind in ('all','pattern') else []
    if limit is not None:
        model_rows=model_rows[:limit];pattern_rows=pattern_rows[:limit]
    # The first catalog dependency is a candidate, not a proven asset owner.
    # All successes still require an exact container GUID and supported layout.
    groups=defaultdict(list)
    for typ,rows in [('geometry',model_rows),('pattern',pattern_rows)]:
        for row in rows:groups[row['bundles'][0]].append((typ,row))
    found=locate(root,set(groups))
    mesh=module('extract-furniture-mesh-source');audit=module('audit-native-dye-materials')
    cab_index=module('batch-furniture-base-materials').CabIndex(root,{n for r in model_rows for n in r['bundles']},module('resolve-unityfs-cabs').node_names) if model_rows else None
    pattern=module('extract-furniture-pattern-texture')
    chair=module('stage-furniture-chair-patterns');typed=module('extract-furniture-preview-camera')
    known_models=unique(read('furniture-mesh-source-sample-v3.0.1.json')['rows'],lambda x:x['itemId'])
    known_patterns=unique(read('furniture-pattern-texture-sample-v3.0.1.json')['rows'],lambda x:x['guid'])
    known_chair=unique(read('furniture-chair-pattern-sources-v3.0.1.json')['rows'],lambda x:x['guid'])
    results=[]
    for bundle,rows in sorted(groups.items()):
        raw=None;bundle_error=None;parsed=None
        try:raw=load_unique(found.get(bundle,[]))
        except (OSError,ValueError) as e:bundle_error=str(e)
        for typ,row in rows:
            key=row['itemId'] if typ=='geometry' else row['guid']
            receipt={'kind':typ,'key':key,'bundle':bundle,'guid':row['guid']}
            if bundle_error:
                results.append({**receipt,'status':'unresolved','reason':bundle_error});continue
            try:
                if typ=='geometry':
                    meta,payload=mesh.extract(raw,bundle,row['guid'],key,audit,resolve_cab=lambda cab:cab_index.resolve(cab,set(row['bundles'])))
                    if key in known_models:require(meta==known_models[key],'pinned geometry mismatch')
                    save_pair(out/'mesh',key,'.geometry.bin',meta,payload)
                elif key in known_chair:
                    meta=known_chair[key];require(meta['bundle']==bundle,'pinned pattern bundle mismatch')
                    payload=chair.extract(meta,raw,mesh,typed,audit)
                    save_pair(out/'pattern',key,'.texture.bin',meta,payload)
                else:
                    if parsed is None:
                        nodes=dict(audit.auditor.extract_nodes(raw)[1]);cabs=[n for n in nodes if re.fullmatch('CAB-[0-9a-f]{32}',n)]
                        require(len(cabs)==1,'one CAB required');cab=cabs[0]
                        parsed=(cab,list(audit.serialized_objects(nodes[cab],classes=(28,142))),nodes.get(cab+'.resS',b''))
                    metas,payloads=pattern.extract(raw,bundle,*parsed,{key})
                    meta=metas[key];payload=payloads[key]
                    if key in known_patterns:require(meta=={k:v for k,v in known_patterns[key].items() if k!='materialIndex'},'pinned pattern mismatch')
                    save_pair(out/'pattern',key,'.texture.bin',meta,payload)
                results.append({**receipt,'status':'extracted','bytes':len(payload),'sha256':sha(payload),'bundleSha256':meta['bundleSha256']})
            except Exception as e:
                # Unsupported format or missing native reference is a per-item
                # failure, never a substituted model. I/O errors abort staging.
                if isinstance(e,OSError):raise
                results.append({**receipt,'status':'unresolved','reason':f'{type(e).__name__}: {e}'[:300]})
        del raw,parsed
    return results
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--plan',action='store_true',help='print complete source plan without accessing game files')
    p.add_argument('--root',type=Path);p.add_argument('--catalog',type=Path);p.add_argument('--out',type=Path)
    p.add_argument('--kind',choices=('all','geometry','pattern'),default='all')
    p.add_argument('--limit',type=int,help='optional per-kind limit for local smoke')
    a=p.parse_args();plan=make_plan()
    if a.plan:
        print(json.dumps(plan,separators=(',',':')));return
    require(a.root and a.catalog and a.out,'--root --catalog --out required')
    require(a.limit is None or a.limit>0,'positive limit')
    root=a.root.resolve();catalog=a.catalog.resolve();out=a.out.resolve()
    require(root.is_dir() and catalog.is_file() and catalog.is_relative_to(root),'catalog must be in source tree')
    require(sha(catalog.read_bytes())==plan['catalogSha256'],'wrong original catalog')
    require(not out.exists() and not out.is_relative_to(REPO) and not out.is_relative_to(root),'new output outside source and repository')
    out.parent.mkdir(parents=True,exist_ok=True);tmp=Path(tempfile.mkdtemp(prefix='.furniture-batch-',dir=out.parent))
    try:
        for name in ('mesh','pattern'):(tmp/name).mkdir()
        results=extract_batch(plan,root,tmp,a.kind,a.limit)
        counts={typ:{status:sum(x['kind']==typ and x['status']==status for x in results) for status in ('extracted','unresolved')} for typ in ('geometry','pattern')}
        # Exact known sample hashes are checked. Other extracted bundle hashes
        # are observed receipts, not pre-pinned v3.0.1 authenticity guarantees.
        report={'schema':'HKIA.FurnitureBatchExtraction.1','version':'3.0.1','catalogSha256':plan['catalogSha256'],'sourcePlanCounts':plan['counts'],'counts':counts,'results':results,'renderFidelity':'unverified'}
        (tmp/'report.json').write_text(json.dumps(report,separators=(',',':'))+'\n',encoding='utf-8')
        require(not out.exists(),'output exists');tmp.rename(out)
        print(json.dumps(counts),flush=True)
    finally:
        if tmp.exists():shutil.rmtree(tmp)
if __name__=='__main__':main()
