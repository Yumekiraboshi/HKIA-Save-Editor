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

def extract(catalog, root, output, locales, achievement_index=None, achievement_output=None, description_index=None, description_output=None):
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
    achievement_ids = None
    achievement_guids = None
    if achievement_index is not None:
        source = json.loads(achievement_index.read_text(encoding="utf-8"))
        records = source.get("records")
        if source.get("schema") != "HKIA.AchievementKeyIndex.1" or not isinstance(records, list):
            raise ValueError("unsupported achievement index")
        achievement_guids = {row[0] for row in records if isinstance(row, list) and len(row) == 3}
        achievement_ids = {int(row[2]) for row in records if isinstance(row, list)
                           and len(row) == 3 and str(row[2]).isdigit()}
        if len(achievement_ids) != len(records) or not achievement_ids:
            raise ValueError("invalid or repeated achievement title ID")
        achievement_output.mkdir(parents=True, exist_ok=True)
    description_ids = None
    if (description_index is None) != (description_output is None):
        raise ValueError("description index and output must both be supplied")
    if description_index is not None:
        if achievement_guids is None:
            raise ValueError("description extraction requires an achievement GUID index")
        facts = json.loads(description_index.read_text(encoding="utf-8"))
        descriptions = facts.get("records")
        if facts.get("schema") != "HKIA.AchievementFacts.1" or facts.get("version") != "3.0.1" or not isinstance(descriptions, list):
            raise ValueError("unsupported achievement facts index")
        if len(descriptions) != len(achievement_guids) or {
            row[0] for row in descriptions if isinstance(row, list) and len(row) == 11
        } != achievement_guids:
            raise ValueError("achievement description GUID mapping incomplete")
        description_ids = {int(row[1]) for row in descriptions if row[1] is not None}
        if len(achievement_guids) == 820 and len(description_ids) != 720:
            raise ValueError("expected 720 official description IDs")
        if len(description_ids) != sum(row[1] is not None for row in descriptions):
            raise ValueError("duplicate achievement description IDs")
        public = (Path(__file__).resolve().parent.parent / "public").resolve()
        if description_output.resolve().is_relative_to(public):
            raise ValueError("description output must not be inside the public website tree")
        description_output.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    names = {"schema": "HKIA.BabelItemKeys.1", "source": "unique exact English Babel string match, not definition-ID verification", "keys": item_keys}
    (output / "item-keys.json").write_text(json.dumps(names, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    available = []
    for locale in locales:
        values = en if locale == "en" else babel_strings(root / locale)
        entries = {str(key): values[key] for key in sorted(selected) if key in values and values[key].strip()}
        record = {"schema": "HKIA.BabelStrings.1", "locale": locale, "strings": entries}
        (output / f"{locale}.json").write_text(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        if achievement_ids is not None:
            titles = {str(key): values[key] for key in sorted(achievement_ids)
                      if key in values and values[key].strip()}
            if len(titles) != len(achievement_ids):
                raise ValueError(f"missing achievement title translations: {locale} "
                                 f"{len(titles)}/{len(achievement_ids)}")
            achievement_record = {"schema": "HKIA.AchievementTitles.1",
                                  "locale": locale, "strings": titles}
            (achievement_output / f"{locale}.json").write_text(
                json.dumps(achievement_record, ensure_ascii=False, separators=(",", ":")) + "\n",
                encoding="utf-8")
            print(f"{locale}: {len(titles)} source-pinned achievement titles")
        if description_ids is not None:
            descriptions = {str(key): values[key] for key in sorted(description_ids)
                            if key in values and values[key].strip()}
            if len(descriptions) != len(description_ids):
                raise ValueError(f"missing source achievement descriptions: {locale} "
                                 f"{len(descriptions)}/{len(description_ids)}")
            output_record = {"schema": "HKIA.AchievementDescriptions.1",
                             "locale": locale, "strings": descriptions}
            (description_output / f"{locale}.json").write_text(
                json.dumps(output_record, ensure_ascii=False, separators=(",", ":")) + "\n",
                encoding="utf-8")
            print(f"{locale}: {len(descriptions)} private achievement descriptions")
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
    parser.add_argument("--achievement-index", type=Path,
                        help="verified source achievement GUID-to-title ID crosswalk")
    parser.add_argument("--achievement-out", default="public/achievement-locales", type=Path)
    parser.add_argument("--achievement-facts-index", type=Path,
                        help="v3.0.1 verified source facts index for private description extraction")
    parser.add_argument("--achievement-descriptions-out", type=Path,
                        help="private output directory outside public/ (never shipped with Pages)")
    args = parser.parse_args()
    locales = args.locales.split(",")
    if not locales or any(locale not in LOCALES for locale in locales) or len(set(locales)) != len(locales):
        parser.error("invalid or duplicate locale")
    extract(args.catalog, args.babel_dir, args.out, locales,
            args.achievement_index, args.achievement_out,
            args.achievement_facts_index, args.achievement_descriptions_out)

if __name__ == "__main__":
    main()
