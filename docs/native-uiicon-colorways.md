# Game-native dyeable item icon pipeline

## Correct target

HKIA Save Editor uses the **original game's item UiIcon**, with the original
96×96 pixel shape, camera angle, pixels, and transparency. It does **not**
replace icons with new 3D outfit poses, a ring, or a palette swatch.

Original Steam v3.0.1 content contains 5,383 dyeable item IDs but only 369
distinct shared original UiIcon sprites. As a result, the challenge is
mapping *dye channels to regions of each original icon*, not creating 5,383
different 3D meshes.

The 5 native palette colors per ID are source-backed; the detailed pixel-to-
palette channel assignments are **not yet fully verified**. Generic icons
use channel 1 on neutral garment pixels. Archer Costume has a source-image
candidate for 3 colored regions; School Jacket/Sweater Vest for 2 regions.
These are approximate, not pixel-perfect replicas of the game 3D shader.

## New batch exporter

The new exporter runs the **same JavaScript native recoloring and region-mask
algorithm as the editor**, but inside an offline headless Chromium worker.
This avoids duplicating the pixel algorithm in Python and ensures
offline PNG output matches what the user sees in the web editor.

```bash
npm ci
npm install --no-save --package-lock=false --ignore-scripts playwright-core@1.56.1

# Original game event icons, 8 representative colorway IDs
node scripts/generate-native-dye-icons.mjs --out dist/native-colorways
node scripts/verify-native-dye-icons.mjs dist/native-colorways

# Optional: other source-backed Item IDs in a supplied native ZIP group
node scripts/generate-native-dye-icons.mjs \
  --group collections_group_events \
  --ids 1286846063,935642973 \
  --out staging/native-colorways

# Optional: all game-native dye item IDs in one shipped ZIP pack
node scripts/generate-native-dye-icons.mjs \
  --group collections_group_events --all \
  --out staging/native-colorways

# Production: every shipped original game icon pack group
node scripts/generate-native-dye-icons.mjs \
  --all-groups --out dist/native-colorways
```

The game-derived inputs are only `public/item-packs/<group>.zip` (and its
split parts), `public/native-dye-palettes.json`, and `public/catalog.json`.
No outside imagery is fetched. Every output must keep the source icon's
alpha values identical at all 9,216 pixels. The static image is PNG RGBA,
96×96, with SHA-256 and source sheet SHA-256 in `index.json`.

The output manifest **explicitly** marks each file as
`fidelity: "approximate"`; the source is
`original-uiicon-pixel-recolor`. The manifest never pretends that a 2D
candidate mask has been validated against the original 3D material shader.

## Display and fallback

If a batch-generated 96px original-icon colorway is available, the editor
displays it in the Collection list, subcategory preview and timestamp dialog.
If missing/corrupt, the existing in-browser native-color Canvas recoloring
takes over. If recoloring cannot safely identify a neutral garment, the
unchanged game source UiIcon is shown.

The previous 3D UnityFS audits and experimental diagnostic renderer are
research tools only, for understanding palette channel assignments; they
are **not the displayed item-icon pipeline**. Do not ship new game 3D
thumbnails in place of the original UiIcon.

## Remaining correctness work

- Establish the actual channel-to-icon-mask mapping for each shared icon
  sprite; until then these PNGs remain explicit previews.
- Expand verified icon-region masks (one per original icon family, not one
  hand-drawn bitmap per color variant).
- Batch export source-verified item IDs without changing their original
  silhouette or metadata.
- Keep all 3D audit output outside the final item icon display.

The all-group export conservatively **skips Item IDs present in multiple icon groups** because selecting the first group could serve the wrong category icon. It also skips shared icons with no safe detectable dye regions, leaving the browser's original UiIcon fallback in place. Its manifest records `sourceGroups`, `uniqueCandidates`, `ambiguous`, `unmatched`, `uncolorable` and `generated` counts. CI checks each output's 96×96 PNG dimensions, native source pack group, exact original sheet/cell and SHA-256; it never silently marks color placement as game-shader-accurate.
