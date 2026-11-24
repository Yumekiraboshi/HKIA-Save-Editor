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


## Implemented offline prototype and verified audits

This repository now contains an offline, dependency-free Python auditor, an
Item-ID-to-prefab render-job generator, and a Unity Editor **diagnostic**
renderer. No external Wiki images or player save files are involved.

Run the auditor against original game bundle bytes held outside the repository:

```bash
python scripts/unityfs-audit.py /path/to/l_basicstyle_fullbody_imaginationarcher
python scripts/unityfs-audit.py /path/to/l_nisetamastyle_shirt_komiyashirt
```

The auditor parses UnityFS v8 LZ4 blocks and SerializedFile v22 TypeTrees,
then reports verified GameObject names and class counts. Source binaries
remain private/local, while the audited metadata is pinned in
`data/unityfs-audit/` with original SHA-256 hashes.

Verified result: Archer Costume's original bundle contains 105 objects,
including 49 GameObjects, one Mesh and one SkinnedMeshRenderer. Its exact
serialized GameObject is `BasicStyle_FullBody_ImaginationArcher`. It
contains **no embedded Material or Texture2D objects**; those references
must be resolved through additional original-game source bundles before a
shader-accurate render can be published. The separate Komiya Shirt bundle
contains one Material, three Texture2Ds and a large `.resS` stream; it is
a useful asset-layout comparison but **not a proven material dependency for
Archer**.

Generate a render job using only live repository game data:

```bash
node scripts/prepare-dye-render.mjs --item-id 1286846063 --out /tmp/archer-job.json
node scripts/prepare-dye-render.mjs --item-id 935642973
```

These jobs include the 5 exact native palette colors, original prefab name,
family, source bundle SHA, and render recipe. The initial manifest and
recipes are `data/dye-render-families.json` and
`data/dye-render-recipes.json`. They deliberately record
`blocked-unresolved-materials`; the following must **fail** rather than
pretend a correct image exists:

```bash
node scripts/prepare-dye-render.mjs --item-id 1286846063 --require-ready
```

The experimental Unity Editor implementation is
`tools/unity/Editor/HKIADyeVariantPilot.cs`. It accepts the job with
`--hkia-job`, original bundle path with `--hkia-bundle`, and an
unpublished staging PNG path with `--hkia-preview`. An explicit
`--hkia-allow-unverified-preview` permits a **diagnostic** attempt,
but the script refuses missing materials, shader properties or `_BaseMap`
textures. After the CAB resolver has identified original external UnityFS files,
pass each with a repeated `--hkia-dependency /path/to/dependency-bundle`
argument; the diagnostic renderer loads them before instantiating the prefab.
It does not register the output in the public image index.

**Not yet completed:** recover Archer's external materials, full dye shader
channel behavior, texture dependencies, correct pose and camera orientation,
and validate an actual rendered PNG. Source audits and job generation do
not satisfy those remaining rendering requirements. Neither the Python
audit nor the C# prototype is a 5,383-image renderer today.


## Verified external UnityFS dependency references

The Archer SerializedFile directly lists the following three external CABs
in this order:

- `CAB-2383a36f15413272ed26f383f73f6431`
- `CAB-6d01000bf1aa6b026bad1ed5b70c73c7`
- `CAB-46b8f8fe122147493b3113f7c1c8cd0f`

The separate Komiya Shirt references the first and third CAB. These exact
references were extracted from original serialized asset metadata—not
inferred from names. The actual source bundle filenames and texture/Shader
semantics are **not yet resolved**.

The dependency scanner locates them by reading only the compressed UnityFS
directory metadata, avoiding costly mesh/texture decompression:

```bash
python scripts/resolve-unityfs-cabs.py \
  --root /path/to/HKIA/StreamingAssets/aa/StandaloneWindows64
```

It prints matching original bundle relative paths and their SHA-256 values;
if any CAB remains unresolved, it exits with code 3. This is a build/debug
tool only and does not process save files or publish game binaries.

## Renderer-level external Material references (original v3.0.1)

The source `MeshRenderer` and `SkinnedMeshRenderer` records were read at
the actual `m_Materials` PPtr array in Unity SerializedFile v22. The
`fileID` is **local to each serialized file**; the 64-bit `pathID` is
saved as a decimal string to avoid JavaScript precision loss.

| Original Renderer | Local fileID | External Material CAB | Material pathID |
|---|---:|---|---|
| Archer MeshRenderer | 2 | `CAB-6d01000bf1aa6b026bad1ed5b70c73c7` | `-8051441427883450333` |
| Archer SkinnedMeshRenderer | 3 | `CAB-46b8f8fe122147493b3113f7c1c8cd0f` | `6824069125264728142` |
| Komiya Shirt SkinnedMeshRenderer | 2 | `CAB-46b8f8fe122147493b3113f7c1c8cd0f` | `6824069125264728142` |

Thus the Archer's main SkinnedMeshRenderer and the Komiya Shirt explicitly
reference the **same original Material object**. This is stronger
evidence than merely finding the same external CAB among bundle dependencies.
The actual serialized Material object, shader, texture bindings and
shader mask semantics still need to be resolved from the source CAB.

The Archer's third dependency
`CAB-2383a36f15413272ed26f383f73f6431` was found in the
original game file named `2383a36f15413272ed26f383f73f6431`:
SHA-256 `2be9445adfb193570f910a22afec50c332a1b02435388b459869377764893de4`,
80,111 bytes. Its serialized contents are **1,546 MonoScripts and one
AssetBundle**, not a clothing Material. This source resolution is recorded
in `data/unityfs-audit/archer-cab-resolution.v3.0.1.json`.

To search *only* the two confirmed Material CABs, rather than all three
external dependencies:

```bash
python scripts/resolve-unityfs-cabs.py \
  --root /path/to/HKIA/StreamingAssets/aa/StandaloneWindows64 \
  --materials-only
```

The auditor's `rendererMaterialReferences` output and
`scripts/prepare-dye-render.mjs` now carry each exact Material CAB,
fileID and string-valued 64-bit pathID into the original-game render job.
Neither the source bundle locations for the two Material CABs nor their
rendering correctness are asserted until the original UnityFS bundles
are found and inspected.


## Unity v22 serialized Material/Shader verification

The offline UnityFS auditor now also decodes the first `m_Name` field on
`Material` and `Texture2D` objects and the `Material.m_Shader` PPtr,
including the correct source-file-relative fileID and 64-bit pathID. It
fixes an object-table cursor error previously masked by synthetic-only
tests: the `objectCount` field must be consumed before the first
serialized object entry. A synthetic v22 Material-object test now protects
this invariant.

Confirmed directly from the original Steam v3.0.1
`l_nisetamastyle_shirt_komiyashirt` bundle:

- Local Material `NisetamaStyle_Shirt_KomiyaShirt`
  (pathID `-8957885102818627004`).
- Material Shader PPtr: external fileID `2`,
  pathID `477622052401609204`, pointing to
  `CAB-46b8f8fe122147493b3113f7c1c8cd0f`.
- Three embedded Texture2D objects:
  `NisetamaStyle_Shirt_KomiyaShirt_N`,
  `NisetamaStyle_Shirt_KomiyaShirt_X`, and
  `NisetamaStyle_Shirt_KomiyaShirt_C`.

The **same external CAB** also hosts the Material object referenced by the
Archer Costume SkinnedMeshRenderer, but the Material pathID and Shader pathID
are different. This is an original-data reference, not evidence that the
Archer and Komiya models use an identical final shader/material.

Once a folder of original game bundles is available, perform a *two-stage*
source verification:

```bash
python scripts/resolve-unityfs-cabs.py \
  --root /path/to/game/StreamingAssets/aa/StandaloneWindows64 \
  --materials-only --verify-materials
```

Unlike simple CAB filename matching, `--verify-materials` decompresses
**only the matching bundles** and requires each Material object to exist
under the **exact 64-bit pathID referenced by Archer**. It reports the
real Material name and its Shader PPtr. If a CAB exists without the target
Material pathID, the command remains blocked with exit code 3.

The source-accurate Unity renderer is still blocked until the remaining
Material-hosting CAB files are identified, materials and shaders loaded,
palette-to-surface behavior validated and a real transparent PNG produced.
No external Wiki images or simulated 3D outputs have been registered.

## Verified native character Shader and definitions dependency (2026-11-24)

Reacquired the original Steam 3.0.1 definitions and atlas bundles and matched both existing SHA-256 fingerprints. The definitions CAB is the previously unresolved Archer skin Material dependency. Its exact Material pathID 6824069125264728142 is ordinary Lit with no bound BaseMap, NOT a dye material. The other Archer renderer CAB remains unresolved. The definitions bundle also contains the exact CustomLitCharacter Shader (pathID 477622052401609204), its four map properties and five palette colors. Fifty local Materials reference this Shader, including 24 with PatternMap, and all 174 non-null map PPtrs resolve to local Texture2D objects. Its three compressed program segments contain 12 vertex and 32 pixel DXBC containers. No shader execution, channel semantics or native icon pose/render is verified yet.

Reproduce the source metadata locally: `python3 scripts/audit-native-character-shader.py /path/to/definitions`. The tool emits metadata and hashes only, never shader program bytes. The pinned SHA prevents applying this layout to unverified versions. See `data/unityfs-audit/definitions-character-shader.v3.0.1.json` for observed source evidence. Existing original icon images remain unchanged.

## Original native albedo operation (2026-11-24)

Thirty of the 32 verified pixel programs contain the same initial dye calculation, in two register-allocation variants (15 each). The original name table and texture bindings identify BaseMap t0, BumpMap t1, ComboMap t2, PatternMap t3; the palette colors occupy five consecutive material constant registers. With samples already in shader space, the exact initial color operation is:

```
q = lerp(PaletteColor1, PaletteColor2, PatternMap.r)
q = lerp(q, PaletteColor3, PatternMap.g)
q = lerp(q, PaletteColor4, PatternMap.b)
q = lerp(PaletteColor5, q, PatternMap.a)
albedo = lerp(BaseMap.rgb, BaseMap.rgb * q, BaseMap.a)
```

Importantly, BaseMap alpha is the dye strength, NOT ComboMap alpha. ComboMap is sampled but is used by other operations. The restricted token evaluator and mathematical port agreed exactly for 3,000 randomized normalized samples across all 30 original programs, and for 512 samples from decoded real Plaid Dress textures. This validates the isolated arithmetic in host precision, not GPU floating-point rounding, sRGB sampling, the lighting pass, pose, or final icon appearance. The fifth palette slot of the source red plaid variant is absent and must retain the verified Material default, not an invented color.

Reproduce: `python3 scripts/verify-native-dye-albedo.py /path/to/definitions`. With Pillow installed, add `--plaid-preview /tmp/plaid-diagnostic.png` for a 512x512 **UV-space** material preview. This raw-normalized texture diagnostic is not a final icon. It must not be put into the public icon index. Source fingerprints and observed test results are in `data/unityfs-audit/native-dye-albedo.v3.0.1.json`. No game binaries, shader programs or full textures are committed.

## Rigid mesh icon projection prototype

The original definitions CAB contains the WitchHat mesh and its actual renderer, Material, BaseMap and PatternMap. Source definition ID 528610065 links to the WitchHat outfit and its shared definition; the renderer and MeshFilter refer to the exact local objects. The original 1,320-vertex, 1,988-triangle mesh uses 36-byte streamed vertex records with float32 positions and float16 UVs. The native dye arithmetic now produces a UV-sampled orthographic raster from the actual triangles. A prototype grid of 360 camera/roll/mirror candidates was compared with the source original icon using normalized alpha and three coarse color-region classes. The best composite candidate measured 83.81% silhouette IoU, not full image equality. Mirroring and camera parameters are diagnostic search parameters, not recovered game settings. Texture color-space conversion, normals/lighting, filtering, icon render setup and pixel-level equality remain unverified. No public icon replacements.

Reproduce locally with Python, NumPy and Pillow: `python3 scripts/render-native-rigid-icon.py /path/to/definitions --out /tmp/hkia-witchhat`. The script produces only local reference/diagnostic PNGs and a comparison report. Source identifiers and prototype results are in `data/unityfs-audit/witchhat-rigid-icon-diagnostic.v3.0.1.json`.

### Lighting diagnostic refinement

The source WitchHat tangent frames and normal map are now used for a fitted diffuse/rim/specular approximation. A 27-candidate local camera refinement improved silhouette IoU from 0.8381 to 0.8871. On 459 held-out, color-region-matched pixels of the same source icon, normalized RGB MAE fell from 0.120185 to 0.086262 (28.2%). This is an intra-icon diagnostic, not cross-variant or cross-family validation. The source normal map is hash-pinned; the normal unpack hypothesis and illumination coefficients have not been recovered from the actual lighting shader. ComboMap has been identified but is not applied. Do not publish this render as a native icon. Reproduce with the rigid-icon tool's optional `--fit-lighting` argument (requires SciPy as well as NumPy and Pillow).
