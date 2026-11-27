# Unified native furniture source pack

`python scripts/assemble-furniture-source-pack.py <local-source-stage.zip> <normalized-source-pack.zip> --out <new local output.zip>`

This offline assembler accepts the prior original-source stage manifest and the normalized mixed-shader source manifest. It produces a single ZIP with sources.json, the existing HKIA.FurniturePayloadPack.1 index, and content-addressed geometry/texture/cube payloads. Exact material/CAB bindings and local object hashes, source-version metadata, individual payload SHA-256, range hashes, alignment padding, original submesh vertex windows, mip and cube bounds are checked before an exclusive output link is made. Duplicate identities must match exactly; separate pattern GUIDs may refer to the same content. Unreferenced ZIP entries, unresolved base material graphs, changed bytes and existing output paths refuse. Source metadata remains from the trusted offline extraction pipeline; the assembler does not independently establish original game provenance of arbitrary supplied metadata.

Local verification with the previous 71-model/120-pattern source stage, normalized four-model pinned pack with twelve pattern GUIDs, and six centerpiece models plus shared white/one new pattern: 81 models, 133 GUIDs, 95 material objects, 140 texture objects, seven shader objects, 44 distinct base source bundle identities. 345 unique payloads (81 geometry, 262 texture, two cube); 171,336,070 uncompressed bytes; 31,868,434-byte ZIP. 196,172 static triangles. sources.json SHA-256 5e3b97b289408dcee18aa64652da8f2c86219f579e06934f0edafc277effec36. ZIP SHA-256 10916dfcaaaec72b944e087377200a5cbf92edce9fb5d09a3a0460ee4a1517c6. All copied payloads were read back and hashed. No original bundles, private saves, or pre-rendered combinations in the pack. The source manifests can be joined to the existing original catalog and variant definitions and consumed by the diagnostic renderer; unsupported materials, UV layouts and effects still refuse there. Neither the pack nor these numbers imply 81 production-ready icons, native lighting/scene parity, or deployment. No asset ZIP is committed automatically.

### Expanded local source pack

Source extraction added 37 complete static geometry/material graphs and 41 previously absent pattern GUIDs from the original v3.0.1 catalog. The newly fingerprinted CustomLitRefractive object (CAB-46b8f8fe122147493b3113f7c1c8cd0f:-245959077359590779; SHA-256 39080ec3a7154ee8032ee36bab5f861630dfe745b3bd1e35ad275662b1c6e332, 41 properties, seven D3D segments of 6520, 519732, 516740, 515272, 523968, 515000, 505264 expanded bytes) closes source dependencies for item IDs 302413286, 184391565, 1845554973 and 1933699846. Extraction of refractive shader metadata does not implement refraction or alpha rendering. Four attempted geometry sources remain excluded: 1913359021 unsupported submesh/index format in the local single-submesh extractor, and 309658643, 679070378, 925764558 unsupported root components. No guessed replacements.

The verified incremental local stage contains 167 unique payloads (124,940,172 bytes), 34 original source bundle identities and a ZIP SHA-256 966d7cc4edbc47bcda13509982424bc085be2273104d2cee0ecee6d26b61399c. Merged using the unified assembler: 118 models, 174 pattern GUIDs, 150 original material objects, 237 base texture objects, eight shader identities, 284,547 static triangles. 500 unique payloads (117 geometry, 381 texture, two cube), 276,505,370 raw bytes, 48,048,830-byte ZIP; sources.json 1,949,233 bytes SHA-256 dbef67615319af08c9cf432557fe3b8dccbd8c307ae044389abd20eb0d7f3cf8; ZIP SHA-256 ca1184964b6858fe67674bfd15246ffda02ed55ce478fdc681cf72d673a05e1e. The local adapted extractor verified bundle and payload hashes, and the shared assembler checked material references and exact geometry/mip ranges. The official extractor registry is extended to permit the same source object, not to change the runtime shader gate. Pack is local only and rendering/deployment remains unverified.

## Local staging and lazy HTTP transport

`python scripts/stage-furniture-source-pack.py <unified.zip> --zip-sha256 <independently recorded ZIP digest> --out <new staging directory>`

The command checks the independent ZIP pin, reuses the assembler's reference, range and payload verification, and writes only the verified normalized manifest, index and content-addressed binaries. It checks the staged bytes again and refuses an existing destination. It does not upload or deploy anything. Use the reported manifestPin (length and SHA-256) as an independently reviewed application-side pin; do not establish trust from an index served alongside the payloads. `fetchFurnitureSourcePack` loads only that exact manifest from a same-origin root, with a bounded streaming buffer and no redirects; existing lazy payload readers handle individual assets. The pack remains diagnostic until scene and shader fidelity are verified. No production UI activation or asset publication by this change.

### Rebuild without the previous source pack

The previous ZIP is optional. To include the two required original reflection cubemaps in a fresh pack, use the existing light-region extractor with its exact scene and preset bundles:

```sh
python scripts/extract-furniture-light-region-source.py <original-scene-bundle> <original-networkedprototypes-bundle> --out /tmp/hkia-light/furniture-light-region-source-v3.0.1.json --staging /tmp/hkia-light
python scripts/pack-furniture-batches.py --source /tmp/hkia-batch --materials /tmp/hkia-materials --lighting-stage /tmp/hkia-light --out /tmp/hkia-unified.zip
```

The packer checks the full extracted manifest against the committed original scene evidence, both cubemap payload hashes and lengths, and the existing assembler's exact face/mip coverage. This eliminates dependence on a prior ZIP for the shared reflection payloads. Existing pattern-only and incremental packs remain supported. A pack still needs complete source model/material graphs before it can render; runtime lighting and face orientation are not inferred or verified by packing.

### Single-command local rebuild

From a checkout of the canonical repository, Python 3.12+ is sufficient for extraction and packing (no package install or network required):

```powershell
python scripts/rebuild-furniture-source-pack.py --root "D:\\SteamLibrary\\steamapps\\common\\Hello Kitty Island Adventure\\Hello Kitty_Data" --out "$env:USERPROFILE\\Desktop\\HKIA-Furniture-Source"
```

Use your actual original v3.0.1 tree path. The output must be new and outside both the game tree and repository. The command discovers the exact catalog and lighting bundles by pinned hashes, runs the existing geometry/pattern and material-closure extractors, includes the original reflection cubes, assembles the pack, and verifies lazy browser staging. Optional `--catalog`, `--limit` and independently pinned `--prior` / `--prior-sha256` are supported. Intermediate local stages remain available if a later stage fails; no success receipt is written on failure. The final `result.json` records pack and manifest pins, coverage and omitted source identities; the pack remains diagnostic. No upload or deployment is performed. Actual original full-tree execution is pending.
