# HKIA game-source colorway image generation (Steam v3.0.1)

## Source policy

**Only original-game assets may be used to produce final variant images.**
The editor must not import or hotlink wiki pictures or other third-party images.
The existing approximate browser re-coloring is a *temporary fallback*, not a
source-accurate game render.

The installed variant image registry currently has **zero images**. Its
presence does **not** imply that original 3D outfit rendering is complete.

## Original game assets already identified

- Steam v3.0.1 UnityFS bundles hold outfit models, materials and textures.
- The inspected clothing materials refer to `_BaseMap`, `_ComboMap` and
  `_PatternMap`, and include `_PaletteColor1` through `_PaletteColor5`.
- `public/native-dye-palettes.json` supplies 5-color values for 5,383 game
  Item IDs, but does not by itself describe the shader material masks.
- `public/catalog.json` maps the same save Item IDs to their game item keys.
- Existing 2D inventory `UiIcon` sprites are shared between colorways.

Original UnityFS sources inspected:
- `l_nisetamastyle_shirt_komiyashirt` (SHA-256
  `15f7d3143c88202f4866f9ee1c35e45416d87dfc03ab1a7a5e888103b8ff0163`)
- `l_basicstyle_fullbody_imaginationarcher` (SHA-256
  `ea8f16a8a326f28c314818a0f2381c227442ea8a3f3137a2f5d05b7ff951084b`)
- `atlas_iconcolormasks` (SHA-256
  `7304bf7b24aac0b34b2a62c9f94d4ec0b981a8eb3ec146931ecb0fe305cf801e`)

These observations do **not** establish that the 2D thumbnails encode the
game's 3D shader-channel assignments. The current 2D garment masks are
approximations and must not be described as pixel-perfect game rendering.

## Required original-game rendering pipeline

1. Identify a game's Item ID → original outfit prefab and MeshRenderer
   (including the specific mesh, submesh, materials, textures, shader).
2. Resolve the game's combination/pattern maps and how each of the five
   `_PaletteColor` parameters affects material pixels and overlays.
3. Apply the Item ID's original five-color native palette to the correct
   materials and channels.
4. Set a fixed outfit pose, orthographic camera, lighting and resolution.
   Render an alpha-transparent image from the 3D asset, not the unchanged 2D
   shared icon.
5. Compare representative colorways against **a render produced locally
   from the original game**, verify material and shading fidelity, then
   generate all variants from the same verified family.
6. Export image as `<itemId>.png` (or lossless WebP), compute SHA-256,
   record the original source UnityFS bundle and register it.
7. Only after step 5 is a family verified should its images supersede the
   approximate collection previews.

The game data should be processed offline in an isolated asset-extraction /
rendering pipeline. GitHub Pages serves the resulting images; the browser
does not need to load or extract Unity 3D game assets.

## Register an output rendered from game assets

```bash
node scripts/register-variant-art.mjs \
  --id 704486536 \
  --image /path/to/game-generated/704486536.png \
  --source-bundle l_basicstyle_fullbody_imaginationarcher
```

The importer requires a known native dye Item ID, a transparent PNG, dimensions,
file hash and a UnityFS bundle *name* for provenance. It does **not** verify
that a supplied image truly came from the bundle or used the correct game
shader. Visual correctness therefore remains a separate required check.

The checked-in `public/variant-art/index.json` starts empty and is only
populated after real source renders have been created and validated.
`src/variant-art.ts` rejects external URLs, non-game provenance and
unsafe filenames. CI validates registered image bytes, SHA-256 and file paths.

## Immediate blocker

The source 3D bundles are identifiable, but a verified material-channel
renderer and a complete Item ID ↔ 3D model mapping have **not** yet been
implemented. Producing 5,383 game-accurate images requires these components.
Do not claim success based only on the existing approximate 2D recoloring.
