# Inventory editor — product specification

## Confirmed scope

- The inventory editor is a comprehensive local save editor, separate from collection registration. The inventory has no fixed UI slot or page capacity.
- Use the original game inventory category order and mappings. For category navigation, prefer distinct full-color, game-derived representative artwork (existing collection category art or an actual representative item's native UiIcon), rather than uniform monochrome inventory tab icons or identical circular backgrounds. If no verified representative is available, retain a readable text label. Keep unknown records visible without inventing a category or dropping them.
- Display a dense, responsive, image-first grid with item name and owned quantity. Use compact controls, native item artwork, search and automatic incremental scrolling; no repeated technical labels or unused slot placeholders.
- Allow users to edit ordinary inventory quantities and the native unique data of flowers, customizable furniture and customizable clothing. Unique-data editing is a confirmed product requirement, even while individual operations are not yet supported.
- For flowers, display the original color swatch and pattern/effect sprite above the item image, with localized color and pattern names sourced from the game. Render the actual variant when its native dynamic-color composition is verified; do not represent an unmodified species sprite or approximation as an exact variant.
- Preserve distinct native records with different unique data; do not merge them merely because they have the same Item ID. Show the appropriate variant appearance when verified source data permits. Expose individual customization controls on demand rather than enlarging every inventory tile.

## Safety and implementation constraints

- Rust is the sole authority for native schema interpretation, valid options, version/structure gates, CAS, atomic mutation, history, undo/redo, reconstruction and independent reparse. Svelte/TS only render and relay typed intents.
- Use source-verified game definitions for each supported unique-data discriminator, field, type and valid option. Do not infer flower genetics, color/pattern encodings, customization choices or IDs from display names or approximate images.
- Keep Document ID, Item ID, Unique ID, quantity, unrelated data and unknown payload fields unchanged unless an explicitly supported operation requires changing one of them. Do not invent identities or native payloads.
- Distinguish the inventory item's individual customization from collection history, placed furniture, equipped clothing, and entitlement or reward state. Do not silently mutate those other systems.
- Each unique-data edit must participate in the existing inventory history, recovery draft, Undo/Redo and export/reparse path; unsupported variants/fields remain read-only until verified.

## Current implementation boundary (not a reduction of scope)

The v3.0.1 native inventory index recognizes Document ID, Item ID, Unique ID, quantity and optional InventoryUniqueData. The existing Rust quantity writer accepts supported ordinary stacks with a nil unique payload only. Non-nil payloads are preserved on export. The current Rust schema and inherited [v3.0.1 native schema](https://github.com/Yumekiraboshi/HKIA-Editor-Dev/blob/main/scripts/research/native-v301-dbroot-schema.json) agree on these native union variants:

| Tag | Type | Serialized fields in order |
| --- | --- | --- |
| 7 | FlowerUniqueDataV2 | FlowerGrowState (byte), FlowerColorIndex (int), FlowerPatternIndex (int), FlowerColorIndex (int) |
| 8 | FurnitureUniqueDataV2 | FurnitureMaterialIndex (int) × 3 |
| 6 | PaletteUniqueData | Color (four float32 components) × 3 |

Tags 1 and 2 are deprecated furniture/flower types using Hash128, not interchangeable with V2. PaletteUniqueData is a native color payload and appears in the shared union used by outfit models; this does not prove that every customizable clothing Item ID uses that payload. Field positions and storage types are known, but the valid option values, per-item applicability, semantic roles of the two flower colors, and native identity/reference behavior are not established by the schema alone. Do not expose arbitrary numeric index or color edits as valid game choices. Preserve opaque and deprecated payloads pending evidence.

Implementation reference: `core/src/schema.rs`, `core/src/native.rs`, `core/src/collection.rs`. Reuse the current native index and session, not the historical JS research reader.

### Native inventory UI assets (v3.0.1)

`public/inventory-ui/index.json` records original source references and exact decoded-pixel verification of all thirteen category sprites and sixteen flower pattern/effect sprites. The original category sprites are retained as source assets, not the default navigation artwork. The flower color and pattern definitions and all 16 locale label maps derive from native assets. The new Rust/WASM flower snapshot is keyed by document identity and read-only. Dynamic flower image tint/mask composition, native name formatting, and unique-data mutation are not yet verified.
