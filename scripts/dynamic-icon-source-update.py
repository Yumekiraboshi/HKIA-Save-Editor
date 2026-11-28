#!/usr/bin/env python3
"""Extract candidate dynamic icon bindings and exact configuration identities.

Usage:
  python scripts/dynamic-icon-source-update.py scan --snapshot candidate.json
      --definitions definitions.bin --out dynamic.json
  python scripts/dynamic-icon-source-update.py diff --before old.json
      --after dynamic.json --out dynamic-delta.json

A candidate release must use --reviewed-layout native-dynamic-v1 after
reviewing native managed layouts. No new release or generated image is
automatically approved. Only source metadata is emitted.
"""
import argparse
import importlib.util
import json
import math
import re
import struct
from pathlib import Path

HERE = Path(__file__).resolve().parent
def module(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + '.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

source = module('icon-source-update')
helpers = module('extract-native-result-icons')
mesh = helpers.module('extract-furniture-mesh-source')
typed = helpers.module('extract-furniture-preview-camera')
audit = helpers.module('unityfs-audit')
require, sha = source.require, source.digest
SCHEMA = 'HKIA.DynamicIconSourceCandidate.1'
LAYOUT = 'native-dynamic-v1'
GUID = re.compile('[0-9a-f]{32}')

def asset_reference(raw, p=0):
    guid, p = mesh.string(raw, p)
    sub, p = mesh.string(raw, p)
    sub_type, p = mesh.string(raw, p)
    require(not guid or GUID.fullmatch(guid), 'invalid original AssetReference GUID')
    require(guid or not(sub or sub_type), 'null AssetReference subobject')
    return {'guid':guid or None,'subObjectName':sub,'subObjectType':sub_type}, p

def managed_details(fields):
    raw = fields['references']
    if len(raw) <= 8:
        return '', len(raw)
    require(struct.unpack_from('<II',raw) == (2,1) and
            raw[8:16] == fields['Details'], 'unsupported managed reference shape')
    cls,p = mesh.string(raw,16)
    if cls:
        ns,p = mesh.string(raw,p)
        asm,p = mesh.string(raw,p)
        require(ns == 'Sunblink.Game' and asm == 'Assembly-CSharp', 'managed type identity')
    return cls,p

def flower_bindings(raw, start, pattern_by_pid):
    """Find one complete native PatternIcon dictionary, not loose GUID hits.

    The reviewed v1 layout has a count, local FlowerPatternDefinition PPtr
    plus AssetReferenceSprite per entry, and a last null-pattern reference.
    Variable-length references are walked. All pattern IDs come from actual
    typed pattern definitions, never from a name or an ordinal guess.
    """
    candidates = []
    for at in range(start,len(raw)-4,4):
        n = mesh.u(raw,at)
        p = at+4
        if not 1 <= n <= 128 or p+24*n > len(raw):
            continue
        rows = []
        try:
            for _ in range(n):
                file_id,pid = mesh.ptr(raw,p)
                p += 12
                require(file_id == 0 and (pid == '0' or pid in pattern_by_pid),
                        'unsupported pattern PPtr')
                ref,p = asset_reference(raw,p)
                require(ref['guid'] and not ref['subObjectName'] and not ref['subObjectType'],
                        'unsupported flower pattern mask reference')
                pattern = 0 if pid == '0' else pattern_by_pid[pid]['index']
                rows.append({'patternIndex':pattern,'patternPathId':pid,**ref})
            require(rows[-1]['patternIndex'] == 0 and
                    len({r['patternIndex'] for r in rows}) == n and len(raw)-p >= 64,
                    'unsupported flower dictionary boundary')
        except (ValueError,KeyError,struct.error,UnicodeError):
            continue
        candidates.append((at,p,rows))
    require(len(candidates)==1, 'ambiguous or unsupported native flower mask dictionary')
    at,end,rows = candidates[0]
    return rows,sha(raw[at:end])

def config_record(pid,tree,raw,fields,index_key=None):
    rec = {'pathId':pid,'name':mesh.string(fields['m_Name'])[0],
           'objectSha256':sha(raw),'schemaSha256':sha(source.stable(tree)),
           'fieldSha256':{k:sha(v) for k,v in fields.items()}}
    if index_key:
        rec['index']=mesh.u(fields[index_key])
        require(rec['index']>0,'invalid config index')
    return rec

def scan(snapshot, definitions_path, reviewed_layout):
    items = source.validate_snapshot(snapshot)
    pinned = snapshot['version']=='3.0.1' and snapshot['platform']=='switch'
    require(pinned or reviewed_layout==LAYOUT,'review native dynamic layout before scanning')
    require(definitions_path.stat().st_size<=audit.MAX_INPUT,'definition bundle too large')
    data = definitions_path.read_bytes()
    require(sha(data)==snapshot['sourceBundleSha256']['definitions'],'definition source mismatch')
    _,nodes = audit.extract_nodes(data)
    cab=snapshot['definitionsCab']
    serialized=dict(nodes)[cab]
    require(sha(serialized)==snapshot['definitionsCabSha256'],'definition CAB mismatch')
    objects,_=typed.load(serialized,mesh)
    patterns,colors,configs={}, {}, {}
    by_pid={}
    for pid,(cls,tree,raw) in objects.items():
        if cls!=114:
            continue
        fields={n[2] for n in tree[-1]}
        role = ('flowerPattern' if {'PatternIndex','IsEffect','SerializedGuid'}<=fields else
                'flowerColor' if {'ColorIndex','Color','SerializedGuid'}<=fields else
                'characteristics' if {'Characteristics','ColorCharacteristicToSwatchReferenceMapping','FleckCharacteristicToMaterialReferenceMapping'}<=fields else
                'wandDisplay' if {'MagicCharacteristicToDisplay','DefaultGemstone','SerializedGuid'}<=fields else None)
        if not role:
            continue
        f=helpers.fields(tree,raw,mesh)
        if role=='flowerPattern':
            rec=config_record(pid,tree,raw,f,'PatternIndex')
            require(len(f['IsEffect']) in (1,4) and f['IsEffect'][0] in (0,1),'invalid effect flag')
            rec['isEffect']=bool(f['IsEffect'][0])
            require(rec['index'] not in patterns,'duplicate pattern index')
            patterns[rec['index']]=rec
            by_pid[pid]=rec
        elif role=='flowerColor':
            rec=config_record(pid,tree,raw,f,'ColorIndex')
            rgba=struct.unpack('<4f',f['Color'])
            require(all(math.isfinite(v) and 0<=v<=1 for v in rgba),'unsupported flower color')
            rec['rgba']=rgba
            require(rec['index'] not in colors,'duplicate flower color index')
            colors[rec['index']]=rec
        else:
            require(role not in configs,'ambiguous source configuration '+role)
            configs[role]=config_record(pid,tree,raw,f)
    rows=[]
    for item,entry in sorted(items.items()):
        if not entry['dynamicColor']:
            continue
        pid=entry['definitionPathId']
        cls,tree,raw=objects[pid]
        require(cls==114 and sha(raw)==entry['definitionSha256'],'definition row identity')
        f=helpers.fields(tree,raw,mesh)
        require(mesh.u(f['Id'])==item and f['UiIconUsesDynamicColor'][0]==1,
                'dynamic definition flag mismatch')
        direct,end=asset_reference(f['UiDynamicColorMaskRef'])
        require(end==len(f['UiDynamicColorMaskRef']),'generic mask reference boundary')
        detail,at=managed_details(f)
        key=entry['key']
        # Explicit supported display families; new dynamic definitions remain
        # visible for review rather than inheriting a guessed compositor.
        family=('flower' if detail=='FlowerItemDetails' else
                'boba' if detail=='CafeFoodItemDetails' and key.startswith('item_chefcreation_boba.') else
                'cafe' if detail=='CafeFoodItemDetails' and key.startswith('item_chefcreation_') else
                'wand' if detail=='WandItemDetails' else
                'palette' if key=='item_avatarpalette_custom.InventoryItemDefinitionAsset' else
                'instruction' if key.startswith('item_instruction_chefcreation_') else 'unknown')
        row={'itemId':item,'key':key,'definitionPathId':pid,'family':family,
             'definitionSha256':entry['definitionSha256'],'detailClass':detail,
             'detailSha256':sha(f['references']),'baseSprite':entry['sprite'],
             'directMask':direct,'flowerMasks':[]}
        if family=='flower':
            masks,hash_value=flower_bindings(f['references'],at,by_pid)
            row['flowerMasks']=masks
            row['flowerMaskDictionarySha256']=hash_value
        rows.append(row)
    if pinned:
        require(len(rows)==50 and len(patterns)==16 and len(colors)==30 and
                set(configs)=={'characteristics','wandDisplay'},'baseline config census mismatch')
        # Compare actual native pointer joins against the existing verified
        # production source maps; no additional catalog is created.
        published=source.read_json(source.ROOT/'public/inventory-flower-art/index.json')
        expected={r['itemId']:[[x['patternIndex'],x['maskGuid']] for x in r['patterns']]
                  for r in published['items']}
        observed={r['itemId']:[[x['patternIndex'],x['guid']] for x in r['flowerMasks']]
                  for r in rows if r['family']=='flower'}
        require(observed==expected,'baseline flower pattern mask mismatch')
        direct_expected={r['itemId']:r['maskGuid'] for r in source.read_json(
            source.ROOT/'data/unityfs-audit/dynamic-uiicons.v3.0.1.json')['rows']
            if r['itemId'] not in expected}
        require({r['itemId']:r['directMask']['guid'] for r in rows if r['family']!='flower'}==direct_expected,
                'baseline generic mask crosswalk mismatch')
        flower_defs=source.read_json(source.ROOT/'public/inventory-ui/flowers.json')
        require({str(i):list(r['rgba']) for i,r in colors.items()}==
                {i:r['rgba'] for i,r in flower_defs['colors'].items()},'baseline flower color mismatch')
    result={'schema':SCHEMA,'approval':'review-required','version':snapshot['version'],
            'platform':snapshot['platform'],'definitionSnapshotSha256':snapshot['snapshotSha256'],
            'layout':LAYOUT,'sourceBundleSha256':snapshot['sourceBundleSha256'],
            'locallyObservedBundles':snapshot['locallyObservedBundles'],
            'rows':rows,'flowerColors':sorted(colors.values(),key=lambda r:r['index']),
            'flowerPatterns':sorted(patterns.values(),key=lambda r:r['index']),
            'configurations':configs,
            'unresolvedFamilyItemIds':[r['itemId'] for r in rows if r['family']=='unknown'],
            'requiredMaskGuids':sorted({ref['guid'] for r in rows
                for ref in [r['directMask'],*r['flowerMasks']] if ref['guid']}),
            'automaticReleaseActivationAuthorized':False}
    result['receiptSha256']=sha(source.stable(result))
    return result

def validate(value):
    payload={k:v for k,v in value.items() if k!='receiptSha256'}
    require(value.get('schema')==SCHEMA and value.get('approval')=='review-required' and
            value.get('receiptSha256')==sha(source.stable(payload)),'dynamic receipt integrity')
    source.checked_release(value['version'],value['platform'])
    require(value['layout']==LAYOUT,'unsupported dynamic layout')
    rows=value['rows']
    require(len({r['itemId'] for r in rows})==len(rows),'duplicate dynamic Item ID')
    return {r['itemId']:r for r in rows}

def diff(before,after):
    old,new=validate(before),validate(after)
    require(before['platform']==after['platform'],'same-platform comparison required')
    def indexed_changes(a,b,key):
        x={r[key]:r for r in a};y={r[key]:r for r in b}
        return sorted(k for k in set(x)|set(y) if x.get(k)!=y.get(k))
    configs=sorted(k for k in set(before['configurations'])|set(after['configurations'])
                   if before['configurations'].get(k)!=after['configurations'].get(k))
    colors=indexed_changes(before['flowerColors'],after['flowerColors'],'index')
    patterns=indexed_changes(before['flowerPatterns'],after['flowerPatterns'],'index')
    changed=sorted(i for i in set(old)|set(new) if old.get(i)!=new.get(i))
    bundles_a,bundles_b=before['sourceBundleSha256'],after['sourceBundleSha256']
    bundles=sorted(k for k in set(bundles_a)|set(bundles_b) if bundles_a.get(k)!=bundles_b.get(k))
    not_observed=sorted((set(bundles_a)|set(bundles_b))-set(after['locallyObservedBundles']))
    # Only classify definition/config changes. An unchanged mask GUID is
    # never sufficient proof that atlas pixels, shader or source config match.
    family_review={r['family'] for i in changed for r in (old.get(i),new.get(i)) if r}
    if colors or patterns:
        family_review.add('flower')
        if colors:
            family_review.add('palette')
    if 'characteristics' in configs:
        family_review.update(('cafe','boba','wand'))
    if 'wandDisplay' in configs:
        family_review.add('wand')
    return {'schema':'HKIA.DynamicIconSourceDelta.1','approval':'review-required',
            'fromVersion':before['version'],'toVersion':after['version'],
            'fromReceiptSha256':before['receiptSha256'],'toReceiptSha256':after['receiptSha256'],
            'addedDynamicItemIds':sorted(set(new)-set(old)),
            'removedDynamicItemIds':sorted(set(old)-set(new)),
            'changedDynamicItemIds':changed,'changedFlowerColorIndices':colors,
            'changedFlowerPatternIndices':patterns,'changedConfigurations':configs,
            'changedSourceBundles':bundles,'unobservedSourceBundles':not_observed,
            'definitionAndConfigAffectedFamilies':sorted(family_review),
            'newMaskGuids':sorted(set(after['requiredMaskGuids'])-set(before['requiredMaskGuids'])),
            'removedMaskGuids':sorted(set(before['requiredMaskGuids'])-set(after['requiredMaskGuids'])),
            'allCandidateMaskGuidsForSourceResolution':after['requiredMaskGuids'],
            'unresolvedFamilyItemIds':after['unresolvedFamilyItemIds'],
            'automaticArtworkReuseAuthorized':False,'automaticReleaseActivationAuthorized':False}

def self_test():
    def string(v):
        b=v.encode()
        return struct.pack('<I',len(b))+b+bytes((-len(b))%4)
    def ref(guid):
        return string(guid)+string('')+string('')
    a,b='a'*32,'b'*32
    raw=bytes(64)+struct.pack('<Iiq',2,0,9)+ref(a)+struct.pack('<iq',0,0)+ref(b)+bytes(64)
    rows,_=flower_bindings(raw,0,{'9':{'index':7}})
    assert [(r['patternIndex'],r['guid']) for r in rows]==[(7,a),(0,b)]
    for invalid in [raw[:-65],raw.replace(a.encode(),b'G'*32)]:
        try:
            flower_bindings(invalid,0,{'9':{'index':7}})
        except ValueError:
            pass
        else:
            raise AssertionError('accepted invalid flower mask layout')
    def receipt(version,mask,color,characteristic):
        v={'schema':SCHEMA,'approval':'review-required','version':version,'platform':'steam',
           'layout':LAYOUT,'rows':[{'itemId':42,'family':'cafe','directMask':{'guid':mask}}],
           'flowerColors':[{'index':1,'rgba':color}],'flowerPatterns':[],
           'configurations':{'characteristics':characteristic},
           'sourceBundleSha256':{'definitions':'d'*64},'locallyObservedBundles':['definitions'],
           'requiredMaskGuids':[mask],'unresolvedFamilyItemIds':[]}
        v['receiptSha256']=sha(source.stable(v))
        return v
    delta=diff(receipt('9.0.0',a,[1,1,1,1],'old'),receipt('9.0.1',b,[0,0,0,1],'new'))
    assert delta['changedDynamicItemIds']==[42] and delta['changedFlowerColorIndices']==[1]
    assert delta['newMaskGuids']==[b] and delta['removedMaskGuids']==[a]
    assert set(delta['definitionAndConfigAffectedFamilies'])=={'flower','palette','cafe','boba','wand'}
    assert not delta['automaticReleaseActivationAuthorized']
    print('HKIA_DYNAMIC_ICON_SOURCE_UPDATE_SELF_TEST_OK')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='command',required=True)
    s=sub.add_parser('scan')
    s.add_argument('--snapshot',type=Path,required=True)
    s.add_argument('--definitions',type=Path,required=True)
    s.add_argument('--reviewed-layout',choices=[LAYOUT])
    s.add_argument('--out',type=Path,required=True)
    d=sub.add_parser('diff')
    d.add_argument('--before',type=Path,required=True)
    d.add_argument('--after',type=Path,required=True)
    d.add_argument('--out',type=Path,required=True)
    sub.add_parser('self-test')
    a=p.parse_args()
    if a.command=='self-test':
        self_test()
    elif a.command=='scan':
        result=scan(source.read_json(a.snapshot),a.definitions,a.reviewed_layout)
        source.write_new(a.out,result)
        print('HKIA_DYNAMIC_ICON_SOURCE',len(result['rows']),'definitions',
              len(result['requiredMaskGuids']),'distinct mask GUIDs',result['receiptSha256'])
    else:
        source.write_new(a.out,diff(source.read_json(a.before),source.read_json(a.after)))
        print('HKIA_DYNAMIC_ICON_DELTA review-required')
