#!/usr/bin/env python3
"""Bind staged source pages to the original per-family renderer inputs.

Never author a release pin or overwrite public assets. The output is a
candidate-only source descriptor for the shared browser renderer.
"""
import argparse
import importlib.util
from pathlib import Path
def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
source=module('icon-source-update')
require,sha=source.require,source.digest

def checked(path,schema):
    v=source.read_json(path)
    body={k:x for k,x in v.items() if k!='receiptSha256'}
    require(v.get('schema')==schema and v.get('approval')=='review-required' and
            v.get('receiptSha256')==sha(source.stable(body)),'stage identity: '+schema)
    return v

def compile_bindings(dynamic,aux,assets,dynamic_hash,aux_hash):
    require(dynamic['version']==aux['version']==assets['version'] and
            dynamic['platform']==aux['platform']==assets['platform'] and
            dynamic['definitionSnapshotSha256']==aux['definitionSnapshotSha256']==assets['definitionSnapshotSha256'] and
            assets['auxiliaryReceiptSha256']==aux['receiptSha256'],'auxiliary/dynamic source identity')
    require(source.SHA.fullmatch(dynamic_hash) and source.SHA.fullmatch(aux_hash) and
            aux_hash==assets['pageIndexSha256'],'source page digest')
    rows=[]
    for r in dynamic['rows']:
        rows.append({'itemId':r['itemId'],'family':r['family'],
                     'baseSpritePathId':r['baseSprite']['pathId'],'maskGuid':r['directMask']['guid'],
                     'flowerMasks':[{'patternIndex':m['patternIndex'],'maskGuid':m['guid']} for m in r['flowerMasks']]})
    by_id={r['itemId']:r['family'] for r in rows}
    require(len(by_id)==len(rows),'duplicate family')
    require({r['itemId'] for r in aux['flowerGrowth']}=={i for i,f in by_id.items() if f=='flower'} and
            {r['itemId'] for r in aux['wandTransforms']}=={i for i,f in by_id.items() if f=='wand'},
            'growth/wand definition coverage')
    expected={i:s for i,s in aux['colorSwatchReferences']}
    resolved={r['characteristicId']:r['swatchId'] for r in assets['chefColors']}
    missing={r['characteristicId']:r['swatchId'] for r in assets['unresolvedSwatches']}
    require(len(resolved)==len(assets['chefColors']) and len(missing)==len(assets['unresolvedSwatches']) and
            not set(resolved)&set(missing) and {**resolved,**missing}==expected,'swatch coverage')
    return {'schema':'HKIA.IconFamilyBindingsCandidate.1','approval':'review-required','version':dynamic['version'],
            'platform':dynamic['platform'],'definitionSnapshotSha256':dynamic['definitionSnapshotSha256'],
            'dynamicIndexSha256':dynamic_hash,'auxiliaryIndexSha256':aux_hash,
            'rows':sorted(rows,key=lambda r:r['itemId']),
            'flowerColors':[{'index':r['index'],'rgba':r['rgba']} for r in dynamic['flowerColors']],
            'flowerPatterns':[{'index':r['index'],'isEffect':r['isEffect']} for r in dynamic['flowerPatterns']],
            'knownCharacteristicIds':sorted(r[0] for r in aux['characteristics']),
            'chefMappedIds':sorted(expected),'chefColors':assets['chefColors'],
            'magic':aux['magic'],'flecks':aux['flecks'],'growthItemIds':sorted(r['itemId'] for r in aux['flowerGrowth']),
            'wandTransforms':aux['wandTransforms'],'unresolvedSwatches':assets['unresolvedSwatches'],
            'automaticReleaseActivationAuthorized':False}

def run(dynamic_path,aux_path,assets_dir,release_dir,out):
    dynamic=checked(dynamic_path,'HKIA.DynamicIconSourceCandidate.1')
    aux=checked(aux_path,'HKIA.IconAuxiliarySourceCandidate.1')
    assets=checked(assets_dir/'index.json','HKIA.IconAuxiliaryAssetStage.1')
    release=checked(release_dir/'release-candidate.json','HKIA.IconReleaseCandidate.1')
    require(release['version']==dynamic['version'] and release['platform']==dynamic['platform'] and
            release['snapshotSha256']==dynamic['definitionSnapshotSha256'] and
            release['inputReceipts']['dynamicBindings']==dynamic['receiptSha256'],'release source identity')
    rel='dynamic-source-pages/index.json'
    digest=source.file_digest(release_dir/rel)
    require(digest==release['outputFiles'][rel]['sha256'],'release source index digest')
    auxiliary_digest=source.file_digest(assets_dir/rel)
    value=compile_bindings(dynamic,aux,assets,digest,auxiliary_digest)
    require(out.resolve()!=source.ROOT and source.ROOT not in out.resolve().parents,
            'candidate manifest must stay outside repository')
    source.write_new(out,value)
    print('HKIA_ICON_FAMILY_BINDINGS',len(value['rows']),'dynamic definitions',
          len(value['unresolvedSwatches']),'unresolved swatches',source.file_digest(out))

def self_test():
    common={'version':'9.1.0','platform':'steam','definitionSnapshotSha256':'c'*64}
    dynamic={**common,'rows':[],'flowerColors':[],'flowerPatterns':[]}
    aux={**common,'receiptSha256':'b'*64,'flowerGrowth':[],'wandTransforms':[],
         'colorSwatchReferences':[[4,9]],'characteristics':[[4,'char_color','']],
         'magic':[],'flecks':[]}
    assets={**common,'auxiliaryReceiptSha256':'b'*64,'pageIndexSha256':'a'*64,
            'chefColors':[],'unresolvedSwatches':[{'characteristicId':4,'swatchId':9}]}
    v=compile_bindings(dynamic,aux,assets,'d'*64,'a'*64)
    assert v['chefMappedIds']==[4] and not v['chefColors'] and not v['automaticReleaseActivationAuthorized']
    try:compile_bindings(dynamic,aux,{**assets,'unresolvedSwatches':[]},'d'*64,'a'*64)
    except ValueError:pass
    else:raise AssertionError('accepted missing required swatch')
    print('HKIA_ICON_FAMILY_BINDINGS_SELF_TEST_OK')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('dynamic','auxiliary','auxiliary-stage','release','out'):p.add_argument('--'+name,type=Path)
    p.add_argument('--self-test',action='store_true')
    a=p.parse_args()
    if a.self_test:self_test()
    elif all((a.dynamic,a.auxiliary,a.auxiliary_stage,a.release,a.out)):
        run(a.dynamic,a.auxiliary,a.auxiliary_stage,a.release,a.out)
    else:p.error('provide all candidate receipts and output')
