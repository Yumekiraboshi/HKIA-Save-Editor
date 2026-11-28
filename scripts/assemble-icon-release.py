#!/usr/bin/env python3
"""Assemble a review-only game-release candidate from original icon stages.

Reuse existing 96px collection/inventory sheet and stored ZIP transport.
Dynamic source pages preserve original RGB/alpha texels and fractional
sampling coordinates. Never generate completed appearance combinations,
edit the save engine, or write into the public tree.
"""
import argparse
import collections
import hashlib
import importlib.util
import io
import json
import math
import re
import struct
import tempfile
import zipfile
from pathlib import Path

HERE=Path(__file__).resolve().parent
def module(name):
    spec=importlib.util.spec_from_file_location(name,HERE/(name+'.py'))
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

source=module('icon-source-update')
require,sha=source.require,source.digest
SCHEMA='HKIA.IconReleaseCandidate.1'
RESULT_LAYOUT='native-result-icon-v1'
GROUP=re.compile(r'[a-z_]+')
SUFFIX='.InventoryItemDefinitionAsset'
SIDE,COLS,PER=96,12,144
MAX_TEXTURE_BYTES=1024*1024
MAX_ARCHIVE_BYTES=4_000_000

def receipt(path,schema):
    value=source.read_json(path)
    body={k:v for k,v in value.items() if k!='receiptSha256'}
    require(value.get('schema')==schema and value.get('approval')=='review-required' and
            value.get('receiptSha256')==sha(source.stable(body)),
            'stage receipt identity: '+schema)
    return value

def bind(value,snapshot,platform_key='platform'):
    require(value['version']==snapshot['version'] and
            value[platform_key]==snapshot['platform'] and
            value['definitionSnapshotSha256']==snapshot['snapshotSha256'],
            'stage source version/snapshot mismatch')

def check_bundles(known,observed):
    for name,fingerprint in observed.items():
        require(source.BUNDLE.fullmatch(name) and source.SHA.fullmatch(fingerprint),
                'invalid source bundle fingerprint')
        require(name not in known or known[name]==fingerprint,
                'inconsistent source bundle: '+name)
        known[name]=fingerprint

def group_catalog(catalog,rows,version):
    require(catalog.get('schema')=='HKIA.CollectionDisplayCatalog.2' and
            catalog.get('version')==version,'collection catalog source version')
    groups={g[0] for g in catalog['groups']}
    require(len(groups)==len(catalog['groups']) and all(GROUP.fullmatch(g) for g in groups),
            'invalid collection group identities')
    result={}
    for row in catalog['items']:
        i,key,_,group=row[:4]
        require(type(i) is int and i in rows and i not in result and group in groups and
                rows[i]['key']==key+SUFFIX,'collection item/source identity mismatch')
        result[i]=group
    return result

def original_routes(snapshot,rows,path,reviewed):
    # Original managed result-reference layout, also used by the existing
    # pinned extractor. The version-independent walker retains the original
    # class and PPtr checks; version-specific counts remain pinned below.
    baseline=snapshot['version']=='3.0.1' and snapshot['platform']=='switch'
    require(baseline or reviewed==RESULT_LAYOUT,'review native main icon route layout')
    helpers=module('extract-native-result-icons')
    mesh=helpers.module('extract-furniture-mesh-source')
    typed=helpers.module('extract-furniture-preview-camera')
    audit=helpers.module('unityfs-audit')
    require(path.stat().st_size<=audit.MAX_INPUT,'definition bundle too large')
    raw=path.read_bytes()
    require(sha(raw)==snapshot['sourceBundleSha256']['definitions'],'definition fingerprint')
    data=dict(audit.extract_nodes(raw)[1])[snapshot['definitionsCab']]
    require(sha(data)==snapshot['definitionsCabSha256'],'definition CAB fingerprint')
    objects,_=typed.load(data,mesh)
    definitions={r['definitionPathId']:i for i,r in rows.items()}
    require(len(definitions)==len(rows),'duplicate definition PPtr')
    results,placeholder={},set()
    for i,row in rows.items():
        cls,tree,b=objects[row['definitionPathId']]
        require(cls==114 and sha(b)==row['definitionSha256'],'snapshot definition identity')
        f=helpers.fields(tree,b,mesh)
        require(mesh.u(f['Id'])==i and mesh.ptr(f['UiIcon'])==
                [row['sprite']['fileId'],row['sprite']['pathId']],'snapshot item pointer')
        fi,sid=mesh.ptr(f['UiIcon'])
        if fi==0 and sid!='0':
            sc,st,sb=objects[sid]
            require(sc==213 and sha(sb)==row['sprite']['objectSha256'],'snapshot Sprite identity')
            if mesh.string(helpers.fields(st,sb,mesh)['m_Name'])[0]=='icon_placeholder':
                placeholder.add(i)
        ref=f['references']
        # Unrelated managed registries may contain multiple children.
        # Only the known result classes use the reviewed one-root layout.
        classes=[c for c in helpers.CLASSES if c.encode() in ref]
        if not classes:
            continue
        require(len(classes)==1 and len(ref)>=20 and struct.unpack_from('<II',ref)==(2,1) and
                ref[8:16]==f['Details'],'unsupported result managed references')
        name,p=mesh.string(ref,16)
        require(name==classes[0],'native result root class mismatch')
        ns,p=mesh.string(ref,p)
        asm,p=mesh.string(ref,p)
        require(ns=='Sunblink.Game' and asm=='Assembly-CSharp','native result class')
        if name=='SchematicDetails':
            require(len(ref)-p==12,'native schematic layout')
            file,craft=mesh.ptr(ref,p)
            require(file==0 and objects[craft][0]==114,'native craft reference')
            _,ct,cb=objects[craft]
            cf=helpers.fields(ct,cb,mesh)
            file,target=mesh.ptr(cf['CraftableItem'])
        else:
            n=mesh.u(ref,p+16)
            require(len(ref)-p==48+n*16,'native recipe layout')
            file,target=mesh.ptr(ref,p+32+n*16)
        require(file==0 and target in definitions and definitions[target]!=i,
                'unresolved native result definition')
        results[i]=definitions[target]
    require(not(set(results)&set(results.values())),'nested native result route')
    if baseline:
        expected=source.read_json(source.ROOT/'data/native-result-icon-routes-v3.0.1.json')
        require(sorted([i,t] for i,t in results.items())==expected['rows'],'baseline result routes')
        expected=source.read_json(source.ROOT/'data/native-placeholder-main-routes-v3.0.1.json')
        require(placeholder==set(expected['ids']),'baseline placeholder routes')
    return results,placeholder

def checked_file(folder,name,expected,size=None,limit=2_000_000):
    require(re.fullmatch(r'[a-z0-9.-]+',name) and '..' not in name and
            source.SHA.fullmatch(expected),'unsafe staged asset descriptor')
    path=folder/name
    length=path.stat().st_size
    require(0<length<=limit and (size is None or length==size),'staged asset size: '+name)
    raw=path.read_bytes()
    require(sha(raw)==expected,'staged asset digest: '+name)
    return raw

def base_partition(stage,rows):
    require(stage['definitionCount']==len(rows) and stage['size']==SIDE and stage['columns']==COLS,
            'base atlas geometry/definition census')
    cells={}
    sprites_by_cell={}
    for key,rec in stage['sprites'].items():
        binding=rec['binding']
        require(key==binding['spriteCab']+':'+binding['spritePathId'],'base sprite key')
        pos=(rec['sheet'],rec['cell'])
        require(pos not in sprites_by_cell and type(pos[0]) is int and 0<=pos[0]<len(stage['sheets']) and
                type(pos[1]) is int and 0<=pos[1]<PER,'base sprite cell identity')
        sprites_by_cell[pos]=rec
    for i,sheet,cell,pid in stage['records']:
        require(type(i) is int and i in rows and i not in cells and (sheet,cell) in sprites_by_cell,
                'base route identity')
        rec=sprites_by_cell[sheet,cell]
        require(rec['binding']['spritePathId']==pid==rows[i]['sprite']['pathId'] and
                rows[i]['sprite']['objectSha256'] in (None,rec['binding']['spriteSha256']),
                'base route/source binding mismatch')
        cells[i]=(sheet,cell,pid)
    missing=[r['itemId'] for r in stage['unresolved']]
    require(len(set(missing))==len(missing) and not set(missing)&set(cells) and
            (set(missing)|set(cells))==set(rows),'base route partition')
    require(set(sprites_by_cell)=={v[:2] for v in cells.values()},'orphan base sprite cells')
    return cells,sprites_by_cell

def override_partition(stage,snapshot,rows):
    require(snapshot.get('outfitIconOverrideLayout')==source.OUTFIT_LAYOUT,
            'reviewed IconOverride definition layout required')
    expected={i:r['outfitIconOverrideGuid'] for i,r in rows.items() if r['outfitIconOverrideGuid']}
    records={}
    for key,record in stage['records'].items():
        i=int(key)
        require(str(i)==key and i in expected and record['file']==key+'.webp','override Item ID')
        b=record['binding']
        require(b['assetGuid']==expected[i] and b['itemId']==i and
                b['serializedGuidBytes']==rows[i]['serializedGuidBytes'] and
                b['itemKey']+SUFFIX==rows[i]['key'],'override source binding')
        records[i]=record
    missing=stage['unresolvedItemIds']
    require(stage['expectedCount']==len(expected) and len(set(missing))==len(missing) and
            not set(missing)&set(records) and (set(missing)|set(records))==set(expected),
            'override route partition')
    return expected,records

def dynamic_partition(bindings,stage,rows):
    dynamic={r['itemId']:r for r in bindings['rows']}
    require(len(dynamic)==len(bindings['rows']) and
            set(dynamic)=={i for i,r in rows.items() if r['dynamicColor']},'dynamic definition census')
    wanted=set()
    for i,row in dynamic.items():
        require(row['baseSprite']==rows[i]['sprite'] and
                row['definitionSha256']==rows[i]['definitionSha256'],'dynamic source binding')
        wanted.add('base:'+str(i))
        for ref in [row['directMask'],*row['flowerMasks']]:
            if ref['guid']:
                require(re.fullmatch(r'[0-9a-f]{32}',ref['guid']),'dynamic mask GUID')
                wanted.add('mask:'+ref['guid'])
    records=stage['records']
    unresolved=[r['key'] for r in stage['unresolved']]
    require(stage['dynamicReceiptSha256']==bindings['receiptSha256'] and
            len(set(unresolved))==len(unresolved) and not set(unresolved)&set(records) and
            (set(unresolved)|set(records))==wanted,'dynamic source route partition')
    require(set(stage['textures'])=={r['texture'] for r in records.values()},
            'orphan/missing dynamic texture')
    return dynamic

def plan_routes(rows,cells,expected,overrides,dynamic,texture_records,results,placeholders):
    routes={}
    for i in sorted(rows):
        blockers=[]
        if i in expected:
            kind='original-override'
            if i not in overrides: blockers.append('missing-original-override')
        elif i in dynamic and dynamic[i]['family']!='instruction':
            row=dynamic[i]
            kind=row['family']
            required=['base:'+str(i)]
            required.extend('mask:'+r['guid'] for r in [row['directMask'],*row['flowerMasks']] if r['guid'])
            if kind not in ('flower','cafe','boba','wand','palette'):
                blockers.append('unknown-dynamic-family')
            if len(required)==1: blockers.append('missing-native-mask-binding')
            if any(k not in texture_records for k in required): blockers.append('missing-dynamic-source')
        else:
            kind='source-placeholder' if i in placeholders else 'original-base'
            if i not in cells: blockers.append('missing-original-base')
        routes[i]={'itemId':i,'kind':kind,'sourceBlockers':blockers}
    # Native inventory results use the target's original artwork, never the
    # unrelated instruction's own source. Collection still uses its own ID.
    for i,target in sorted(results.items()):
        require(i in routes and target in routes and target not in results,'invalid native result route')
        t=routes[target]
        blockers=list(t['sourceBlockers'])
        if t['kind'] not in ('original-override','original-base','source-placeholder'):
            blockers.append('unreviewed-dynamic-result-target')
        routes[i]={'itemId':i,'kind':'native-result','targetItemId':target,'sourceBlockers':blockers}
    return routes

def zip_bytes(files):
    buffer=io.BytesIO()
    with zipfile.ZipFile(buffer,'w',compression=zipfile.ZIP_STORED) as z:
        for name,data in files:
            info=zipfile.ZipInfo(name,(1980,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_STORED
            info.create_system=0
            z.writestr(info,data)
    return buffer.getvalue()

def stored_pack(folder,name,entries):
    raw=zip_bytes(entries)
    require(len(raw)<=MAX_ARCHIVE_BYTES,'stored ZIP transport bound')
    (folder/name).write_bytes(raw)
    return {'file':name,'bytes':len(raw),'sha256':sha(raw),
            'gitBlobSha1':hashlib.sha1(('blob '+str(len(raw))+'\0').encode()+raw).hexdigest()}

def split_archives(folder,group,entries):
    # Group index occurs exactly once. Keep total browser budget and existing
    # ZIP transport, with generated part count for the release adapter.
    pending=[];parts=[]
    for entry in entries:
        if pending and sum(len(b)+256 for _,b in pending)+len(entry[1])+256>MAX_ARCHIVE_BYTES:
            name=group+('-'+str(len(parts)) if parts else '')+'.zip'
            parts.append(stored_pack(folder,name,pending))
            pending=[]
        pending.append(entry)
    if pending:
        name=group+('-'+str(len(parts)) if parts else '')+'.zip'
        parts.append(stored_pack(folder,name,pending))
    require(sum(p['bytes'] for p in parts)<=20*1024*1024,'collection group delivery budget')
    return parts

def pack_static(folder,base_dir,base,cells,sprite_cells,groups,placeholders,dynamic,texture_records,atlas):
    from PIL import Image
    cache={}
    def tile(pos):
        sheet,cell=pos
        if sheet not in cache:
            m=base['sheets'][sheet]
            require(m['name']=='sheet-%03d.webp'%sheet,'base sheet filename')
            raw=checked_file(base_dir,m['name'],m['sha256'],m['bytes'])
            with Image.open(io.BytesIO(raw)) as im:
                require(im.width==SIDE*COLS and SIDE<=im.height<=SIDE*COLS and im.height%SIDE==0,
                        'base sheet dimensions')
                cache.clear()
                cache[sheet]=im.convert('RGBA')
        im=cache[sheet]
        x,y=cell%COLS*SIDE,cell//COLS*SIDE
        require(y+SIDE<=im.height,'base cell bounds')
        out=im.crop((x,y,x+SIDE,y+SIDE))
        require(atlas.visible_hash(out)==sprite_cells[pos]['pixelSha256'],'base cell pixel identity')
        return out
    packs=folder/'item-packs';packs.mkdir()
    extra=folder/'inventory-art';extra.mkdir()
    parts={};pack_digests=[]
    by_group=collections.defaultdict(list)
    for i,group in groups.items():
        if i in cells:by_group[group].append(i)
    def make_sheets(out,ids):
        # Preserve source sharing within each output group and process each
        # original sheet in order, avoiding repeated texture decode.
        positions=collections.defaultdict(list)
        for i in ids:positions[cells[i][:2]].append(i)
        pending=[];metadata=[];records=[]
        for pos,members in sorted(positions.items()):
            sheet,cell=len(metadata),len(pending)
            pending.append(tile(pos))
            records.extend([i,sheet,cell,cells[i][2]] for i in members)
            if len(pending)==PER:
                metadata.append(atlas.write_sheet(out,len(metadata),pending));pending=[]
        if pending:metadata.append(atlas.write_sheet(out,len(metadata),pending))
        return metadata,sorted(records)
    for group,ids in sorted(by_group.items()):
        with tempfile.TemporaryDirectory() as tmp:
            sheet_dir=Path(tmp)
            metas,records=make_sheets(sheet_dir,ids)
            require(len(metas)<=251 and len(records)<=15000,'collection sheet/index bound')
            index={'schema':'HKIA.SheetIcons.1','group':group,'size':SIDE,'columns':COLS,
                   'records':[r[:3] for r in records]}
            entries=[('index.json',source.stable(index))]
            entries.extend((m['name'],(sheet_dir/m['name']).read_bytes()) for m in metas)
            result=split_archives(packs,group,entries)
            parts[group]=len(result)
            pack_digests.extend([p['file'],p['bytes'],p['gitBlobSha1']] for p in result)
    extra_ids=sorted(set(cells)-set(groups)-set(placeholders))
    metas,records=make_sheets(extra,extra_ids)
    placeholder_records={}
    placeholder_dir=folder/'original-placeholder-art';placeholder_dir.mkdir()
    placeholder_cells={}
    for i in sorted(set(placeholders)&set(cells)):
        pos=cells[i][:2]
        if pos not in placeholder_cells:
            im=tile(pos)
            b=io.BytesIO();im.save(b,format='WEBP',lossless=True,method=4,exact=True)
            raw=b.getvalue()
            with Image.open(io.BytesIO(raw)) as check:
                require(atlas.visible_hash(check.convert('RGBA'))==atlas.visible_hash(im),'placeholder pixel readback')
            name=sha(raw)+'.webp'
            (placeholder_dir/name).write_bytes(raw)
            placeholder_cells[pos]={'file':name,'sha256':sha(raw),'spritePathId':cells[i][2]}
        placeholder_records[str(i)]=placeholder_cells[pos]
    source.write_new(placeholder_dir/'index.json',{'records':placeholder_records})
    withheld=[[i,cells[i][2],'source-placeholder'] for i in sorted((set(placeholders)&set(cells))-set(groups))]
    # Never fabricate an ordinary base. An actual guarded dynamic base can
    # cover a missing static cell, but its family manifest still needs review.
    withheld.extend([i,dynamic[i]['baseSprite']['pathId'],'dynamic-color']
        for i in sorted(set(dynamic)-set(cells)-set(groups)-set(placeholders))
        if dynamic[i]['family'] in ('flower','cafe','boba','wand','palette') and 'base:'+str(i) in texture_records)
    withheld.sort()
    missing_extra=sorted(set(base_id for base_id in (r['itemId'] for r in base['unresolved']))
                         -set(groups)-{r[0] for r in withheld})
    source.write_new(extra/'index.json',{'schema':'HKIA.InventoryNativeArt.1',
        'version':base['version'],'definitionsSha256':base['sourceBundles']['definitions'],
        'atlasSha256':base['sourceBundles'].get('atlas_global'),'size':SIDE,'columns':COLS,
        'count':len(records),'withheldCount':len(withheld),'sheets':metas,'records':records,'withheld':withheld})
    return {'collectionPackParts':parts,'collectionPackDigests':sorted(pack_digests),
            'collectionBaseCount':sum(map(len,by_group.values())),
            'inventoryBaseCount':len(records),'placeholderCount':len(placeholder_records),
            'missingInventoryBaseItemIds':missing_extra}

def pack_overrides(folder,stage_dir,records):
    from PIL import Image
    out=folder/'original-override-packs';out.mkdir()
    entries=[];packs=[];index={}
    def flush():
        if not entries:return
        name='override-%03d.zip'%len(packs)
        p=stored_pack(out,name,[(f,b) for f,b,_ in entries])
        p['count']=len(entries);packs.append(p)
        for file,raw,i in entries:
            index[str(i)]={'file':file,'sha256':sha(raw),'pack':name,'binding':records[i]['binding']}
        entries.clear()
    for i,rec in sorted(records.items()):
        raw=checked_file(stage_dir,rec['file'],rec['sha256'],limit=200000)
        with Image.open(io.BytesIO(raw)) as im:
            require(im.format=='WEBP' and im.size==(SIDE,SIDE),'override image dimensions')
            im.load()
        if len(entries)==PER or sum(len(b)+256 for _,b,_ in entries)+len(raw)+256>MAX_ARCHIVE_BYTES:flush()
        entries.append((rec['file'],raw,i))
    flush()
    source.write_new(out/'index.json',{'schema':'HKIA.OriginalOverridePackCandidate.1','packs':packs,
                                      'records':index})
    return len(index)

def shelf_pages(sizes,limit=1024):
    pages=[];page=[];x=y=row_h=0
    for key,w,h in sorted(sizes,key=lambda v:(-v[2],-v[1],v[0])):
        require(0<w<=limit and 0<h<=limit,'dynamic crop page bound')
        if x+w>limit:x=0;y+=row_h;row_h=0
        if y+h>limit:
            pages.append(page);page=[];x=y=row_h=0
        page.append((key,x,y,w,h))
        x+=w;row_h=max(row_h,h)
    if page:pages.append(page)
    return pages

def edge_pad(im):
    # A crop touching the original texture edge has no outside guard texel.
    # Repeat the original edge so packing beside another crop cannot change
    # bilinear clamp behavior. No original pixel is resampled.
    from PIL import Image
    w,h=im.size
    out=Image.new('RGB',(w+2,h+2))
    out.paste(im,(1,1))
    out.paste(im.crop((0,0,1,h)),(0,1))
    out.paste(im.crop((w-1,0,w,h)),(w+1,1))
    out.paste(im.crop((0,0,w,1)),(1,0))
    out.paste(im.crop((0,h-1,w,h)),(1,h+1))
    for x,sx in ((0,0),(w+1,w-1)):
        for y,sy in ((0,0),(h+1,h-1)):
            out.putpixel((x,y),im.getpixel((sx,sy)))
    return out

def pack_dynamic(folder,stage_dir,stage):
    from PIL import Image
    out=folder/'dynamic-source-pages';out.mkdir()
    images={};sizes=[]
    for key,m in stage['textures'].items():
        require(source.SHA.fullmatch(key) and m['file']==key+'.webp' and
                key==sha(source.stable(m['binding'])),'dynamic texture binding identity')
        raw=checked_file(stage_dir,m['file'],m['sha256'],m['bytes'],MAX_TEXTURE_BYTES)
        with Image.open(io.BytesIO(raw)) as im:
            require(im.format=='WEBP' and im.mode=='RGB' and im.size==(m['width'],m['height']) and
                    im.height%2==0 and 0<im.width<=1024 and 0<im.height<=2048,
                    'dynamic original texture geometry')
            pixels=im.copy()
        require(sha(pixels.tobytes())==m['rgbSha256'],'dynamic original RGB identity')
        images[key]=pixels;sizes.append((key,pixels.width+2,pixels.height//2+2))
    pages=[];placement={}
    def emit(group):
        width=max(x+w for _,x,y,w,h in group)
        height=max(y+h for _,x,y,w,h in group)
        im=Image.new('RGB',(width,height*2))
        for key,x,y,w,h in group:
            src=images[key]
            ow,oh=w-2,h-2
            im.paste(edge_pad(src.crop((0,0,ow,oh))),(x,y))
            im.paste(edge_pad(src.crop((0,oh,ow,oh*2))),(x,y+height))
        b=io.BytesIO();im.save(b,format='WEBP',lossless=True,method=4,exact=True)
        raw=b.getvalue()
        if len(raw)>MAX_TEXTURE_BYTES:
            require(len(group)>1,'individual dynamic crop exceeds delivery bound')
            mid=len(group)//2
            for sub in (group[:mid],group[mid:]):
                for p in shelf_pages([(k,w,h) for k,_,_,w,h in sub]):emit(p)
            return
        with Image.open(io.BytesIO(raw)) as check:
            require(check.mode=='RGB' and check.size==im.size and check.tobytes()==im.tobytes(),
                    'packed source RGB/alpha readback')
        name='source-%s.webp'%sha(raw)
        (out/name).write_bytes(raw)
        meta={'file':name,'bytes':len(raw),'sha256':sha(raw),'rgbSha256':sha(im.tobytes()),
              'width':width,'height':height*2}
        pages.append(meta)
        for key,x,y,w,h in group:placement[key]=(meta,x+1,y+1,w-2,h-2,height)
    for group in shelf_pages(sizes):emit(group)
    records={}
    for key,r in sorted(stage['records'].items()):
        meta,x,y,w,h,height=placement[r['texture']]
        sx,sy,sw,sh=r['sampleRect']
        require(r['alphaOffsetY']==h and all(math.isfinite(v) for v in [sx,sy,sw,sh]) and
                0<=sx<sx+sw<=w+.001 and 0<=sy<sy+sh<=h+.001,'dynamic source sample bounds')
        records[key]={**r,'asset':meta,'sampleRect':[sx+x,sy+y,sw,sh],
                      'guardRect':[x,y,w,h],'alphaOffsetY':height}
    source.write_new(out/'index.json',{'schema':'HKIA.DynamicSourcePageCandidate.1','version':stage['version'],
                                      'renderer':stage['renderer'],'pages':pages,
                                      'records':records,'unresolved':stage['unresolved']})
    return len(records),len(pages)

def assemble(args):
    # Load and validate the source-bound receipts before producing anything.
    snapshot=source.read_json(args.snapshot)
    rows=source.validate_snapshot(snapshot)
    override_snapshot=source.read_json(args.override_snapshot) if args.override_snapshot else snapshot
    override_rows=source.validate_snapshot(override_snapshot)
    require(snapshot['version']==override_snapshot['version'] and set(rows)==set(override_rows) and
            all((r['key'],r['serializedGuidBytes'])==
                (override_rows[i]['key'],override_rows[i]['serializedGuidBytes']) for i,r in rows.items()),
            'cross-platform definition identity mismatch')
    base=receipt(args.base_stage/'index.json','HKIA.NativeIconAtlasStaging.1')
    overrides=receipt(args.override_stage/'index.json','HKIA.IconOverrideStaging.1')
    bindings=receipt(args.dynamic_receipt,'HKIA.DynamicIconSourceCandidate.1')
    dynamic_stage=receipt(args.dynamic_stage/'index.json','HKIA.DynamicIconTextureStaging.1')
    for item in (base,bindings,dynamic_stage):bind(item,snapshot)
    bind(overrides,override_snapshot,'definitionPlatform')
    require(overrides['assetPlatform']==snapshot['platform'],'override artwork platform mismatch')
    known=dict(snapshot['sourceBundleSha256'])
    for value in (base,overrides,dynamic_stage):check_bundles(known,value['sourceBundles'])
    check_bundles(known,bindings['sourceBundleSha256'])
    require(base['sourceBundles'].get('definitions')==snapshot['sourceBundleSha256']['definitions'] and
            dynamic_stage['sourceBundles'].get('definitions')==snapshot['sourceBundleSha256']['definitions'],
            'staged original definition mismatch')
    catalog=group_catalog(source.read_json(args.catalog),rows,snapshot['version'])
    cells,sprite_cells=base_partition(base,rows)
    expected,completed=override_partition(overrides,override_snapshot,override_rows)
    dynamic=dynamic_partition(bindings,dynamic_stage,rows)
    results,placeholders=original_routes(snapshot,rows,args.definitions,args.reviewed_result_layout)
    routes=plan_routes(rows,cells,expected,completed,dynamic,dynamic_stage['records'],results,placeholders)
    require(args.out.resolve()!=source.ROOT and source.ROOT not in args.out.resolve().parents and
            not args.out.exists(),'new staging directory outside repository required')
    atlas=module('stage-native-icon-atlas')
    args.out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='hkia-icon-release-',dir=args.out.parent) as tmp:
        folder=Path(tmp)/'candidate';folder.mkdir()
        static=pack_static(folder,args.base_stage,base,cells,sprite_cells,catalog,placeholders,dynamic,dynamic_stage['records'],atlas)
        override_count=pack_overrides(folder,args.override_stage,completed)
        texture_count,page_count=pack_dynamic(folder,args.dynamic_stage,dynamic_stage)
        report={'schema':SCHEMA,'approval':'review-required','version':snapshot['version'],
                'platform':snapshot['platform'],'snapshotSha256':snapshot['snapshotSha256'],
                'overrideSnapshotSha256':override_snapshot['snapshotSha256'],
                'inputReceipts':{k:v['receiptSha256'] for k,v in
                    [('base',base),('overrides',overrides),('dynamicBindings',bindings),('dynamicTextures',dynamic_stage)]},
                'definitionCount':len(rows),'sourceBundles':known,**static,
                'completedOverrideCount':override_count,'dynamicSourceCount':texture_count,
                'dynamicPageCount':page_count,'nativeResultRoutes':sorted([i,t] for i,t in results.items()),
                'nativePlaceholderItemIds':sorted(placeholders),'routes':list(routes.values()),
                'missingCollectionBaseItemIds':sorted(set(catalog)-set(cells)),
                'unresolvedInventorySourceItemIds':[i for i,r in routes.items() if r['sourceBlockers']],
                'remainingReleaseChecks':['verify source image sampling and special native routes',
                    'extract and verify characteristic/swatch, growth, decorator and wand overlay dependencies',
                    'generate and verify family runtime manifests and version-bound loader/cache identities',
                    'verify collection/achievement catalogs, save compatibility and actual browser/game display'],
                'automaticReleaseActivationAuthorized':False}
        report['outputFiles']={str(p.relative_to(folder)).replace('\\','/'):
             {'bytes':p.stat().st_size,'sha256':source.file_digest(p)}
             for p in sorted(folder.rglob('*')) if p.is_file()}
        report['receiptSha256']=sha(source.stable(report))
        source.write_new(folder/'release-candidate.json',report)
        require(not args.out.exists(),'candidate output already exists')
        folder.rename(args.out)
    return report

def self_test():
    rows={i:{} for i in range(1,8)}
    dynamic={3:{'family':'flower','directMask':{'guid':None},'flowerMasks':[{'guid':'a'*32}]},
             4:{'family':'unknown','directMask':{'guid':'b'*32},'flowerMasks':[]}}
    p=plan_routes(rows,{1:1,2:1,5:1,6:1,7:1},{2:'c'*32,7:'d'*32},{2:1},dynamic,
                  {'base:3':1,'mask:'+'a'*32:1},{6:7},{5})
    assert p[1]['kind']=='original-base' and p[2]['kind']=='original-override'
    assert p[3]['kind']=='flower' and not p[3]['sourceBlockers']
    assert p[4]['sourceBlockers']==['unknown-dynamic-family','missing-dynamic-source']
    assert p[5]['kind']=='source-placeholder'
    assert p[6]['targetItemId']==7 and p[6]['sourceBlockers']==['missing-original-override']
    assert p[7]['sourceBlockers']==['missing-original-override']
    sizes=[('a',700,500),('b',500,500),('c',600,500),('d',300,600)]
    pages=shelf_pages(sizes)
    assert sorted(k for page in pages for k,*_ in page)==list('abcd')
    for page in pages:
        for k,x,y,w,h in page:
            assert x+w<=1024 and y+h<=1024
            assert all(k==k2 or x+w<=x2 or x2+w2<=x or y+h<=y2 or y2+h2<=y
                       for k2,x2,y2,w2,h2 in page)
    a=zip_bytes([('index.json',b'{}'),('sheet-000.webp',b'original')])
    assert a==zip_bytes([('index.json',b'{}'),('sheet-000.webp',b'original')])
    with zipfile.ZipFile(io.BytesIO(a)) as z:
        assert z.namelist()==['index.json','sheet-000.webp'] and all(i.compress_type==0 for i in z.infolist())
    try:
        from PIL import Image
    except ImportError:
        pass
    else:
        im=Image.new('RGB',(2,2))
        im.putdata([(10,20,30),(40,50,60),(70,80,90),(100,110,120)])
        padded=edge_pad(im)
        assert padded.size==(4,4) and padded.crop((1,1,3,3)).tobytes()==im.tobytes()
        assert padded.getpixel((0,0))==im.getpixel((0,0))
        assert padded.getpixel((3,3))==im.getpixel((1,1))
    print('HKIA_ICON_RELEASE_ASSEMBLY_SELF_TEST_OK')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--self-test',action='store_true')
    for name in ('snapshot','override-snapshot','definitions','catalog','base-stage','override-stage',
                 'dynamic-receipt','dynamic-stage','out'):
        p.add_argument('--'+name,type=Path)
    p.add_argument('--reviewed-result-layout',choices=[RESULT_LAYOUT])
    a=p.parse_args()
    if a.self_test:self_test()
    elif all(getattr(a,k) for k in ('snapshot','definitions','catalog','base_stage','override_stage',
                                     'dynamic_receipt','dynamic_stage','out')):
        result=assemble(a)
        print('HKIA_ICON_RELEASE_CANDIDATE',result['definitionCount'],'definitions',
              len(result['unresolvedInventorySourceItemIds']),'unresolved inventory sources',
              len(result['missingCollectionBaseItemIds']),'missing collection bases','review-required')
    else:p.error('provide snapshot, definitions, catalog, all source stages, dynamic receipt and out')
