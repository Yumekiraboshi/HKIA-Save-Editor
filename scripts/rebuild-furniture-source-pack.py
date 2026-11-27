#!/usr/bin/env python3
"""Build a local furniture source pack from the original Steam tree.
No network, publication, game modification, save reads or generated thumbnails.
"""
import argparse
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
REPO=HERE.parent

def module(name):
    s=importlib.util.spec_from_file_location(name,HERE/(name+'.py'))
    m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

source=module('stage-furniture-native-assets')
batch=module('batch-furniture-native-source')
packer=module('pack-furniture-batches')
stager=module('stage-furniture-source-pack')
require=source.require

def discover(root,catalog=None):
    plan=batch.make_plan()
    light=source.read('furniture-light-region-source-v3.0.1.json')
    expected={'scenes_interior_furniturecustomizer_vis_d3967c85':light['sceneSha256'],
              'networkedprototypes':light['presetBundleSha256']}
    if catalog is None:expected['catalog']=plan['catalogSha256']
    paths=source.locate(root,expected)
    catalog=catalog if catalog is not None else paths['catalog']
    require(catalog.is_file() and not catalog.is_symlink() and catalog.resolve().is_relative_to(root)
            and source.sha(catalog)==plan['catalogSha256'],'wrong original catalog')
    return plan,catalog,paths

def run(script,*args):
    print('Stage: '+script,flush=True)
    subprocess.run([sys.executable,str(HERE/script),*map(str,args)],check=True)

def read(path):
    return json.loads(path.read_text(encoding='utf-8'))

def rebuild(root,out,catalog=None,prior=None,prior_sha=None,limit=None,run_stage=run):
    root=root.resolve();out=out.resolve()
    require(root.is_dir() and not out.exists() and not out.is_symlink() and
            not out.is_relative_to(REPO) and not out.is_relative_to(root),'new output outside repository and original source')
    require(bool(prior)==bool(prior_sha),'prior pack and independent hash required together')
    require(limit is None or type(limit) is int and limit>0,'positive limit')
    plan,catalog,paths=discover(root,catalog)
    remaining=batch.remaining_plan(plan,prior,prior_sha) if prior else plan
    require(remaining['models'] or remaining['patterns'],'no remaining source identities')
    out.mkdir(parents=True,exist_ok=False)
    print('Source identities: '+json.dumps({'models':len(remaining['models']),'patterns':len(remaining['patterns'])}),flush=True)
    geometry=out/'batch';materials=out/'materials';lighting=out/'lighting'
    args=['--root',root,'--catalog',catalog,'--out',geometry]
    if prior:args+=['--remaining-from',prior,'--remaining-sha256',prior_sha]
    if limit is not None:args+=['--limit',limit]
    run_stage('batch-furniture-native-source.py',*args)
    report=read(geometry/'report.json')
    pack_materials=None
    if any(r['kind']=='geometry' and r['status']=='extracted' for r in report['results']):
        run_stage('batch-furniture-base-materials.py','--root',root,'--catalog',catalog,'--batch',geometry,'--out',materials)
        pack_materials=materials
    run_stage('extract-furniture-light-region-source.py',paths['scenes_interior_furniturecustomizer_vis_d3967c85'],
              paths['networkedprototypes'],'--out',lighting/'furniture-light-region-source-v3.0.1.json','--staging',lighting)
    zip_path=out/'furniture-source.zip'
    print('Stage: assemble verified geometry/material/pattern/cube payloads',flush=True)
    packed=packer.pack_batches(plan,geometry,pack_materials,zip_path,prior,prior_sha,lighting)
    pin=source.sha(zip_path)
    result={'schema':'HKIA.FurnitureLocalRebuild.1','version':'3.0.1','zipSha256':pin,
            'pack':packed,'sourcePlanCounts':plan['counts'],'renderFidelity':'unverified'}
    if packed['models']:
        print('Stage: verify and stage lazy browser payloads',flush=True)
        result['staged']=stager.stage(zip_path,out/'staged',pin)
    # Exclusive report only after every requested stage succeeds.
    with (out/'result.json').open('x',encoding='utf-8') as f:json.dump(result,f,separators=(',',':'));f.write('\n')
    print(json.dumps(result),flush=True)
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,required=True,help='Steam Hello Kitty_Data directory or equivalent original tree')
    p.add_argument('--out',type=Path,required=True,help='new private output directory outside source and repo')
    p.add_argument('--catalog',type=Path,help='optional explicit catalog path inside source tree; otherwise exact hash discovery')
    p.add_argument('--prior',type=Path);p.add_argument('--prior-sha256')
    p.add_argument('--limit',type=int,help='optional small per-kind diagnostic extraction')
    a=p.parse_args()
    rebuild(a.root,a.out,a.catalog,a.prior,a.prior_sha256,a.limit)
