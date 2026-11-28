# Icon source updates

Use the existing original-source icon pipeline, not a separate image database. Current published source release is 3.0.1; the Rust supported-save/version gate and each published source hash remain independent and unchanged until the new release is verified.

## Intake and delta (offline)

1. Obtain the original definitions bundle for the previous and new **same-platform** game release, with independently recorded game version and SHA-256. For Steam 3.0.1 the existing source manifests supply the exact original definition, global/mask atlas and 11 dynamic inventory bundle fingerprints; Switch uses its own pinned definition fingerprint. Do not mix platforms. Use the real original bundle name mapping from the game's catalog, not guessed numeric filenames.
2. Generate local metadata snapshots; keep the baseline for the next release. Example (PowerShell or shell; substitute actual paths, version and fingerprints):

```sh
python scripts/icon-source-update.py snapshot --version 3.0.1 --platform steam --definitions /original/definitions.bundle --expected-definitions-sha256 ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0 --out baseline.json
python scripts/icon-source-update.py snapshot --version 3.1.0 --platform steam --definitions /new/definitions.bundle --expected-definitions-sha256 <actual-new-sha256> --bundle atlas_global=/new/atlas_global.bundle --bundle atlas_iconcolormasks=/new/atlas_iconcolormasks.bundle --out candidate.json
python scripts/icon-source-update.py diff --before baseline.json --after candidate.json --out delta.json
```

3. Add every available named original source bundle via repeated `--bundle NAME=PATH` (including all original dynamic inventory bundles, any new ones, shader/prefab and other dependencies). The delta distinguishes absent input from a real deletion, and byte-identical source bundles from changed sources. It records every Item ID and exact serialized GUID, original Sprite PPtr/object hash, field/schema hash, native unique/dynamic flags, and unresolved references. GUID moves are evidence for review, never save remaps. The candidate version label is operator-provided, not inferred from the Unity engine version.
4. Re-extract added/changed definitions and original sprite dependencies, following the existing source-bound extractors; update affected result routes, source overrides, collection/inventory packs, dynamic masks/characteristics, growth and decorator assets, localized names and shared source maps. A stable Sprite PPtr alone is not proof of identical pixels; check referenced textures, named overrides, shader/prefab changes, mask GUID and actual source version. Reuse only byte-identical, independently verified dependencies. Review missing bundles, unresolved sources and altered type trees first. The generic intake handles supported UnityFS/serialized-file layouts, not arbitrary future serializer changes; stop on unsupported layouts.
5. Keep the current released assets intact until the candidate routes close over the complete original definition set and the existing real render and version-specific save tests pass. Update the pinned manifests, asset hashes, source tables and cache version keys as one coordinated release PR; activate Rust save support independently only when its own compatibility/operation checks pass. Do not turn a metadata delta into authorization to edit a new save format. Verify actual Pages publication and game display separately.

The intake script is read-only toward originals; it creates only the explicitly named new metadata output files, never overwrites a previous snapshot, generates no published imagery, and does not activate a candidate. Existing pinned extractors and CI keep their release-specific exact checks. The delta is a prioritized extraction/review input, not yet an automated pack generator for an unseen version.
