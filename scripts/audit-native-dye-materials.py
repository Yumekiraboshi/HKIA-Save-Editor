#!/usr/bin/env python3
"""Audit original UnityFS Material -> Texture2D bindings and stream hashes.

Offline, read-only game asset tool. Never registers an approximate icon or
emits original mesh/texture bytes into a public repository.

python scripts/audit-native-dye-materials.py /path/to/d_3_bundle --out staging/material-audit.json
python scripts/audit-native-dye-materials.py --self-test
"""
import argparse
import hashlib
import importlib.util
import json
import re
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("hkia_unityfs_audit", HERE / "unityfs-audit.py")
auditor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auditor)

MAPS = ("_BaseMap", "_BumpMap", "_ComboMap", "_PatternMap")
FORMATS = {10: "BC1/DXT1", 12: "BC3/DXT5"}


def aligned(n):
    return (n + 3) & ~3


def serialized_objects(blob):
    """Bounded Unity 2022 SerializedFile v22 object table; exact i64 PathIDs."""
    if len(blob) < 48 or auditor.integer(blob, 8) != 22:
        raise auditor.InvalidAsset("SerializedFile v22 required")
    offset = auditor.integer(blob, 32, 8)
    if auditor.integer(blob, 24, 8) != len(blob) or offset >= len(blob):
        raise auditor.InvalidAsset("SerializedFile size mismatch")
    endian = "<" if blob[16] == 0 else ">"
    pos = 48
    _, pos = auditor.cstring(blob, pos)
    pos += 4
    type_tree = blob[pos]
    pos += 1
    types_count = auditor.integer(blob, pos, 4, endian)
    pos += 4
    if types_count > 512:
        raise auditor.InvalidAsset("type count too large")
    types = []
    for _ in range(types_count):
        class_id = struct.unpack_from(endian + "i", blob, pos)[0]
        pos += 7
        if class_id == 114 or class_id < 0:
            pos += 16
        pos += 16
        if type_tree:
            nodes, size = struct.unpack_from(endian + "II", blob, pos)
            if nodes > 100_000 or size > 10_000_000:
                raise auditor.InvalidAsset("invalid type tree")
            pos += 8 + 32 * nodes + size
        dependencies = auditor.integer(blob, pos, 4, endian)
        pos += 4 + 4 * dependencies
        if dependencies > 10_000 or pos > len(blob):
            raise auditor.InvalidAsset("invalid type references")
        types.append(class_id)
    count = auditor.integer(blob, pos, 4, endian)
    pos = aligned(pos + 4)
    if count > 2_000_000:
        raise auditor.InvalidAsset("object count too large")
    for _ in range(count):
        if pos + 24 > len(blob):
            raise auditor.InvalidAsset("truncated object table")
        path_id, start, size, index = struct.unpack_from(endian + "qqIi", blob, pos)
        pos += 24
        if index < 0 or index >= len(types) or start < 0 or offset + start + size > len(blob):
            raise auditor.InvalidAsset("invalid serialized object")
        if types[index] in (21, 28):
            yield types[index], str(path_id), blob[offset+start:offset+start+size], endian


def material_properties(blob, endian):
    name, start = auditor.named_asset(blob, endian)
    if start + 12 > len(blob):
        raise auditor.InvalidAsset("Material shader PPtr is truncated")
    shader_file, shader_path = struct.unpack_from(endian + "iq", blob, start)
    properties = {}
    for name_key in MAPS:
        marker = struct.pack(endian + "I", len(name_key)) + name_key.encode("ascii")
        at = blob.find(marker, start + 12)
        if at < 0:
            continue
        if blob.find(marker, at + len(marker)) >= 0:
            raise auditor.InvalidAsset("ambiguous Material TexEnv")
        at = aligned(at + len(marker))
        if at + 28 > len(blob):
            raise auditor.InvalidAsset("truncated Material TexEnv")
        file_id, path_id = struct.unpack_from(endian + "iq", blob, at)
        uv = struct.unpack_from(endian + "4f", blob, at + 12)
        if file_id < 0 or any(not (-1e8 < v < 1e8) for v in uv):
            raise auditor.InvalidAsset("invalid Material TexEnv")
        properties[name_key] = {
            "fileId": file_id, "pathId": str(path_id),
            "scale": [uv[0], uv[1]], "offset": [uv[2], uv[3]]
        }
    return {"name": name,
            "shader": {"fileId": shader_file, "pathId": str(shader_path)},
            "textures": properties}


def texture_stream(blob, endian):
    name, at = auditor.named_asset(blob, endian)
    if at + 28 > len(blob):
        raise auditor.InvalidAsset("truncated Texture2D")
    width, height, size = struct.unpack_from(endian + "3i", blob, at + 4)
    format_id = struct.unpack_from(endian + "i", blob, at + 20)[0]
    if min(width, height) <= 0 or max(width, height) > 8192 or size < 0:
        raise auditor.InvalidAsset("invalid Texture2D dimensions")
    pos = blob.find(b"archive:/CAB-")
    if pos < 16:
        raise auditor.InvalidAsset("Texture2D stream reference unavailable")
    length = auditor.integer(blob, pos - 4, 4, endian)
    if not (16 <= length <= 400) or pos + length > len(blob):
        raise auditor.InvalidAsset("invalid stream path size")
    path = blob[pos:pos+length].decode("ascii")
    stream_offset = auditor.integer(blob, pos - 16, 8, endian)
    stream_size = auditor.integer(blob, pos - 8, 4, endian)
    if format_id not in FORMATS or stream_size != size or not re.fullmatch(
        r"archive:/CAB-[0-9a-f]{32}/CAB-[0-9a-f]{32}\.resS", path
    ):
        raise auditor.InvalidAsset("unsupported or invalid Texture2D stream")
    return {
        "name": name, "width": width, "height": height,
        "format": FORMATS[format_id], "compressedBytes": size,
        "streamOffset": stream_offset, "streamPath": path
    }


def audit(path):
    raw = path.read_bytes()
    header, nodes = auditor.extract_nodes(raw)
    assets = {name: data for name, data in nodes}
    cabs = [name for name in assets if re.fullmatch(r"CAB-[0-9a-f]{32}", name)]
    if len(cabs) != 1:
        raise auditor.InvalidAsset("expected one material CAB")
    cab = cabs[0]
    res = assets.get(cab + ".resS")
    if res is None:
        raise auditor.InvalidAsset("missing original texture stream")
    materials, textures = {}, {}
    for class_id, path_id, blob, endian in serialized_objects(assets[cab]):
        if class_id == 21:
            info = material_properties(blob, endian)
            if info["textures"]:
                materials[path_id] = info
        else:
            textures[path_id] = texture_stream(blob, endian)
    if not materials:
        raise auditor.InvalidAsset("no material TexEnv map")
    for material in materials.values():
        for key, ref in material["textures"].items():
            if ref["fileId"] != 0:
                continue  # External textures are not verified by this bundle.
            texture = textures.get(ref["pathId"])
            if texture is None or texture["streamPath"] != f"archive:/{cab}/{cab}.resS":
                raise auditor.InvalidAsset("unresolved source Texture2D: " + key)
            start = texture["streamOffset"]
            size = texture["compressedBytes"]
            if start + size > len(res):
                raise auditor.InvalidAsset("source Texture2D stream bounds")
            data = res[start:start+size]
            block_bytes = 8 if texture["format"] == "BC1/DXT1" else 16
            first_mip_bytes = texture["width"] * texture["height"] * block_bytes // 16
            if first_mip_bytes > len(data):
                raise auditor.InvalidAsset("Texture2D base mip truncated")
            texture["streamSha256"] = hashlib.sha256(data).hexdigest()
            texture["baseMipSha256"] = hashlib.sha256(data[:first_mip_bytes]).hexdigest()
    return {
        "schema": "HKIA.NativeDyeMaterialAudit.1",
        "source": "original-game-unityfs",
        "sourceBundle": path.name.removesuffix(".bin"),
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "compressedBytes": len(raw),
        "serializedCab": cab,
        "materials": materials,
        "textures": textures,
        "renderFidelity": "unverified",
        "actualGameUiIconConfirmed": False
    }


def self_test():
    material = b"\x04\x00\x00\x00Test" + struct.pack("<iq", 2, 477622052401609204)
    name = b"_PatternMap"
    texenv = struct.pack("<I", len(name)) + name + b"\x00"
    texenv += struct.pack("<iqffff", 0, 3737869573706931705, 1., 1., 0., 0.)
    parsed = material_properties(material + texenv, "<")
    assert parsed["textures"]["_PatternMap"] == {
        "fileId": 0, "pathId": "3737869573706931705",
        "scale": [1., 1.], "offset": [0., 0.]
    }
    assert parsed["shader"]["pathId"] == "477622052401609204"
    print("NATIVE_DYE_MATERIAL_SELFTEST_OK")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path, nargs="?")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    try:
        if args.self_test:
            self_test()
            return 0
        if args.bundle is None:
            parser.error("original UnityFS bundle required")
        result = audit(args.bundle)
        encoded = json.dumps(result, indent=2, sort_keys=True) + "\n"
        if args.out:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(encoded, encoding="utf8")
            print("Wrote source-derived Material metadata:", args.out)
        else:
            print(encoded)
        return 0
    except (OSError, struct.error, auditor.InvalidAsset, UnicodeError) as exc:
        print("NATIVE_DYE_MATERIAL_AUDIT_ERROR: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
