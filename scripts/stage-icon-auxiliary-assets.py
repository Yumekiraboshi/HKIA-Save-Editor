#!/usr/bin/env python3
"""Resolve original growth/magic sprites and exact chef swatches for a candidate.

Consumes the reviewed auxiliary source receipt. Shares the native atlas
decoder, guarded texture transport and candidate page assembler. Does not
create individual appearance combinations or enable a game release.
"""
import argparse
import collections
import importlib.util
import json
import math
import struct
import re
import tempfile
from pathlib import Path

def module(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

source=module('icon-source-update')
require,sha=source.require,source.digest
SCHEMA='HKIA.IconAuxiliaryAssetStage.1'
RENDERER='guarded-native-rgb-alpha-v1'

def validate_auxiliary(snapshot,aux):
    rows=source.validate_snapshot(snapshot)
    payload={k:v for k,v in aux.items() if k!='receiptSha256'}
    require(aux.get('schema')=='HKIA.IconAuxiliarySourceCandidate.1' and
            aux.get('approval')=='review-required' and
            aux.get('receiptSha256')==sha(source.stable(payload)) and
            aux['version']==snapshot['version'] and aux['platform']==snapshot['platform'] and
            aux['definitionSnapshotSha256']==snapshot['snapshotSha256'],
            'auxiliary source identity mismatch')
    known=[v[0] for v in aux['characteristics']]
    require(len(set(known))==len(known),'duplicate characteristic')
    refs=aux['colorSwatchReferences']
    require(len({v[0] for v in refs})==len(refs) and
            all(i in known and type(s) is int and s>0 for i,s in refs),'invalid swatch mapping')
    sprites=auxiliary_routes(aux)
    require(all(r['itemId'] in rows and rows[r['itemId']]['dynamicColor']
                for r in aux['flowerGrowth']),'unknown flower growth definition')
    require(all(r['characteristicId'] in known for r in aux['magic']),'unknown magic characteristic')
    return sprites

def auxiliary_routes(aux):
    entries={}
    def add(key,b):
        require(key not in entries and type(b['fileId']) is int and
                b['fileId']>=0 and isinstance(b['pathId'],str) and
                bool(re.fullmatch(r'-?[1-9][0-9]{0,18}',b['pathId'])),'duplicate/invalid auxiliary Sprite reference')
        entries[key]=b
    for row in aux['flowerGrowth']:
        i=row['itemId']
        add('growth:%d:0'%i,row['seed'])
        add('growth:%d:7'%i,row['grownTroweled'])
    for row in aux['magic']:
        add('magic:%d'%row['characteristicId'],row['sprite'])
    for row in aux.get('flowerPatternSprites',[]):
        i=row['patternIndex'];key='pattern:%d'%i
        require(type(i) is int and 0<i<=0x7fffffff and key not in entries,'invalid flower pattern route')
        if row['sprite'] is None:entries[key]=None
        else:add(key,row['sprite'])
    return entries

def join_swatches(refs,colors):
    """Keep mapping identity even when original swatch data is absent."""
    resolved=[];missing=[]
    for i,s in sorted(refs):
        if s not in colors:
            missing.append({'characteristicId':i,'swatchId':s})
        else:
            value=colors[s]
            require(len(value)==4 and all(math.isfinite(v) and 0<=v<=1 for v in value),
                    'invalid original swatch color')
            resolved.append({'characteristicId':i,'swatchId':s,'rgba':list(value)})
    return resolved,missing

def config_objects(bundle,helpers,mesh):
    configs=[]
    for pid,(cls,tree,raw) in bundle['objects'].items():
        if cls!=114:continue
        # Use the exact typed m_Name field to select the original object.
        names={n[2] for n in tree[-1]}
        if 'm_Name' not in names:continue
        f=helpers.fields(tree,raw,mesh)
        if mesh.string(f['m_Name'])[0]=='Default.DyeDataServiceConfig':
            configs.append((pid,tree,raw,f))
    require(len(configs)==1,'missing/ambiguous native dye configuration')
    return configs[0]

def swatch_colors(bundle,layout,aux,atlas):
    """The layout is reviewed from actual native type trees, not inferred
    from matching numbers or copied a previous release's RGBA.
    """
    native=module('extract-icon-auxiliary-source')
    pid,tree,raw,f=config_objects(bundle,atlas.helpers,atlas.mesh)
    require(layout['objectSha256']==sha(raw) and
            layout['schemaSha256']==sha(source.stable(tree)),
            'reviewed dye configuration object/tree mismatch')
    field=layout['swatchMapField']
    nodes=[n for n in tree[-1] if n[2]==field]
    require(len(nodes)==1,'reviewed swatch map field missing')
    values,node=native.map_rows(nodes[0],f[field],('m_Keys','m_Values'))
    colors={}
    for i,v in values:
        parts=atlas.helpers.fields(node,v,atlas.mesh)
        color=parts[layout['rgbaField']]
        require(len(color)==16,'reviewed swatch RGBA field width')
        colors[i]=native.rgba(color)
    resolved,missing=join_swatches(aux['colorSwatchReferences'],colors)
    return resolved,missing,{'pathId':pid,'objectSha256':sha(raw),
           'schemaSha256':sha(source.stable(tree)),'bundleCab':bundle['cab'],
           'swatchCount':len(colors)}

def extract(snapshot,aux,manifest_path,out,previous_dir=None):
    requested=validate_auxiliary(snapshot,aux)
    # These are the same shared original-stage modules, not a second
    # Unity texture decoder, resizer or browser rendering engine.
    stage=module('stage-dynamic-icon-textures')
    atlas=stage.atlas
    assembler=module('assemble-icon-release')
    manifest=source.read_json(manifest_path)
    require(manifest.get('schema')=='HKIA.NativeIconAtlasInput.1' and
            manifest.get('version')==snapshot['version'] and
            manifest.get('platform')==snapshot['platform'] and
            manifest.get('definitionSnapshotSha256')==snapshot['snapshotSha256'] and
            manifest.get('reviewedLayout')==atlas.LAYOUT,'original release/layout mismatch')
    entries=manifest['bundles']
    require(entries and len({e['name'] for e in entries})==len(entries),'duplicate source bundle')
    loaded,cabs={},{}
    pinned=snapshot['sourceBundleSha256']
    for e in entries:
        require(source.BUNDLE.fullmatch(e['name']) and source.SHA.fullmatch(e['sha256']) and
                (e['name'] not in pinned or pinned[e['name']]==e['sha256']),'source bundle fingerprint')
        b=atlas.load_bundle(manifest_path.parent/e['file'],e['sha256'])
        require(b['cab'] not in cabs,'duplicate source CAB')
        loaded[e['name']]=b;cabs[b['cab']]=b
    definition=loaded['definitions']
    require(definition['cab']==snapshot['definitionsCab'] and
            definition['cabSha256']==snapshot['definitionsCabSha256'] and
            next(e['sha256'] for e in entries if e['name']=='definitions')==pinned['definitions'],
            'definition bundle identity')
    # Read exact reviewed swatch configuration, if supplied. No required
    # swatch value is replaced with a neutral or previous-version color.
    colors,missing=join_swatches(aux['colorSwatchReferences'],{})
    swatch_source=None
    layout=manifest.get('reviewedSwatchLayout')
    if layout is not None:
        require(layout.get('bundle') in loaded,'reviewed dye source not supplied')
        colors,missing,swatch_source=swatch_colors(loaded[layout['bundle']],layout,aux,atlas)
    baseline=snapshot['version']=='3.0.1' and snapshot['platform']=='steam'
    if baseline and swatch_source:
        expected=source.read_json(source.ROOT/'public/dynamic-chef-art/chef-runtime-source-v3.0.1.json')
        require(swatch_source['swatchCount']==556 and
                colors==[{k:r[k] for k in ('characteristicId','swatchId','rgba')}
                         for r in expected['colors']] and not missing,
                'baseline original swatch projection mismatch')
    require(out.resolve()!=source.ROOT and source.ROOT not in out.resolve().parents and
            not out.exists(),'new staging directory outside repository required')
    previous={}
    if previous_dir:
        old=source.read_json(previous_dir/'index.json')
        payload={k:v for k,v in old.items() if k!='receiptSha256'}
        require(old.get('schema')==SCHEMA and old.get('platform')==snapshot['platform'] and
                old.get('renderer')==RENDERER and old.get('receiptSha256')==sha(source.stable(payload)),
                'previous auxiliary receipt identity')
        previous=old['textures']
    unresolved=[];jobs=collections.defaultdict(list);atlas_cache={}
    for key,ref in sorted(requested.items()):
        if ref is None:
            unresolved.append({'key':key,'reason':'native null FlowerPatternDefinition.Icon'})
            continue
        try:
            fi,pid=ref['fileId'],ref['pathId']
            require(0<=fi<=len(definition['external']),'auxiliary external reference index')
            require(ref['external']==(definition['external'][fi-1] if fi else None),
                    'auxiliary Sprite external identity')
            sprite=atlas.resolve(definition,[fi,pid],cabs,213)
            sb,sid,_,raw=sprite
            require(ref['objectSha256'] in (None,sha(raw)),'auxiliary Sprite object identity')
            logical,rect,offset,texture,binding=atlas.geometry(sprite,cabs,atlas_cache)
            tb,tid,_,_=texture
            jobs[(tb['cab'],tid)].append((key,sprite,logical,rect,offset,texture,binding))
        except (atlas.Unsupported,KeyError,StopIteration,struct.error) as exc:
            unresolved.append({'key':key,'reason':str(exc) or type(exc).__name__})
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='hkia-auxiliary-',dir=out.parent) as tmp:
        folder=Path(tmp)/'candidate';folder.mkdir()
        records,textures={},{}
        for _,group in sorted(jobs.items()):
            try:
                image,tex=stage.decode_texture(group[0][5])
            except (atlas.Unsupported,KeyError,StopIteration,struct.error) as exc:
                unresolved.extend({'key':j[0],'reason':str(exc) or type(exc).__name__} for j in group)
                continue
            for key,sprite,logical,rect,offset,texture,binding in group:
                sb,sid,_,raw=sprite
                try:
                    crop,sample=stage.guarded_crop(image,rect)
                    atlas.supported(crop.width<=1022 and crop.height<=1022,'auxiliary source exceeds padded page bound')
                    lw,lh=logical;ox,oy=offset
                    trim=[ox,lh-oy-rect[3],ox+rect[2],lh-oy]
                    atlas.supported(lw==lh and tex['colorSpace']==1 and
                        -.001<=trim[0]<trim[2]<=lw+.001 and -.001<=trim[1]<trim[3]<=lh+.001,
                        'unsupported auxiliary original geometry/color space')
                    ident={'renderer':RENDERER,'spriteCab':sb['cab'],'spritePathId':sid,
                        'spriteSha256':sha(raw),'logicalSize':lw,'sourceRect':rect,
                        'sampleRect':sample,'trimTopLeft':trim,'cropRgbaSha256':sha(crop.tobytes()),
                        **binding,**tex}
                    ident=json.loads(source.stable(ident))
                    digest=sha(source.stable(ident))
                    if digest not in textures:
                        digest,meta=stage.write_texture(folder,previous_dir,previous,ident,stage.opaque_planes(crop))
                        textures[digest]=meta
                    records[key]={'texture':digest,'sampleRect':sample,'trimTopLeft':trim,
                                  'logicalSize':lw,'alphaOffsetY':crop.height,'maskColorSpace':'srgb'}
                except atlas.Unsupported as exc:
                    unresolved.append({'key':key,'reason':str(exc)})
            del image
        require((set(records)|{r['key'] for r in unresolved})==set(requested) and
                len(records)+len(unresolved)==len(requested),'auxiliary route closure')
        result={'schema':SCHEMA,'approval':'review-required','renderer':RENDERER,
                'version':snapshot['version'],'platform':snapshot['platform'],
                'definitionSnapshotSha256':snapshot['snapshotSha256'],
                'auxiliaryReceiptSha256':aux['receiptSha256'],
                'sourceBundles':{e['name']:e['sha256'] for e in entries},
                'records':records,'textures':textures,'unresolved':sorted(unresolved,key=lambda r:r['key']),
                'chefColors':colors,'unresolvedSwatches':missing,'swatchSource':swatch_source,
                'automaticReleaseActivationAuthorized':False}
        # Same page assembler, including edge padding and pixel readback.
        count,pages=assembler.pack_dynamic(folder,folder,result)
        result['packedSourceCount']=count;result['packedPageCount']=pages
        result['pageIndexSha256']=source.file_digest(folder/'dynamic-source-pages'/'index.json')
        result['receiptSha256']=sha(source.stable(result))
        source.write_new(folder/'index.json',result)
        require(not out.exists(),'candidate output already exists')
        folder.rename(out)
    return result

def self_test():
    refs=[[6,237],[7,216],[33,215],[34,215]]
    colors={237:[.25,.5,.75,1],215:[1,0,0,1]}
    ready,missing=join_swatches(refs,colors)
    assert [r['characteristicId'] for r in ready]==[6,33,34]
    assert missing==[{'characteristicId':7,'swatchId':216}]
    assert ready[1]['rgba']==ready[2]['rgba']
    b={'fileId':0,'pathId':'1','external':None,'objectSha256':'a'*64}
    aux={'flowerGrowth':[{'itemId':42,'seed':b,'grownTroweled':{**b,'pathId':'2'}}],
         'magic':[{'characteristicId':104,'sprite':b}]}
    aux['flowerPatternSprites']=[{'patternIndex':1,'sprite':b},{'patternIndex':2,'sprite':None}]
    assert set(auxiliary_routes(aux))=={'growth:42:0','growth:42:7','magic:104','pattern:1','pattern:2'}
    assert auxiliary_routes(aux)['pattern:2'] is None
    aux['magic'].append(aux['magic'][0])
    try:auxiliary_routes(aux)
    except ValueError:pass
    else:raise AssertionError('accepted duplicate auxiliary route')
    print('HKIA_ICON_AUXILIARY_ASSET_STAGE_SELF_TEST_OK')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('snapshot','auxiliary','bundles','previous-stage','out'):
        p.add_argument('--'+name,type=Path)
    p.add_argument('--self-test',action='store_true')
    a=p.parse_args()
    if a.self_test:self_test()
    elif a.snapshot and a.auxiliary and a.bundles and a.out:
        result=extract(source.read_json(a.snapshot),source.read_json(a.auxiliary),
                       a.bundles,a.out,a.previous_stage)
        print('HKIA_ICON_AUXILIARY_ASSET_STAGE',len(result['records']),'resolved sprites',
              len(result['unresolved']),'unresolved sprites',len(result['chefColors']),'swatch mappings',
              len(result['unresolvedSwatches']),'unresolved swatches')
    else:p.error('provide snapshot, auxiliary, bundles and out')
