#!/usr/bin/env python3
import argparse
import gzip
import json
import struct
from collections import defaultdict
from pathlib import Path

LOCALE_IDS = {
    "ar": 1000, "zh-Hans": 2000, "zh-Hant": 3000, "nl": 4000,
    "en-GB": 5000, "en": 6000, "fr-CA": 7000, "fr": 8000,
    "de": 9000, "it": 10000, "ja": 11000, "ko": 12000,
    "pt-BR": 13000, "ru": 14000, "es": 15000, "tr": 16000,
}
LOCALES = tuple(LOCALE_IDS)
MAX_MANIFEST = 50_000_000
MAX_FILE = 32_000_000

def unpack_file(path, limit):
    content = path.read_bytes()
    if content.startswith(b"\x1f\x8b"):
        content = gzip.decompress(content)
    if len(content) > limit:
        raise ValueError(f"oversized Babel asset: {path}")
    return content

def babel_strings(folder):
    name = folder.name
    raw = unpack_file(folder / f"{name}.manifest", MAX_MANIFEST)
    if len(raw) < 12:
        raise ValueError(f"short Babel manifest: {name}")
    version, section_count, item_count = struct.unpack_from("<III", raw)
    if version != LOCALE_IDS[name] or not 1 <= section_count <= 8 or item_count > 2_000_000:
        raise ValueError(f"unsupported Babel manifest: {name}")
    footer = 12 + item_count * 20
    if len(raw) != footer + section_count * 12:
        raise ValueError(f"invalid Babel manifest length: {name}")
    entries = {}
    covered = 0
    for section in range(section_count):
        table_id, start, count = struct.unpack_from("<III", raw, footer + section * 12)
        if start != covered or count > item_count or start + count > item_count:
            raise ValueError(f"invalid Babel section range: {name}")
        covered += count
        if table_id != 300:
            continue
        data = unpack_file(folder / f"{name}.{table_id}.txt", MAX_FILE)
        for row in range(start, start + count):
            key, offset, length, variant = struct.unpack_from("<QIII", raw, 12 + row * 20)
            if offset > len(data) or length > len(data) - offset:
                raise ValueError(f"out-of-range Babel string: {name} {key}")
            if variant != 0:
                continue
            value = data[offset:offset + length].decode("utf-8")
            if key in entries and entries[key] != value:
                raise ValueError(f"conflicting Babel strings: {name} {key}")
            entries[key] = value
    if covered != item_count:
        raise ValueError(f"incomplete Babel sections: {name}")
    return entries

def extract(catalog, root, output, locales):
    items = json.loads(catalog.read_text(encoding="utf-8"))["items"]
    en = babel_strings(root / "en")
    by_value = defaultdict(set)
    for key, value in en.items():
        if value:
            by_value[value].add(key)
    item_keys = {}
    skipped_ambiguous = 0
    for item in items:
        if not isinstance(item, list) or len(item) != 8 or not isinstance(item[5], str):
            continue
        choices = by_value[item[5]]
        if len(choices) == 1:
            item_keys[str(item[0])] = str(next(iter(choices)))
        elif len(choices) > 1:
            skipped_ambiguous += 1
    if not item_keys:
        raise ValueError("no unambiguous item-name matches in Babel files")
    selected = {int(key) for key in item_keys.values()}
    output.mkdir(parents=True, exist_ok=True)
    names = {"schema": "HKIA.BabelItemKeys.1", "source": "unique exact English Babel string match, not definition-ID verification", "keys": item_keys}
    (output / "item-keys.json").write_text(json.dumps(names, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    available = []
    for locale in locales:
        values = en if locale == "en" else babel_strings(root / locale)
        entries = {str(key): values[key] for key in sorted(selected) if key in values and values[key].strip()}
        record = {"schema": "HKIA.BabelStrings.1", "locale": locale, "strings": entries}
        (output / f"{locale}.json").write_text(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        available.append(locale)
        print(f"{locale}: {len(entries)}/{len(selected)} shared name strings")
    index = {"schema": "HKIA.BabelLocaleIndex.1", "available": available}
    (output / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"matched items={len(item_keys)}, ambiguous={skipped_ambiguous}, total={len(items)}")

def main():
    parser = argparse.ArgumentParser(description="Extract game item names from Babel table 300 without shipping unrelated dialogue tables")
    parser.add_argument("--babel-dir", required=True, type=Path)
    parser.add_argument("--catalog", default="public/catalog.json", type=Path)
    parser.add_argument("--out", default="public/locales", type=Path)
    parser.add_argument("--locales", default=",".join(LOCALES))
    args = parser.parse_args()
    locales = args.locales.split(",")
    if not locales or any(locale not in LOCALES for locale in locales) or len(set(locales)) != len(locales):
        parser.error("invalid or duplicate locale")
    extract(args.catalog, args.babel_dir, args.out, locales)

if __name__ == "__main__":
    main()
