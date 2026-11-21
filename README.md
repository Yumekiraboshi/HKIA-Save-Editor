# HKIA Save Editor

**[Open the editor](https://yumekiraboshi.github.io/HKIA-Save-Editor/)**

A browser-local collection-history and achievement-state editor for Hello Kitty Island Adventure. Collection browsing uses the game's 25 collection groups rather than a flat ItemId list.

## Creating an absent achievement (v3.0.1 source-only)

A source-defined achievement may be visible in the game without its own serialized `AchievementModel` (the verified v3.0.1 example had 571 of 820 saved records). The editor displays an absent leaf as `0 / X`, rather than claiming that a third "unknown" gameplay status exists. In a v3.0.1 save, clicking the absent tile creates a new `IDocument` Union(16) / `AchievementModel`, with a four-word source-verified GUID, a collision-free new per-tag Document ID, complete flag, verified target progress and completion timestamp. The DbRoot MessagePack document sequence count is updated; the untouched record bytes are preserved, and the whole resulting save is decoded again before any export. One Undo deletes the new document from the edited model. The source's native parent mapping is validated before atomically completing the last child and either updating an existing incomplete parent or creating a missing source-defined parent.

The same local recovery draft can restore additions using a `before:null` compare-and-swap precondition, without relying on network services. It does not create unselected entries or independent `GameCounterModel` records, grant rewards, or sync external achievements. **Runtime loading/reboot confirmation is pending.** New achievement creation is disabled for v3.0.0 because the verified definition set is v3.0.1-specific.

Collection items already use `GameCollectionsTraitModel` history dictionary membership. Missing items are displayed as `0 / 1` (and entirely unrecorded categories as `0 / X`); on v3.0.1, adding a source-eligible item inserts the item's ID with a timestamp, with undo/redo and export roundtrip verification. Version, deprecated-history and source allowlist gates remain in place. This is collection history, not proof of inventory ownership.

## Floorplans collection-history editing (v3.0.1; 18 source-defined IDs)

The game's collection definition for `collection_furniture_floorplans` is marked hidden and belongs to a DLC-referenced group. The previous UI disallowed all flagged entries (`item[4] !== 0`), and the Rust `eligible_for_new_history` source allowlist omitted all 18 Floorplans IDs. Consequently, the previous localization and artwork fixes did **not** enable clicking those items.

This release authorizes **only the exact 18 verified source Item IDs** from `collection_group_floorplans` for a user-triggered `GameCollectionsTraitModel.CollectablesCollectedTime` dictionary history addition on a compatible **v3.0.1** save. The full Rust allowlist, v3.0.1 gate, existing dictionary and deprecated-history structural checks, timestamp bounds and CAS preconditions remain authoritative. The UI's mirror predicate permits these precise IDs irrespective of the generic source restriction flag, with the existing click, Undo/Redo, timestamp edit and Save export flows; no other flagged group becomes eligible. Native tests exercise all 18 additions together, ZIP/raw export roundtrip, map-header size change from 2 to 20 entries, removal, Undo/Redo and unsupported versions.

**This is a collection-history entry only, not the game's Floorplan item inventory, ownership, cabin layout availability, DLC entitlement or quest reward**. Whether a game load recognizes each manually added collected entry and whether the game will override it is not hardware-verified. Keep a backup before importing edited saves.

## Color variants and shared original-game icons (Steam v3.0.1)

**Known art-fidelity limitation; not a sprite-position, image-loading, or greyscale-CSS error.** The native `InventoryItemDefinitionAsset.UiIcon` pointer is commonly shared by multiple distinct items of different colours. Our audited original Steam v3.0.1 image map contains 10,262 collection-item IDs referencing only 3,855 distinct original UI sprite pointers. In particular, the **5,383 source keys prefixed `item_c_dyeable_` use only 369 distinct native `UiIcon` sprites**. The image ZIP packs correctly preserve that shared source artwork, but they **do not render the game's actual dye/palette/material colours**.

One reproducible original-game example is the Imagination Celebration archer hat:
- Ice Cream: item ID `704486536`, source key `item_c_dyeable_icarcherhat_icecream`
- Orange: item ID `585726126`, source key `item_c_dyeable_icarcherhat_orange`
- Both resolve to the **exact same** native Sprite PathID `7834849297367771244` and the exact same shipped `collections_group_events.zip` image position (sheet 2, cell 59). The same is true for the Archer Outfit Ice Cream `1286846063` versus Orange `935642973` (native Sprite PathID `4470433174330146938`, sheet 10, cell 103).

The Unity definition bundle contains dye and palette terminology, including `DyeReference`, `PaletteDefinition` and `_PaletteColor1`–`_PaletteColor5`, but **the exact per-item dye assignments and the native image-shader recolour pipeline have not been verified**. Guessing CSS colour filters from English/Japanese item names would create misleading artwork. Until a source-verified recolour pipeline is implemented, the editor displays the shared original icon and a localized disclosure for source-dyeable collection items. **Different names/IDs and collection-history entries remain fully distinct.** Source asset extraction itself remains a lossless copy of each unique game-authored sprite, not a separate rendered icon for each colourway.

## Source-verified Floorplans (18/18; 16 languages; genuine artwork)

All 18 `collection_group_floorplans` items now use source-pinned labels from the user's Steam v3.0.1 Babel table 300. The direct source `InventoryItemDefinitionAsset.Id` from the decoded collection/image map is paired with the uniquely matching original English Babel `Floorplan` title and its same 64-bit string ID across **all 16 game locales**, including native Japanese strings such as `小さな部屋の間取り図` and `広い部屋の間取り図`. This crosswalk is in `src/floorplan-names.ts`; the complete 16×18 string vectors are checked with source-computed SHA-256 digests in `tests/floorplan-source-names.test.mjs`. It does not claim to resolve the remaining 1,597 unnamed catalog items.

No new or substituted images are needed. The existing `public/item-packs/collection_group_floorplans.zip` already contains one original game-derived thumbnail for **each** of the same 18 source Item IDs, in `sheet-000.webp`; the pack index and all image bytes are verified in CI. The UI reuses its existing local WebP renderer and shows the corresponding image together with the exact localized title in the zero-history 0/18 list. Game image distribution remains subject to the upstream source/asset-rights caveat.

## Automatic achievement-category completion

Each of the **63 native categories** is an independent saved achievement with its own source GUID. Its **757 child achievements** are grouped by the game-defined `GameCounterAchievementsDefinition` links. The parent record is stored and managed internally, displayed as a completion check on the category card rather than repeated as an editable child tile; the individual grids contain 757 source-defined children, plus source-unmapped saved GUIDs when present.

When a user completes the final saved child through the achievement grid, the editor also completes that category **only when** every other native child has a saved, completed achievement record. An existing incomplete parent is updated, while a source-confirmed missing parent is created in v3.0.1. Neither is changed if any sibling is still incomplete or absent. Both records are changed through a single atomic Rust/WASM operation, with compare-and-swap validation and a single Undo/Redo step. In v3.0.1, explicitly revoking a completed child also revokes a completed parent atomically, preserving other siblings.

The parent timestamp is copied **exactly** (seconds plus 100ns-resolution nanoseconds) from the latest completed child when all children have known completion timestamps. If any child timestamp is absent, the parent is completed with `CompletedTime=null` rather than inventing a historical time. For subsequent **date-only edits** to a completed child on v3.0.1, an already completed parent's date follows the new latest child date **only when** every child still has a valid completed timestamp, the parent's progress equals its native child count, and the parent's existing date exactly matches the previous latest child date. An independently recorded date, unknown dates, incomplete/missing siblings, and changes that do not affect the latest timestamp leave the parent untouched. The parent `CurrentValue` is not changed by date synchronization. Missing child achievement records are created only when explicitly unlocked in a source-verified v3.0.1 save; a missing parent record is created only as part of a user-triggered final-child completion, never on save open. No changes occur merely from opening a save.

**Scope limitation:** these edits change existing achievement documents or create an explicitly selected, source-verified missing achievement document (v3.0.1 only). Separate game counters (`GameCounterModel`), reward grant state, and external platform achievements are **not** synchronized; the runtime may recompute category state on game load, and this behavior is not hardware-verified. Treat the date as an editor-derived consistency rule, not a verified historical parent unlock event.

## Interface

- Game-derived collection categories, with 25 local category images and their real sub-collections from each item's collection ID. **Zero collection-history entries never hide an entire category or its item rows**: each native base item remains visible at 0/1, even when names cannot be verified (these are explicitly marked with the unmodified source Item ID). Subcategory cards reuse representative local item sprites.
- Select a category and (where applicable) a subcategory before browsing items. Search names in Japanese or English in the continuously loading list.
- Show base collection items by default instead of mixing color/size variations into the checklist. An optional variation toggle preserves individual variant-history editing. Edit collection-history membership or recorded date in a modal where structural constraints allow it.
- Separate Collections and Achievements tabs. **All 757 individual achievements are listed as tiles**, while the 63 category-parent achievements are represented by category cards and retained in the saved model: saved entries can be edited for completion state and completion time; saved progress is read-only in the UI and is adjusted to the native source goal only when the completion status is toggled; definitions without a stored entry show **0 / source goal** and can be explicitly unlocked on v3.0.1 by creating a native AchievementModel; original absent records remain absent until clicked. A verified 820-record source GUID-to-key crosswalk identifies saved local achievements without exposing raw GUIDs. All 820 definition titles are mapped to native Babel ID 300 strings in **all 16 game languages**. The selected locale's achievement-title pack loads on demand; the UI uses a readable internal source key only when the localization resource cannot load. Search supports localized titles and source keys.
- Compact header for the active tool, loading another file, downloading the **unchanged original** backup, downloading an edited copy, undo/redo, language and light/dark/system theme.
- Browser-language detection and manual Japanese/English language selection; display preferences and the active editing session are stored locally for recovery after a refresh.
- Source-verified items display proper localized names, never internal keys or GUIDs. Items whose names remain unverified are explicitly labeled with their native item ID rather than hidden or assigned invented names.

### Display-name coverage and accuracy

The 3.0.1 collection membership IDs were joined against a separately sourced item-name index for **PC Build 1119 / Switch 2.16.2**. The current result has **8,647 matched English/Japanese display-name pairs** out of 10,262 mapped collection items. Of the original **1,615 unnamed items**, **18 Floorplans** now have exact native game-text names in **all 16 languages**, grounded by source item IDs, Steam v3.0.1 English Babel string keys, and matching localized table-300 IDs. The remaining **1,597** still show an explicit unverified-name placeholder with the exact source Item ID, never a guessed official name. They remain subject to the editor's existing per-item safety gates for changing collection history. The match by stable item ID does not prove naming parity with 3.0.1; a current-version localization extraction remains required. Japanese category group labels are editor labels matched to game group keys, not all verified as exact in-game UI strings. The reported native Japanese title for City Town is **都市の町**; this correction is also supported by v3.0.1 Babel item and achievement names. All other group label parity still requires a matching original group-title table.

## Per-tab editing history and SVG toolbar

The header now exposes a local, accessible **editing-history menu for the active Collections or Achievements tab**. Each native Rust/WASM history entry is listed under its item or achievement title, with the current cursor indicated. The user can jump to the original state of **that tab** or any previous/future edit in the same tab. The other tab's edits remain unchanged, even when edits were originally interleaved. The undo and redo SVG buttons are also scoped to the active tab. Achievement child + category parent transactions remain one history entry and one reversible change. New edits invalidate only the same tab's redo branch.

The file menu and language/theme controls use SVG icons rather than Unicode-only controls. History has the same native 256-entry overall bound as before; this is a **local in-session transaction history**, not an external audit log. On restoring a browser draft, its final edit state is restored; per-step session history is not guaranteed to reconstruct the original edit grouping or ordering. Source-native game achievements and collection-history values remain separate; no counter/reward/entitlement systems are modified.

## Forward save-version compatibility

The editor now distinguishes **save release labels** from **compatible editable structures**. Canonical versions later than 3.0.1 (for example 3.0.2, 3.1.0 or 4.0.0) can open when their numeric envelope release code matches, their CollectionVersion string matches exactly, and the native typed MessagePack schema and collection/achievement document representations remain compatible. Existing collection timestamps/removals and existing achievement state/date changes can then be edited, exported and structurally re-opened with their original version label preserved. Unknown or incompatible structures fail closed.

This is not a guarantee that every future game update will remain compatible: if the native serialization layout changes, validation rejects it until the source schema is updated. **Creating previously absent AchievementModel documents or new collection-history entries still requires a version-specific source allowlist and remains restricted to verified v3.0.1**, because matching shape alone does not verify future item/achievement identities or gameplay effects. In-game loading and ownership/reward behavior have not been verified for future versions. Always retain the original save.

## Save data and compatibility

- Game SaveGameV2 3.0.0/3.0.1 slot or supported ZIP backups are accepted. **Future canonical HKIA save version labels are also accepted when their envelope version code, CollectionVersion metadata, original native target schema, type/offset safety checks and write/export/reopen verification remain compatible**. Unknown layouts are rejected; this is not an unconditional version bypass.
- Data is processed in Rust/WebAssembly inside a Web Worker, entirely in the browser. The original remains untouched. No save is uploaded.
- Achievements are ordered by **the game's own progression sequence**, never alphabetically: categories use `Local_RootAchievement` source-reference order; within each category, individual achievements use the v3.0.1 `LocalAchievementRuntimeData.order` numeric field (fallback to the exact game group-reference order). The unfiltered all-achievements view and filtered/search results preserve this hierarchy. One cross-category duplicate native `order=42` exists; it is intentionally not treated as a unique global sort key. Future/unmapped saved GUIDs remain at the end instead of being dropped.
- Achievement category cards now show **63/63 game-authored source icons**, extracted from the user-provided Steam v3.0.1 original image pack. Each image is keyed by the exact native achievement Source GUID and Sprite PathID, checked against the original root/reference order, and packed into one compact 8×8 lossless WebP atlas at `public/achievement-category-atlas.webp` (source bitmap resized for UI). The matched original Sprite GUIDs, source sprite SHA256 hashes, atlas hash and image-map provenance are documented in `public/achievement-category-atlas.json`. This is not a fallback to the 25 collection category icons. Missing/mismatched assets fail closed to a neutral placeholder rather than displaying an incorrect image. The image pack is version-specific and does not establish third-party redistribution rights.
- Achievement category navigation now mirrors the native **Local_RootAchievement** counter structure: 63 source-defined category achievements with 757 direct child achievements, covering all 820 identities. The navigation is **root → category → individual achievement**, with no duplicate parent tile inside the category or in the all-achievements list; no deeper subcategory tier appears in the verified v3.0.1 reference graph. Category titles use the same official 16-language Babel packs as individual achievements. Saved child counts are informational only, and never represent a game-authoritative achievement percentage. Source-unmapped saved GUIDs remain accessible separately, and the ungrouped "all achievements" search/filter view remains available. The exact crosswalk is `public/achievement-groups.json`.
- **Individual achievement artwork** now uses the 198 source-verifiable non-category `LocalAchievementData.Icon` Sprite references from the user-supplied original Steam v3.0.1 assets (out of 757 individual achievements). Each bitmap is mapped to its **own** save-GUID identity through the exact game-definition key, *not* the source asset GUID; original Sprite PathIDs and image SHA256 hashes are documented in `public/achievement-individual-atlas.json`. UI-scale originals are packed into the 14×15 WebP sheet `public/achievement-individual-atlas.webp`. The remaining 559 definitions have an authoritative **null** icon reference, so they deliberately retain the neutral placeholder; no category icon, arbitrary graphic, reward item, or hypothetical runtime fallback is substituted. A source image-map SHA, 198-key coverage check, and strict mapping checks guard against wrong icons. The art is version-specific and does not establish third-party redistribution rights.
- **Runtime image integrity:** category and individual atlases now download only after a save is open and the Achievements tab is selected. In addition to manifest key/Sprite provenance checks, the actual WebP response bytes are SHA-256 checked before rendering. Stale/missing/corrupt artwork shows neutral placeholders and a localized warning, never an unverified image; image Blob URLs are revoked on teardown. A save is required to access the Achievements interface.
- Achievement tile layout now keeps an identical fixed height for completed, incomplete and missing records (including mobile). Incomplete items show a **single** localized `Progress: A / B` status rather than an extra row: `A` is the saved AchievementModel current value; for leaves, `B` is the native source achievement threshold; category parents do not appear as individual achievement tiles, and their saved state is displayed on the category card instead. Missing saved achievement records display **0 / source goal**; zero is a display default, not a write on load. These figures are informative and do not imply that linked source counters, completion triggers or rewards are synchronized. Category and individual order remain source-native.
- Achievement UX now mirrors Collections: compact category icon cards and compact individual achievement tiles. For an **existing saved AchievementModel** the main tile toggles the stored complete flag in one click (newly completed entries receive the current timestamp; reversing removes the timestamp). On completion, the saved progress is set to its verified native goal. On reversal, partial progress is preserved when below the goal, or capped at goal minus one; the original value remains recoverable via Undo. If a verified native goal has not loaded, the edit is blocked rather than inventing one. Linked counters, rewards and platform achievements remain unchanged. Source-verified missing AchievementModel records can now be created on a v3.0.1 explicit completion click (never on load). The separate clock / overflow button opens a popup for completion-time adjustments (if completed) and read-only conditions/reward details; **arbitrary numeric progress entry is removed**. Counter conditions and reward definitions remain available in an advanced, collapsed details section, not displayed on every tile. Global/native category and within-group numeric progression order is unchanged. The save must still be exported for external use; genuine-game loading and cross-system consistency of one-click completion are not verified.
- Achievement details now use a verified **820/820 source-definition facts index** (720 description string IDs, 820 counter definitions, 264 positive item-reward definitions). The optional popup shows source thresholds, actual saved **GameCounterModel** values where present, item reward definitions, and DLC/group flags in all 16 UI languages. Missing counters remain UNKNOWN; source thresholds alone never imply completion, reward ownership or reward receipt. The counter snapshot is read-only and never modified.
- Changes are limited to **collection history (Key1)** and existing **AchievementModel** state fields (completion, goal-bounded progress on toggles, completion date). Achievement/GameCounter linkages, quest/reward unlocks, inventory, DLC entitlements, and other linked systems are **not** modified. In-game synchronization of achievement changes is not proven.
- An existing legacy Key0 map blocks add/remove; editing an existing saved timestamp remains available.
- New v3.0.1 history additions are gated in Rust to confirmed collection IDs; **the exact 18 source-pinned Floorplan IDs are an explicit limited exception**, writing collection history only, without DLC entitlement/ownership changes. Other DLC/event restrictions remain enforced.
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

**Deployment coverage:** native Babel table-300 text has been matched by unique English string to 8,568 of the 10,262 catalog items; all 16 localized dictionaries for these records are shipped. The remaining 79 ambiguous/unmatched legacy named entries retain source-name fallback where available. Of the prior 1,615 items without verified names, 18 Floorplans now use exact source-pinned 16-language Babel labels, and the remaining 1,597 items show a visibly unverified source-ID placeholder instead of vanishing from zero-progress subcategories. Core UI labels are translated in 16 locales; remaining editor-authored UI copy falls back to English. This is not yet a guarantee that every editor string is translated.

The achievement detail index is built from the archived v3.0.1 UnityFS-derived source index; the application does not publish game definition binaries, original player saves or third-party icons. Full in-game description text and achievement artwork are not redistributed; the source description IDs remain available for a rights-cleared extraction workflow. This metadata is version-specific and does not prove synchronization or reward-grant semantics.

The game source defines 720 localized achievement-description string IDs and 100 entries without a description ID. For a **private, local-only** extraction of those 720 descriptions per chosen language, use:

```sh
python3 scripts/extract-babel-items.py --babel-dir /path/to/Babel \\
  --achievement-index public/achievement-index.json \\
  --achievement-facts-index public/achievement-facts-index.json \\
  --achievement-descriptions-out /path/outside/website/private-achievement-descriptions
```

The extractor verifies the source GUID crosswalk and completeness per locale, refuses writing description exports inside `public/`, and does not commit or publish the game-authored sentences. Description text remains excluded from the public website until redistribution rights are reviewed. Item names and already-published achievement titles remain separate.
