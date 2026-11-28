#!/usr/bin/env python3
"""Offline candidate-game-release intake and icon-source delta.

Reuse the existing bounded UnityFS/typed-object readers. This tool NEVER
changes published assets, supported save versions, or mutation eligibility.
A version label is supplied by the operator, not inferred from Unity's
engine version. A candidate snapshot is evidence, not an approved release.
"""
import argparse
import collections
import hashlib
import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = 'HKIA.IconSourceSnapshot.1'
VERSION = re.compile(r'[0-9]+\.[0-9]+\.[0-9]+')
SHA = re.compile(r'[0-9a-f]{64}')
BUNDLE = re.compile(r'[a-zA-Z0-9_.-]{1,128}')
REQUIRED_FIELDS = {'Id', 'UiIcon', 'SerializedGuid', 'RequiresUniqueData',
                   'UiIconUsesDynamicColor', 'm_Name'}

def require(ok, message):
    if not ok:
        raise ValueError(message)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def stable(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'),
                      ensure_ascii=True).encode('utf-8')

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))

def file_digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def checked_release(version, platform):
    require(bool(VERSION.fullmatch(version)), 'explicit game version required')
    require(platform in ('steam', 'switch'), 'unsupported source platform')

def known_baseline(version, platform):
    """Read existing verified provenance, not a second catalog."""
    if version != '3.0.1':
        return {}
    override = read_json(ROOT / 'data/native-icon-override-source-v3.0.1.json')
    if platform == 'switch':
        return {'definitions': override['switchDefinitionsSha256']}
    dynamic = read_json(ROOT / 'data/unityfs-audit/dynamic-uiicons.v3.0.1.json')
    return {**dynamic['sourceHashes'],
            **{row['name']: row['sha256'] for row in override['sourceBundles']}}

# Managed-reference layout is verified for the pinned 3.0.1 Switch source.
# A later release must explicitly opt into this adapter after reviewing the
# native type dump. An unknown/changed layout must not invent an override.
OUTFIT_LAYOUT = 'outfit-icon-override-v1'
def outfit_override(fields, mesh):
    ref = fields['references']
    if len(ref) < 20:
        return None
    if b'OutfitItemDetails' not in ref:
        return None
    require(struct.unpack_from('<II', ref) == (2, 1) and
            ref[8:16] == fields['Details'], 'managed reference identity')
    cls, p = mesh.string(ref, 16)
    if cls != 'OutfitItemDetails':
        return None
    ns, p = mesh.string(ref, p)
    asm, p = mesh.string(ref, p)
    require(ns == 'Sunblink.Game' and asm == 'Assembly-CSharp', 'outfit type identity')
    guid, p = mesh.string(ref, p + 16)
    sub, p = mesh.string(ref, p)
    sub_type, p = mesh.string(ref, p)
    require(len(ref) - p == 80 and not sub and
            (not sub_type or sub_type == 'UnityEngine.Sprite, UnityEngine.CoreModule, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null'),
            'unsupported OutfitItemDetails IconOverride layout')
    require(not guid or re.fullmatch(r'[0-9a-f]{32}', guid), 'invalid IconOverride GUID')
    return guid or None

def scan_rows(objects, externals, helpers, mesh, outfit_layout=None):
    rows = []
    ids, guids, names = set(), set(), set()
    for pid, (cls, tree, raw) in objects.items():
        if cls != 114:
            continue
        names_in_tree = {node[2] for node in tree[-1]}
        # A recognized definition type with a changed field layout is an
        # explicit schema failure, not a silently skipped new item.
        if not {'Id', 'UiIcon', 'SerializedGuid'} <= names_in_tree:
            continue
        require(REQUIRED_FIELDS <= names_in_tree, 'item schema changed: ' + pid)
        f = helpers.fields(tree, raw, mesh)
        item = mesh.u(f['Id'])
        name, _ = mesh.string(f['m_Name'])
        # Keep exact serialized GUID bytes: no reinterpretation or inference.
        guid = f['SerializedGuid'].hex()
        require(0 < item <= 0x7fffffff and item not in ids, 'duplicate/invalid Item ID')
        require(guid and any(f['SerializedGuid']) and guid not in guids,
                'duplicate/invalid serialized GUID')
        require(name.startswith('item_') and name not in names, 'duplicate/invalid item key')
        unique, dynamic = f['RequiresUniqueData'][0], f['UiIconUsesDynamicColor'][0]
        require(unique in (0, 1) and dynamic in (0, 1), 'invalid native icon flags')
        file_id, sprite = mesh.ptr(f['UiIcon'])
        require(0 <= file_id <= len(externals), 'invalid sprite external reference')
        sprite_hash = None
        if sprite != '0' and file_id == 0:
            require(sprite in objects and objects[sprite][0] == 213,
                    'invalid local UiIcon Sprite')
            sprite_hash = digest(objects[sprite][2])
        # A null/external reference is retained as unresolved, not guessed.
        binding = outfit_override(f, mesh) if outfit_layout == OUTFIT_LAYOUT else None
        rows.append({
            **({'outfitIconOverrideGuid': binding} if outfit_layout else {}),
            'itemId': item, 'key': name, 'serializedGuidBytes': guid,
            'definitionPathId': pid, 'definitionSha256': digest(raw),
            'schemaSha256': digest(stable(tree)),
            'fieldSha256': {key: digest(value) for key, value in f.items()},
            'requiresUniqueData': bool(unique), 'dynamicColor': bool(dynamic),
            'sprite': {'fileId': file_id, 'pathId': sprite,
                       'external': externals[file_id-1] if file_id else None,
                       'objectSha256': sprite_hash},
        })
        ids.add(item); guids.add(guid); names.add(name)
    require(bool(rows), 'no recognized item definitions; review source schema')
    return sorted(rows, key=lambda row: row['itemId'])

def snapshot(version, platform, definitions, expected, bundles, outfit_layout=None):
    checked_release(version, platform)
    require(bool(SHA.fullmatch(expected)), 'explicit expected definitions SHA-256 required')
    pinned = known_baseline(version, platform)
    if pinned:
        require(expected == pinned['definitions'], 'verified baseline fingerprint mismatch')
    # Use the existing original typed readers; no version-specific item
    # count, CAB name, sprite PathID or mask GUID is assumed for candidates.
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'native_icon_helpers', Path(__file__).with_name('extract-native-result-icons.py'))
    helpers = importlib.util.module_from_spec(spec); spec.loader.exec_module(helpers)
    audit = helpers.module('unityfs-audit')
    typed = helpers.module('extract-furniture-preview-camera')
    mesh = helpers.module('extract-furniture-mesh-source')
    require(definitions.stat().st_size <= audit.MAX_INPUT, 'definitions bundle too large')
    raw = definitions.read_bytes()
    require(digest(raw) == expected, 'definitions SHA-256 mismatch')
    header, pairs = audit.extract_nodes(raw)
    cabs = [(name, data) for name, data in pairs if re.fullmatch(r'CAB-[0-9a-f]{32}', name)]
    require(len(cabs) == 1, 'expected exactly one serialized definitions CAB')
    cab, data = cabs[0]
    objects, externals = typed.load(data, mesh)
    if version == '3.0.1' and platform == 'switch':
        outfit_layout = OUTFIT_LAYOUT
    require(outfit_layout in (None, OUTFIT_LAYOUT), 'unrecognized outfit layout')
    rows = scan_rows(objects, externals, helpers, mesh, outfit_layout)
    if outfit_layout:
        bindings = {row['itemId']: row['outfitIconOverrideGuid'] for row in rows if row['outfitIconOverrideGuid']}
        require(len(set(bindings.values())) == len(bindings), 'ambiguous IconOverride GUIDs')
        if version == '3.0.1' and platform == 'switch':
            original = read_json(ROOT / 'data/native-icon-override-source-v3.0.1.json')
            require(bindings == {row[0]: row[1] for row in original['rows']}, 'baseline IconOverride crosswalk mismatch')
    if pinned:
        require(len(rows) == 12163, 'verified baseline definition count mismatch')
        require(sum(row['dynamicColor'] for row in rows) == 50, 'baseline dynamic census mismatch')
        require(sum(row['requiresUniqueData'] for row in rows) == 138, 'baseline unique census mismatch')
    source_hashes = dict(pinned)
    source_hashes['definitions'] = expected
    observed = ['definitions']
    for entry in bundles:
        name, sep, filename = entry.partition('=')
        require(sep and BUNDLE.fullmatch(name) and name != 'definitions' and
                name not in observed, 'invalid or repeated bundle binding: ' + name)
        fingerprint = file_digest(Path(filename))
        require(name not in pinned or fingerprint == pinned[name], 'baseline bundle mismatch: ' + name)
        source_hashes[name] = fingerprint
        observed.append(name)
    result = {'schema': SCHEMA, 'version': version, 'platform': platform,
              'approval': 'unverified-candidate', 'unityEditorVersion': header['editorVersion'],
              'definitionsCab': cab, 'definitionsCabSha256': digest(data),
              'sourceBundleSha256': source_hashes, 'locallyObservedBundles': sorted(observed),
              'definitionCount': len(rows), 'rows': rows,
              **({'outfitIconOverrideLayout': outfit_layout} if outfit_layout else {})}
    result['snapshotSha256'] = digest(stable(result))
    return result

def validate_snapshot(value):
    require(value.get('schema') == SCHEMA and value.get('approval') == 'unverified-candidate',
            'unexpected snapshot schema/status')
    checked_release(value['version'], value['platform'])
    payload = {k: v for k, v in value.items() if k != 'snapshotSha256'}
    require(value.get('snapshotSha256') == digest(stable(payload)), 'snapshot integrity mismatch')
    rows = value['rows']
    require(isinstance(rows, list) and len(rows) == value['definitionCount'] and bool(rows),
            'snapshot definition count mismatch')
    require(len({r['itemId'] for r in rows}) == len(rows) and
            len({r['serializedGuidBytes'] for r in rows}) == len(rows) and
            len({r['key'] for r in rows}) == len(rows), 'snapshot identity collision')
    hashes = value['sourceBundleSha256']
    require('definitions' in hashes and all(BUNDLE.fullmatch(k) and SHA.fullmatch(v)
                                           for k, v in hashes.items()), 'snapshot source fingerprints')
    pinned = known_baseline(value['version'], value['platform'])
    require(all(hashes.get(k) == v for k, v in pinned.items()), 'verified baseline source mismatch')
    require(set(value['locallyObservedBundles']) <= set(hashes) and
            'definitions' in value['locallyObservedBundles'], 'snapshot observed sources')
    return {r['itemId']: r for r in rows}

def diff(before, after):
    old, new = validate_snapshot(before), validate_snapshot(after)
    require(before['platform'] == after['platform'], 'compare releases on the same platform')
    old_b, new_b = before['sourceBundleSha256'], after['sourceBundleSha256']
    common = set(old_b) & set(new_b)
    bundles = {
        'changed': sorted(k for k in common if old_b[k] != new_b[k]),
        'byteIdentical': sorted(k for k in common if old_b[k] == new_b[k]),
        'newlySupplied': sorted(set(new_b) - set(old_b)),
        'notSupplied': sorted(set(old_b) - set(new_b)),
    }
    added, removed = sorted(set(new) - set(old)), sorted(set(old) - set(new))
    # GUID moves are review evidence only. Never remap an old save Item ID.
    new_guids = {r['serializedGuidBytes']: i for i, r in new.items()}
    moves = [[i, new_guids[old[i]['serializedGuidBytes']]]
             for i in removed if old[i]['serializedGuidBytes'] in new_guids]
    changed = []
    for i in sorted(set(old) & set(new)):
        a, b = old[i], new[i]
        fields = sorted(k for k in set(a['fieldSha256']) | set(b['fieldSha256'])
                        if a['fieldSha256'].get(k) != b['fieldSha256'].get(k))
        if a == b:
            continue
        changed.append({
            'itemId': i, 'keyBefore': a['key'], 'keyAfter': b['key'],
            'identityChanged': a['serializedGuidBytes'] != b['serializedGuidBytes'],
            'schemaChanged': a['schemaSha256'] != b['schemaSha256'],
            'spriteChanged': a['sprite'] != b['sprite'],
            'flagsChanged': (a['dynamicColor'], a['requiresUniqueData']) !=
                            (b['dynamicColor'], b['requiresUniqueData']),
            'changedFields': fields,
        })
    unresolved = sorted(i for i, row in new.items()
                        if row['sprite']['objectSha256'] is None)
    # A stable PPtr or Sprite object alone does not prove unchanged pixels:
    # atlas textures, masks, named overrides and rendering logic may change.
    # Deliberately withhold automatic reuse/activation for EVERY candidate.
    return {'schema': 'HKIA.IconSourceDelta.1', 'approval': 'review-required',
            'platform': before['platform'], 'fromVersion': before['version'],
            'toVersion': after['version'], 'fromSnapshotSha256': before['snapshotSha256'],
            'toSnapshotSha256': after['snapshotSha256'],
            'definitionCounts': [len(old), len(new)],
            'addedItemIds': added, 'removedItemIds': removed, 'possibleGuidMoves': moves,
            'changedDefinitions': changed, 'unchangedDefinitionCount': len(old) - len(removed) - len(changed),
            'candidateDynamicItemIds': sorted(i for i, r in new.items() if r['dynamicColor']),
            'unresolvedSpriteItemIds': unresolved, 'sourceBundles': bundles,
            'automaticArtworkReuseAuthorized': False,
            'automaticReleaseActivationAuthorized': False}

def write_new(path, value):
    with path.open('x', encoding='utf-8', newline='\n') as f:
        json.dump(value, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')

def self_test():
    def row(i, guid, art, flags=False):
        return {'itemId': i, 'key': 'item_'+str(i), 'serializedGuidBytes': guid,
                'definitionPathId': str(i), 'definitionSha256': digest(str(i).encode()),
                'schemaSha256': '1'*64, 'fieldSha256': {'UiIcon': art},
                'requiresUniqueData': flags, 'dynamicColor': flags,
                'sprite': {'fileId': 0, 'pathId': str(i), 'external': None,
                           'objectSha256': art}}
    def sample(version, rows, bundles, platform='steam'):
        v = {'schema': SCHEMA, 'version': version, 'platform': platform,
             'approval': 'unverified-candidate', 'definitionCount': len(rows),
             'sourceBundleSha256': {'definitions': 'd'*64, **bundles},
             'locallyObservedBundles': ['definitions'], 'rows': rows}
        v['snapshotSha256'] = digest(stable(v))
        return v
    old = sample('9.0.0', [row(1,'aa','a'*64),row(2,'bb','b'*64),row(3,'cc','c'*64)],
                 {'atlas_global':'1'*64,'old_only':'2'*64})
    new = sample('9.0.1', [row(1,'aa','a'*64),row(2,'dd','e'*64,True),row(4,'cc','f'*64)],
                 {'atlas_global':'3'*64,'new_only':'4'*64})
    result = diff(old,new)
    assert result['addedItemIds'] == [4] and result['removedItemIds'] == [3]
    assert result['possibleGuidMoves'] == [[3,4]]
    assert result['unchangedDefinitionCount'] == 1
    assert result['changedDefinitions'][0]['identityChanged']
    assert result['changedDefinitions'][0]['spriteChanged']
    assert result['changedDefinitions'][0]['flagsChanged']
    assert result['sourceBundles'] == {'changed':['atlas_global'],'byteIdentical':['definitions'],
                                       'newlySupplied':['new_only'],'notSupplied':['old_only']}
    assert not result['automaticArtworkReuseAuthorized']
    assert not result['automaticReleaseActivationAuthorized']
    for invalid in [{**new,'version':'9.0.2'},
                    sample('9.0.1',[row(1,'aa','a'*64),row(1,'bb','b'*64)],{}),
                    sample('9.0.1',[row(1,'aa','a'*64)],{},'switch')]:
        try: diff(old,invalid)
        except ValueError: pass
        else: raise AssertionError('accepted invalid candidate')
    print('HKIA_ICON_SOURCE_UPDATE_SELF_TEST_OK')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    s = sub.add_parser('snapshot', help='read original game definitions and bundle fingerprints')
    s.add_argument('--version', required=True)
    s.add_argument('--platform', choices=['steam','switch'], required=True)
    s.add_argument('--definitions', type=Path, required=True)
    s.add_argument('--expected-definitions-sha256', required=True)
    s.add_argument('--bundle', action='append', default=[], metavar='NAME=PATH')
    s.add_argument('--out', type=Path, required=True)
    s.add_argument('--reviewed-outfit-layout', choices=[OUTFIT_LAYOUT], help='only after native managed-layout review for the candidate release')
    d = sub.add_parser('diff', help='compare two candidate snapshots; never activate a release')
    d.add_argument('--before', type=Path, required=True)
    d.add_argument('--after', type=Path, required=True)
    d.add_argument('--out', type=Path, required=True)
    sub.add_parser('self-test')
    args = parser.parse_args()
    if args.command == 'self-test':
        self_test()
    elif args.command == 'snapshot':
        value = snapshot(args.version,args.platform,args.definitions,
                         args.expected_definitions_sha256,args.bundle,args.reviewed_outfit_layout)
        write_new(args.out,value)
        print('HKIA_ICON_SOURCE_SNAPSHOT', value['definitionCount'], value['snapshotSha256'])
    else:
        value = diff(read_json(args.before),read_json(args.after))
        write_new(args.out,value)
        print('HKIA_ICON_SOURCE_DELTA', len(value['addedItemIds']),len(value['removedItemIds']),
              len(value['changedDefinitions']), 'review-required')

if __name__ == '__main__':
    main()
