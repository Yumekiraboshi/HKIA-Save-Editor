# Dynamic icon release staging

Use the existing [versioned intake](icon-source-updates.md) and [native atlas staging](native-icon-atlas-staging.md). After reviewing the candidate native managed layout, run:

```sh
python scripts/dynamic-icon-source-update.py scan --snapshot candidate.json --definitions /original/definitions.bin --reviewed-layout native-dynamic-v1 --out dynamic.json
python scripts/stage-dynamic-icon-textures.py --snapshot candidate.json --dynamic-receipt dynamic.json --bundles native-atlas-input.json --previous-stage /staging/dynamic-old --out /staging/dynamic-new
```

Use the same-platform original bundle manifest, including all source base, mask and atlas dependencies; add original mask bundles through their actual game catalog identity. The extractor follows the original definition Sprite PPtr and actual AssetBundle GUID container Sprite reference, using the ordinary stage's typed SpriteAtlas/Texture2D resolution and stream decoder. It keeps exact fractional geometry and one-texel guards; produces opaque RGB/alpha planes at original resolution, verifies lossless RGB readback, retains native texture color space/filter/wrap settings, and reuses only source-identical verified previous outputs. It stores each identical binding once, not any colored appearance combination. Missing/ambiguous masks, unsupported subobject references or source layouts remain explicitly unresolved. No live renderer is activated by this metadata.

The staged individual source textures are an input to the existing runtime family's packed source manifests; final pack assembly, characteristic/swatch and shader/prefab compatibility review, route closure and actual Chromium/game comparison remain separate. Do not publish the staging index or claim new save compatibility from it. No original bundles or personal saves are committed.
