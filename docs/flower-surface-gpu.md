# Flower surface GPU diagnostic (Steam v3.0.1)

The actual original CustomLitFlower ForwardLit vertex program (both keyword-free and CUSTOM_RIMLIGHT_ON, same bytes) is DXBC SHA-256 5cd10a88525c0eda465f99a94eff25440751096e6f6a71fb003efce14d2073a8. Its ISGN declares TEXCOORD0 at v4 and TEXCOORD1 at v5; SHEX words [2493,2515), SHA-256 bff3c1e53aa695c3a8b0f494de4d7e25e712542bb8772314bf91d22dd8ba06be, apply independent _BaseMap_ST to UV0 and _PatternMap_ST to UV1. Never substitute UV0 for absent UV1. The original pixel program samples BaseMap and MetallicGlossMap with base UV, and PatternMap with pattern UV, using global mip bias. The no-effect arithmetic is as documented in flower-native-surface.md. 

The new WebGL2 diagnostic compiles these surface expressions to GLSL ES 3.00, reuses the existing verified native geometry and texture uploaders, and outputs linear albedo or packed roughness/metallic/occlusion. Camera matrix, mip bias and shader-space tint inputs are explicit. Wind deformation, normal/rim/lighting and effects are not implemented by this diagnostic. Neither original Unity camera nor actual runtime tint selection is inferred. No production UI or save mutation change.

## Actual original-source test

All 25 exact crown geometries were extracted again from the original source definitions' Visual3D GUIDs and the prefab's FlowerRenderers/mesh PPtrs. Geometry SHA values matched the existing 25-item source index. The corresponding original authored BaseMap, PatternMap and MetallicGlossMap texture payloads, original authored UV transforms and no-effect scalar values were extracted by exact material PPtrs and staged privately: 78 unique payloads totaling 22,394,424 bytes. The derived diagnostic metadata SHA-256 is 5d6781ee543214858e4d4e5b0f6cb9f5fbc86f542e8a61c662805bef7d39243a. The existing source manifests and staging utilities are reused by the new adapter; the adapter itself has not yet been executed against its canonical predecessor outputs.

Actual Mesa 25.0.7-2 OpenGL ES 3.2 llvmpipe (LLVM 19.1.7) compiled and linked the exact GLSL shader strings now committed (vertex SHA 4dbe26be0c7c9601ef62553b79498afe719ef553cc6a00cbb47f20b537067199, fragment SHA 76b68c071bae75a97457a214b3d35c1ded6849d42196874b1b43389e8ddbc9a6). Original mesh and compressed texture mips were uploaded to EGL; each crown was drawn at 128x128 with two synthetic shader-space tints and one material output. 75/75 successful draws; nonzero alpha coverage 3276–5591 pixels per model; identical alpha plane and changed RGB for the two tints in all 25 cases. Each material-output frame differed from albedo. Local result JSON SHA-256 e6d19433b453b0c79293879a2a123e3f3459b1296cf2c125af5f75acc915c315. The local harness used an explicit top-down diagnostic projection of source bounds and equivalent GL calls, not the native camera or exact browser uploader. BC1 RGB mode and zero global mip bias were explicit diagnostic choices; native runtime settings not claimed. Chromium GPU initialization failed locally, so no browser or Pages success is claimed. 

To reproduce with original Steam copies, use the existing crown extractor with --stage, then stage-flower-external-textures.py with the same staging directory. Then:

```sh
python scripts/stage-flower-surface-diagnostic.py --root /path/to/source-copies --crown-manifest /tmp/crown-source.json --stage /tmp/crown-stage --out /tmp/flower-surface.json
node scripts/flower-surface-smoke.mjs --manifest /tmp/flower-surface.json --stage /tmp/crown-stage
```

The new smoke script executes the actual shared WebGL2 upload and draw batch for all 25 models. It is an offline diagnostic; no original assets or diagnostic output screenshots are included in Git or production Pages. A passing result would not establish game-equivalent thumbnail fidelity. 
