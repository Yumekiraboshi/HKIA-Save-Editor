#!/usr/bin/env python3
"""Stage completed original IconOverride imagery from source-exact GUID routes.

No name-only fallback, no save edits, no public asset writes. Reuse the
existing lossless 96px BC3 Sprite decoder. Candidate releases and unsupported
source layouts remain unapproved; actual original dependencies are required.
"""
import argparse
import hashlib
import importlib.util
import json
import re
import shutil
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
decoder = module('extract-dynamic-colorways')
native_webp = module('native-raster-webp')
require = source.require
sha = source.digest
RENDERER = 'original-BC3-256-to-84-in-96-v1'
SCHEMA = 'HKIA.IconOverrideStaging.1'

def read_container(raw, targets, name=decoder.name, ptr=decoder.ptr):
    """Resolve only the actual AssetBundle container GUID entries."""
    _, p = name(raw)
    preloads = struct.unpack_from('<I', raw, p)[0]
    p += 4 + 12 * preloads
    require(preloads <= 2000000 and p + 4 <= len(raw), 'container preload bounds')
    count = struct.unpack_from('<I', raw, p)[0]
    p += 4
    require(count <= 2000000, 'container size')
    selected = {}
    for _ in range(count):
        key, p = name(raw, p)
        require(p + 20 <= len(raw), 'container entry bounds')
        first, size = struct.unpack_from('<ii', raw, p)
        require(first >= 0 and size >= 0 and first + size <= preloads, 'container range')
        ref = ptr(raw, p + 8)
        p += 20
        if key in targets:
            require(ref[0] == 0 and ref[1] != '0', 'external or null IconOverride')
            selected.setdefault(key, []).append(ref[1])
    return selected

def snapshot_targets(snapshot):
    rows = source.validate_snapshot(snapshot)
    require(snapshot.get('outfitIconOverrideLayout') == source.OUTFIT_LAYOUT,
            'snapshot requires reviewed native outfit layout')
    targets = {}
    for item_id, row in rows.items():
        guid = row['outfitIconOverrideGuid']
        if guid is None:
            continue
        require(re.fullmatch(r'[0-9a-f]{32}', guid) and guid not in targets,
                'ambiguous override GUID')
        key = row['key']
        suffix = '.InventoryItemDefinitionAsset'
        require(key.endswith(suffix) and re.fullmatch(r'item_[a-z0-9_]+', key[:-len(suffix)]),
                'unsupported definition key')
        require(type(item_id) is int and 0 < item_id <= 0x7fffffff, 'invalid Item ID')
        targets[guid] = (item_id, key[:-len(suffix)], row['serializedGuidBytes'])
    return targets

def binding_identity(guid, target, sprite_id, sprite, texture_id, texture, stream_hash):
    item, key, serialized_guid = target
    return {'itemId': item, 'itemKey': key, 'serializedGuidBytes': serialized_guid,
            'assetGuid': guid, 'spritePathId': sprite_id, 'texturePathId': texture_id,
            'spriteSha256': sha(sprite), 'textureObjectSha256': sha(texture),
            'textureStreamSha256': stream_hash, 'renderer': RENDERER}

def read_prior(directory):
    if directory is None:
        return {}
    index = source.read_json(directory / 'index.json')
    require(index.get('schema') == SCHEMA and index.get('approval') == 'review-required',
            'invalid previous staging receipt')
    payload = {k: v for k, v in index.items() if k != 'receiptSha256'}
    require(index.get('receiptSha256') == sha(source.stable(payload)), 'previous receipt integrity')
    return index['records']

def reuse_previous(directory, previous, identity):
    record = previous.get(str(identity['itemId']))
    if not directory or not record or record.get('binding') != identity:
        return None
    filename = str(identity['itemId']) + '.webp'
    require(record.get('file') == filename, 'previous image name mismatch')
    path = directory / filename
    require(path.stat().st_size <= 200000, 'previous image size')
    data = path.read_bytes()
    require(sha(data) == record['sha256'], 'previous image SHA-256 mismatch')
    return data

def scan_bundle(path, expected, name, targets, helper, previous, prior_dir, stage,native_resolution=False):
    require(path.stat().st_size <= helper.auditor.MAX_INPUT, 'source bundle too large')
    raw = path.read_bytes()
    require(sha(raw) == expected, 'source bundle hash mismatch: ' + name)
    _, pairs = helper.auditor.extract_nodes(raw)
    nodes = dict(pairs)
    cabs = [k for k in nodes if re.fullmatch(r'CAB-[0-9a-f]{32}', k)]
    require(len(cabs) == 1, 'one source CAB required')
    cab = cabs[0]
    objects = {}
    for cls, pid, blob, endian in helper.serialized_objects(nodes[cab], classes=(28, 142, 213)):
        require(endian == '<' and pid not in objects, 'unsupported source object identity')
        objects[pid] = (cls, blob)
    containers = [b for c, b in objects.values() if c == 142]
    require(len(containers) == 1, 'one AssetBundle container required')
    selected = read_container(containers[0], targets)
    records = {}
    for guid, refs in sorted(selected.items()):
        require(all(pid in objects for pid in refs), 'unresolved IconOverride container PPtr')
        sprites = [pid for pid in refs if objects[pid][0] == 213]
        textures = [pid for pid in refs if objects[pid][0] == 28]
        require(len(sprites) == len(textures) == 1 and len(refs) == 2,
                'ambiguous IconOverride container binding: ' + guid)
        sid, tid = sprites[0], textures[0]
        sprite, texture = objects[sid][1], objects[tid][1]
        item, key, _ = targets[guid]
        sn, at = decoder.name(sprite)
        require(sn == 'icon_' + key and decoder.name(texture)[0] == sn,
                'original Sprite/definition identity mismatch: ' + str(item))
        stream = helper.texture_stream(texture, '<')
        w,h=stream['width'],stream['height']
        size=((w+3)//4)*((h+3)//4)*16
        require(type(w) is int and type(h) is int and 0<min(w,h)<=max(w,h)<=native_webp.MAX_DIMENSION and
                (native_resolution or (w,h)==(256,256)) and
                struct.unpack_from('<4f',sprite,at)==(0.,0.,float(w),float(h)) and
                decoder.ptr(sprite,at+100)==(0,tid),'unsupported Sprite geometry/PPtr')
        require(stream['format']=='BC3/DXT5' and stream['compressedBytes']==size and
                stream['streamPath']==f'archive:/{cab}/{cab}.resS','unsupported completed icon texture')
        res=nodes[cab+'.resS']
        pos=stream['streamOffset']
        require(0<=pos<=len(res)-size,'source texture stream bounds')
        stream_hash=sha(res[pos:pos+size])
        identity = binding_identity(guid, targets[guid], sid, sprite, tid, texture, stream_hash)
        if native_resolution:
            identity['renderer']=native_webp.POLICY
            old=previous.get(str(item))
            reused=bool(old and old['binding']==identity)
            if reused:
                asset=native_webp.reuse(stage,prior_dir,old['asset'])
            else:
                from PIL import Image
                image=Image.frombytes('RGBA',(w,h),res[pos:pos+size],'bcn',3).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
                asset=native_webp.store(stage,image)
            require((asset['width'],asset['height'])==(stream['width'],stream['height']),'original override dimensions')
            records[str(item)]={'binding':identity,'asset':asset,'sourceBundle':name,'sourceBundleSha256':expected,'cab':cab,'reused':reused}
            continue
        data = reuse_previous(prior_dir, previous, identity)
        reused = data is not None
        if data is None:
            data, verified = decoder.decode(texture, res, cab, sn)
            require(verified == stream_hash, 'decoded texture source mismatch')
        filename = str(item) + '.webp'
        with (stage / filename).open('xb') as out:
            out.write(data)
        records[str(item)] = {'binding': identity, 'file': filename, 'sha256': sha(data),
                              'sourceBundle': name, 'sourceBundleSha256': expected, 'cab': cab,
                              'reused': reused}
    return records

def stage(snapshot, manifest_path, out, prior_dir=None,native_resolution=False):
    targets = snapshot_targets(snapshot)
    manifest = source.read_json(manifest_path)
    require(manifest.get('schema') == 'HKIA.IconOverrideBundleInput.1' and
            manifest.get('version') == snapshot['version'] and
            manifest.get('definitionSnapshotSha256') == snapshot['snapshotSha256'],
            'asset source release/snapshot mismatch')
    platform = manifest['platform']
    source.checked_release(manifest['version'], platform)
    # The original 3.0.1 pipeline uses typed Switch definitions with Steam
    # artwork. This is an explicit source platform, never an implicit fallback.
    pinned = source.known_baseline(snapshot['version'], platform)
    entries = manifest['bundles']
    require(isinstance(entries, list) and bool(entries), 'no source bundles')
    require(len({e['name'] for e in entries}) == len(entries), 'duplicate source bundle name')
    for e in entries:
        require(source.BUNDLE.fullmatch(e['name']) and source.SHA.fullmatch(e['sha256']),
                'invalid source bundle fingerprint')
        require(e['name'] not in pinned or pinned[e['name']] == e['sha256'],
                'verified release bundle mismatch')
        if platform == snapshot['platform'] and e['name'] in snapshot['sourceBundleSha256']:
            require(e['sha256'] == snapshot['sourceBundleSha256'][e['name']],
                    'snapshot bundle fingerprint mismatch')
    require(out.resolve() != source.ROOT and source.ROOT not in out.resolve().parents,
            'staging directory must be outside repository')
    require(not out.exists(), 'staging output already exists')
    helper = decoder.load_helpers()
    if native_resolution:
        previous={}
        if prior_dir:
            old=source.read_json(prior_dir/'index.json')
            require(old.get('schema')=='HKIA.NativeResolutionOverrideStage.1' and old.get('renderer')==native_webp.POLICY and
                    old.get('assetPlatform')==platform and old.get('receiptSha256')==sha(source.stable({k:v for k,v in old.items() if k!='receiptSha256'})),
                    'native previous override must not contain legacy resized assets')
            previous=old['records']
    else:previous=read_prior(prior_dir)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='hkia-icon-stage-', dir=out.parent) as temp:
        folder = Path(temp) / 'result'
        folder.mkdir()
        records = {}
        for e in entries:
            found = scan_bundle(manifest_path.parent / e['file'], e['sha256'], e['name'],
                                targets, helper, previous, prior_dir, folder,native_resolution)
            require(not set(found) & set(records), 'ambiguous cross-bundle override')
            records.update(found)
        missing = sorted(v[0] for v in targets.values() if str(v[0]) not in records)
        if snapshot['version'] == '3.0.1' and platform == 'steam' and snapshot['platform'] == 'switch':
            expected = {str(row[0]): row for row in source.read_json(
                source.ROOT / 'data/native-icon-override-source-v3.0.1.json')['rows']}
            for item, record in records.items():
                row = expected[item]
                binding = record['binding']
                require([binding['assetGuid'], binding['spritePathId'], binding['texturePathId']] ==
                        [row[1], row[3], row[4]], 'baseline native IconOverride mismatch')
                require(record['sourceBundle'] == ('definitions' if row[2] == 0 else
                        'dynamicinventory_icons_' + str(row[2]).zfill(2)), 'baseline bundle route mismatch')
        result = {'schema': SCHEMA, 'approval': 'review-required',
                  'version': snapshot['version'], 'definitionPlatform': snapshot['platform'],
                  'assetPlatform': platform, 'definitionSnapshotSha256': snapshot['snapshotSha256'],
                  'sourceBundles': {e['name']: e['sha256'] for e in entries},
                  'renderer': RENDERER, 'expectedCount': len(targets),
                  'records': records, 'unresolvedItemIds': missing,
                  'reusedCount': sum(row['reused'] for row in records.values()),
                  'automaticReleaseActivationAuthorized': False}
        if native_resolution:
            result.update(schema='HKIA.NativeResolutionOverrideStage.1',renderer=native_webp.POLICY)
            unique={r['asset']['sha256']:r['asset'] for r in records.values()}
            result['uniqueAssetCount']=len(unique);result['imageBytes']=sum(r['bytes'] for r in unique.values())
        result['receiptSha256'] = sha(source.stable(result))
        source.write_new(folder / 'index.json', result)
        require(not out.exists(), 'staging output already exists')
        folder.rename(out)
    return result

def self_test():
    def string(s):
        b = s.encode()
        return struct.pack('<I', len(b)) + b + bytes((-len(b)) % 4)
    guid = 'a'*32
    raw = (string('bundle') + struct.pack('<I', 2) + bytes(24) + struct.pack('<I', 3) +
           string(guid) + struct.pack('<iiiq', 0, 1, 0, 11) +
           string(guid) + struct.pack('<iiiq', 1, 1, 0, -22) +
           string('other') + struct.pack('<iiiq', 0, 1, 0, 33))
    assert read_container(raw, {guid}) == {guid: ['11', '-22']}
    try:
        read_container(raw[:-1], {guid})
    except ValueError:
        pass
    else:
        raise AssertionError('accepted truncated container')
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        target = (42,'item_test','0'*72)
        ident = binding_identity(guid,target,'11',b'sprite','-22',b'texture','b'*64)
        data = b'synthetic previous image bytes'
        (folder/'42.webp').write_bytes(data)
        prior = {'42':{'binding':ident,'file':'42.webp','sha256':sha(data)}}
        assert reuse_previous(folder,prior,ident) == data
        assert reuse_previous(folder,prior,{**ident,'textureStreamSha256':'c'*64}) is None
        assert reuse_previous(folder,prior,{**ident,'serializedGuidBytes':'f'*72}) is None
        (folder/'42.webp').write_bytes(b'corrupt')
        try:
            reuse_previous(folder,prior,ident)
        except ValueError:
            pass
        else:
            raise AssertionError('accepted corrupt reuse')
    print('HKIA_ICON_OVERRIDE_STAGE_SELF_TEST_OK')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--snapshot', type=Path)
    parser.add_argument('--bundles', type=Path, help='original bundle input manifest')
    parser.add_argument('--previous-stage', type=Path)
    parser.add_argument('--native-resolution',action='store_true')
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    if args.self_test:
        self_test()
    elif args.snapshot and args.bundles and args.out:
        result = stage(source.read_json(args.snapshot),args.bundles,args.out,args.previous_stage,args.native_resolution)
        print('HKIA_ICON_OVERRIDE_STAGE', len(result['records']), 'of', result['expectedCount'],
              'reused', result['reusedCount'], 'unresolved',len(result['unresolvedItemIds']),
              'review-required')
    else:
        parser.error('provide --snapshot, --bundles, --out')
