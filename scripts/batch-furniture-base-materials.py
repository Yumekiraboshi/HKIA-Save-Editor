#!/usr/bin/env python3
"""Resolve the base material dependency closure of extracted furniture models.
Original asset tree only; one model at a time, no publication or rendered images.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
import tempfile
from pathlib import Path
from collections import defaultdict

REPO=Path(__file__).resolve().parent.parent
def read(path):return json.loads(path.read_text(encoding='utf-8'))
def require(ok,msg):
    if not ok:raise ValueError(msg)
def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def digest(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

class CabIndex:
    def __init__(self,root,names,node_names):
        self.by_cab=defaultdict(list);self.invalid=0
        for directory,dirs,files in os.walk(root,followlinks=False):
            dirs.sort()
            for filename in sorted(files):
                name=filename.removesuffix('.bin')
                if name not in names:continue
                p=Path(directory)/filename
                if p.is_symlink() or not p.is_file():continue
                try:
                    cabs=[x for x in node_names(p) if re.fullmatch('CAB-[0-9a-f]{32}',x)]
                except Exception:
                    self.invalid+=1;continue
                if len(cabs)==1:self.by_cab[cabs[0]].append((name,p))
    def resolve(self,cab,allowed):
        matches=[(name,p) for name,p in self.by_cab.get(cab,[]) if name in allowed]
        if not matches:return None
        first=matches[0][1]
        if len(matches)>1:
            h=digest(first)
            require(all(digest(p)==h for _,p in matches[1:]),'ambiguous native CAB '+cab)
        return first

def extract_one(row,allowed,index,base,mesh,audit,shader,out,bundle_cache=None):
    # Exact material, texture and shader PPtrs determine which CABs are
    # opened. The original catalog limits all candidate source bundles.
    result=base.extract([],{'rows':[row]},mesh,audit,shader,out,resolve_cab=lambda cab:index.resolve(cab,allowed),bundle_cache=bundle_cache)
    require(not result['unresolved'],'unresolved original objects: '+','.join(result['unresolved']))
    require(len(result['rows'])==1 and result['rows'][0]['itemId']==row['itemId'],'material row identity')
    for rid,key,slot in result['rows'][0]['bindings']:
        require(key in result['materials'],'material reference')
    expected={n['rendererPathId']:n for n in row['nodes'] if 'materialSlots' in n}
    observed=result['rows'][0].get('submeshBindings',[])
    require(len(observed)==len(expected) and {r['rendererPathId'] for r in observed}==set(expected),'submesh binding coverage')
    for r in observed:
        node=expected[r['rendererPathId']]
        keys=[]
        for value in node['materialSlots']:
            file,pid=value.split(':');file=int(file)
            keys.append((row['cab'] if file==0 else row['externals'][file-1].split('/')[-1])+':'+pid)
        require(r['materials']==keys and r['slot']==node['slot'] and all(k in result['materials'] for k in keys),'submesh material order')
    for mat in result['materials'].values():
        require(mat['shader'] in result['shaders'],'shader reference')
        require(all(link['texture'] is None or link['texture'] in result['textures'] for link in mat['textures'].values()),'texture reference')
    for tex in result['textures'].values():
        p=out/(tex['sha256']+'.texture.bin')
        require(p.stat().st_size==tex['bytes'] and digest(p)==tex['sha256'],'texture payload')
    return result

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for key in ('root','catalog','batch','out'):p.add_argument('--'+key,type=Path,required=True)
    p.add_argument('--item-id',type=int,action='append')
    a=p.parse_args();root=a.root.resolve();batch=a.batch.resolve();out=a.out.resolve();catalog=a.catalog.resolve()
    require(root.is_dir() and batch.is_dir() and catalog.is_file() and catalog.is_relative_to(root),'source paths')
    require(not out.exists() and all(not out.is_relative_to(x) for x in (REPO,root,batch)),'new output outside source and repository')
    v=read(REPO/'data/furniture-visual-source-v3.0.1.json');ad=read(REPO/'data/furniture-addressables-v3.0.1.json')
    require(v['version']==ad['version']=='3.0.1' and v['definitionsSha256']==ad['visualDefinitionsSha256'] and digest(catalog)==ad['catalogSha256'],'source identity')
    report=read(batch/'report.json')
    require(report['schema']=='HKIA.FurnitureBatchExtraction.1' and report['version']=='3.0.1' and report['catalogSha256']==ad['catalogSha256'],'batch identity')
    visual={r[0]:r for r in v['rows']};locations={r[0]:r[3] for r in ad['rows']}
    planned=[];seen=set()
    for receipt in report['results']:
        if receipt['kind']!='geometry' or receipt['status']!='extracted':continue
        id=receipt['key']
        if a.item_id and id not in a.item_id:continue
        require(type(id) is int and id in visual and id not in seen,'geometry identity');seen.add(id)
        r=visual[id];guid=r[6] or r[4]
        allowed={ad['bundleNames'][i] for i in locations[guid]}
        row=read(batch/'mesh'/(str(id)+'.json'))
        require(row['schema']=='HKIA.FurnitureStaticMeshSource.1' and row['version']=='3.0.1' and row['itemId']==id and row['visualGuid']==guid and row['bundle'] in allowed and row['bundleSha256']==receipt['bundleSha256'],'geometry source binding')
        payload=batch/'mesh'/(str(id)+'.geometry.bin')
        require(payload.stat().st_size==row['geometryBytes']==receipt['bytes'] and digest(payload)==row['geometrySha256']==receipt['sha256'],'geometry payload')
        planned.append((row,allowed))
    require(planned,'no extracted geometry selected')
    base=module('extract-furniture-base-material-source');mesh=module('extract-furniture-mesh-source')
    audit=module('audit-native-dye-materials');shader=module('audit-native-character-shader')
    index=CabIndex(root,set().union(*(allowed for _,allowed in planned)),module('resolve-unityfs-cabs').node_names)
    out.parent.mkdir(parents=True,exist_ok=True);tmp=Path(tempfile.mkdtemp(prefix='.furniture-materials-',dir=out.parent))
    receipts=[]
    bundle_cache=base.MaterialBundleCache()
    try:
        (tmp/'items').mkdir();(tmp/'texture').mkdir()
        for row,allowed in planned:
            id=row['itemId'];stage=Path(tempfile.mkdtemp(prefix='.item-',dir=tmp))
            try:
                result=extract_one(row,allowed,index,base,mesh,audit,shader,stage,bundle_cache)
                for p in stage.glob('*.texture.bin'):
                    dest=tmp/'texture'/p.name
                    if dest.exists():require(digest(dest)==digest(p),'texture digest collision')
                    else:p.rename(dest)
                (tmp/'items'/(str(id)+'.json')).write_text(json.dumps(result,separators=(',',':'))+'\n',encoding='utf-8')
                receipts.append({'itemId':id,'status':'extracted','materials':len(result['materials']),'textures':len(result['textures']),'shaders':len(result['shaders'])})
            except Exception as e:
                if isinstance(e,OSError):raise
                receipts.append({'itemId':id,'status':'unresolved','reason':f'{type(e).__name__}: {e}'[:500]})
            finally:shutil.rmtree(stage)
        result={'schema':'HKIA.FurnitureBatchMaterials.1','version':'3.0.1','catalogSha256':ad['catalogSha256'],'invalidBundleHeaders':index.invalid,'items':receipts,'renderFidelity':'unverified'}
        (tmp/'report.json').write_text(json.dumps(result,separators=(',',':'))+'\n',encoding='utf-8')
        require(not out.exists(),'output exists');tmp.rename(out)
    finally:
        if tmp.exists():shutil.rmtree(tmp)
    print(json.dumps({'extracted':sum(x['status']=='extracted' for x in receipts),'unresolved':sum(x['status']=='unresolved' for x in receipts)}))
if __name__=='__main__':main()
