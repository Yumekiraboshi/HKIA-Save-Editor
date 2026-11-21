# HKIA Save Editor

**[Open the editor](https://yumekiraboshi.github.io/HKIA-Save-Editor/)**

A browser-local collection-history editor for Hello Kitty Island Adventure. The interface is based on the game's 25 collection groups rather than a flat raw ItemId list.

## Interface

- Game-derived collection categories, with 25 local category images and their real sub-collections from each item's collection ID. Subcategory cards reuse representative local item sprites.
- Select a category and (where applicable) a subcategory before browsing items. Search names in Japanese or English in the continuously loading list.
- Show base collection items by default instead of mixing color/size variations into the checklist. An optional variation toggle preserves individual variant-history editing. Edit collection-history membership or recorded date in a modal where structural constraints allow it.
- Compact header for the active tool, loading another file, downloading the **unchanged original** backup, downloading an edited copy, undo/redo, language and light/dark/system theme.
- Browser-language detection and manual Japanese/English language selection; display preferences and the active editing session are stored locally for recovery after a refresh.
- No raw item IDs, internal keys, GUIDs, or technical tokens in normal item and category views.

### Display-name coverage and accuracy

The 3.0.1 collection membership IDs were joined against a separately sourced item-name index for **PC Build 1119 / Switch 2.16.2**. The current result has **8,647 matched English/Japanese display-name pairs** out of 10,262 mapped collection items. The other **1,615 items are deliberately hidden from the normal list** instead of presenting opaque internal identifiers. The match by stable item ID does not prove naming parity with 3.0.1; a current-version localization extraction remains required. Japanese category group labels are editor labels matched to game group keys, not asserted to be exact in-game text.

## Save data and compatibility

- Only game SaveGameV2 3.0.0/3.0.1 slot or supported ZIP backups are accepted.
- Data is processed in Rust/WebAssembly inside a Web Worker, entirely in the browser. The original remains untouched. No save is uploaded.
- Changes are limited to the **collection history (Key1)**, not ownership, items in inventory, achievements, quests, rewards, DLC entitlements or other linked systems.
- An existing legacy Key0 map blocks add/remove; editing an existing saved timestamp remains available.
- New v3.0.1 history additions are further gated in Rust to confirmed collection IDs without identified DLC/event group restrictions.
- Synthetic native Save and ZIP tests, compiled WASM save roundtrip, Svelte/TypeScript checks and page builds run in CI. **Real-game acceptance and the behavior of edited genuine saves remain unverified.**
- Keep an untouched backup before testing edited saves.

## Development

Requires Node.js 22+ and Rust with `wasm32-unknown-unknown`.

```sh
npm ci
npm run build:wasm
npm run dev
```

To run checks:

```sh
cargo test -p hkia-save-core
npm test
npm run build:wasm
npm run test:wasm
npm run check
npm run build
```

Unofficial tool. Not affiliated with Sunblink, Sanrio or the game's publishers.
