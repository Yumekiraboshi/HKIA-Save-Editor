# Original dynamic UI icon source audit (v3.0.1)

The pinned audit records all 12,163 Steam inventory definition assets (serialized type index 3). The aligned Unity name/GUID layout has Item ID at GUID-field start +36, UiIcon PPtr at +80, UiIconUsesDynamicColor at +92, and UiDynamicColorMaskRef at +96. All UiIcon references resolve to local Sprite objects. Exactly 50 definitions enable the flag.

| Category | Definitions | Source mask evidence |
| --- | ---: | --- |
| Flowers | 25 | 161 original pattern-specific references, all resolved |
| Chef creations including Boba | 10 | 10 distinct masks in atlas_iconcolormasks |
| Chef instructions | 5 | Same GUIDs as corresponding creations; runtime appearance not proven |
| Wand creations | 9 | GUIDs known, unresolved in the two inspected atlases |
| Avatar custom palette | 1 | Exact Sprite in atlas_global |

The original AssetBundle container GUID mapping determines the source mask identity. The mask manifest and audit keep signed 64-bit PathIDs as decimal strings. A flagged definition is not proof of an individual item having a valid dynamic payload, nor is this an exhaustive catalog of all procedural rendering paths. Furniture has no flagged definitions in this scan; its separate customization/thumbnail path remains to be established.

Use original completed images whenever available. For missing completed appearances, reproduce the source material and runtime behavior locally, on demand; do not publish generated combinations or approximate compositions as original art. The flower tint inputs are documented in [inventory-flower-art.md](inventory-flower-art.md). No final dynamic composite is verified yet. This audit is development metadata, not a new save-editing allowlist, and is not shipped as part of the web UI.
