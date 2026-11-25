#!/usr/bin/env python3
"""Stage the original v3.0.1 furniture payloads locally, without publishing them.
Usage: python scripts/stage-furniture-native-assets.py --root <Steam game tree> --out <new directory outside repo>
The existing extractors and committed source manifests remain authoritative.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

REPO=Path(__file__).resolve().parent.parent
DATA=REPO/'data'
SCRIPTS=REPO/'scripts'

def read(name):
    return json.loads((DATA/name).read_text(encoding='utf-8'))

def sha(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f,'sha256').hexdigest()

def require(condition,message):
    if not condition:
        raise ValueError(message)

def required_bundles(base,geometry,patterns,lights):
    result={}
    def add(name,digest):
        require(Path(name).name==name and len(digest)==64 and all(c in '0123456789abcdef' for c in digest),'invalid source identity')
        require(name not in result or result[name]==digest,'conflicting bundle digest: '+name)
        result[name]=digest
    for name,digest in base['bundles'].values():
        add(name,digest)
    for row in geometry['rows']+patterns['rows']:
        add(row['bundle'],row['bundleSha256'])
    add('scenes_interior_furniturecustomizer_vis_d3967c85',lights['sceneSha256'])
    add('networkedprototypes',lights['presetBundleSha256'])
    return result

def locate(root,expected):
    candidates={name:[] for name in expected}
    for directory,dirs,files in os.walk(root,followlinks=False):
        dirs.sort()
        for filename in files:
            name=filename.removesuffix('.bin')
            if name in expected:
                p=Path(directory)/filename
                if not p.is_symlink() and p.is_file():
                    candidates[name].append(p)
    result={}
    for name,digest in expected.items():
        matches=[p for p in sorted(candidates[name]) if sha(p)==digest]
        require(matches,'missing original or wrong v3.0.1 hash: '+name)
        # Multiple copies with identical verified bytes are equivalent.
        result[name]=matches[0]
    return result

def run(script,*args):
    subprocess.run([sys.executable,str(SCRIPTS/script),*map(str,args)],check=True)

def verify_file(path,size,digest):
    require(path.is_file() and path.stat().st_size==size and sha(path)==digest,'source payload mismatch: '+path.name)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--plan',action='store_true',help='locate and hash required bundles without extracting')
    a=p.parse_args()
    root=a.root.resolve();out=a.out.resolve()
    require(root.is_dir(),'source directory does not exist')
    require(not out.is_relative_to(REPO) and not out.is_relative_to(root),'stage outside both repository and original game tree')
    require(not out.exists(),'output directory already exists')
    base=read('furniture-base-material-source-v3.0.1.json')
    geometry=read('furniture-mesh-source-sample-v3.0.1.json')
    patterns=read('furniture-pattern-texture-sample-v3.0.1.json')
    lights=read('furniture-light-region-source-v3.0.1.json')
    require(all(x['version']=='3.0.1' for x in (base,geometry,patterns,lights)),'source version')
    expected=required_bundles(base,geometry,patterns,lights)
    bundles=locate(root,expected)
    print(json.dumps({'version':'3.0.1','verifiedBundles':len(bundles),'names':sorted(bundles)},indent=2),flush=True)
    if a.plan:
        return
    out.parent.mkdir(parents=True,exist_ok=True)
    tmp=Path(tempfile.mkdtemp(prefix='.furniture-stage-',dir=out.parent))
    try:
        for name in ('mesh','base','pattern','cube'):
            (tmp/name).mkdir()
        for row in geometry['rows']:
            run('extract-furniture-mesh-source.py',bundles[row['bundle']],DATA/'furniture-visual-source-v3.0.1.json',DATA/'furniture-addressables-v3.0.1.json','--item-id',row['itemId'],'--out',tmp/'mesh')
            verify_file(tmp/'mesh'/f"{row['itemId']}.geometry.bin",row['geometryBytes'],row['geometrySha256'])
            require(json.loads((tmp/'mesh'/f"{row['itemId']}.json").read_text())==row,'mesh manifest mismatch')
        run('extract-furniture-base-material-source.py',DATA/'furniture-mesh-source-sample-v3.0.1.json',*[bundles[name] for name,digest in base['bundles'].values()],'--out',tmp/'base')
        require(json.loads((tmp/'base'/'furniture-base-material-source-v3.0.1.json').read_text())==base,'base manifest mismatch')
        for tex in base['textures'].values():
            verify_file(tmp/'base'/(tex['sha256']+'.texture.bin'),tex['bytes'],tex['sha256'])
        groups={}
        for row in patterns['rows']:
            groups.setdefault(row['bundle'],[]).append(row)
        for bundle,rows in groups.items():
            run('extract-furniture-pattern-texture.py',bundles[bundle],DATA/'furniture-material-render-source-v3.0.1.json',*[v for row in rows for v in ('--guid',row['guid'])],'--out',tmp/'pattern')
            for row in rows:
                verify_file(tmp/'pattern'/(row['guid']+'.texture.bin'),row['bytes'],row['sha256'])
                observed=json.loads((tmp/'pattern'/(row['guid']+'.json')).read_text())
                require(observed=={k:v for k,v in row.items() if k!='materialIndex'},'pattern manifest mismatch')
        run('extract-furniture-light-region-source.py',bundles['scenes_interior_furniturecustomizer_vis_d3967c85'],bundles['networkedprototypes'],'--out',tmp/'cube'/'furniture-light-region-source-v3.0.1.json','--staging',tmp/'cube')
        require(json.loads((tmp/'cube'/'furniture-light-region-source-v3.0.1.json').read_text())==lights,'light manifest mismatch')
        for cube in lights['cubemaps'].values():
            verify_file(tmp/'cube'/(cube['sha256']+'.cubemap.bin'),cube['bytes'],cube['sha256'])
        require(not out.exists(),'output directory appeared during extraction')
        tmp.rename(out)
    finally:
        if tmp.exists():
            shutil.rmtree(tmp)
    print(json.dumps({'status':'verified-staging','geometry':len(geometry['rows']),'baseTextures':len(base['textures']),'patternTextures':len(patterns['rows']),'cubemaps':len(lights['cubemaps']),'directory':str(out)},indent=2))

if __name__=='__main__':
    main()
