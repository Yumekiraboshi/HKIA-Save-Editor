#!/usr/bin/env python3
"""Turn existing geometry/pattern and material batch receipts into one source
pack without copying private game bundles or inventing incomplete models.
Optionally merge the previous independently pinned unified source pack.
"""
import argparse
import hashlib
import importlib.util
import json
import tempfile
import zipfile
from pathlib import Path

def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
batch=module('batch-furniture-native-source')
assembler=module('assemble-furniture-source-pack')
require=assembler.require
def read(p):
    return json.loads(p.read_text(encoding='utf-8'))
def identity(report,schema,plan):
    require(report['schema']==schema and report['version']==plan['version'] and
            report['catalogSha256']==plan['catalogSha256'] and
            report['renderFidelity']=='unverified','BATCH_IDENTITY')
def pack_batches(plan,source,materials,out,prior=None,prior_sha=None):
    require(bool(prior)==bool(prior_sha),'PRIOR_PIN_REQUIRED')
    require(not out.exists() and not out.is_symlink(),'OUTPUT_EXISTS')
    require(all(not out.resolve().is_relative_to(x.resolve()) for x in
                (source,materials,batch.REPO)),'OUTPUT_INSIDE_SOURCE')
    if prior:plan=batch.remaining_plan(plan,prior,prior_sha)
    src=read(source/'report.json');mat=read(materials/'report.json')
    identity(src,'HKIA.FurnitureBatchExtraction.1',plan)
    identity(mat,'HKIA.FurnitureBatchMaterials.1',plan)
    models=batch.unique(plan['models'],lambda r:r['itemId'])
    patterns=batch.unique(plan['patterns'],lambda r:r['guid'])
    receipts=batch.unique(src['results'],lambda r:(r['kind'],r['key']))
    closed=batch.unique(mat['items'],lambda r:r['itemId'])
    # Existing pack exclusion is optional at extraction time. Reject overlap
    # here: the delta must consist of the exact selected missing identities.
    for (kind,key),r in receipts.items():
        require(kind in ('geometry','pattern') and key in (models if kind=='geometry' else patterns)
                and r['status'] in ('extracted','unresolved'),'RECEIPT_IDENTITY')
    for id,r in closed.items():
        require(id in models and ('geometry',id) in receipts and
                receipts[('geometry',id)]['status']=='extracted' and
                r['status'] in ('extracted','unresolved'),'MATERIAL_RECEIPT')
    stage={'schema':'HKIA.LocalFurnitureSourceStage.1','version':plan['version'],
           'catalogSha256':plan['catalogSha256'],'renderFidelity':'unverified',
           'models':[],'patterns':[]}
    omitted=[];written=set()
    with tempfile.TemporaryDirectory(prefix='hkia-batch-pack-') as d:
        p=Path(d)/'delta.zip'
        with zipfile.ZipFile(p,'x',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
            def add(kind,digest,n,path):
                require(type(n)==int and 0<n<=assembler.LIMIT and
                        path.is_file() and not path.is_symlink() and path.stat().st_size==n,'BATCH_PAYLOAD_LENGTH')
                raw=path.read_bytes();require(len(raw)==n and assembler.sha(raw)==digest,'BATCH_PAYLOAD_HASH')
                name=f'{kind}/{digest}.bin'
                if name not in written:z.writestr(name,raw);written.add(name)
            for (kind,key),receipt in sorted(receipts.items()):
                if receipt['status']!='extracted' or kind=='geometry' and closed.get(key,{}).get('status')!='extracted':
                    omitted.append({'kind':kind,'key':key,'reason':'source or material closure unresolved'});continue
                planned=(models if kind=='geometry' else patterns)[key]
                folder=source/('mesh' if kind=='geometry' else 'pattern')
                meta=read(folder/(str(key)+'.json'))
                require(meta['bundle'] in planned['bundles'] and
                        meta['bundle']==receipt['bundle'] and
                        meta['bundleSha256']==receipt['bundleSha256'] and
                        receipt['guid']==planned['guid'],'BATCH_BUNDLE_BINDING')
                if kind=='geometry':
                    require(meta['itemId']==key and meta['visualGuid']==planned['guid'] and
                            meta['geometrySha256']==receipt['sha256'] and meta['geometryBytes']==receipt['bytes'],'GEOMETRY_RECEIPT')
                    base=read(materials/'items'/(str(key)+'.json'))
                    require(len(base['rows'])==1 and base['rows'][0]['itemId']==key and
                            base['bundles'].get(meta['cab'])==[meta['bundle'],meta['bundleSha256']] and
                            not base['unresolved'],'MATERIAL_CLOSURE')
                    add('geometry',meta['geometrySha256'],meta['geometryBytes'],folder/(str(key)+'.geometry.bin'))
                    for t in base['textures'].values():
                        add('texture',t['sha256'],t['bytes'],materials/'texture'/(t['sha256']+'.texture.bin'))
                    stage['models'].append({'geometry':meta,'base':base})
                else:
                    require(meta['guid']==key and meta['sha256']==receipt['sha256'] and meta['bytes']==receipt['bytes'],'PATTERN_RECEIPT')
                    add('texture',meta['sha256'],meta['bytes'],folder/(key+'.texture.bin'))
                    stage['patterns'].append(meta)
            require(stage['models'] or stage['patterns'],'NO_NEW_COMPLETE_SOURCE')
            z.writestr('local-source-manifest.json',json.dumps(stage,separators=(',',':'),allow_nan=False))
        # Snapshot the previous ZIP before handing it to the assembler.
        inputs=[]
        if prior:
            snapshot=Path(d)/'previous.zip'
            h=hashlib.sha256()
            with prior.open('rb') as f,snapshot.open('xb') as dst:
                while chunk:=f.read(1024*1024):h.update(chunk);dst.write(chunk)
            require(h.hexdigest()==prior_sha,'PRIOR_PACK_CHANGED')
            inputs.append(snapshot)
        result=assembler.assemble([*inputs,p],out)
    return {**result,'addedModels':len(stage['models']),'addedPatterns':len(stage['patterns']),
            'omitted':omitted,'renderFidelity':'unverified'}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('source','materials','out'):p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--prior',type=Path);p.add_argument('--prior-sha256')
    a=p.parse_args()
    print(json.dumps(pack_batches(batch.make_plan(),a.source,a.materials,a.out,a.prior,a.prior_sha256)))
