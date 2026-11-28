// Transport/display bounds matching the native HKIAHS01 journal. Mutation
// authority and the live inventory batch limit remain with Rust/WASM.
export const HISTORY_MAX_BYTES=32*1024*1024;
export const HISTORY_MAX_ROWS=256;
// Replay allocation is bounded by the remaining serialized bytes, not a
// fixed row count. Net draft verification may contain more than 65,536 rows.
export const INVENTORY_BATCH_TEST_TARGET=65536;
export const MAX_INVENTORY_DRAFT_PATCHES=Math.floor(HISTORY_MAX_BYTES/8);
