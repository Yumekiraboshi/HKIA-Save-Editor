# Inventory editor — product specification

## Confirmed scope

- The inventory editor is a comprehensive local save editor, separate from collection registration. The inventory has no fixed UI slot or page capacity.
- Use the original game inventory category order and mappings; keep unknown records visible without inventing a category or dropping them.
- Display a dense, responsive, image-first grid with item name and owned quantity. Use compact controls, native item artwork, search and automatic incremental scrolling; no repeated technical labels or unused slot placeholders.
- Allow users to edit ordinary inventory quantities and the native unique data of flowers, customizable furniture and customizable clothing. Unique-data editing is a confirmed product requirement, even while individual operations are not yet supported.
- Preserve distinct native records with different unique data; do not merge them merely because they have the same Item ID. Show the appropriate variant appearance when verified source data permits. Expose individual customization controls on demand rather than enlarging every inventory tile.

## Safety and implementation constraints

- Rust is the sole authority for native schema interpretation, valid options, version/structure gates, CAS, atomic mutation, history, undo/redo, reconstruction and independent reparse. Svelte/TS only render and relay typed intents.
- Use source-verified game definitions for each supported unique-data discriminator, field, type and valid option. Do not infer flower genetics, color/pattern encodings, customization choices or IDs from display names or approximate images.
- Keep Document ID, Item ID, Unique ID, quantity, unrelated data and unknown payload fields unchanged unless an explicitly supported operation requires changing one of them. Do not invent identities or native payloads.
- Distinguish the inventory item's individual customization from collection history, placed furniture, equipped clothing, and entitlement or reward state. Do not silently mutate those other systems.
- Each unique-data edit must participate in the existing inventory history, recovery draft, Undo/Redo and export/reparse path; unsupported variants/fields remain read-only until verified.

## Current implementation boundary (not a reduction of scope)

The v3.0.1 native inventory index recognizes Document ID, Item ID, Unique ID, quantity and optional InventoryUniqueData. The existing Rust quantity writer accepts supported ordinary stacks with a nil unique payload only. Non-nil payloads are preserved on export. This does not establish the concrete schema or allowed values for flower, furniture or clothing customization; those edits must not be enabled until their evidence and end-to-end validation exist.
