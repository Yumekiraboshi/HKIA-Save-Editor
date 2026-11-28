# Assemble an icon release candidate

The final offline assembly command consumes the existing versioned source snapshot, original atlas stage, exact IconOverride stage, dynamic binding receipt and guarded source texture stage. It requires the candidate shared CollectionDisplayCatalog.2 produced by the catalog pipeline, not manually inferred groups. Keep the whole candidate outside the repository until verified.

```sh
python scripts/assemble-icon-release.py --snapshot candidate.json --definitions /original/definitions.bin --catalog candidate-catalog.json --base-stage /staging/base-new --override-stage /staging/overrides-new --dynamic-receipt dynamic.json --dynamic-stage /staging/dynamic-new --reviewed-result-layout native-result-icon-v1 --out /staging/release-new
```

The reviewed result layout selection is valid only after inspecting the candidate native managed classes and main icon selection behavior. The Switch 3.0.1 source is independently pinned; its 762 result routes and 152 exact icon_placeholder IDs are checked against existing source tables. If the original outfit GUIDs were extracted from a separate platform, supply `--override-snapshot`; both complete definition ID/key/GUID sets must match, and asset platform must match the primary snapshot. All source bundle fingerprints must agree within that artwork platform.

Outputs:
- Collection group stored ZIPs in the existing HKIA.SheetIcons.1 transport (96px, 12 columns, deduplicated source cells), plus a candidate inventory-only sheet index. ZIP part counts and Git blob digests are recorded; 3.0.1 runtime pins are not changed.
- Bounded stored ZIPs of exact completed original overrides, with original binding and individual file hash.
- Shared, content-addressed opaque dynamic source pages, preserving unresized RGB/alpha texels, sampling guards, fractional sample rectangles, source color space and separate alpha offset. Same source texture is packed once; there are no generated appearance combinations. Page geometry and lossless pixel readback are checked.
- A release-candidate receipt with every definition route, native recipe/schematic result mapping, missing source IDs, candidate pack bytes/hashes, input receipt identity and remaining compatibility checks. Missing or unsupported sources are not treated as completed artwork.

This is a **candidate transport assembly**, not a production release or a second production database. New-version family-specific runtime manifest adapters, original growth/decorator/magic/characteristic/shader dependencies, exact source route review, current loader/cache pins, and browser/game checks must still be completed before publication. Current published 3.0.1 source and save-version support remain unchanged. Actual next-version original bundles are required to exercise the full pipeline. Pillow is required for extraction/packing; the pure route/packing-layout self-test uses only the Python standard library.

The original placeholder cells are also emitted as verified shared WebP references. At a source texture edge, the dynamic page assembler repeats one edge texel outside each preserved crop so packed neighbours cannot change bilinear clamp sampling. Unrelated managed-reference registries are not parsed using the single-result layout.


## Version-bound collection pack delivery

The shared collection ZIP decoder is also available through `createVersionedCollectionPackLoader(root, pin)` in `src/icon-packs.ts`. The reviewed pin contains the explicit game version and `receiptFileSha256` (SHA-256 of the exact release-candidate.json file bytes, not its internal canonical receiptSha256). The loader validates the candidate part counts, complete ZIP digest/size partition and per-group delivery budget before fetching a group; each ZIP is then verified by SHA-256 and exact length before the existing stored-ZIP decoder constructs local sprite URLs. Missing groups and wrong versions do not trigger a guessed ZIP filename. Failed receipt fetches can be retried. The original production 3.0.1 loader and pinned Git-blob hashes remain unchanged. This candidate adapter is not registered as a live release, and requires a separately reviewed matching collection catalog.
