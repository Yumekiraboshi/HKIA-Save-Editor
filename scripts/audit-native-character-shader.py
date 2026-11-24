#!/usr/bin/env python3
"""Recover verified PC v3.0.1 CustomLitCharacter DXBC metadata.
Read-only, local game source only. Never writes raw compiled code into Git.
The Shader's known serialized name field offset is pinned to its full object
SHA-256, not guessed or reused across game versions.
"""
import argparse
import hashlib
import importlib.util
import json
import struct
from pathlib import Path

spec = importlib.util.spec_from_file_location("native_material_audit", Path(__file__).with_name("audit-native-dye-materials.py"))
material_audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(material_audit)
auditor = material_audit.auditor
SOURCE = "ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0"
CAB = "CAB-46b8f8fe122147493b3113f7c1c8cd0f"
SHADER = "477622052401609204"
OBJECT_SHA = "a1078dfbdb6da8c3e2ce40106135fd59c8a0c1749e885dd98c45a4aa094125f3"
NAME = "Sunblink/Lynx/CustomLitCharacter"

def require(ok, reason):
    if not ok:
        raise ValueError(reason)

def sha(b):
    return hashlib.sha256(b).hexdigest()

class Reader:
    def __init__(self, b, pos=0):
        self.b, self.pos = b, pos
    def take(self, fmt):
        n = struct.calcsize("<" + fmt)
        require(self.pos + n <= len(self.b), "truncated shader field")
        result = struct.unpack_from("<" + fmt, self.b, self.pos)
        self.pos += n
        return result[0] if len(result) == 1 else result
    def align(self):
        self.pos = (self.pos + 3) & ~3
    def string(self):
        n = self.take("I")
        require(n <= 4096 and self.pos + n <= len(self.b), "invalid shader string")
        value = self.b[self.pos:self.pos+n].decode("utf8")
        self.pos += n
        self.align()
        return value
    def array(self, callback, limit=1024):
        n = self.take("I")
        require(n <= limit, "invalid shader array")
        return [callback() for _ in range(n)]

def shader_properties(obj):
    r = Reader(obj)
    r.string()
    def prop():
        name, description = r.string(), r.string()
        attrs = r.array(r.string)
        kind, flags = r.take("iI")
        defaults = r.take("ffff")
        texture = r.string()
        dimension = r.take("i")
        return {"name": name, "type": kind, "defaultTexture": texture, "defaultValue": list(defaults)}
    return r.array(prop, 128)

def containers(blob):
    """Validate DXBC container/chunk bounds and stage from tokenized header."""
    result, pos = [], 0
    while True:
        start = blob.find(b"DXBC", pos)
        if start < 0:
            break
        pos = start + 4
        require(start + 32 <= len(blob), "truncated DXBC")
        size, count = struct.unpack_from("<II", blob, start + 24)
        require(1 <= count <= 64 and 32 + 4*count <= size <= len(blob)-start, "DXBC bounds")
        program = blob[start:start+size]
        stages = []
        for offset in struct.unpack_from("<" + "I"*count, program, 32):
            require(32+4*count <= offset <= size-8, "DXBC chunk offset")
            tag, length = struct.unpack_from("<4sI", program, offset)
            require(offset + 8 + length <= size, "DXBC chunk size")
            if tag in (b"SHDR", b"SHEX"):
                require(length >= 8 and length % 4 == 0, "DXBC instruction bounds")
                version, tokens = struct.unpack_from("<II", program, offset+8)
                require(tokens*4 == length and version >> 16 in (0, 1), "unsupported DXBC program")
                stages.append("pixel" if version >> 16 == 0 else "vertex")
        require(len(stages) == 1, "DXBC shader stage missing or ambiguous")
        result.append({"offset": start, "bytes": size, "stage": stages[0], "sha256": sha(program)})
        pos = start + size
    return result

def shader_segments(obj, decoded=None):
    require(sha(obj) == OBJECT_SHA, "unsupported Shader object")
    r = Reader(obj, 16176)
    require(r.string() == NAME, "Shader name mismatch")
    editor, fallback = r.string(), r.string()
    r.array(lambda: (r.string(), r.string()))
    r.array(lambda: (r.string(), r.string()))
    r.take("B")
    r.align()
    platforms = r.array(lambda: r.take("I"))
    offsets, sizes, expanded = [r.array(lambda: r.array(lambda: r.take("I"))) for _ in range(3)]
    require(platforms == [4] and len(offsets) == len(sizes) == len(expanded) == 1, "unexpected Shader platform")
    n = r.take("I")
    require(n <= 1_000_000 and r.pos+n <= len(obj), "Shader blob bounds")
    blob = obj[r.pos:r.pos+n]
    require(len(offsets[0]) == len(sizes[0]) == len(expanded[0]) == 3, "Shader segment count")
    segments = []
    cursor = 0
    for offset, compressed, length in zip(offsets[0], sizes[0], expanded[0]):
        require(offset == cursor and 0 < compressed <= len(blob)-offset and 0 < length <= 2_000_000, "Shader segment bounds")
        data = auditor.decompress(blob[offset:offset+compressed], length, 2)
        if decoded is not None:
            decoded.append(data)
        segments.append({"offset": offset, "compressedBytes": compressed, "bytes": length,
                         "sha256": sha(data), "programs": containers(data)})
        cursor += compressed
    require(cursor == len(blob), "unconsumed Shader blob")
    return segments

def audit(path):
    raw = path.read_bytes()
    require(sha(raw) == SOURCE, "unsupported definitions version")
    _, nodes = auditor.extract_nodes(raw)
    blob = dict(nodes)[CAB]
    objects = list(material_audit.serialized_objects(blob, classes=(21,28,48)))
    shader = next(o for c,p,o,e in objects if c == 48 and p == SHADER and e == "<")
    properties = shader_properties(shader)
    segments = shader_segments(shader)
    textures = {p for c,p,o,e in objects if c == 28}
    material_count = pattern_count = map_count = 0
    for c,p,o,e in objects:
        if c != 21:
            continue
        m = material_audit.material_properties(o,e)
        if m["shader"] != {"fileId":0,"pathId":SHADER}:
            continue
        material_count += 1
        for k in material_audit.MAPS:
            ref = m["textures"].get(k)
            if not ref or ref["pathId"] == "0":
                require(k == "_PatternMap", "required native map absent")
                continue
            require(ref["fileId"] == 0 and ref["pathId"] in textures, "unresolved native map")
            map_count += 1
            pattern_count += int(k == "_PatternMap")
    programs = [p for s in segments for p in s["programs"]]
    summary = {"materials":material_count,"patternMaterials":pattern_count,"textureReferences":map_count,
               "pixelPrograms":sum(p["stage"]=="pixel" for p in programs),
               "vertexPrograms":sum(p["stage"]=="vertex" for p in programs)}
    require(summary == {"materials":50,"patternMaterials":24,"textureReferences":174,"pixelPrograms":32,"vertexPrograms":12}, "source summary mismatch")
    return {"schema":"HKIA.NativeCharacterShaderAudit.1","sourceSha256":SOURCE,"cab":CAB,
            "shaderPathId":SHADER,"shaderObjectSha256":OBJECT_SHA,"shaderName":NAME,
            "properties":properties,"segments":segments,"summary":summary,
            "nativeIconRenderVerified":False}

def self_test():
    # Minimal container with one tokenized pixel shader chunk, no game bytes.
    header = b"DXBC" + bytes(20) + struct.pack("<III",52,1,36)
    demo = header + b"SHEX" + struct.pack("<III",8,0x50,2)
    assert len(demo)==52 and containers(demo)[0]["stage"]=="pixel"
    for invalid in (demo[:-1],demo[:36]+b"SHEX"+struct.pack("<III",8,0x50,3)):
        try:
            containers(invalid)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid DXBC accepted")
    print("NATIVE_CHARACTER_SHADER_SELFTEST_OK")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("definitions",type=Path,nargs="?")
    parser.add_argument("--self-test",action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    elif args.definitions:
        print(json.dumps(audit(args.definitions),indent=2))
    else:
        parser.error("definitions bundle required")
