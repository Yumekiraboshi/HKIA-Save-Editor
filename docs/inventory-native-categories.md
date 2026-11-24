# HKIA v3.0.1 Inventory item source classification

Source: verified original Steam v3.0.1 UnityFS `definitions` (SHA-256 `ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0`); Switch v3.0.1 IL2CPP `dump.cs` confirms the matching native field and enum names. The original binary assets are *not* included in the repo or deployed.

## Native save versus game definitions

The original MessagePack `DbRoot` has a sequence of `IDocument` union records. Union tag `1` is `Sunblink.UserData.InventoryItem` with five ordered values: Document ID, Item ID, Unique ID, quantity, and optional `InventoryUniqueData`. There is **no category field in the save**. Rust core (`core/src/schema.rs`, `core/src/native.rs`) provides read-only Inventory rows keyed by Document ID and Item ID. For v3.0.1, Rust edits positive quantities only for eligible existing ordinary stacks, with CAS, Undo/Redo, source preservation and independent reparse; no insertion or deletion in this UI slice.

`InventoryItemDefinitionAsset` is the authority for display classification, looked up by Item ID. Unity SerializedFile type index 3 has `ItemCategory` (bit flags), `HasUiOverridenItemCategory` (bool) and `UiOverridenItemCategory` (flags). All 12,163 item definitions were parsed without malformed or duplicate IDs; 1,238 have the UI override enabled. The native source `ItemCategory` is NOT the collection membership `CollectionGuidString` or `CollectionPrimaryKey`. This change replaces the old 25-category collection navigation in Inventory, while retaining the collection atlas solely to resolve *item artwork* for known items.

`public/inventory-native-categories.json` contains **derived metadata only**, with provenance, a pinned source SHA-256, a decoded-data SHA-256, 75 exact distinct category/override tuples, and source-sorted Item IDs in gzip-compressed unsigned-delta-varint/palette format. Metadata loading validates schema, version, count, range and SHA-256 before any category is used; incompatible data fails closed to an unclassified list. No user save is sent over the network.

## Native RawCategories order and dedicated artwork

Switch v3.0.1 global-metadata.dat SHA256 e4300e0e4235c99bf791392c2a2b50ae3d693edc328a68ce2f5a20571de1f7bb. InventoryViewModel constructor RVA 0x2D111C0 initializes a 13-element RawCategories array. Unique 52-byte Assembly-CSharp initializer at 0xC1E150 has SHA256 9a7a6a37f6e96428ef90f9bab12da276b8128af80a000ef26a7e60b92c59264c. Order: 134217728,0,65536,4096,50331648,32,8,16384,256,64,67108864,2097152,8388608. InventoryItem.get_InventoryCategory RVA 0x39964A0 selects base or override. Display mask matching preserves multiple category matches and catchall. The game specialized filter predicates (creation station, hidden/visibility, synthetic/context tabs) are not fully reproduced; editor retains all saved rows. Captions are localized editor labels, not verified Babel captions.

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

Other populated category art reuses the existing original game Collection UI icons; these are not asserted to be the exact Inventory TabItemView.CategoryIcons sprite mapping. Three categories remain text-only. No wiki assets or fabricated images. Original binaries and personal saves are not committed.
