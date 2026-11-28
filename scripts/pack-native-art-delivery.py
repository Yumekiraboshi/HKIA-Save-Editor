#!/usr/bin/env python3
"""Restore reviewed derived artwork from an existing backup and pack for Pages.
No game originals, network, repository mutations or automatic activation.
"""
import argparse
import hashlib
import json
import re
import tempfile
import zipfile
from pathlib import Path

SHA = re.compile(r'[a-f0-9]{64}')
WEBP = re.compile(r'(?:native-art/[a-f0-9]{64}|(?:dynamic-source-pages|auxiliary-source-pages)/source-[a-f0-9]{64})\.webp')
STATIC = re.compile(r'(?:native-achievement-complete|native-category-stage|native-base-complete|native-override-stage)/([a-f0-9]{64}\.webp)')
JSON_FILES = frozenset(('distribution.json', 'release-candidate.json', 'family-bindings.json', 'collection-catalog.json', 'achievement-art.json', 'category-art.json', 'native-art/index.json', 'dynamic-source-pages/index.json', 'auxiliary-source-pages/index.json'))
POLICY = 'native-resolution-lossless-webp-v1'
MAX_PART = 32 * 1024 * 1024
MAX_FILE = 32 * 1024 * 1024


def require(ok, message):
    if not ok:
        raise ValueError(message)


def digest(b):
    return hashlib.sha256(b).hexdigest()


def safe(n):
    return n in JSON_FILES or WEBP.fullmatch(n) is not None


def checked(b, meta, name):
    require(type(meta['bytes']) is int and 0 < meta['bytes'] <= MAX_FILE and SHA.fullmatch(meta['sha256']) and len(b) == meta['bytes'] and digest(b) == meta['sha256'], 'bad file: ' + name)
    return b


def distribution(raw, expected):
    require(SHA.fullmatch(expected) and digest(raw) == expected, 'reviewed distribution SHA-256 mismatch')
    d = json.loads(raw)
    require(d['schema'] == 'HKIA.NativeArtDistribution.1' and d['artworkPolicy'] == POLICY and d['automaticReleaseActivationAuthorized'] is False and re.fullmatch(r'\d+\.\d+\.\d+', d['version']) and d['platform'] in ('steam', 'switch'), 'distribution identity')
    f = d['files']
    require('distribution.json' not in f and len(f) <= 100000 and all(safe(n) for n in f) and JSON_FILES - {'distribution.json'} <= set(f), 'distribution file census')
    require(sum(x['bytes'] for x in f.values()) == d['totalBytes'], 'distribution byte census')
    return d


def archive(root, p, pattern):
    name = p['file']
    require(re.fullmatch(pattern, name) and type(p['entries']) is int and 0 < p['entries'] <= 100000, 'backup part identity')
    path = root / name
    require(path.is_file() and not path.is_symlink() and 0 < path.stat().st_size <= MAX_PART, 'backup part size')
    checked(path.read_bytes(), p, name)
    z = zipfile.ZipFile(path)
    infos = z.infolist()
    require(len(infos) == p['entries'] and len({i.filename for i in infos}) == len(infos) and all(not i.is_dir() and i.compress_type == zipfile.ZIP_STORED and 0 < i.file_size <= MAX_FILE for i in infos), 'backup archive census')
    return z


def restore(root, out, expected):
    """Only exact distribution members are written; original stage metadata is not published."""
    m = json.loads((root / 'distribution-backup.json').read_bytes())
    require(m['schema'] == 'HKIA.NativeDistributionBackup.1' and m['distributionFileSha256'] == expected, 'backup identity')
    require(out.is_dir() and not any(out.iterdir()), 'fresh restore directory required')
    parts = m['additionalParts']
    require(len(parts) <= 256 and len({p['file'] for p in parts}) == len(parts), 'additional part census')
    # Find and authenticate the distribution before extracting any image.
    raw = None
    for p in parts:
        with archive(root, p, r'hkia-native-distribution-delta-\d{2}\.zip') as z:
            if 'distribution.json' in z.namelist():
                require(raw is None, 'duplicate distribution manifest')
                raw = z.read('distribution.json')
    require(raw is not None, 'missing distribution manifest')
    d = distribution(raw, expected)
    require(d['version'] == m['version'] and d['platform'] == m['platform'] and d['totalBytes'] + len(raw) == m['distributionBytes'], 'backup release mismatch')
    (out / 'distribution.json').write_bytes(raw)
    f = d['files']
    seen = set()

    def put(name, b):
        require(name in f, 'unexpected output: ' + name)
        checked(b, f[name], name)
        target = out / name
        if name in seen:
            require(target.read_bytes() == b, 'conflicting duplicate: ' + name)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b)
            seen.add(name)

    for p in parts:
        with archive(root, p, r'hkia-native-distribution-delta-\d{2}\.zip') as z:
            for i in z.infolist():
                if i.filename == 'distribution.json':
                    require(z.read(i) == raw, 'distribution changed')
                    continue
                require(safe(i.filename) and i.filename not in seen, 'unexpected duplicate member')
                put(i.filename, z.read(i))
    static = m['staticStageParts']
    require(len(static) <= 256 and len({p['file'] for p in static}) == len(static), 'static part census')
    for p in static:
        with archive(root, p, r'hkia-native-art-\d{2}\.zip') as z:
            for i in z.infolist():
                match = STATIC.fullmatch(i.filename)
                if match:
                    name = 'native-art/' + match[1]
                    if name in f:
                        put(name, z.read(i))
    require(seen == set(f), 'missing distribution members: ' + str(len(set(f)-seen)))
    return d


def pack(root, out, expected):
    require(out.is_dir() and not any(out.iterdir()), 'fresh delivery directory required')
    raw = (root / 'distribution.json').read_bytes()
    d = distribution(raw, expected)
    paths = ['distribution.json', *sorted(d['files'])]
    require(set(paths) == {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()}, 'distribution directory census')
    for n in paths:
        p = root / n
        require(not p.is_symlink(), 'symlink: ' + n)
        if n != 'distribution.json':
            checked(p.read_bytes(), d['files'][n], n)
    chunks = [[n for n in paths if n in JSON_FILES]]
    size, chunk = 0, []
    for n in paths:
        if n in JSON_FILES:
            continue
        length = (root / n).stat().st_size + 256
        require(length <= 22 * 1024 * 1024, 'single image exceeds archive bound')
        if size + length > 22 * 1024 * 1024 and chunk:
            chunks.append(chunk)
            size, chunk = 0, []
        chunk.append(n)
        size += length
    if chunk:
        chunks.append(chunk)
    parts = []
    for i, chunk in enumerate(chunks):
        path = out / ('part-%02d.zip' % i)
        with zipfile.ZipFile(path, 'w', allowZip64=False) as z:
            for n in chunk:
                info = zipfile.ZipInfo(n, date_time=(2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED if n in JSON_FILES else zipfile.ZIP_STORED
                z.writestr(info, (root / n).read_bytes())
        b = path.read_bytes()
        require(len(b) <= MAX_PART, 'archive size')
        parts.append({'file': path.name, 'bytes': len(b), 'sha256': digest(b), 'gitBlobSha1': hashlib.sha1(f'blob {len(b)}\0'.encode() + b).hexdigest(), 'count': len(chunk)})
        with zipfile.ZipFile(path) as z:
            require(z.testzip() is None, 'archive CRC')
    (out / 'parts.json').write_text(json.dumps({'schema': 'HKIA.NativeArtDeliveryParts.1', 'distributionSha256': expected, 'version': d['version'], 'parts': parts}, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('HKIA_NATIVE_ART_PARTS', len(parts), sum(p['bytes'] for p in parts), 'bytes')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument('--distribution', type=Path)
    group.add_argument('--backup', type=Path)
    p.add_argument('--expected-distribution-sha256', required=True)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    a.out.mkdir(parents=True, exist_ok=False)
    if a.distribution:
        pack(a.distribution, a.out, a.expected_distribution_sha256)
    else:
        with tempfile.TemporaryDirectory(prefix='hkia-native-restore-') as temp:
            restore(a.backup, Path(temp), a.expected_distribution_sha256)
            pack(Path(temp), a.out, a.expected_distribution_sha256)
