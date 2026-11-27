# Game-native dyeable item icon pipeline

## Current policy (Owner decision 2026-11-25)

Use a finished original sprite for the exact appearance whenever it exists. Every appearance without a completed original must instead be generated on demand in the browser from verified native assets and rendering rules. No production batch of reconstructed combinations. Source extraction, compression, and offline verification are permitted. The batch exporter and approximation sections below are historical implementation notes, not the target policy. The 5,383 dye Item IDs already have original images; no new clothing reconstruction is required for them.

## Historical target

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

## Sports, Vaporwave, Lolita and related original colorway groups

The original Steam v3.0.1 `collections_group_events` source-game
UiIcon index and dye palette verify a further **317 original Item IDs**
sharing one neutral source sprite within each of these 17 families:

| Sheet/cell | Game family | Original Item IDs |
| --- | --- | ---: |
| 001/048 | Sports Shorts | 20 |
| 004/039 | Vaporwave Wireframe Hat | 23 |
| 010/018 | Vaporwave Wireframe Pants | 23 |
| 007/048 | Vaporwave Sunset Backpack | 22 |
| 004/045 | Vaporwave Wireframe Glasses | 23 |
| 008/137 | Vaporwave Wireframe Shirt | 23 |
| 007/139 | Basketball Jersey | 18 |
| 006/058 | Feathered Wings | 18 |
| 008/059 | Parade Dress | 11 |
| 010/063 | Origami Armor | 11 |
| 005/010 | Lolita Mini Hat | 17 |
| 006/021 | Gothic Lolita Dress | 16 |
| 010/089 | Tube Top | 20 |
| 004/110 | Tropical Shirt | 20 |
| 003/019 | Spooky Lolita Dress | 17 |
| 010/069 | Lolita Lace Bows | 18 |
| 009/116 | Gothic Lolita Suit | 17 |

Each source family has at least one verified game-authored same-first
color / different-second color pair. Rather than showing identical
thumbnails with overlaid rings, the original game UiIcon's neutral
fabric/accent pixels directly receive the source-native channel 2
color (and the rest channel 1), retaining original alpha, shape,
texture, dark outline and pre-colored parts. Every source cell is
checked against the shipped game atlas index; changed or unrelated
art fails closed to the general source-icon fallback.

**Accuracy:** IDs, game palette values, original icon locations and
PNG origin are verified. The trim/cloth/feather/lens pixel region
location is a guarded, estimated **2D image segmentation**; the
Unity five-channel material shader masks have *not* been recovered
or proven equivalent. Higher channels with unknown pixel positions
are not fabricated. No Wiki art, invented items, CSS swatches,
replacement 3D renders or save editing changes.

## City Town and Clothing original-icon second-channel outfits

Two further *game-original* neutral UiIcon sprites are identified by the
Steam v3.0.1 packed source atlas and native dye palette:

| Source item-pack group | Native sheet/cell | Original item IDs | Same-primary, different-secondary pairs |
| --- | --- | ---: | ---: |
| `collection_group_citytown` | 002/065 | 22 | 3 |
| `collections_group_clothing` | 001/036 | 15 | 3 |

The original 96×96 chest-decoration pixels inherit the game's **second**
palette dye and the remaining neutral body uses its first dye; pre-colored
details, source texture, alpha and silhouette are retained. This changes
the actual per-item image pixels, without CSS rings, swatches, alternate
shapes or community-wiki images.

The parent source pack, item IDs, exact five-slot palette records, and
all six same-primary variant pairs are independently checked by the
source ZIP/index unit tests. The post-build image QA checks **the
generated PNG file hashes**, the applied channel-2 mask and source-sheet
SHA-256; a pair that still renders identically is a test failure.
The mask placement remains an **approximate 2D UiIcon segmentation**,
not an authenticated Unity shader or 3D material-channel assignment.

## Source-original Night Cap and striped pajama icons

The original Steam v3.0.1 `collections_group_clothing` game UiIcon index
contains three additional source-neutral, 22-colorway families:

| Game-original item family | Original sheet/cell | Native Item IDs | Same-primary / distinct-secondary pairs |
| --- | --- | ---: | ---: |
| Night Cap | 000/024 | 22 | 2 |
| Striped Pajama Pants | 000/044 | 22 | 2 |
| Striped Pajama Shirt | 000/077 | 22 | 2 |

Six pairs among these 66 game-authored IDs have identical original
primary dye values but different native secondary dyes. The source-image
region profile applies only that actual second dye color to neutral
hat fabric, garment panel or pant trim, preserving original image alpha,
shading, unchanged pixel details and original Item ID association.
No wiki images, fake dye colors or rings/swatches are introduced.

**Accuracy boundary:** The exact Item IDs, Babel names, five-channel
palette records, icon sheet/cell and generated pixel differences are
checked against original game source data. The placement of each
source-2D cloth/trim region is an estimate, not proof of the Unity 3D
material/shader channels. The post-build PNG verifier must detect each
of the six source-distinct variant pairs, or CI fails.

## Original Mermaid Tail colorways

Four further game-authored, source-neutral Mermaid Tail UiIcon families
each contain 21 valid Item IDs with two exact same-primary/
different-secondary colorway pairs:

| Game family | Source group | Sheet/cell | Game Item IDs |
| --- | --- | --- | ---: |
| Gilded Mermaid Tail | `collections_group_events` | 001/019 | 21 |
| Ornate Mermaid Tail | `collections_group_events` | 005/141 | 21 |
| Mermaid Fish Tail | `collections_group_events` | 006/136 | 21 |
| Striped Mermaid Tail | `collections_group_events` | 006/005 | 21 |

All **84 source IDs**, their original Babel names and native dye palettes
are checked directly against the bundled Steam v3.0.1 game index.
The generated icons recolor only neutral source-native tail cloth pixels
on the right side using the game's second dye channel. Native primary
fabric, texture, transparency, seams and already colored details remain
from the actual game sprite; no wiki images or decorative color rings.

This is an *approximate 2D UiIcon region*, not an authenticated Unity
shader-material assignment or a pixel-perfect in-game 3D render.
CI checks the generated 96px PNG hashes and channels for every original
same-primary/different-secondary pair and rejects silent duplicates.

## Paper Bow, Glasses, Leafy Mermaid and Shell Armor icons

The native Steam v3.0.1 UiIcon index verifies the following four
additional source-neutral families, all from the original
`collections_group_events` pack:

| Native item family | Game sheet/cell | Source Item IDs | Shared-primary/distinct-secondary pairs |
| --- | --- | ---: | ---: |
| Paper Bow Dress | 001/103 | 11 | 2 |
| Glasses | 003/107 | 11 | 2 |
| Leafy Mermaid Top | 000/006 | 8 | 2 |
| Mermaid Shell Armor | 008/091 | 8 | 2 |

The unchanged native 96×96 UiIcon pixels receive actual original dye
channel 2 on source-specific neutral fabric, eyeglass trim, or marine
armor panels. Alpha, dark outlines and already-colored details are
preserved. No CSS rings, color swatches or wiki images are involved.

The **38 original IDs and eight source-native pairs** are verified
against the packaged game sheet index, localized source name lookup
and full original native dye palette. The generated PNG verifier checks
every same-primary/different-secondary pair for genuinely different
image bytes and source channel 2. Placement remains a **guarded 2D
approximation**, not an authenticated Unity 3D shader mask.

## Precise remaining-collision diagnosis (no invented shader masks)

`scripts/audit-native-colorway-collisions.mjs` uses the **generated
96×96 PNG SHA-256** plus each matching original Steam v3.0.1 five-slot
dye palette. For each still-identical source sprite, it now records
`unresolvedBitmapGroups` with exact Item IDs, the earliest truly
different native dye channel (1–5), and *all* channels whose original
palette values differ. These values are emitted in the generated
`dist/native-colorways/qa.json` and summarized in the CI log.

This prevents confusing two independent problems:

- A real palette difference in channel 1 or 2 whose pixels still render
  identically means the existing 2D recoloring masks need inspection.
- A pair whose first difference is in channel 3, 4 or 5 needs verified
  higher-channel mapping from original Unity materials/combination maps.
  **The audit does not manufacture any shader-to-pixel assignment.**

Current original-asset audit identifies Material references, but not
their complete accessible dependencies or the game renderer's mask
semantics. The next exact-artwork milestone is recovering those
dependencies and verifying the channel mapping against a real
game-origin render. Do not call a newly estimated 2D region an exact
3D shader result merely because its two generated PNGs differ.

## Five original source-icon families with a single missing second-dye pair

Source-backed Steam v3.0.1 original UiIcon ZIP cells, native Item IDs,
Babel names and palette records identify five further original game
dyeable families:

| Original family | Original atlas group | Source sheet/cell | Native Item IDs |
|---|---|---|---:|
| Stylist Overalls | `collection_group_citytown` | 001/011 | 24 |
| Tailor Top | `collection_group_citytown` | 000/065 | 20 |
| Striped Jacket | `collection_group_citytown` | 001/061 | 18 |
| School Beret | `collections_group_events` | 000/122 | 19 |
| Starfish Necklace | `collections_group_events` | 001/127 | 22 |

Each family contains exactly one original-game same-first/different-second
native dye pair. The image generator applies the second original palette
value to an approximate, exact-source-cell-gated neutral cloth/trim region.
It changes 96×96 source pixel colors directly, preserving game pixel alpha
and pre-colored art; no wiki image, CSS ring or fake swatch is used.

CI checks all **103 original IDs**, native names, palette pairs and 96×96
generated PNG hashes. If the real original pixels cannot be colored or
an original pair remains indistinguishable, the build must fail rather
than claim image coverage. These 2D regions are **approximate**, not
authenticated Unity shader/material-channel masks.

## Pink and Purple Bee original game colorways

Original Steam v3.0.1 `collections_group_events` UiIcon sources map
**12 further 11-colorway families** to their unique 96px original
game sheet/cells: Pleated Sunhat (003/122), Parade Vest (003/054),
Parade Pants (003/075), Pleated Vest (004/105), Pinwheel (004/142),
Pleated Cap (004/081), Origami Helm (005/139), Paper Bow (005/003),
Wings (005/096), Pleated Dress (006/067), Origami Crane Hat
(007/117), Pleated Tophat (007/028).

For each of the 132 genuine original Item IDs, the source ZIP atlas,
game English name and five-slot original native dye palette are verified.
Each of the 12 families includes one pair with identical native first
dye `#3a3840`, but Pink Bee `#fd8de0` versus Purple Bee `#a66fbe`
as the second dye. A source-cell-restricted 2D neutral cloth/trim region
applies that original channel 2 color **directly within the sprite**,
preserving original source alpha, linework and existing colored details.
Strict post-build CI checks the real generated per-ID PNG hashes for all
12 pairs and rejects indistinguishable previews.

These pixels are an **approximate original-UiIcon 2D segmentation**, NOT
an exact Unity 3D shader/material mask or rendered 3D game model.

## Last ten original second-dye collision families (Steam v3.0.1)

Original source-native 96px `collections_group_events` sprites map the
remaining ten 2D secondary-channel mismatch families to their exact
UiIcon source sheet/cell:

| Source-game item family | Native sheet/cell | Original Item IDs |
| --- | --- | ---: |
| Starfish Mermaid Top | 004/139 | 15 |
| Cowrie Shell Necklace | 010/004 | 14 |
| Jester Costume | 002/084 | 11 |
| Vaporwave Neon Palm Hat | 001/061 | 10 |
| Shell Hair Piece | 001/119 | 8 |
| Koi Tail | 010/006 | 8 |
| Clamshell Backpack | 005/032 | 8 |
| Gudetama Zip Hoodie | 005/078 | 8 |
| Mermaid Vest | 006/103 | 8 |
| Bat Bow | 010/052 | 7 |

All **97 game-authored original Item IDs**, names, 5-slot palettes and
the ten same-first / different-second source dye pairs are checked in
the original game ZIP index and standalone Node tests. The generated
PNG verifier also requires real source-native dye channel 2 in each
colorway and visibly different actual 96px image bytes for each pair.

The source cell and palette are game-authored. The neutral fabric,
trim and accessory region segmentation remains a guarded **2D
approximation**, *not* a recovered Unity material shader mask or
game-rendered 3D model. The pipeline does not add fake rings, overlays,
third-party images, invented item IDs or unsupported channel-3 pixels.


## Current production source path: dynamic inventory sprites (Steam 3.0.1)

The game includes 11 `dynamicinventory_icons_01` through `11` bundles, containing 5,345 named 256×256 Sprite/Texture2D pairs. 5,344 correspond to dye Item IDs; 39 of the 5,383 dye IDs are outside these bundles and already exist in the named original sprite index. The existing 362 originals overlap 323 dynamic IDs. The 5,021 additional extracted images therefore complete the 5,383-ID original-art coverage. `scripts/extract-dynamic-colorways.py` checks pinned bundle hashes, definition ID, exact sprite name and local texture PPtr, decodes original BC3 data, and performs only the existing 84px resize and 6px transparent padding to produce lossless 96px WebP. No palette fitting, shader simulation, new pose or recoloring is involved. Source paths, CABs, 64-bit PPtrs, source texture and image hashes are recorded in `data/dynamic-colorway-packs/index*.json`; only derived image packs and metadata are committed. The build validates complete non-overlapping Item ID coverage and unpacks the 35 bounded packs into `public/dynamic-colorways/`. Collection, Inventory and timestamp dialogs use the shared original-image loader. A completed original is selected by Item ID before a registered reconstruction, without requiring the shared atlas cell or dye palette to load; mutable indexes are revalidated rather than force-cached. Legacy approximations remain only as fallback if source assets fail to load and as historical build diagnostics. Named source images are not proof of the game's exact runtime lookup or the screen's final sampling. Future missing artwork must be recovered from the original source mechanism, not estimated by fitting to reference images; comparisons are verification only.

To exercise the actual published Pages URL, use the existing Chromium smoke with `node scripts/browser-history-smoke.mjs --pages` after preparing the checkout's original-colorway assets and the usual Playwright/Chrome dependencies. The test uses a synthetic save and compares displayed Item IDs and source hashes against that checkout. It does not upload a save or replace the required deployment checks. Ordinary CI continues to test the local build artifact.

## Production routing boundary (2026-11-27)
All 5,383 colorway Item IDs have a finished game-original named image. The editor no longer loads the fitted or pixel-recolored fallback manifest, and never runs the heuristic recolorer on a failed original image. If both original and registered exact image fail, the unchanged source UiIcon is only a shared reference, not a verified colorway. The historical recoloring and calibration checks remain diagnostic; their output is outside `dist` and is not published. New missing dynamic item icons must use the actual native icon generation path and original inputs, not inferred masks or screenshot fitting. Furniture 3D previews are excluded.

## Non-dye completed dynamic-inventory sprite (2026-11-27)
Reopened all eleven Steam 3.0.1 dynamicinventory_icons bundles and enumerated their actual class 213 Sprite and class 28 Texture2D names. Counts per CAB were 491, 500, 498, 499, 500, 500, 500, 488, 481, 498, 390 (5,345 pairs). Exactly one original name is outside the 5,344 dye definition pairs: `icon_item_player_balloons_scholastic_marchband` in bundle 11. The source catalog's exact definition key is `item_player_balloons_scholastic_marchband`, Item ID 1393962785, Marching Band Balloons, collection_events_schoolasitccelebration. The existing catalog entry was not missing a generic collection atlas route; this is a newly recovered separate completed original. The exact source bundle hash, 256x256 Sprite rect, local Texture2D PPtr, BC3 stream range, source-object hashes, alpha and decoded PNG hash are recorded in `data/named-original-item-sprites-v3.0.1.json`. No recoloring or generated variants. Source pixels are BC3-decoded, vertically oriented, filtered and losslessly encoded as 256x256 RGBA PNG (50,307 bytes). The independent PNG inflate/unfilter test checks the entire RGBA digest. The common original-image renderer displays this original before the ordinary atlas reference. Do not count it as a 5,384th dye ID or claim live Unity framebuffer equivalence.

The Steam 3.0.1 l_inventoryview prefab (CAB-d43911c69a81902a397405feb43fb245, pinned source SHA256 061a47ae598d0bcc8c067463e19e18b360ba37d0124b94e08c484818e24d280d) was independently reopened and its SerializedFile type tree and objects decoded. Nine DynamicallyLoadedIconView objects (type 42) have distinct local dynamicIconImage and defaultImage PPtrs and fadeDuration 0.10000000149011612. All nine dynamic Image components have null Material, white vertex RGBA, preserveAspect=false, useSpriteMesh=false; the default side has the DynamicSpriteColor material on one pair and null on the remaining eight. Both Images in each pair reference the same serialized initial Sprite: six pairs (19,6085473716183996317), two (3,7985552200196459576), one (3,-3049564882340741616). This is original prefab evidence of separate completed-image and default-image layers, not evidence of which particular Item ID overrides are requested. `OutfitItemDetails.IconOverride` is an AssetReferenceSprite field in the original Switch dump; actual per-definition references and the achievement fallback behavior still require executable/definitions inspection. No claim that any of the 152 placeholder definitions has an alternative asset has been made.

## Native IconOverride reference verification (2026-11-27)
The original Switch 3.0.1 definitions bundle `7acd12a2895ab8172afdabcd72f5af5c.bundle` (SHA256 660aba36ab6da5964180fe0d474696fc22dd806b2f5b19ce601222cb5a631afa, CAB-191652df9468c684714b3b89a22974ec) was identified using the same definition GUID dependencies in Steam and Switch catalogs and independently decoded. All 12,163 InventoryItemDefinitionAsset records were traversed, including managed OutfitItemDetails and the three serialized AssetReferenceSprite strings. All 5,383 dye Item IDs plus Marching Band Balloons have distinct nonempty IconOverride GUIDs. The Steam Addressables catalog resolves 5,345 of them to the eleven dynamicinventory_icons bundles and 39 to definitions. Every one of the 5,345 actual bundle AssetBundle.m_Container GUID entries resolves to a local Sprite and Texture2D pair; the Sprite texture PPtr and exact original definition key match in all cases. The original 39 definition-bundle names and PPtrs remain verified named sprites, but the actual definition-bundle container GUID→Sprite binding has not yet been directly decoded. The 5,021 previously unpacked dynamic colorway images and the balloon now have independent GUID/actual Sprite/Texture2D matching. The remaining 323 named atlas sprites have actual dynamic-bundle overrides and should preferentially use those originals when the corresponding images are extracted. The source evidence is stored in `data/native-icon-override-source-v3.0.1.json`; build materialization checks the existing source records against the actual pointer chain. This is stronger native asset-reference evidence, not proof of live Unity framebuffer sampling.

All 152 previously identified shared placeholder references have the same source PathID on Switch. All have dynamicColor=false and empty mask references; all 19 OutfitItemDetails in the set have empty IconOverride AssetGUID. Two NpcOutfitItemDetails have a different type, and no OutfitItemDetails IconOverride. The separate ramen and palette dynamic-mask GUIDs are nonempty and verified. This does not establish runtime visibility or other fallback routes. RequirementOverrideIcon belongs to the dynamic mission definition, not the local achievement record; no achievement icon inference from that field is warranted.

## Native IconOverride source completion (2026-11-27)

Reopened all eleven Steam v3.0.1 dynamicinventory_icons bundles and the definitions bundle with the previously pinned hashes. The definitions AssetBundle.m_Container has 37,032 entries; all 39 direct definition routes have the exact GUID shared by the Sprite and Texture2D, with the Sprite's local texture PPtr matching. The sorted 39 source rows digest is bf5b8aefa8f6da5f97c912684c319bcbecc412f28af0f4f941f35f6597d2774c. Extracted the remaining 323 overlap images from the actual dynamic-inventory IconOverride GUID, Sprite and Texture2D pairs, independently checking all source row identities (digest 74004c2d7911bb047203966739af86b658fee8cd53f08d828e7de198be43c16e). Original BC3 pixels are vertically oriented, resized to 84px and placed in a 96px transparent canvas. All lossless WebP decodes match the RGBA canvas. Three bounded packs include the image bytes and a pinned index; build validation binds each record to the original source route. Dynamic images now take precedence over the older atlas-derived image when both exist. Coverage is 5,344 dynamic plus 39 direct dye IDs, with the separate non-dye Marching Band Balloons unchanged. Older atlas sources remain fallback only; they are not counted as additional items. Actual game framebuffer sampling remains unverified. No original game binaries or personal saves are committed.
