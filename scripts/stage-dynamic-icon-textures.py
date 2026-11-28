#!/usr/bin/env python3
"""Stage unresized original RGB/alpha and mask texels for dynamic icons.

Consumes the versioned source snapshot and dynamic binding receipt.
No finished variants are generated; staging is not release approval.
"""
import argparse
import collections
import io
import math
import re
import struct
import tempfile
from pathlib import Path
from importlib.util import spec_from_file_location, module_from_spec

def module(name):
    spec = spec_from_file_location(name, Path(__file__).with_name(name+'.py'))
    m = module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

atlas = module('stage-native-icon-atlas')
dynamic = module('dynamic-icon-source-update')
source, mesh, helpers = atlas.source, atlas.mesh, atlas.helpers
require, supported, sha = atlas.require, atlas.supported, atlas.sha
SCHEMA = 'HKIA.DynamicIconTextureStaging.1'
RENDERER = 'guarded-native-rgb-alpha-v1'
MAX_FILE = 1024*1024
SPRITE_TYPE = 'UnityEngine.Sprite, UnityEngine.CoreModule, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null'

def supported_mask_selector(refs):
    return bool(refs) and all(not name and kind in ('',SPRITE_TYPE) for name,kind in refs)

def container_refs(bundle, wanted):
    """Use actual container keys and exact Sprite PPtrs, not asset names."""
    found = collections.defaultdict(set)
    for _,(cls,tree,raw) in bundle['objects'].items():
        if cls != 142:
            continue
        fields = helpers.fields(tree,raw,mesh)
        data = fields['m_Container']
        count = mesh.u(data)
        require(count<=2000000,'container count bound')
        p=4
        for _ in range(count):
            key,p=mesh.string(data,p)
            require(p+20<=len(data),'container entry bound')
            ref=mesh.ptr(data,p+8)
            p+=20
            if key in wanted and ref[0]==0 and bundle['objects'].get(ref[1],(None,))[0]==213:
                found[key].add(ref[1])
        require(p==len(data),'container layout boundary')
    return found

def decode_texture(texture):
    """Same original formats as the ordinary source layer, additionally
    accepting native linear-data masks. Preserve source sampler metadata."""
    bundle,tid,tree,raw=texture
    f=helpers.fields(tree,raw,mesh)
    color=mesh.u(f['m_ColorSpace'])
    settings=f['m_TextureSettings']
    supported(len(settings)==24 and color in (0,1),'unsupported texture sampler')
    filter_mode,aniso,mip_bias,wrap_u,wrap_v,wrap_w=struct.unpack('<iifiii',settings)
    supported(filter_mode in (1,2) and wrap_u==wrap_v==1 and math.isfinite(mip_bias),
              'unsupported filter/wrap settings')
    # The ordinary texture decoder accepts sRGB only. Share its complete
    # stream validation and decode, with an explicit color-space parameter.
    image,binding=atlas.texture_data(texture,allowed_color_spaces=(0,1))
    return image,{**binding,'colorSpace':color,'filterMode':filter_mode,
                  'wrapModeU':wrap_u,'wrapModeV':wrap_v,'wrapModeW':wrap_w,
                  'mipCount':1,'aniso':aniso,'mipBias':mip_bias}

def guarded_crop(image,rect):
    x,y,w,h=rect
    top=image.height-y-h
    supported(all(math.isfinite(v) for v in rect) and w>0 and h>0 and
              x>=0 and y>=0 and x+w<=image.width+.001 and y+h<=image.height+.001,
              'source sample rectangle outside texture')
    left=max(0,math.floor(x)-1)
    upper=max(0,math.floor(top)-1)
    right=min(image.width,math.ceil(x+w)+1)
    lower=min(image.height,math.ceil(top+h)+1)
    supported(0<right-left<=1024 and 0<lower-upper<=1024,'guarded crop size')
    return image.crop((left,upper,right,lower)), [x-left,top-upper,w,h]

def opaque_planes(crop):
    from PIL import Image
    w,h=crop.size
    out=Image.new('RGB',(w,h*2))
    out.paste(crop.convert('RGB'),(0,0))
    a=crop.getchannel('A')
    out.paste(Image.merge('RGB',(a,a,a)),(0,h))
    return out

def read_verified(path,meta):
    from PIL import Image
    require(path.stat().st_size==meta['bytes'] and 0<meta['bytes']<=MAX_FILE,'texture file size')
    raw=path.read_bytes()
    require(sha(raw)==meta['sha256'],'texture file digest')
    with Image.open(io.BytesIO(raw)) as im:
        require(im.size==(meta['width'],meta['height']) and im.mode=='RGB',
                'texture geometry/mode')
        require(sha(im.tobytes())==meta['rgbSha256'],'texture pixel digest')
    return raw

def write_texture(folder, prior_dir, prior, binding, pixels):
    key=sha(source.stable(binding))
    filename=key+'.webp'
    path=folder/filename
    rgb_hash=sha(pixels.tobytes())
    old=prior.get(key)
    if old is not None:
        require(old['binding']==binding and old['file']==filename and
                old['rgbSha256']==rgb_hash,'previous source texture binding mismatch')
        path.write_bytes(read_verified(prior_dir/filename,old))
        reused=True
    else:
        pixels.save(path,lossless=True,method=4,exact=True)
        reused=False
    record={'file':filename,'bytes':path.stat().st_size,'sha256':source.file_digest(path),
            'rgbSha256':rgb_hash,'width':pixels.width,'height':pixels.height,
            'binding':binding,'reused':reused}
    read_verified(path,record)
    return key,record

def prior_records(folder, platform):
    if folder is None:
        return {}
    receipt=source.read_json(folder/'index.json')
    payload={k:v for k,v in receipt.items() if k!='receiptSha256'}
    require(receipt.get('schema')==SCHEMA and receipt.get('renderer')==RENDERER and
            receipt.get('platform')==platform and receipt.get('receiptSha256')==sha(source.stable(payload)),
            'invalid previous dynamic stage')
    return receipt['textures']

def stage(snapshot, receipt, manifest_path, out, prior_dir=None):
    rows=source.validate_snapshot(snapshot)
    dynamic_rows=dynamic.validate(receipt)
    require(receipt['definitionSnapshotSha256']==snapshot['snapshotSha256'] and
            receipt['version']==snapshot['version'] and receipt['platform']==snapshot['platform'],
            'dynamic receipt/snapshot mismatch')
    require(set(dynamic_rows)=={i for i,r in rows.items() if r['dynamicColor']},
            'dynamic definition coverage mismatch')
    manifest=source.read_json(manifest_path)
    require(manifest.get('schema')=='HKIA.NativeIconAtlasInput.1' and
            manifest.get('version')==snapshot['version'] and
            manifest.get('platform')==snapshot['platform'] and
            manifest.get('definitionSnapshotSha256')==snapshot['snapshotSha256'] and
            manifest.get('reviewedLayout')==atlas.LAYOUT,'original release/layout mismatch')
    pinned=snapshot['sourceBundleSha256']
    entries=manifest['bundles']
    require(entries and len({e['name'] for e in entries})==len(entries),'duplicate source bundle')
    loaded,cabs={},{}
    for e in entries:
        require(source.BUNDLE.fullmatch(e['name']) and source.SHA.fullmatch(e['sha256']) and
                (e['name'] not in pinned or pinned[e['name']]==e['sha256']),'source bundle fingerprint')
        b=atlas.load_bundle(manifest_path.parent/e['file'],e['sha256'])
        require(b['cab'] not in cabs,'duplicate source CAB')
        loaded[e['name']]=b
        cabs[b['cab']]=b
    definition=loaded['definitions']
    require(definition['cab']==snapshot['definitionsCab'] and
            definition['cabSha256']==snapshot['definitionsCabSha256'] and
            next(e['sha256'] for e in entries if e['name']=='definitions')==pinned['definitions'],
            'definition source mismatch')
    mask_refs={}
    for item,row in dynamic_rows.items():
        require(row['baseSprite']==rows[item]['sprite'] and
                row['definitionSha256']==rows[item]['definitionSha256'],'dynamic definition mismatch')
        for ref in [row['directMask'],*row['flowerMasks']]:
            guid=ref['guid']
            if not guid:
                continue
            mask_refs.setdefault(guid,set()).add((ref['subObjectName'],ref['subObjectType']))
    require(set(mask_refs)==set(receipt['requiredMaskGuids']),'dynamic mask GUID coverage')
    found=collections.defaultdict(set)
    for b in loaded.values():
        for guid,ids in container_refs(b,mask_refs).items():
            found[guid].update((b['cab'],pid) for pid in ids)
    previous=prior_records(prior_dir,snapshot['platform'])
    require(out.resolve()!=source.ROOT and source.ROOT not in out.resolve().parents and
            not out.exists(),'new staging directory outside repository required')
    jobs=collections.defaultdict(list)
    unresolved=[]
    atlas_cache={}
    def plan(label,owner,ref,expected=None):
        try:
            sprite=atlas.resolve(owner,ref,cabs,213)
            sb,sid,_,raw=sprite
            require(expected is None or sha(raw)==expected,'snapshot Sprite identity mismatch')
            logical,rect,offset,texture,binding=atlas.geometry(sprite,cabs,atlas_cache)
            tb,tid,_,_=texture
            jobs[(tb['cab'],tid)].append((label,sprite,logical,rect,offset,texture,binding))
        except (atlas.Unsupported,KeyError,StopIteration,struct.error) as exc:
            unresolved.append({'key':label,'reason':str(exc) or type(exc).__name__})
    for item,row in sorted(dynamic_rows.items()):
        s=row['baseSprite']
        plan('base:'+str(item),definition,[s['fileId'],s['pathId']],s['objectSha256'])
    for guid,refs in sorted(mask_refs.items()):
        label='mask:'+guid
        # Nonempty subobject selectors need an independently reviewed adapter;
        # never choose an arbitrary Sprite from an ambiguous container.
        if not supported_mask_selector(refs) or len(found[guid])!=1:
            unresolved.append({'key':label,'reason':'unresolved/ambiguous original mask reference'})
            continue
        cab,pid=next(iter(found[guid]))
        plan(label,cabs[cab],[0,pid])
    out.parent.mkdir(parents=True,exist_ok=True)
    records,textures={},{}
    with tempfile.TemporaryDirectory(prefix='hkia-dynamic-texels-',dir=out.parent) as temp:
        folder=Path(temp)/'result'
        folder.mkdir()
        for key,group in sorted(jobs.items()):
            try:
                image,tex=decode_texture(group[0][5])
            except (atlas.Unsupported,KeyError,StopIteration,struct.error) as exc:
                unresolved.extend({'key':j[0],'reason':str(exc) or type(exc).__name__} for j in group)
                continue
            for label,sprite,logical,rect,offset,texture,binding in group:
                sb,sid,_,raw=sprite
                try:
                    crop,sample=guarded_crop(image,rect)
                    lw,lh=logical
                    ox,oy=offset
                    trim=[ox,lh-oy-rect[3],ox+rect[2],lh-oy]
                    supported(lw==lh and -.001<=trim[0]<trim[2]<=lw+.001 and
                              -.001<=trim[1]<trim[3]<=lh+.001,'unsupported dynamic logical geometry')
                    if label.startswith('base:'):
                        supported(tex['colorSpace']==1,'non-sRGB base texture')
                    ident={'renderer':RENDERER,'spriteCab':sb['cab'],'spritePathId':sid,
                           'spriteSha256':sha(raw),'logicalSize':lw,'sourceRect':rect,
                           'sampleRect':sample,'trimTopLeft':trim,'cropRgbaSha256':sha(crop.tobytes()),
                           **binding,**tex}
                    # Normalize tuples for exact comparison with JSON receipts.
                    import json
                    ident=json.loads(source.stable(ident))
                    digest=sha(source.stable(ident))
                    if digest not in textures:
                        digest,meta=write_texture(folder,prior_dir,previous,ident,opaque_planes(crop))
                        textures[digest]=meta
                    records[label]={'texture':digest,'sampleRect':sample,'trimTopLeft':trim,
                                    'logicalSize':lw,'alphaOffsetY':crop.height,
                                    'maskColorSpace':'linear' if tex['colorSpace']==0 else 'srgb'}
                except atlas.Unsupported as exc:
                    unresolved.append({'key':label,'reason':str(exc)})
            del image
        require(len(records)+len(unresolved)==len(dynamic_rows)+len(mask_refs),'source route closure')
        result={'schema':SCHEMA,'approval':'review-required','renderer':RENDERER,
                'version':snapshot['version'],'platform':snapshot['platform'],
                'definitionSnapshotSha256':snapshot['snapshotSha256'],
                'dynamicReceiptSha256':receipt['receiptSha256'],
                'sourceBundles':{e['name']:e['sha256'] for e in entries},
                'records':records,'textures':textures,'unresolved':sorted(unresolved,key=lambda x:x['key']),
                'automaticReleaseActivationAuthorized':False}
        result['receiptSha256']=sha(source.stable(result))
        source.write_new(folder/'index.json',result)
        require(not out.exists(),'staging output already exists')
        folder.rename(out)
    return result

def self_test():
    assert supported_mask_selector({('',''),('',SPRITE_TYPE)})
    assert supported_mask_selector({('',SPRITE_TYPE)})
    assert not supported_mask_selector({('named',SPRITE_TYPE)})
    assert not supported_mask_selector({('','Unknown.Type')})
    # Test coordinate/guard logic using an image stub; no Pillow required.
    class ImageStub:
        width=32
        height=32
        def crop(self,box):return box
    box,rect=guarded_crop(ImageStub(),(2.25,4.5,10.5,12.0))
    assert box==(1,14,14,29) and rect==[1.25,1.5,10.5,12.0]
    box,rect=guarded_crop(ImageStub(),(0,0,32,32))
    assert box==(0,0,32,32) and rect==[0,0,32,32]
    for invalid in [(-1,0,2,2),(0,0,33,1),(0,0,0,1)]:
        try:guarded_crop(ImageStub(),invalid)
        except atlas.Unsupported:pass
        else:raise AssertionError('accepted invalid crop')
    print('HKIA_DYNAMIC_TEXTURE_STAGE_SELF_TEST_OK')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--self-test',action='store_true')
    p.add_argument('--snapshot',type=Path)
    p.add_argument('--dynamic-receipt',type=Path)
    p.add_argument('--bundles',type=Path)
    p.add_argument('--previous-stage',type=Path)
    p.add_argument('--out',type=Path)
    a=p.parse_args()
    if a.self_test:self_test()
    elif a.snapshot and a.dynamic_receipt and a.bundles and a.out:
        result=stage(source.read_json(a.snapshot),source.read_json(a.dynamic_receipt),
                     a.bundles,a.out,a.previous_stage)
        print('HKIA_DYNAMIC_TEXTURE_STAGE',len(result['records']),'routes',len(result['textures']),
              'source textures',len(result['unresolved']),'unresolved')
    else:p.error('provide --snapshot, --dynamic-receipt, --bundles and --out')
