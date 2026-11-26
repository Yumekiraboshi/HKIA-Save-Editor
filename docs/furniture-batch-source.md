# Batch source extraction for furniture thumbnails

The original catalog and definition crosswalk now support a complete extraction plan rather than one manually selected model at a time. The v3.0.1 plan covers 649 visual GUIDs (621 furniture, 28 home customization), 44 explicit customizer overrides, 523 first model-bundle candidates, 861 referenced treatment indices and 274 referenced pattern GUIDs in 148 first pattern-bundle candidates. The 26,274 slot choices are not distinct final images.

```sh
python scripts/batch-furniture-native-source.py --plan > /tmp/hkia-furniture-plan.json
python scripts/batch-furniture-native-source.py --root /path/to/Steam-source --catalog /path/to/Steam-source/catalog.bin --out /tmp/hkia-furniture-batch
```

Use --kind geometry or --kind pattern and optionally --limit for a small local run. The source catalog hash is checked before extraction. Only the first dependency is attempted automatically, as a candidate; successful geometry/texture extraction requires the exact GUID in the original AssetBundle container and supported serialized layout. The four pinned mesh samples and existing pattern samples are checked against previous exact manifests. The chair texture extractor handles the six already verified chair pattern sources. Newly observed bundle hashes are recorded, not represented as independently pre-pinned evidence. Unsupported layouts and missing candidate bundles appear individually in report.json and cannot be silently substituted. The output remains outside the repository and the source tree.

The batch runner extracts geometry and patterns; base material and shader dependency closure still use the existing source extractors and need broader layout coverage. The complete plan was computed from committed source manifests; actual batch extraction and browser rendering have not been executed. No new production assets or rendered variants are included.
