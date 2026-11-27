# Original dynamic UI icon source audit (v3.0.1)

The pinned audit records all 12,163 Steam inventory definition assets (serialized type index 3). The aligned Unity name/GUID layout has Item ID at GUID-field start +36, UiIcon PPtr at +80, UiIconUsesDynamicColor at +92, and UiDynamicColorMaskRef at +96. All UiIcon references resolve to local Sprite objects. Exactly 50 definitions enable the flag.

| Category | Definitions | Source mask evidence |
| --- | ---: | --- |
| Flowers | 25 | 161 original pattern-specific references, all resolved |
| Chef creations including Boba | 10 | 10 distinct masks in atlas_iconcolormasks |
| Chef instructions | 5 | Same GUIDs as corresponding creations; runtime appearance not proven |
| Wand creations | 9 | GUIDs known, unresolved in the two inspected atlases |
| Avatar custom palette | 1 | Exact Sprite in atlas_global |

The original AssetBundle container GUID mapping determines the source mask identity. The mask manifest and audit keep signed 64-bit PathIDs as decimal strings. A flagged definition is not proof of an individual item having a valid dynamic payload, nor is this an exhaustive catalog of all procedural rendering paths. Furniture has no flagged definitions in this scan. All 649 customizable definitions have ordinary original UiIcon Sprite references; use those icons and the separate Customized decorator rather than generating furniture 3D previews. See [inventory-furniture-source.md](inventory-furniture-source.md).

Use original completed images whenever available. For missing completed appearances, reproduce the source material and runtime behavior locally, on demand; do not publish generated combinations or approximate compositions as original art. The flower tint inputs are documented in [inventory-flower-art.md](inventory-flower-art.md). No final dynamic composite is verified yet. This audit supplies read-only presentation metadata, not a new save-editing allowlist. The UI uses its definition-to-family routing; original game binaries are not shipped.

The five flagged recipe instructions retain their original UiIcon in ordinary inventory rows without a dynamic-color source; see [dynamic-chef-art.md](dynamic-chef-art.md). All 15 original InventoryViewDecoratorType definitions (1–15) are separately cataloged in [inventory-decorator-art.md](inventory-decorator-art.md). Furniture customized decoration is an independent Sprite, not a dynamic 3D icon.

The main-image routing of flower, chef/Boba and wand definitions now shares the pinned 50-row source audit through `native-icon-route.ts`. The renderer's per-family verified manifest still determines whether a particular image can be rendered. Recipe instructions remain static, and palette is bound to its existing exact source item. The test cross-checks every route against the original per-family manifests, rather than separately maintaining Item ID lists. Seed/plant and source-base previews in the flower edit dialog no longer depend on the optional tint definitions.
