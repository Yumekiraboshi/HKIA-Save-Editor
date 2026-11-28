# Auxiliary original icon assets

After the versioned auxiliary source extraction (#510) and shared atlas/dynamic stages (#509) are integrated:

```sh
python scripts/stage-icon-auxiliary-assets.py --snapshot candidate.json --auxiliary auxiliary.json --bundles native-atlas-input.json --previous-stage /staging/aux-old --out /staging/aux-new
```

Use the same original bundle input manifest and exact platform, including the actual SpriteAtlas dependencies. Seed/grown-troweled and magic Sprite PPtrs are joined by original identity. Reuse the common atlas decoder, guarded RGB/alpha staging, lossless source verification and candidate page assembler. No resized substitute or completed appearance variant. The source pages have growth:ItemID:0/7 and magic:CharacteristicID routes; the existing production runtime is not activated by this staging format.

For actual chef color values add the original deferredserviceconfigs bundle to the manifest and a reviewedSwatchLayout object with bundle (manifest name), objectSha256, schemaSha256 (canonical typed tree digest), swatchMapField and rgbaField. These selectors must be reviewed against the exact native Default.DyeDataServiceConfig tree; do not infer their names or reuse a previous version's values. The stage walks the actual typed parallel key/value arrays, joins the exact IDs and retains missing mappings. Steam 3.0.1 is checked against the existing 556-swatch source and 34 chef color mappings. Without that bundle and reviewed layout the receipt explicitly lists all unresolved swatches.

Output is a candidate-only auxiliary source receipt and guarded dynamic-source-pages index. Actual source bundles, integration with the release route catalog/family runtime manifests, and real browser verification are still needed. This command depends on the shared modules from #509 and #510; do not publish any candidate output or change save compatibility automatically.
