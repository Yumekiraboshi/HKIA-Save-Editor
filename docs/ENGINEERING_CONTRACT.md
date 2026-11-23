# HKIA Save Editor — permanent engineering contract

Status: normative, 2026-11-22. Applies to all agents, PRs, releases and workstreams. If a README or historical migration note conflicts, use the latest explicit Owner decision. Deviations require an explicit Owner decision **before implementation**.

## 1. Product, scope and priorities
- Product: **HKIA Save Editor** under **ゆめきらぼし**. No community, accounts, backend save storage, or unnecessary service infrastructure.
- Public canonical repository: `Yumekiraboshi/HKIA-Save-Editor`; GitHub Pages is the live preview. Do not create a new private development repository.
- Priorities: **data integrity > correctness > shipping a verified usable feature > dependencies > parallel speed > optimization**. Finish-First means implementing end-to-end operations, not accumulating plans, documentation or redundant QA.
- A small user-facing editor with a game-like full-viewport UI; no persistent header/footer consuming workspace, verbose technical labels, or accidental destructive one-click actions. Confirm removal of completed/collected records because timestamps are lost.
- All game-supported languages are in scope. Names, categories, IDs and images must derive from verified native assets. Keep user-facing UI minimal; internal source details belong in code/test data, not tiles.

## 2. Mandatory architecture
```
Svelte 5 UI → typed TypeScript RPC → Module Web Worker → Rust/WASM → Rust core
                                      ↕                  ↓
                              read-only data        validated Save I/O
Browser IndexedDB: original local copy, recovery draft, history checkpoint; no cloud saves
```
- **Use this as the starting architecture, not as a migration target.** A JS-only prototype followed by a Rust rewrite is prohibited.
- **Rust Core is the sole authority** for save format/version detection, decompression, native schema, indexing, operation planning and game rules, eligibility, bounds/validation, CAS/atomic mutation, undo/redo/history, lossless preservation, writing, reparse and export.
- TS/Svelte are for rendering, UI interaction, search/filter, localization, file-picker, progress display, asset rendering, safe browser storage and typed Worker transport. Worker TS marshals data and invokes native exports; it cannot act as an alternative native editor or independent validation authority.
- A UI may propose intent (e.g. “complete this achievement” or “revoke this collection record”) and capture the user-selected timestamp. **Do not calculate authoritative target progress, parent completion/revocation, native ownership, entitlement, new record bytes or write permissions in TS.** Rust determines them and returns a result.
- The previous `src/achievement-quick.ts`, `src/achievement-parent-auto.ts`, `src/collection-eligibility.ts` and `src/achievement-progress.ts` TypeScript rule planners have been migrated to Rust/WASM and deleted. New save mutation, eligibility and native goal rules remain Rust-only; the TS display layer must not duplicate them.
- JS/MJS/CJS is permitted under `scripts/` and `tests/` for development, generation, CI and verification. **No JS source runtime modules under `src/`**, no fallback JS writer, no second engine/session/registry. Source percentage in GitHub Languages is not an architecture quality metric.

## 3. Save integrity contract
Input → bound/validate → decode → index → plan → diff → CAS/atomic apply → encode → independently reparse → verify → export.
- Work entirely on user device, in a Web Worker where large save processing is involved. Never upload source saves or edit the only copy. Offer a backup, export under a different filename, and preserve unmodified bytes, unknown fields, exact integers/timestamps and version-specific records.
- Reject unsupported formats and operations safely; never silently downgrade, weaken size/security bounds, synthesize unknown IDs/entitlements, grant rewards, or overwrite unrelated records.
- New achievement/collection creation is restricted to source-verified IDs and compatible game versions; distinguish a collected-history flag from item inventory/ownership, DLC access or an online achievement.
- Undo/redo and recovery must be atomic and restore exact prior data. A failed operation must never yield a partially edited output.
- Public Git, CI artifacts, logs, issues and Pages must not contain genuine personal save files, tokens, private keys, account/online IDs or other sensitive records. Synthetic and verified non-sensitive game data are allowed.

## 4. Native evidence, graphics and UI
- Use game-source assets and source version/hash where possible. Do not populate missing definitions with guesses or promote an unverified version as confirmed.
- Original game-derived images may be used under the Owner's published policy with concise rights attribution; do **not** copy images from a community wiki or imply ownership/official affiliation.
- A recolored 2D sprite approximation is not an exact 3D shader/material render. State that distinction in developer documentation; do not misrepresent incomplete fidelity.
- Collection search is available across levels; achievement search, native category hierarchy, history timeline and confirmation of destructive removals should remain intuitive. Unimplemented features may be greyed out instead of blocking the entire editor.

## 5. Development and proof
- Implement cohesive vertical slices: actual source mapping → Rust operation → Worker RPC → Svelte UI → native/synthetic roundtrip → Pages smoke. No extensive parallel approval chain or duplicated always-on QA gates.
- Keep one scoped PR per independently mergeable responsibility. Rebase only with informed coordination; avoid force pushes, unrelated edits and overwriting concurrent streams.
- `cargo test`, Rust/WASM build, TS/Svelte checks, targeted Node tests and Pages/Chromium smoke are appropriate. Safety-critical export paths require roundtrip verification. A passing synthetic test is **not** proof that a console/Steam game accepted the result; report evidence precisely.
- The `architecture` CI job must be green before the build/deploy job. Do not remove the check or weaken policy to make a failing PR pass. Fix the cause or explicitly request an Owner-approved contract revision.
- For true branch-level enforcement, the repository Owner must make `architecture` and `test` required status checks in a GitHub Ruleset for `main`, with PR-only changes and no bypass. CI alone prevents the deployment job, but **cannot** prohibit merging or direct pushes by itself.

## 6. Explicitly prohibited shortcuts
- JS/TS-first native editing, duplicated Rust/TS game-rule calculations, unverified source mappings, silent fallback writers, direct save-network transmission, publishing private game assets/saves, using wiki captures for native renders, masking failing checks, and claiming unsupported features are finished.
- Outdated private-repo rules, heavyweight SSOT/QA/hand-off bureaucracy and repeated parallel coordination must not override current public-repo Finish-First decisions.
