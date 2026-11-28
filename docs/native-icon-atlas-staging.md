# Native UiIcon atlas staging for release updates

Part of the shared [icon source update process](icon-source-updates.md), not a second product catalog. Build the candidate snapshot first. The versioned staging command uses the existing typed UnityFS readers and the existing native crop/trim/96px sheet geometry. It resolves the actual definition Sprite, SpriteAtlas render-data key, and local/external Texture2D PPtr, deduplicates shared Sprite objects, and records the exact source object/texture/payload fingerprints. No name-based fallback. The explicit `unity-v22-uiicon-v1` layout selection requires review of a candidate game's native Sprite/Texture2D layout. Unsupported source layouts, secondary textures, compression, or mip chains remain unresolved. The existing release-specific extractors and assets are untouched.

Input manifest shape (substitute actual hashes, paths and version; include all required same-platform dependencies):

```json
{"schema":"HKIA.NativeIconAtlasInput.1","version":"3.0.1","platform":"steam","definitionSnapshotSha256":"<snapshot hash>","reviewedLayout":"unity-v22-uiicon-v1","bundles":[{"name":"definitions","file":"/original/definitions.bin","sha256":"ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0"},{"name":"atlas_global","file":"/original/atlas_global.bin","sha256":"04c1f4c191b0a821a0bbcb15e67a75bec85cf343a0b2e875ee8e525e1e8dfc7b"}]}
```

```sh
python scripts/stage-native-icon-atlas.py --snapshot candidate.json --bundles native-atlas-input.json --previous-stage /staging/base-old --out /staging/base-new
```

Pillow is needed for image extraction. The optional previous stage is reused only when exact original Sprite, render geometry, texture metadata/payload and renderer revision match and the old sheet/cell digest verifies. Shared texture changes invalidate all dependent source tiles conservatively. Output consists of lossless WebP sheets (12 columns, 96px cells, up to 144 cells per sheet) and a source-bound staging receipt. Each decoded sheet is checked for visible RGBA equivalence, each original Item ID is either resolved or explicitly unresolved. The image output is an original normalized source reference, not a Unity framebuffer capture. Current native BC3/RGB/RGBA single-mip sRGB layout is supported; other texture formats and render layouts must be implemented and verified rather than guessed. Fractional crop coordinates follow the existing growth-image rounded trim transport, not the dynamic shader sampling path.

The base stage is deliberately separate from selecting final artwork: recipe/schematic results, IconOverride, dynamic base/mask/characteristics, growth and decorator routes must use their source-proven rules. All dynamic-flag IDs are recorded for candidate review. Do not publish this receipt directly as the existing native inventory index; resolve all remaining source routes and validate the final pack partitions and save gates before activation.
