# HKIA Save Editor

**[Open the editor](https://yumekiraboshi.github.io/HKIA-Save-Editor/)**

A browser-local collection-history and achievement-state editor for Hello Kitty Island Adventure. Collection browsing uses the game's 25 collection groups rather than a flat ItemId list.

## Interface

- Game-derived collection categories, with 25 local category images and their real sub-collections from each item's collection ID. Subcategory cards reuse representative local item sprites.
- Select a category and (where applicable) a subcategory before browsing items. Search names in Japanese or English in the continuously loading list.
- Show base collection items by default instead of mixing color/size variations into the checklist. An optional variation toggle preserves individual variant-history editing. Edit collection-history membership or recorded date in a modal where structural constraints allow it.
- Separate Collections and Achievements tabs. Achievement records are read from the save and can be edited for completion state, floating-point progress and completion time. A verified 820-record source GUID-to-key crosswalk identifies saved local achievements without exposing raw GUIDs. All 820 definition titles are mapped to native Babel ID 300 strings in **all 16 game languages**. The selected locale's achievement-title pack loads on demand; the UI uses a readable internal source key only when the localization resource cannot load. Search supports localized titles and source keys.
- Compact header for the active tool, loading another file, downloading the **unchanged original** backup, downloading an edited copy, undo/redo, language and light/dark/system theme.
- Browser-language detection and manual Japanese/English language selection; display preferences and the active editing session are stored locally for recovery after a refresh.
- No raw item IDs, internal keys, GUIDs, or technical tokens in normal item and category views.

### Display-name coverage and accuracy

The 3.0.1 collection membership IDs were joined against a separately sourced item-name index for **PC Build 1119 / Switch 2.16.2**. The current result has **8,647 matched English/Japanese display-name pairs** out of 10,262 mapped collection items. The other **1,615 items are deliberately hidden from the normal list** instead of presenting opaque internal identifiers. The match by stable item ID does not prove naming parity with 3.0.1; a current-version localization extraction remains required. Japanese category group labels are editor labels matched to game group keys, not asserted to be exact in-game text.

## Save data and compatibility

- Only game SaveGameV2 3.0.0/3.0.1 slot or supported ZIP backups are accepted.
- Data is processed in Rust/WebAssembly inside a Web Worker, entirely in the browser. The original remains untouched. No save is uploaded.
- Changes are limited to **collection history (Key1)** and existing **AchievementModel** state fields (completion, progress, completion date). Achievement/GameCounter linkages, quest/reward unlocks, inventory, DLC entitlements, and other linked systems are **not** modified. In-game synchronization of achievement changes is not proven.
- An existing legacy Key0 map blocks add/remove; editing an existing saved timestamp remains available.
- New v3.0.1 history additions are further gated in Rust to confirmed collection IDs without identified DLC/event group restrictions.
- Synthetic native Save and ZIP tests, achievement mutation/undo/re-export/reopen tests, compiled WASM save roundtrip, Svelte/TypeScript checks and page builds run in CI. **Real-game acceptance and the behavior of edited genuine saves remain unverified.**
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

## Languages and shared game text

The language selector offers all 16 Babel locales present in the supplied game assets: `ar`, `de`, `en`, `en-GB`, `es`, `fr`, `fr-CA`, `it`, `ja`, `ko`, `nl`, `pt-BR`, `ru`, `tr`, `zh-Hans`, `zh-Hant`. Browser language matching, remembered selection and Arabic right-to-left layout are supported. Common editor actions have language-specific labels; remaining editor-owned copy falls back to English until reviewed translations are available.

The game text system is shared across tools. The editor accepts on-demand Babel string dictionaries keyed by native 64-bit string ID, with a separate item-to-string crosswalk. The Achievements tab uses the shared locale selection and has a source-verified 820-record save-GUID-to-Babel-title-ID crosswalk. Each of its 820 title IDs now resolves to the official game Babel string in every supported language. These compact dictionaries live in `public/achievement-locales/<locale>.json`, separate from item names and all other game dialogue. Only the selected locale is fetched. Text is tied to the v3.0.1 source definitions, not an assertion of exact parity with future game builds.

To build the item dictionaries locally, put the legally obtained Babel language folders directly under `<BABEL_DIR>/`, e.g. `<BABEL_DIR>/ja/ja.manifest`, `ja.100.txt`, `ja.200.txt`, `ja.300.txt`, and run:

```sh
python3 scripts/extract-babel-items.py --babel-dir /path/to/Babel \\
  --achievement-index public/achievement-index.json
npm test
npm run build
```

The extractor parses the native locale-ID-aware gzip-capable Babel format and generates `public/locales/item-keys.json`, a compact item dictionary, and the 820-entry achievement-title dictionary for each of the 16 locales. It only maps an item if its catalog English name matches **one unique** native English Babel string key, leaving ambiguous or unverified names to fallback; exact English text matching is not proof of the item's source localization key. It does not publish the full game's dialogue tables.

**Deployment coverage:** native Babel table-300 text has been matched by unique English string to 8,568 of the 10,262 catalog items; all 16 localized dictionaries for these records are shipped. The remaining 79 ambiguous/unmatched named entries and 1,615 entries without verified catalog names retain existing fallback or remain hidden. Core UI labels are translated in 16 locales; remaining editor-authored UI copy falls back to English. This is not yet a guarantee that every editor string is translated.
