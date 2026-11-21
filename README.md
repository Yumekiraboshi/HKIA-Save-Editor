# HKIA Save Editor

[Open the browser editor](https://yumekiraboshi.github.io/HKIA-Save-Editor/)

An unofficial, browser-local collection-history editor for Hello Kitty Island Adventure.

## Features

- Open supported 3.0.0 / 3.0.1 SaveGameV2 and ZIP backups locally; the save file is never uploaded.
- Browse/search/filter 3.0.1 collection definitions.
- Edit existing collection-history timestamps and, when the save is eligible, add or remove collection-history records.
- Undo, redo, reset and download a **separate edited file**, preserving the original.
- Rust/WebAssembly reader/writer, TypeScript + Svelte UI and a dedicated Web Worker.
- Validate encoded edits by independently re-parsing the generated output. Unrelated ZIP members remain byte-for-byte unchanged.

## Safety and compatibility

- **Keep the original backup.** Game-side persistence has not yet been verified with a genuine save in this restarted project.
- Changes target the Key1 *collection history*, **not** inventory, entitlements, paid items, quests, rewards, or achievements.
- Presence of legacy Key0 data disables add/remove to prevent uncertain cross-version mutations; existing timestamps remain editable.
- Newly added entries require a source-mapped, non-DLC/non-event item in the exact v3.0.1 catalog. Unsupported options are disabled.
- Actual gameplay effects, event eligibility and other linked systems are not inferred from Key1.
- The project includes a synthetic save/ZIP roundtrip test and a compiled WASM ABI smoke test, but no genuine-save browser E2E acceptance yet.

## Development

Requires Rust with the `wasm32-unknown-unknown` target and Node.js 22+.

```sh
npm ci
npm run build:wasm
npm run dev
```

To run the complete CI checks:

```sh
cargo test -p hkia-save-core
cargo build --release --target wasm32-unknown-unknown -p hkia-web-editor
npm run test:wasm
npm run check
npm run build
```

Not affiliated with Sunblink, Sanrio, or the game's publishers.
