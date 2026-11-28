# HKIA v3.0.1 Inventory item source classification

Source: verified original Steam v3.0.1 UnityFS `definitions` (SHA-256 `ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0`); Switch v3.0.1 IL2CPP `dump.cs` confirms the matching native field and enum names. The original binary assets are *not* included in the repo or deployed.

## Native save versus game definitions

The original MessagePack `DbRoot` has a sequence of `IDocument` union records. Union tag `1` is `Sunblink.UserData.InventoryItem` with five ordered values: Document ID, Item ID, Unique ID, quantity, and optional `InventoryUniqueData`. There is **no category field in the save**. Rust core (`core/src/schema.rs`, `core/src/native.rs`) provides read-only Inventory rows keyed by Document ID and Item ID. For v3.0.1, Rust edits positive quantities only for eligible existing ordinary stacks, with CAS, Undo/Redo, source preservation and independent reparse; no insertion or deletion in this UI slice.

`InventoryItemDefinitionAsset` is the authority for display classification, looked up by Item ID. Unity SerializedFile type index 3 has `ItemCategory` (bit flags), `HasUiOverridenItemCategory` (bool) and `UiOverridenItemCategory` (flags). All 12,163 item definitions were parsed without malformed or duplicate IDs; 1,238 have the UI override enabled. The native source `ItemCategory` is NOT the collection membership `CollectionGuidString` or `CollectionPrimaryKey`. This change replaces the old 25-category collection navigation in Inventory, while retaining the collection atlas solely to resolve *item artwork* for known items.

`public/inventory-native-categories.json` contains **derived metadata only**, with provenance, a pinned source SHA-256, a decoded-data SHA-256, 75 exact distinct category/override tuples, and source-sorted Item IDs in gzip-compressed unsigned-delta-varint/palette format. Metadata loading validates schema, version, count, range and SHA-256 before any category is used; incompatible data fails closed to an unclassified list. No user save is sent over the network.

## Native RawCategories order and dedicated artwork

Switch v3.0.1 global-metadata.dat SHA256 e4300e0e4235c99bf791392c2a2b50ae3d693edc328a68ce2f5a20571de1f7bb. InventoryViewModel constructor RVA 0x2D111C0 initializes a 13-element RawCategories array. Unique 52-byte Assembly-CSharp initializer at 0xC1E150 has SHA256 9a7a6a37f6e96428ef90f9bab12da276b8128af80a000ef26a7e60b92c59264c. Order: 134217728,0,65536,4096,50331648,32,8,16384,256,64,67108864,2097152,8388608. InventoryItem.get_InventoryCategory RVA 0x39964A0 selects base or override. Display mask matching preserves multiple category matches and catchall. The specialized station classification below is based on native filter disassembly; remaining hidden/visibility and synthetic/context behavior is not reproduced, because the editor retains all saved rows. Captions are localized editor labels, not verified Babel captions.

Original inventory-specific textures extracted from Steam definitions CAB-46b8f8fe122147493b3113f7c1c8cd0f using BC3 decompression and vertical flip:

{
  "flowers": {
    "asset": "inventory_icon_category_Flower",
    "spritePathId": "5864427760786097363",
    "texturePathId": "-6933717049427147565",
    "sha256": "b4134139e5ba02972e4320e3ece8b598408b6decd3a88216d4d49d8ef990400d"
  },
  "furniture": {
    "asset": "inventory_icon_category_furniture",
    "spritePathId": "-8333129205685113078",
    "texturePathId": "-7862054458161385718",
    "sha256": "f428d50dea3962fae65d6b3ae787aecf4b9ffccca45f86ac1089446e6db3e7ad"
  }
}

The exact `TabItemView.CategoryIcons` Sprite references from `l_inventoryview` have been resolved for all 13 native tabs and are retained as source assets. Navigation instead uses colored representative game art for readability, selected to resemble the motif and silhouette of the original category icon, per the Owner's latest decision. The source-item mapping lives in `src/inventory-browse.ts`; it is presentation-only and does not change category membership or ordering. Original collection icons remain fallbacks. Dyeable representatives use the existing shared colorway renderer. Fish, wands, chef station and creation station resolve through `d_23_7e3a06d4` (CAB-0f2e3940b6dc3309fd0d44b6af2b4a83). Comics resolves through the definitions Sprite `ui_tag_icon_comic` and its exact render-data key in GlobalUIAtlas, restored to its original 93×93 canvas. Source-size RGBA images are encoded losslessly with method 6; hashes are pinned in `public/inventory-ui/index.json`. No wiki assets. Original bundles and personal saves are not committed.

## Native station filter correction

Switch v3.0.1 original NSO SHA-256 64bd5fb69239f57eb0578a1897a45a3c6f5e187480903f83df503b46bf827bfb. CreationStationFilterViewModel.BaseFilter (RVA 0x2CFFC10) obtains effective InventoryCategory, excludes Outfit (bit 8), and iterates IInventoryItemData.GetCraftingSources (interface slot 20); Category==24 (ItemSourceCategory.FlowerCreationStation) qualifies. The raw CreationStation bit does not identify this inventory group. Original Unity type index 3 CraftingSources list was decoded across all 12,163 item definitions: 181 have a source category 24; 46 have effective Outfit, leaving 135 candidates. Source-derived IDs are pinned in src/inventory-native-crafting.ts. ChefStationFilterViewModel.BaseFilter (RVA 0x2D004E0) uses raw GetCategory (slot 29), bit 12, rather than UI override flags: 33 candidates, including 7 overridden to Food. Some rows match several tabs. Native IsVisible additionally checks hidden, unlock and contextual conditions; the editor deliberately preserves saved rows and does not infer unlock state. These counts are definition-level candidates, not evidence of the player's actual inventory or in-game visibility.

## Complete inventory name crosswalk

The original InventoryItemDefinitionAsset type 3 supplies Id and Name.selectedString (tableId, simpleStringId) directly. All 12,163 definitions were traversed; 12,162 reference Babel table 300 and one references table 100. Existing collection name assets cover 10,262 IDs; the additional 1,901 IDs use original Babel manifest lookups, not English string matching. The supplemental files under public/inventory-names/ preserve the source definitions SHA-256, each original decoded manifest/table SHA-256, and locale. Verified coverage is 12,163 IDs in 15 locales; Arabic retains the 10,262 existing verified names pending recovery of the original supplementary table. The loader rejects duplicate IDs between the sets and does not substitute an English or fabricated name.

## Additional original inventory artwork

Steam v3.0.1 definitions contains 12,163 non-null UiIcon PPtrs, resolving to 5,020 Sprite objects. All resolve via the Sprite's exact local Texture2D or render-data key in original GlobalUIAtlas CAB-7b5f150a8a680cc279a40f4d3ca4f657 (bundle SHA-256 04c1f4c191b0a821a0bbcb15e67a75bec85cf343a0b2e875ee8e525e1e8dfc7b). For the 1,901 additional item IDs, the sprite texture rect, trim offset and original rect were resolved; source pixels were BC3-decoded, vertically flipped, cropped, restored to the original transparent canvas, scaled to 96px, and encoded as WebP quality 90 with alpha. 1,747 IDs map to 1,317 distinct verified cells. The 152 original icon_placeholder IDs and 2 UiIconUsesDynamicColor items are withheld, not represented as exact final art. Original Sprite PathIDs and sheet hashes are pinned in public/inventory-art/index.json. This is original 2D UiIcon artwork, not a claim of material/dye render fidelity. Existing collection-backed art and shared colorway handling remain available for their original IDs; correcting any remaining source mapping and colorway differences is separate work. The additional sheets load only when a visible card references their CSS image URL.

The 152 source-placeholder definitions all reference the same original Sprite PathID -6646601456236922891. The editor now uses the verified shared original placeholder crop already extracted for wand overlays (see [dynamic-wand-art.md](dynamic-wand-art.md)), with its original alpha plane and shared local cache, only for exact manifest membership. This is not 152 newly recovered individual images. The two dynamic-color definitions remain separate; no placeholder is assigned to them. A missing source file retains the generic editor fallback. Further individual artwork requires evidence of an alternate native route.

## Native category fallback during artwork delivery failures

Preserve the Owner-approved colored representative images and collection category artwork. All 13 original TabItemView category Sprites are available as independent fallbacks, including key-items, items and wands which previously had no fallback. A category keeps its fixed 34px artwork slot while a representative atlas or named image is unavailable; the native placeholder never overlaps a loaded representative. Existing colored collection category artwork remains the first fallback when available. If it cannot load, use the exact original category Sprite. No category membership, item images or save logic changes. Tests verify every existing native category file hash and exercise all thirteen original fallbacks in Chromium with the other artwork paths unavailable.


## Reviewed versioned category artwork candidates

`scripts/stage-category-art.py` and `src/versioned-category-art.ts` share the original native Sprite/texture crop and verified image delivery foundation for Collection and Inventory categories. The reviewed category scope binds the exact version/platform/definition SHA, complete collection and inventory keys and original item IDs. The `HKIA.CategoryArtPointerCensus.1` input binds that scope file SHA-256 and supplies each domain/key, native Sprite PPtr pair [fileId, decimalPathIdString], pointer-owning bundle, explicit navigation representativeItemId (or null) and collectionFallback key (or null). Collection rows have neither representative nor fallback. The reviewed layout marker is `native-category-pointers-v1`. The `HKIA.CategoryArtBundleInput.1` binds the census file SHA-256, version/platform and actual source bundle names, relative paths and SHA-256.

```sh
python scripts/stage-category-art.py --census category-pointers.json --scope category-scope.json --bundles category-bundles.json --out /staging/category-art
```

Output: `HKIA.CategoryArtCandidate.1` manifest plus content-addressed lossless 96px WebP files. The loader requires the exact manifest file SHA and same-version catalog scope, verifies original source and file identities, shares immutable bytes and retries failures. Inventory artwork order stays representative item → approved Collection category → original native tab icon; no arbitrary item substitution. Collection uses its original category directly. Explicit native null and unresolved references remain different states.

This does not independently extract the native category pointer census or category catalog; both must be reviewed from the actual original version. The existing UI remains on 3.0.1 until candidate validation/registration. No save changes or new category policy.
