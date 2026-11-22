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


## Verified all-group coverage and collision prioritization

CI generated and validated **5,383 of 5,383** original-game dyeable
Item ID icons from **25 original icon ZIP groups**. No ID was unmapped,
ambiguous between groups or ineligible for the neutral-fabric recolorer.
The 25 groups are the logical packs; the events pack is physically
split into six ZIP files.

This is **coverage of approximate pixel recoloring**, not verification of
five-channel material accuracy. A colorway's individual PNG can still be
visually identical to a different full-palette colorway when the source
96px art has only one verified recolorable region.

The audit tool specifically detects this case rather than hiding it with
additional guessed dye regions:

```bash
node scripts/audit-native-colorway-collisions.mjs dist/native-colorways
```

It generates `dist/native-colorways/qa.json` with the number of shared
original UiIcon families, total colorways, images that are identical
despite different full five-channel palettes, and the 60 highest-priority
shared source icons for obtaining genuine channel masks. It never adds
visual overlays or changes any item/save data.

Each static PNG is checked against the exact original item's
`<group>/<sheet>/<cell>` source index, original WebP sheet SHA-256 and
generated PNG SHA-256. Ambiguous or uncolorable originals automatically
fall back to their native source icon in the browser.


## Crew Medic Outfit source palette distinction

The first high-priority collision family is the **17 Crew Medic Outfit**
Item IDs in the original `collections_group_events` source icon sheet
`000`, cell `071`. All 17 original game palettes have the same channel 1
(`#ebe4e7`), while channel 2 varies across every colorway (Blue, Maroon,
Blush, Peacock, Navy, etc.). First-channel-only preview coloring therefore
could never distinguish these original game IDs.

The source-icon profile now applies each Item ID's **actual native channel 2**
to its monochrome tunic pixels, preserving the original icon's alpha, outline,
shape and shading. Selection requires the exact source sheet/cell and
the measured original garment silhouette. If the native art changes, the
profile refuses to recolor via this inference and falls back to the
generic original-icon path.

**Fidelity boundary:** the choice to color the 2D monochrome fabric with
native channel 2 is supported by native palette variation, but its precise
3D shader mask/garment-region assignment is not yet independently confirmed.
This remains an explicitly approximate icon preview. No game IDs, colors,
ownership or item data are fabricated.

## Source-native banded hat colorways

Steam v3.0.1 collection_group_teagarden sheet 000 cell 018 is shared by
48 High Tea Banded Tophat colors. The original collections_group_clothing
sheet 000 cell 053 is shared by 45 Banded Mini Tophat colors.
Within each original family, the native White and Yellow / White and Sky
pairs have identical first dye color (#fdf7e6), but different second
channel colors (#fede49 and #bbf2ef). Previously their 2D image pixels
could remain identical even though the game defines different variants.

For these **two exact native atlas cells only**, the gray crown uses
native channel 1 and the visible horizontal band region uses channel 2.
The source artwork's 96x96 shape, alpha and shadows are preserved.
Unrecognized original art or incompatible pixel geometry declines the
two-channel region mask. No Wiki images, arbitrary CSS swatches or
replacement 3D perspectives are used.

**Fidelity limit:** Positioning of the band in this 2D UiIcon is a
source-image-derived approximation, not independently verified as the
Unity game's material-to-pixel shader mask. The source cells, Item IDs,
native palette colors and shared-icon identity are game-original facts.

## High Tea Tophat original-game dye variants

Original Steam v3.0.1 `collection_group_teagarden` UiIcon sheet
`000`, cell `098` is shared by 47 native **High Tea Tophat**
Item IDs. In this family the White and Yellow / White and Sky
versions have the same first dye (`#fdf7e6`) but different
second dyes (`#fede49` / `#bbf2ef`). A first-channel-only recolorer
necessarily shows those different variants as identical.

For this one precisely identified original UiIcon, a conservative
pixel mask uses the native second palette color on the visible
lower crown band and channel 1 on other neutral cloth. The original
96px icon position, transparency, outline and shading remain.
Replaced source art fails closed to the generic source-icon fallback.

**Limit:** the band geometry is estimated from the original 2D source
icon; the Unity material shader's 1..5 channel-to-pixel mapping is not
yet independently verified. These previews must not be described as
pixel-perfect reconstructions of the game's 3D dye shader.

## Camp Counselor Skort (22 original colorways)

Original Steam v3.0.1 `collections_group_events` sheet `001`, cell
`021` is shared by 22 verified **Camp Counselor Skort** Item IDs.
The actual game-defined dye palettes include pairs whose primary channel
is identical but secondary colors differ: White / White and Black
(`#ebe4e7` / `#3a3840`), Green / Green and Brown
(`#3c7041` / `#5a3528`), Khaki / Khaki and Brown
(`#f3be89` / `#764231`), and Light Gray / Light and Dark Gray
(`#b5b1b8` / `#534e57`). A single-channel icon would collapse these
distinct game item colorways to identical images.

For the exact original source icon, a guarded approximate **2D** region
mask applies native channel 2 to the right-hand pleated fabric and native
channel 1 to the remaining neutral cloth. The game-original 96px atlas
cell, colors, transparency and shading remain the source of all output.
Replacement art or mismatched source cells refuse the special mask,
leaving the original safe fallback. No Wiki art, additional badges or
invented dye values are used.

**Fidelity limitation:** Right-side placement is inferred from the
original icon's visible fabric, *not* independently recovered from
Unity's 3D five-channel shader material masks. Output must be treated as
an approximate 2D preview, not pixel-perfect game rendering.

## High Tea Flower Clip: native second-channel blossoms

The original Steam v3.0.1 `collection_group_teagarden` UiIcon
sheet `000`, cell `101` is shared by **45** exactly mapped native
High Tea Flower Clip Item IDs. Its game-authored palette includes
White and Yellow (290453986), White and Sky (808145972),
White and Green (911692875) and White and Periwinkle (1473720360).
All four use native channel 1 `#fdf7e6` but have different native
channel 2 colors (`#fede49`, `#bbf2ef`, `#78d244`, `#afb4fd`).

A source-cell-gated, conservative 2D image region applies the verified
second dye to the visible right-hand flower petals and channel 1 to
other neutral petals. The original game UiIcon's 96×96 silhouette,
transparency, shading and non-neutral decoration remain unchanged.
There are no overlaid rings, color swatches, external Wiki assets or
invented Item IDs. Any mismatched source cell or non-neutral source
art refuses the specialized mask.

**Fidelity limit:** This is an image-derived 2D segmentation,
not a verified Unity shader/material texture mask. The colors, item
identities and original UiIcon source are verified, but the precise
game-rendered 3D material assignment remains unconfirmed.

## High Tea Frilled Bonnet: original source-ribbon distinction

Steam v3.0.1 `collection_group_teagarden` UiIcon sheet `000`,
cell `004` maps to **41 original High Tea Frilled Bonnet Item IDs**.
Four verified game-native palettes have the same first channel
(`#fdf7e6`): White and Yellow (1265055643) uses second color
`#fede49`, White and Sky (1046324850) uses `#bbf2ef`,
White and Green (1893329026) uses `#78d244`, and White and
Periwinkle (535112962) uses `#afb4fd`.

For the precise source cell only, a guarded 96px 2D region estimate
applies channel 2 to the visibly narrow central/diagonal bonnet ribbon
and channel 1 to the other neutral cloth, while preserving the original
game icon's transparent silhouette, darker outline and detailing.
This does not import Wiki graphics, fake swatches or alternate models.
Unrecognized/non-neutral art fails closed to the generic original-icon
path.

**Fidelity limit:** The original Item IDs, source UiIcon and dye
palette are verified. This **2D ribbon segmentation is approximate**,
not a recovered or independently verified five-channel Unity shader
material mask.

## Triangle Shades source-lens distinction (34 colors)

The original game Steam v3.0.1 `collections_group_clothing` UiIcon
sheet `000` cell `038` is shared by 34 exact Triangle Shades
Item IDs. Seven verified pairs have identical native first dye but
different second dye: White / White and Black, Warm Pink / Warm Pink
and Black, Blue / Blue and Black, Red / Red and Black, Orange / Orange
and Black, Cream / Cream and Black, and Black / Full Black.

The source cell shows two downward-pointing neutral triangular lenses.
A strict source-cell-gated **2D approximation** colors those lens
interiors with game-native palette channel 2, while neutral frames
remain channel 1; the actual 96px transparent silhouette, texture,
shading, outlines and colored decoration remain sourced from the
original icon. Altered/non-neutral art fails closed and reuses the
generic source-icon fallback. No Wiki art, CSS swatches, fabricated
colorways or replacement 3D viewpoints are involved.

**Fidelity boundary:** The source Item IDs, dye color values and
UiIcon location are original verified game data. The placement of
the lens regions is an image-derived approximation, not a verified
Unity five-channel 3D shader/material mask. Pixel-perfect parity
with the game's 3D model is not claimed.

## High Tea Elegant Hat (44 native colorways)

Steam v3.0.1 `collection_group_teagarden` sheet `000`, cell `031`
is the source-original neutral UiIcon for **44** verified High Tea
Elegant Hat Item IDs. Three distinct variants have the same native
palette channel 1 (`#fdf7e6`) but different native channel 2:
White and Green (77149467, `#78d244`), White and Sky (370872413,
`#bbf2ef`), and White and Periwinkle (2022277447, `#afb4fd`).
They were indistinguishable in first-channel-only icon recoloring.

The original 96px icon is retained. For this **exact source cell only**,
a guarded approximate 2D pixel-region profile colors the neutral
central hat ribbon with the original game dye channel 2, and other
neutral hat fabric with channel 1. The original transparent silhouette,
shading, outlines and colored decorations remain unchanged. Unrecognized
or non-neutral source art falls back to the original general source icon
rendering; no CSS color rings, swatches, Wikipedia/Wiki images, novel
items, or 3D renders are introduced.

**Accuracy limit:** original Item IDs, palette values and image source
are verified game data. The 2D ribbon placement is image-derived
approximation, **not** a recovered five-channel Unity material mask.
Pixel-perfect correspondence with the actual 3D renderer is unverified.

## Native High Tea Empire Waist Dress and Marching Band batch

Original HKIA Steam v3.0.1 packs have ten independently source-mapped
two-tone UiIcon families, whose item palette channel 2 was not yet
shown in the generated 2D colorway artwork.

| Original pack group | Sheet/cell | Native family | Game Item IDs |
| --- | --- | --- | ---: |
| collection_group_teagarden | 000/074 | High Tea Empire Waist Dress | 38 |
| collections_group_events | 000/038 | Marching Band Two Toned Feather Cap | 13 |
| collections_group_events | 001/029 | Marching Band Peaked Feather Cap | 13 |
| collections_group_events | 001/092 | Marching Band Buttoned Pants | 13 |
| collections_group_events | 002/118 | Marching Band Shako Feather Cap | 13 |
| collections_group_events | 002/064 | Marching Band Badged Shirt | 13 |
| collections_group_events | 003/047 | Marching Band Sashed Shirt | 13 |
| collections_group_events | 004/111 | Marching Band Tall Cap | 13 |
| collections_group_events | 005/120 | Marching Band Two Toned Pants | 13 |
| collections_group_events | 005/034 | Marching Band Buttoned Skirt | 13 |

Each of the nine original Marching Band families uses the same first
source-native dye value `#3a3840` on all 13 variants, but its second
native dye value differs for each one. The original image must therefore
recolor the contrasting trim/feather/panel pixels to differentiate the
game's actual IDs. The Empire Waist Dress likewise has multiple
same-first-color / different-second-color game-native pairs.

The 96×96 original game UiIcon sprite and all native palette values
are retained, including alpha, shape and original dark/colored details.
A source-cell-gated, fail-closed **approximate 2D** profile recolors
neutral pixels in the selected trim, plume, sash or cloth panel with
native channel 2. No Wiki art, fake item IDs, added color swatches,
rings, alternate models or remotely hosted save processing are used.
If the expected neutral source art cannot be recognized, the source
sprite retains its existing generic fallback.

**Rendering fidelity:** source Item IDs, cell positions and palette
colors are verified; the pixel-region placement is estimated from
the original 2D icon, **not** derived from the actual game Unity
five-channel 3D material/shader masks. Do not claim pixel-perfect
reproduction of the 3D in-game dye system.

## Additional 12 source-original Marching Band colorway families

Game-authoritative Steam v3.0.1 `collections_group_events` native
UiIcon source index maps **12 more original 13-colorway families**,
156 additional Item IDs, to the following exact 96px atlas cells:

| Sheet/cell | Original game family | Source Item IDs |
| --- | --- | ---: |
| 005/040 | Marching Band Ornate Shirt | 13 |
| 005/091 | Marching Band Drum | 13 |
| 005/093 | Marching Band Two Toned Shirt | 13 |
| 006/072 | Marching Band Two Toned Skirt | 13 |
| 007/001 | Marching Band Lined Pants | 13 |
| 007/011 | Marching Band Cape | 13 |
| 007/130 | Marching Band Peaked Cap | 13 |
| 007/034 | Marching Band Two Toned Cap | 13 |
| 007/056 | Marching Band Track Pants | 13 |
| 008/056 | Marching Band Shako Cap | 13 |
| 009/033 | Marching Band Lined Skirt | 13 |
| 009/122 | Marching Band Tall Feather Cap | 13 |

All 12 families use original palette channel 1 `#3a3840` on
every member, but 13 distinct real game channel-2 colors. In each
exact source cell, the original gray fabric, trim, band, plume, side
panel or instrument accent is recolored using native channel 2,
preserving original source alpha and shading. The native PNG identity
and dye color data are verified from game archives. The masks are
guarded, asset-cell-specific **approximate 2D segmentations**, not
independently verified five-channel Unity 3D material masks. No
Wiki art, artificial colors, CSS rings or new 3D renderings are used.

Together with the previous nine-family Marching Band batch, the
21 original Marching Band families comprise 273 native colorways.

## Further game-original two-tone icon families (13 additional sources)

The Steam v3.0.1 game-authored UiIcon pack indices and dye palette map
383 more Item IDs across 13 exact, shared original source cells:

| Original game pack | Sheet/cell | Native colorway family | Items |
| --- | --- | --- | ---: |
| collection_group_teagarden | 000/028 | High Tea Waistcoat | 42 |
| collection_group_teagarden | 000/025 | High Tea Flower Bonnet | 40 |
| collection_group_teagarden | 000/063 | High Tea Open Tailcoat | 40 |
| collection_group_teagarden | 000/095 | High Tea Patterned Tailcoat | 40 |
| collection_group_teagarden | 000/107 | High Tea Elegant Dress | 38 |
| collection_group_teagarden | 000/106 | High Tea Dress | 38 |
| collection_group_teagarden | 000/052 | High Tea Long Sleeved Dress | 36 |
| collection_group_teagarden | 000/105 | High Tea Great Coat | 34 |
| collections_group_clothing | 000/039 | Browline Glasses | 12 |
| collections_group_events | 002/081 | Soccer Jersey | 18 |
| collections_group_events | 004/109 | Floral Grass Skirt | 12 |
| collections_group_events | 005/074 | Floral Beachcomber Hat | 11 |
| collections_group_events | 007/121 | Vaporwave Eclectic Outfit | 22 |

All new families contain original Item IDs with the same native
first dye but different second dye. A source-cell-specific 2D
approximation now recolors neutral ribbon, lens, trim, decorative
fabric or secondary cloth panels with the **actual native palette
channel 2**; other neutral pixels use channel 1. Alpha, original
silhouette, shading, outlines and pre-colored details are preserved.

An item pair may still be indistinguishable if both original dye
channels 1 and 2 are identical but higher native channels differ;
no unverified third/fourth/fifth channel assignment is invented.

**Fidelity boundary:** These IDs, icons and dye colors are genuine
source-game records; the pixel region is inferred from the native
96px 2D sprite, **not** a recovered Unity material/shader mask.
All preview PNGs remain appropriately labelled approximate rather
than pixel-perfect game 3D renders. No Wiki images or color rings.
