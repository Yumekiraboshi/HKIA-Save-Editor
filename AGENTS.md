# HKIA Save Editor — agent development instructions

Read [docs/ENGINEERING_CONTRACT.md](docs/ENGINEERING_CONTRACT.md) before any implementation. It is the project-wide, normative contract; this file is the concise agent entrypoint.

- Canonical repo: public `Yumekiraboshi/HKIA-Save-Editor`. Product name: **HKIA Save Editor**. Organization/project name: **ゆめきらぼし**, never kanji branding.
- **Final architecture from the first implementation:** Svelte 5 + TypeScript (UI, typed Worker RPC, browser storage and display) + Rust core compiled to WASM in a module Web Worker. One authoritative Rust save engine; no JS/TS save engine, writer, parser, or domain-edit fallback.
- Rust owns native save parsing/validation, version/source gates, mutation semantics and planning, CAS/transactions, history/Undo/Redo, encoding, export, and independent reparse checks. TS may request an operation, handle UI inputs, render artwork, and persist a recoverable local draft; it must not determine game-specific save mutation results.
- All previously tracked TS game-rule planners (achievement click, category parent, collection creation eligibility and progress display goals) have migrated into Rust/WASM. No new TS mutation/eligibility/goal planner may duplicate the Rust source rules.
- No remote upload of player saves. Local processing only. Preserve original file and unknown records/fields/precision. Exports must be safely revalidated; never invent progress, records, timestamps, entitlements, GUIDs, items, or source claims.
- Use original verified game data and game-derived images; no wiki image copying. Label approximations honestly. Unsupported functionality remains disabled/greyed out.
- Finish-First: complete one usable feature from actual import through edit/export/reopen/Pages; avoid redundant QA gates, elaborate coordination, or research that delays it. Always preserve data-integrity tests.
- CI architecture check is mandatory before build/deployment, but static checks cannot prove every semantic boundary. Review any TS that computes a save edit, especially existing exceptions.
- GitHub workflow: small scoped PRs to public `main`; don't force-push, bypass failing checks, leak private source assets, or claim implementation not merged/verified. Browser checks on GitHub Pages; clearly distinguish synthetic proof from real-game validation.
