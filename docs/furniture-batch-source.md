# Batch source extraction for furniture thumbnails

The original catalog and definition crosswalk now support a complete extraction plan rather than one manually selected model at a time. The v3.0.1 plan covers 649 visual GUIDs (621 furniture, 28 home customization), 44 explicit customizer overrides, 523 first model-bundle candidates, 861 referenced treatment indices and 274 referenced pattern GUIDs in 148 first pattern-bundle candidates. The 26,274 slot choices are not distinct final images.

```sh
python scripts/batch-furniture-native-source.py --plan > /tmp/hkia-furniture-plan.json
python scripts/batch-furniture-native-source.py --root /path/to/Steam-source --catalog /path/to/Steam-source/catalog.bin --out /tmp/hkia-furniture-batch
```

Use --kind geometry or --kind pattern and optionally --limit for a small local run. The source catalog hash is checked before extraction. Only the first dependency is attempted automatically, as a candidate; successful geometry/texture extraction requires the exact GUID in the original AssetBundle container and supported serialized layout. The four pinned mesh samples and existing pattern samples are checked against previous exact manifests. The chair texture extractor handles the six already verified chair pattern sources. Newly observed bundle hashes are recorded, not represented as independently pre-pinned evidence. Unsupported layouts and missing candidate bundles appear individually in report.json and cannot be silently substituted. The output remains outside the repository and the source tree.

The batch runner extracts geometry and patterns; base material and shader dependency closure still use the existing source extractors and need broader layout coverage. The complete plan was computed from committed source manifests; actual batch extraction and browser rendering have not been executed. No new production assets or rendered variants are included.

## Resume and merge missing original sources

Use the independently recorded SHA-256 of a previously verified unified pack:
```sh
python scripts/batch-furniture-native-source.py --remaining-from prior.zip --remaining-sha256 <prior-sha256> --plan
python scripts/batch-furniture-native-source.py --root /path/to/Steam-source --catalog /path/to/Steam-source/catalog.bin --out /tmp/hkia-next --remaining-from prior.zip --remaining-sha256 <prior-sha256>
python scripts/batch-furniture-base-materials.py --root /path/to/Steam-source --catalog /path/to/Steam-source/catalog.bin --batch /tmp/hkia-next --out /tmp/hkia-next-materials
python scripts/pack-furniture-batches.py --source /tmp/hkia-next --materials /tmp/hkia-next-materials --prior prior.zip --prior-sha256 <prior-sha256> --out /tmp/hkia-next-unified.zip
```
Resume checks the pinned prior ZIP and exact Item ID / visual GUID / bundle and pattern GUID / bundle crosswalks. The full plan counts remain unchanged; the returned model and pattern lists contain only missing identities. Packing consumes the existing batch receipts and admits a model only with its complete material closure. The existing unified assembler revalidates the previous pack and the new geometry, texture and dependency graph. Unresolved results are reported, not fabricated. Omit --materials for a pattern-only delta. No automatic publication or proof of render fidelity.

### Rebuild without the previous source pack

The previous ZIP is optional. To include the two required original reflection cubemaps in a fresh pack, use the existing light-region extractor with its exact scene and preset bundles:

```sh
python scripts/extract-furniture-light-region-source.py <original-scene-bundle> <original-networkedprototypes-bundle> --out /tmp/hkia-light/furniture-light-region-source-v3.0.1.json --staging /tmp/hkia-light
python scripts/pack-furniture-batches.py --source /tmp/hkia-batch --materials /tmp/hkia-materials --lighting-stage /tmp/hkia-light --out /tmp/hkia-unified.zip
```

The packer checks the full extracted manifest against the committed original scene evidence, both cubemap payload hashes and lengths, and the existing assembler's exact face/mip coverage. This eliminates dependence on a prior ZIP for the shared reflection payloads. Existing pattern-only and incremental packs remain supported. A pack still needs complete source model/material graphs before it can render; runtime lighting and face orientation are not inferred or verified by packing.
