# Source-accurate colorway image pipeline (Steam v3.0.1)

## What the editor displays

1. When a **verified, captured variant-specific image** has been registered for
   the exact game Item ID, display that image at its natural aspect ratio,
   including original multi-channel colors and item details.
2. If that image is absent, broken or fails to decode, use the existing local
   native-palette pixel-recoloring approximation (one channel generally;
   guarded two/three-channel source-image profiles for certain families).
3. If recoloring cannot be performed, show the original game-authored icon.

**As of this implementation, the verified-image registry is empty. No
unretrieved wiki images have been represented as installed.** This pipeline
does not hotlink the wiki, add palette swatches/rings, contact a server with
player data, or modify a save.

## Game source audit

The source bundle manifests identify the following Steam game UnityFS files.
Original binaries are source inputs only and are not part of the published
repository.

| Source bundle | SHA-256 | Findings |
|---|---|---|
| `l_nisetamastyle_shirt_komiyashirt` | `15f7d3143c88202f4866f9ee1c35e45416d87dfc03ab1a7a5e888103b8ff0163` | Serialized Material includes `_BaseMap`, `_ComboMap`, `_PatternMap`, `_PaletteColor1` … `_PaletteColor5`. In the sampled default material, palette colors are white and do not identify their placement on the 2D item thumbnail. |
| `l_basicstyle_fullbody_imaginationarcher` | `ea8f16a8a326f28c314818a0f2381c227442ea8a3f3137a2f5d05b7ff951084b` | Serialized prefab/mesh object and Material references; no embedded five-channel image-pixel mapping could be established from this bundle alone. |
| `atlas_iconcolormasks` | `7304bf7b24aac0b34b2a62c9f94d4ec0b981a8eb3ec146931ecb0fe305cf801e` | The original image atlas contains icon color-mask artwork, but it does not furnish a verified channel correspondence for dyeable 3D outfits. |

These findings do **not** establish any automatic 3D-shader-to-UiIcon mapping.
Do not extrapolate channels 2–5 for all 5,383 IDs from these bundles.

## Available reference imagery

The official community-maintained HKIA Wiki indexes *individually rendered*
colorway PNGs, for example
[`Blue Archer Costume.png`](https://hellokittyislandadventure.wiki.gg/wiki/Category:Imagination_Celebration_Images),
and the `Shirt Images` category lists School Jacket and Sweater Vest variants.
The category listings confirm filenames, **not the bytes of those files**.
Direct image retrieval was blocked in the current runtime, so none are
imported yet. Source image identity and redistribution rights should be
checked for each imported file before publication.

## Register a verified capture

Only register a background-transparent, visually verified **true game image**.
An algorithmically recolored variant is *not* a valid exact capture.

```bash
node scripts/register-variant-art.mjs \
  --id 704486536 \
  --image /path/to/verified/Ice_Cream_Archer_Hat.png \
  --source 'https://hellokittyislandadventure.wiki.gg/wiki/File:Ice_Cream_Archer_Hat.png'
```

The importer validates that the Item ID occurs in the pinned 5,383-entry
native dye data, checks PNG alpha and dimensions, writes
`public/variant-art/<id>.png`, and records a SHA-256 digest, source page,
and provenance in `public/variant-art/index.json`.

CI verifies **every** recorded file, source ID, header, SHA-256, format, byte
budget and untracked/orphaned file. The browser only uses same-origin
validated paths; it verifies image decode and falls back if missing. Runtime
does not download from a wiki.

## Remaining work

- Retrieve exact image bytes (rather than names or rendered HTML) for colorway
  screenshots, and verify visual correspondence to original Item IDs.
- Import confirmed files into the repository or a validated image pack.
- For variants without exact captures, derive the 3D material/texture
  channel assignments and projection into 2D before describing an icon
  recoloring as accurate.
- Keep the fast approximation path as a fallback, not as proof of fidelity.
