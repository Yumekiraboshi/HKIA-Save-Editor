# Auxiliary original icon assets

After the versioned auxiliary source extraction (#510) and shared atlas/dynamic stages (#509) are integrated:

```sh
python scripts/stage-icon-auxiliary-assets.py --snapshot candidate.json --auxiliary auxiliary.json --bundles native-atlas-input.json --previous-stage /staging/aux-old --out /staging/aux-new
```

Use the same original bundle input manifest and exact platform, including the actual SpriteAtlas dependencies. Seed/grown-troweled and magic Sprite PPtrs are joined by original identity. Reuse the common atlas decoder, guarded RGB/alpha staging, lossless source verification and candidate page assembler. No resized substitute or completed appearance variant. The source pages have growth:ItemID:0/7 and magic:CharacteristicID routes; the existing production runtime is not activated by this staging format.

For actual chef color values add the original deferredserviceconfigs bundle to the manifest and a reviewedSwatchLayout object with bundle (manifest name), objectSha256, schemaSha256 (canonical typed tree digest), swatchMapField and rgbaField. These selectors must be reviewed against the exact native Default.DyeDataServiceConfig tree; do not infer their names or reuse a previous version's values. The stage walks the actual typed parallel key/value arrays, joins the exact IDs and retains missing mappings. Steam 3.0.1 is checked against the existing 556-swatch source and 34 chef color mappings. Without that bundle and reviewed layout the receipt explicitly lists all unresolved swatches.

Output is a candidate-only auxiliary source receipt and guarded dynamic-source-pages index. Actual source bundles, integration with the release route catalog/family runtime manifests, and real browser verification are still needed. This command depends on the shared modules from #509 and #510; do not publish any candidate output or change save compatibility automatically.

## Connect the source pages to the existing renderer

```sh
python scripts/compile-icon-family-bindings.py --dynamic dynamic.json --auxiliary auxiliary.json --auxiliary-stage /staging/aux-new --release /staging/release-new --out /staging/family-bindings.json
```

The generated descriptor links the exact dynamic and auxiliary page indices by digest. The versioned family adapter (src/versioned-icon-families.ts) consumes the reviewed, explicitly pinned descriptor and uses the same flower pattern selection, characteristic tint resolution, palette channel normalization and rasterizer as the current 3.0.1 views. It supports flower growth, café/boba tints, customized palette RGB and wand magic/source-item overlay composition. A nonzero wand source uses the same-version original definition UiIcon source pages (including rectangular sprites); an optional independently verified same-version provider can recover missing delivery. Absent source data returns no complete composite. A known magic characteristic with no MagicDisplay entry displays the native tinted base, while a mapped but missing sprite remains unresolved. Known mapped-but-unresolved swatches stay unresolved, not white. No candidate pin is registered in the live app. Game shader/prefab behavior and route compatibility must still be reviewed on actual new-version originals. The existing application remains on the verified 3.0.1 production bindings.


## Flower pattern/effect icon sources

The same auxiliary extractor now reads the typed original `FlowerPatternDefinition.Icon` PPtr, keyed by `PatternIndex` (not the per-species dynamic tint mask). The auxiliary stages include `pattern:Index` routes in the existing verified guarded texture transport and reuse the same-version source identity and previous-stage reuse. The family compiler checks all current pattern definitions against resolved/unresolved routes; the family renderer exposes `flowerPattern(index, version)` for resolved original source images. Native null references remain explicitly unavailable; unknown indices cannot borrow another pattern. New indices do not depend on the 3.0.1 count of 16. Existing production pattern files and circular rim/foreground CSS remain unchanged. Candidate raster delivery is not yet wired to the badge UI; native plate and other decorator metadata extraction, exact badge geometry/crop parity and actual new-version original validation remain necessary.
