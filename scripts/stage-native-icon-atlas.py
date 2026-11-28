#!/usr/bin/env python3
"""Version-aware staging of original definition UiIcon sprites and 96px sheets.

This is a source-base layer, not a final per-instance appearance or an
approved production inventory index. Native result/override/growth and
dynamic routes must be composed separately before release activation.
"""
import argparse
import collections
import importlib.util
import io
import json
import math
import re
import struct
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
def module(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + '.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

source = module('icon-source-update')
native_webp = module('native-raster-webp')
helpers = module('extract-native-result-icons')
mesh = helpers.module('extract-furniture-mesh-source')
typed = helpers.module('extract-furniture-preview-camera')
audit = helpers.module('unityfs-audit')
require, sha = source.require, source.digest
SCHEMA = 'HKIA.NativeIconAtlasStaging.1'
LAYOUT = 'unity-v22-uiicon-v1'
RENDERER = 'native-rect-trim-contain-84-in-96-v1'
SIDE, COLS, PER = 96, 12, 144

class Unsupported(ValueError):
    pass

def supported(ok, message):
    if not ok:
        raise Unsupported(message)

def load_bundle(path, expected):
    require(path.stat().st_size <= audit.MAX_INPUT, 'source bundle too large')
    raw = path.read_bytes()
    require(sha(raw) == expected, 'source bundle fingerprint mismatch')
    _, pairs = audit.extract_nodes(raw)
    nodes = dict(pairs)
    require(len(nodes) == len(pairs), 'duplicate bundle node')
    cabs = [k for k in nodes if re.fullmatch(r'CAB-[0-9a-f]{32}', k)]
    require(len(cabs) == 1, 'expected one original serialized CAB')
    cab = cabs[0]
    objects, external = typed.load(nodes[cab], mesh)
    return {'cab': cab, 'objects': objects, 'external': external,
            'res': nodes.get(cab + '.resS', b''), 'cabSha256': sha(nodes[cab])}

def resolve(bundle, ref, cabs, cls):
    file_id, pid = ref
    supported(pid != '0' and 0 <= file_id <= len(bundle['external']), 'null/invalid reference')
    if file_id:
        external = bundle['external'][file_id-1]
        cab = external.rsplit('/', 1)[-1]
        supported(external == f'archive:/{cab}/{cab}' and cab in cabs,
                  'unprovided external CAB')
        bundle = cabs[cab]
    supported(pid in bundle['objects'] and bundle['objects'][pid][0] == cls,
              'unresolved source object')
    _, tree, raw = bundle['objects'][pid]
    return bundle, pid, tree, raw

def atlas_records(data):
    # Existing verified GlobalUIAtlas layout: 24-byte key, 84-byte render data.
    n = mesh.u(data)
    supported(n <= 100000 and len(data) == 4 + 108*n, 'unsupported atlas render-data layout')
    result = {}
    for i in range(n):
        p = 4 + i*108
        key = data[p:p+24]
        require(key not in result, 'duplicate atlas render-data key')
        result[key] = data[p+24:p+108]
    return result

def geometry(sprite, cabs, atlas_cache):
    bundle, sid, tree, raw = sprite
    f = helpers.fields(tree, raw, mesh)
    logical = struct.unpack('<4f', f['m_Rect'])
    supported(all(math.isfinite(v) for v in logical) and min(logical[:2]) >= 0 and
              0 < min(logical[2:]) <= max(logical[2:]) <= 4096 and
              f['m_Border'] == bytes(16) and struct.unpack('<2f',f['m_Pivot']) == (.5,.5),
              'unsupported sprite logical geometry')
    atlas_ref = mesh.ptr(f['m_SpriteAtlas'])
    if atlas_ref != [0,'0']:
        supported(logical[:2] == (0.,0.), 'unsupported packed Sprite origin')
        ab, aid, at, ar = resolve(bundle, atlas_ref, cabs, 687078895)
        cache_key = (ab['cab'], aid)
        if cache_key not in atlas_cache:
            atlas_cache[cache_key] = atlas_records(helpers.fields(at, ar, mesh)['m_RenderDataMap'])
        key = f['m_RenderDataKey']
        supported(key in atlas_cache[cache_key], 'unresolved atlas render key')
        rd = atlas_cache[cache_key][key]
        fi, ti, af, ai, *values = struct.unpack('<iqiq4f2f2f4ffII', rd)
        rect, offset = values[:4], values[4:6]
        down, flags, secondary = values[-3:]
        supported(af == ai == secondary == 0 and down == 1 and flags in (65,67),
                  'unsupported atlas rotation/secondary/downscale')
        texture = resolve(ab, [fi,str(ti)], cabs, 28)
        binding = {'atlasCab': ab['cab'], 'atlasPathId': aid,
                   'renderKey': key.hex(), 'renderDataSha256': sha(rd)}
    else:
        node = next(n for n in tree[-1] if n[2] == 'm_RD')
        rd = helpers.fields(node, f['m_RD'], mesh)
        supported(mesh.ptr(rd['alphaTexture']) == [0,'0'] and rd['secondaryTextures'] == bytes(4)
                  and mesh.u(rd['settingsRaw']) in (64,65,67)
                  and struct.unpack('<f', rd['downscaleMultiplier'])[0] == 1,
                  'unsupported standalone sprite layout')
        rect = struct.unpack('<4f', rd['textureRect'])
        offset = struct.unpack('<2f', rd['textureRectOffset'])
        texture = resolve(bundle, mesh.ptr(rd['texture']), cabs, 28)
        binding = {'renderDataSha256': sha(f['m_RD'])}
        if logical[:2] != (0.,0.):
            # Direct texture subrect: verify trim is relative to authored rect.
            supported(all(abs(rect[i]-logical[i]-offset[i]) <= .001 for i in range(2)),
                      'standalone subrect origin/trim mismatch')
            binding['originalRectOrigin'] = logical[:2]
    supported(all(math.isfinite(v) for v in [*rect,*offset]), 'invalid crop coordinates')
    return logical[2:], tuple(rect), tuple(offset), texture, binding

def texture_level_bytes(w,h,fmt):
    if fmt in (10,12):
        return ((w+3)//4)*((h+3)//4)*(8 if fmt==10 else 16)
    return w*h*({3:3,4:4}[fmt])

def texture_data(texture,allowed_color_spaces=(1,)):
    bundle, tid, tree, raw = texture
    f = helpers.fields(tree, raw, mesh)
    w,h,fmt,mips = [mesh.u(f[k]) for k in ('m_Width','m_Height','m_TextureFormat','m_MipCount')]
    supported(0 < min(w,h) <= max(w,h) <= 8192 and mesh.u(f['m_ColorSpace']) in allowed_color_spaces
              and fmt in (3,4,10,12) and 1<=mips<=max(w,h).bit_length(), 'unsupported texture format/mip/color space')
    # Unity Texture2D stores the largest level first. Validate the whole
    # mip chain and bind its original bytes, then decode only level zero.
    expected = sum(texture_level_bytes(max(1,w>>i),max(1,h>>i),fmt) for i in range(mips))
    stream = f['m_StreamData']
    off,z = struct.unpack_from('<QI', stream)
    name,end = mesh.string(stream,12)
    if z:
        supported(name == f"archive:/{bundle['cab']}/{bundle['cab']}.resS" and
                  end == len(stream) and z == expected and off+z <= len(bundle['res']),
                  'unsupported texture stream')
        payload = bundle['res'][off:off+z]
    else:
        data = f.get('image data', b'')
        supported(len(data) == 4+expected and mesh.u(data) == expected, 'unsupported inline texture')
        payload = data[4:]
    from PIL import Image
    top=payload[:texture_level_bytes(w,h,fmt)]
    image = (Image.frombytes('RGBA',(w,h),top,'bcn',1 if fmt==10 else 3) if fmt in (10,12) else
             Image.frombytes('RGB' if fmt == 3 else 'RGBA',(w,h),top).convert('RGBA'))
    return image.transpose(Image.Transpose.FLIP_TOP_BOTTOM), {'textureCab':bundle['cab'],
            'texturePathId':tid,'textureObjectSha256':sha(raw),'texturePayloadSha256':sha(payload)}

def original_canvas(image, logical, rect, offset):
    from PIL import Image
    lw,lh = logical
    x,y,w,h = rect
    ox,oy = offset
    top = lh-oy-h
    supported(0 <= x < x+w <= image.width+.001 and 0 <= y < y+h <= image.height+.001 and
              -.001 <= ox < ox+w <= lw+.001 and -.001 <= top < top+h <= lh+.001,
              'sprite crop outside source/logical bounds')
    # Match the existing original growth-icon extraction's rounded trim
    # geometry. Fractional coordinates are not inferred as exact native
    # framebuffer samples; retain full original rect in the receipt.
    box = (round(x),round(image.height-y-h),round(x+w),round(image.height-y))
    supported(box[0]<box[2] and box[1]<box[3], 'empty rounded crop')
    crop = image.crop(box)
    canvas = Image.new('RGBA',(round(lw),round(lh)))
    left,upper = round(ox),round(top)
    supported(left>=0 and upper>=0 and left+crop.width<=canvas.width and
              upper+crop.height<=canvas.height, 'rounded trim outside logical bounds')
    canvas.paste(crop,(left,upper))
    return canvas

def stage_original_sprites(folder, requests, loaded, cabs, hashes, prior_dir=None, prior=None):
    """Shared original Sprite extraction for all reviewed view/icon roles.
    requests: [(route_key, owner_bundle_name, native PPtr)].
    Identity includes actual Sprite, render data, texture bytes and policy.
    Unsupported pointers stay absent; caller retains explicit null/unresolved.
    """
    jobs=collections.defaultdict(list)
    cache={}
    for key,owner,ref in requests:
        if ref==[0,'0'] or owner not in loaded:continue
        try:
            sprite=resolve(loaded[owner],ref,cabs,213)
            logical,rect,offset,texture,binding=geometry(sprite,cabs,cache)
            jobs[(texture[0]['cab'],texture[1])].append((key,sprite,logical,rect,offset,texture,binding))
        except (Unsupported,KeyError,StopIteration,struct.error):continue
    results={};resolved={}
    for _,group in sorted(jobs.items()):
        try:image,tex=texture_data(group[0][5])
        except (Unsupported,KeyError,StopIteration,struct.error):continue
        for key,sprite,logical,rect,offset,texture,binding in group:
            sb,pid,_,raw=sprite;identity=(sb['cab'],pid)
            if identity not in resolved:
                proof={'spriteSha256':sha(raw),'logicalSize':logical,'rect':rect,'offset':offset,
                       **binding,**tex,'renderer':native_webp.POLICY}
                fingerprint=sha(source.stable(proof))
                old=(prior or {}).get(fingerprint)
                try:
                    if old is not None:
                        asset=native_webp.reuse(folder,prior_dir,old)
                        require((asset['width'],asset['height'])==tuple(round(v) for v in logical),
                                'prior source dimensions mismatch')
                    else:
                        asset=native_webp.store(folder,original_canvas(image,logical,rect,offset))
                except Unsupported:continue
                resolved[identity]={'kind':'sprite','sourceBundleSha256':hashes[sb['cab']],
                    'spritePathId':pid,'sourceSha256':fingerprint,'asset':asset}
            results[key]=resolved[identity]
        del image
    return results

def previous_original_sprites(directory,manifest_name,schema,platform,field):
    if directory is None:return {}
    value=source.read_json(directory/manifest_name)
    require(value['schema']==schema and value['platform']==platform and
            value['artworkPolicy']==native_webp.POLICY and
            value.get('receiptSha256')==sha(source.stable({k:v for k,v in value.items() if k!='receiptSha256'})),
            'previous view art requires native-resolution receipt')
    result={}
    for row in value['rows']:
        icon=row[field]
        if icon['kind']!='sprite':continue
        key=icon['sourceSha256'];asset=icon['asset']
        require(source.SHA.fullmatch(key) and (key not in result or result[key]==asset),'conflicting previous source')
        result[key]=asset
    return result

def crop_tile(image, logical, rect, offset):
    # Legacy production transport only. New candidates use original_canvas.
    from PIL import Image
    canvas = original_canvas(image, logical, rect, offset)
    scale = 84/max(canvas.size)
    size = tuple(max(1,round(v*scale)) for v in canvas.size)
    tile = Image.new('RGBA',(96,96))
    tile.paste(canvas.resize(size,Image.Resampling.LANCZOS),((96-size[0])//2,(96-size[1])//2))
    supported(tile.getchannel('A').getextrema()[1]>0, 'empty original sprite')
    return tile

def visible_hash(image):
    # Invisible RGB is not observable artwork; normalize it for WebP readback.
    from PIL import Image
    alpha = image.getchannel('A')
    normalized = image.copy()
    normalized.paste((0,0,0,0),mask=alpha.point(lambda a:255 if a==0 else 0))
    return sha(normalized.tobytes())

def write_sheet(folder, index, tiles):
    from PIL import Image
    sheet = Image.new('RGBA',(SIDE*COLS,SIDE*((len(tiles)+COLS-1)//COLS)))
    for i,tile in enumerate(tiles):
        sheet.paste(tile,(i%COLS*SIDE,i//COLS*SIDE))
    filename = 'sheet-%03d.webp' % index
    path = folder/filename
    sheet.save(path,lossless=True,method=6,exact=True)
    raw = path.read_bytes()
    with Image.open(path) as decoded:
        require(decoded.size == sheet.size and visible_hash(decoded.convert('RGBA')) == visible_hash(sheet),
                'lossless atlas readback mismatch')
    require(len(raw) <= 2000000, 'atlas sheet exceeds existing delivery bound')
    return {'name':filename,'sha256':sha(raw),'bytes':len(raw)}

def previous_tiles(folder):
    if folder is None:
        return {},[]
    receipt = source.read_json(folder/'index.json')
    payload = {k:v for k,v in receipt.items() if k!='receiptSha256'}
    require(receipt.get('schema')==SCHEMA and receipt.get('renderer')==RENDERER and
            receipt.get('receiptSha256')==sha(source.stable(payload)), 'invalid previous atlas receipt')
    return receipt['sprites'],receipt['sheets']

def read_previous(folder, row, sheets, cache=None):
    from PIL import Image
    sheet,cell = row['sheet'],row['cell']
    require(type(sheet) is int and 0<=sheet<len(sheets) and type(cell) is int and 0<=cell<PER,
            'invalid previous atlas cell')
    record = sheets[sheet]
    filename = 'sheet-%03d.webp' % sheet
    require(record['name']==filename, 'invalid previous sheet path')
    im = cache.get(sheet) if cache is not None else None
    if im is None:
        raw = (folder/filename).read_bytes()
        require(len(raw)==record['bytes'] and len(raw)<=2000000 and sha(raw)==record['sha256'],
                'previous sheet integrity mismatch')
        with Image.open(io.BytesIO(raw)) as decoded:
            require(decoded.width==COLS*SIDE and 0<decoded.height<=COLS*SIDE and
                    decoded.height%SIDE==0, 'previous sheet dimensions')
            im=decoded.convert('RGBA')
        if cache is not None:
            cache.clear()
            cache[sheet]=im
    x,y = cell%COLS*SIDE,cell//COLS*SIDE
    require(y+SIDE<=im.height,'previous cell bounds')
    tile = im.crop((x,y,x+SIDE,y+SIDE))
    require(visible_hash(tile)==row['pixelSha256'],'previous tile identity mismatch')
    return tile

def stage(snapshot, manifest_path, out, prior_dir=None, native_resolution=False):
    rows = source.validate_snapshot(snapshot)
    manifest = source.read_json(manifest_path)
    require(manifest.get('schema')=='HKIA.NativeIconAtlasInput.1' and
            manifest.get('version')==snapshot['version'] and manifest.get('platform')==snapshot['platform'] and
            manifest.get('definitionSnapshotSha256')==snapshot['snapshotSha256'] and
            manifest.get('reviewedLayout')==LAYOUT, 'original release/layout mismatch')
    entries = manifest['bundles']
    require(isinstance(entries,list) and bool(entries) and len({e['name'] for e in entries})==len(entries),
            'missing/duplicate source bundle')
    cabs,loaded = {},{}
    pinned = snapshot['sourceBundleSha256']
    for e in entries:
        require(source.BUNDLE.fullmatch(e['name']) and source.SHA.fullmatch(e['sha256']) and
                (e['name'] not in pinned or pinned[e['name']]==e['sha256']), 'invalid source bundle fingerprint')
        bundle = load_bundle(manifest_path.parent/e['file'],e['sha256'])
        require(bundle['cab'] not in cabs,'ambiguous source CAB')
        cabs[bundle['cab']]=bundle
        loaded[e['name']]=bundle
    require('definitions' in loaded and loaded['definitions']['cab']==snapshot['definitionsCab'] and
            loaded['definitions']['cabSha256']==snapshot['definitionsCabSha256'] and
            next(e['sha256'] for e in entries if e['name']=='definitions')==pinned['definitions'],
            'snapshot definitions mismatch')
    definitions = loaded['definitions']
    require(out.resolve()!=source.ROOT and source.ROOT not in out.resolve().parents and not out.exists(),
            'new staging directory outside repository required')
    if native_resolution:
        old,old_sheets={},[]
        if prior_dir:
            prior=source.read_json(prior_dir/'index.json')
            require(prior.get('schema')=='HKIA.NativeResolutionIconStage.1' and
                    prior.get('renderer')==native_webp.POLICY and prior.get('platform')==snapshot['platform'] and
                    prior.get('receiptSha256')==sha(source.stable({k:v for k,v in prior.items() if k!='receiptSha256'})),
                    'native previous stage must not contain resized legacy assets')
            old=prior['sprites']
    else:
        old,old_sheets = previous_tiles(prior_dir)
    # Group by complete source pointer, not by name or per-item variants.
    groups = collections.defaultdict(list)
    for i,row in rows.items():
        ref = row['sprite']
        groups[(ref['fileId'],ref['pathId'])].append(i)
    atlas_cache,previous_sheet_cache={},{}
    sprites,items,unresolved,sheets={},[],[],[]
    reused=0
    # Plan original crops first; process each source texture once. Thousands
    # of shared sprites must not repeatedly decompress the same large atlas.
    by_texture=collections.defaultdict(list)
    for (fi,sid),ids in sorted(groups.items(),key=lambda pair:(pair[0][0],int(pair[0][1]))):
        try:
            sprite=resolve(definitions,[fi,sid],cabs,213)
            sb,sp,_,raw=sprite
            require(all(rows[i]['sprite']['objectSha256'] in (None,sha(raw)) for i in ids),
                    'snapshot Sprite identity mismatch')
            logical,rect,offset,texture,binding=geometry(sprite,cabs,atlas_cache)
            tb,tid,_,_=texture
            by_texture[(tb['cab'],tid)].append((ids,sprite,logical,rect,offset,texture,binding))
        except (Unsupported,KeyError,StopIteration,struct.error) as exc:
            unresolved.extend({'itemId':i,'reason':str(exc) or type(exc).__name__} for i in ids)
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='hkia-native-atlas-',dir=out.parent) as temp:
        folder=Path(temp)/'result'
        folder.mkdir()
        pending=[]
        for key, jobs in sorted(by_texture.items()):
            try:
                image,tex=texture_data(jobs[0][5])
            except (Unsupported,KeyError,StopIteration,struct.error) as exc:
                unresolved.extend({'itemId':i,'reason':str(exc) or type(exc).__name__}
                                  for job in jobs for i in job[0])
                continue
            for ids,sprite,logical,rect,offset,texture,binding in jobs:
                sb,sp,_,raw=sprite
                sprite_key=sb['cab']+':'+sp
                if sprite_key in sprites:
                    existing=sprites[sprite_key]
                    if native_resolution:items.extend([i,sprite_key] for i in ids)
                    else:items.extend([i,existing['sheet'],existing['cell'],sp] for i in ids)
                    continue
                identity={'spriteCab':sb['cab'],'spritePathId':sp,'spriteSha256':sha(raw),
                          'logicalSize':logical,'rect':rect,'offset':offset,**binding,**tex}
                identity=json.loads(source.stable(identity))
                previous=old.get(sprite_key)
                try:
                    if native_resolution:
                        if previous and previous['binding']==identity:
                            meta=native_webp.reuse(folder,prior_dir,previous['asset'])
                            require((meta['width'],meta['height'])==(round(logical[0]),round(logical[1])),
                                    'prior original dimensions mismatch')
                            reused+=1
                        else:
                            canvas=original_canvas(image,logical,rect,offset)
                            meta=native_webp.store(folder,canvas)
                        sprites[sprite_key]={'binding':identity,'asset':meta}
                        items.extend([i,sprite_key] for i in ids)
                        continue
                    if previous and previous['binding']==identity:
                        tile=read_previous(prior_dir,previous,old_sheets,previous_sheet_cache)
                        reused+=1
                    else:
                        tile=crop_tile(image,logical,rect,offset)
                except Unsupported as exc:
                    unresolved.extend({'itemId':i,'reason':str(exc)} for i in ids)
                    continue
                sheet,cell=len(sheets),len(pending)
                sprites[sprite_key]={'binding':identity,'sheet':sheet,'cell':cell,'pixelSha256':visible_hash(tile)}
                items.extend([i,sheet,cell,sp] for i in ids)
                pending.append(tile)
                if len(pending)==PER:
                    sheets.append(write_sheet(folder,len(sheets),pending))
                    pending=[]
            del image
        if pending:
            sheets.append(write_sheet(folder,len(sheets),pending))
        require(len(items)+len(unresolved)==len(rows),'source route partition')
        result={'schema':SCHEMA,'approval':'review-required','version':snapshot['version'],
                'platform':snapshot['platform'],'definitionSnapshotSha256':snapshot['snapshotSha256'],
                'sourceBundles':{e['name']:e['sha256'] for e in entries},'renderer':RENDERER,
                'size':SIDE,'columns':COLS,'sheets':sheets,'sprites':sprites,
                'records':sorted(items),'unresolved':sorted(unresolved,key=lambda r:r['itemId']),
                'reusedSpriteCount':reused,'definitionCount':len(rows),
                'dynamicReviewItemIds':sorted(i for i,row in rows.items() if row['dynamicColor']),
                'automaticReleaseActivationAuthorized':False}
        if native_resolution:
            result.update(schema='HKIA.NativeResolutionIconStage.1',renderer=native_webp.POLICY)
            for field in ('size','columns','sheets'):del result[field]
            unique={r['asset']['sha256']:r['asset'] for r in sprites.values()}
            result['uniqueAssetCount']=len(unique)
            result['imageBytes']=sum(r['bytes'] for r in unique.values())
        result['receiptSha256']=sha(source.stable(result))
        source.write_new(folder/'index.json',result)
        require(not out.exists(),'staging output already exists')
        folder.rename(out)
    return result

def self_test():
    # Steam anniversary cards: BC1 512px, complete ten-level chain.
    assert sum(texture_level_bytes(max(1,512>>i),max(1,512>>i),10) for i in range(10))==174776
    assert texture_level_bytes(512,512,10)==131072
    # No game bundles or Pillow dependency in the CI schema check.
    key=bytes(range(24))
    rd=struct.pack('<iqiq4f2f2f4ffII',0,123,0,0,2,3,10,11,1,2,0,0,0,0,0,0,1,67,0)
    assert atlas_records(struct.pack('<I',1)+key+rd)=={key:rd}
    for invalid in [struct.pack('<I',1)+key+rd[:-1],struct.pack('<I',2)+(key+rd)*2]:
        try:
            atlas_records(invalid)
        except ValueError:
            pass
        else:
            raise AssertionError('accepted invalid atlas data')
    root={'cab':'CAB-a','external':['archive:/CAB-b/CAB-b'],'objects':{'7':(213,[],b'sprite')}}
    ext={'cab':'CAB-b','external':[],'objects':{'9':(28,[],b'texture')}}
    assert resolve(root,[0,'7'],{},213)[1:] == ('7',[],b'sprite')
    assert resolve(root,[1,'9'],{'CAB-b':ext},28)[1:] == ('9',[],b'texture')
    try:
        resolve(root,[1,'9'],{},28)
    except Unsupported:
        pass
    else:
        raise AssertionError('accepted unavailable texture')
    print('HKIA_NATIVE_ICON_ATLAS_STAGE_SELF_TEST_OK')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--self-test',action='store_true')
    p.add_argument('--snapshot',type=Path)
    p.add_argument('--bundles',type=Path)
    p.add_argument('--previous-stage',type=Path)
    p.add_argument('--native-resolution',action='store_true',help='original-size lossless WebP candidate; no 96px sheets')
    p.add_argument('--out',type=Path)
    a=p.parse_args()
    if a.self_test:
        self_test()
    elif a.snapshot and a.bundles and a.out:
        result=stage(source.read_json(a.snapshot),a.bundles,a.out,a.previous_stage,a.native_resolution)
        print('HKIA_NATIVE_ICON_ATLAS_STAGE',len(result['records']),'of',result['definitionCount'],
              'sprites',len(result['sprites']),'reused',result['reusedSpriteCount'],
              'unresolved',len(result['unresolved']),'review-required')
    else:
        p.error('provide --snapshot, --bundles, --out')
