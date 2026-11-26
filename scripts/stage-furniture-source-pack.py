#!/usr/bin/env python3
"""Stage an independently pinned unified furniture pack as lazy HTTP assets.

Local only: does not commit, upload, deploy, or enable unverified icon output.
The printed manifest pin must be reviewed and committed separately from the
served assets; a server-provided digest is not an independent trust anchor.
"""
import argparse
import hashlib
import importlib.util
import json
import re
import shutil
import tempfile
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'furniture_assembler', Path(__file__).with_name('assemble-furniture-source-pack.py'))
assembler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assembler)

def stage(pack, out, zip_sha):
    assembler.require(re.fullmatch('[0-9a-f]{64}', zip_sha), 'ZIP_PIN')
    assembler.require(not out.exists() and not out.is_symlink(), 'OUTPUT_EXISTS')
    # Work from a private immutable-by-convention snapshot, not a potentially
    # changing user input between digest validation and ZIP reads.
    with tempfile.TemporaryDirectory(prefix='hkia-stage-') as td:
        tmp = Path(td)
        snapshot = tmp / 'input.zip'
        h = hashlib.sha256()
        with pack.open('rb') as src, snapshot.open('xb') as dst:
            while chunk := src.read(1024 * 1024):
                h.update(chunk)
                dst.write(chunk)
        assembler.require(h.hexdigest() == zip_sha, 'ZIP_HASH')
        with zipfile.ZipFile(snapshot) as z:
            manifest = assembler.json_entry(z, 'sources.json')
            assembler.require(manifest['schema'] == 'HKIA.FurnitureSourcePack.1', 'UNIFIED_ONLY')
            model_count = len(manifest['geometry']['rows'])
            cubes = manifest['cubemaps']
            assembler.require(0 < model_count <= 649 and len(cubes) == 2 and
                              len({c['sha256'] for c in cubes.values()}) == 2 and
                              len(manifest['additionalPatterns']['rows']) <= 274,
                              'COVERAGE')
        # Reuse the native reference/range/closure validation. Its normalized
        # output contains only the verified allowlist, never extra ZIP members.
        normalized = tmp / 'verified.zip'
        result = assembler.assemble([snapshot], normalized)
        with zipfile.ZipFile(normalized) as z:
            meta = z.read('sources.json')
            idx = assembler.json_entry(z, 'index.json')
            pin = {'sha256': assembler.sha(meta), 'bytes': len(meta)}
            out.mkdir(parents=False, exist_ok=False)
            try:
                for row in idx['payloads']:
                    name = f"{row['kind']}/{row['sha256']}.bin"
                    data = z.read(name)
                    assembler.require(len(data) == row['bytes'] and
                                      assembler.sha(data) == row['sha256'], 'STAGE_HASH')
                    dest = out / name
                    dest.parent.mkdir(exist_ok=True)
                    with dest.open('xb') as f:
                        f.write(data)
                # Write metadata last. No consumer should publish this staging
                # directory until the complete command has succeeded.
                for name in ('index.json', 'sources.json'):
                    with (out / name).open('xb') as f:
                        f.write(z.read(name))
                for row in idx['payloads']:
                    dest = out / f"{row['kind']}/{row['sha256']}.bin"
                    assembler.require(assembler.sha(dest.read_bytes()) == row['sha256'], 'READBACK_HASH')
                assembler.require(assembler.sha((out / 'sources.json').read_bytes()) ==
                                  pin['sha256'], 'READBACK_MANIFEST')
            except BaseException:
                shutil.rmtree(out)
                raise
    return {**result, 'manifestPin': pin, 'inputZipSha256': zip_sha,
            'renderFidelity': 'unverified'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pack', type=Path)
    parser.add_argument('--zip-sha256', required=True)
    parser.add_argument('--out', type=Path, required=True,
                        help='New staging directory; its parent must exist.')
    args = parser.parse_args()
    print(json.dumps(stage(args.pack, args.out, args.zip_sha256)))
