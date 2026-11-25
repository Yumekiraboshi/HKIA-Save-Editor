# Native inventory quantity source (v3.0.1)

The checked-in Rust source table is a projection of the Steam v3.0.1 `definitions` UnityFS bundle, SHA-256 `ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0`, CAB `CAB-46b8f8fe122147493b3113f7c1c8cd0f`, SerializedFile v22 type index 3 (class 114). All 12,163 distinct positive item IDs are present, including the valid ID 2147483647 (Bubble Wand). No original bundle or player data is included.

The typed fields give 10,293 stackable definitions, 138 requiring unique data, 13 with custom caps and 2,776 with nonempty RequiredDlcContent. The Switch v3.0.1 NSO (SHA-256 `64bd5fb69239f57eb0578a1897a45a3c6f5e187480903f83df503b46bf827bfb`) implements InventoryItemExtensions.MaxCount at RVA 0x373A870: Stackable bit 1 tested at 0x373A914, nonstackable return 1, custom flag at 0x373A984, default signed i32 maximum at 0x373A9C8, custom getter tail call at 0x373AA00.

Existing ordinary positive-quantity rows with a verified definition and no unique payload use the native cap in Rust CAS, batch CAS and export. Unknown definitions and unique-required definitions with missing payload are read-only. Finite-cap definitions with multiple saved rows of the same item ID remain read-only rather than guessing aggregate allocation. UI receives limits from the Worker; it does not infer edit authority.

A separate conservative ingredient candidate flag identifies 37 definitions for later membership research; it does not grant permission to create/delete, prove DLC rights, or authorize changing UID/ownership. Existing draft replay is subject to the same validation, and previously accepted out-of-bounds drafts may fail closed. Existing source values are not normalized merely by opening or exporting an unrelated edit.

Extraction: run `python scripts/extract-inventory-quantity-rules.py /path/to/definitions --check` against the verified source bundle. No network, Unity executable, or personal save is required. Generated file: `core/src/inventory_source_data.rs`.

The ingredient candidate projection is restricted to Common/Uncommon/Rare (2/3/4). Original definition 460708033 has Rarity.Currency (1), so it is not a membership candidate; the separate currency editing contract is not inferred from the Ingredient bit.
