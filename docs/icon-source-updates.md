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

## Completed IconOverride artwork staging

The typed 3.0.1 Switch snapshot now additionally extracts all 5,384 original OutfitItemDetails.IconOverride GUIDs and cross-checks every pair against the existing verified source table. For a new release, add `--reviewed-outfit-layout outfit-icon-override-v1` to snapshot only after verifying the same managed class layout in the new native type dump; changed layouts require an adapter. Existing older snapshots can still be diffed; regenerate the baseline snapshot for staging. This reads exact GUIDs, not inferred names.

Use a local input manifest with explicit release, source platform, the snapshot's printed SHA-256 and actual original bundle file paths/hashes. The source platform can differ from the typed definition platform only by this explicit declaration; the existing 3.0.1 pipeline uses Switch definitions and Steam images. Include definitions and all original dynamic inventory bundles. Example shape (replace placeholder hashes and paths):

```json
{"schema":"HKIA.IconOverrideBundleInput.1","version":"3.0.1","platform":"steam","definitionSnapshotSha256":"<snapshot hash>","bundles":[{"name":"definitions","file":"/original/steam/definitions.bundle","sha256":"ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0"}]}
```

```sh
python scripts/stage-icon-overrides.py --snapshot candidate.json --bundles original-bundles.json --out /staging/icons-new --previous-stage /staging/icons-old
```

Requires Pillow for actual decoding, and uses the existing original BC3 decoder. Resolve exact GUID -> AssetBundle container -> local Sprite -> Texture2D, confirm the original definition key and verified 256px Sprite geometry, then produce lossless 96px WebP using the existing layout. No approximate/name-only selection. The previous stage is optional: reuse only if exact Item ID/GUID, original Sprite object, Texture2D object, compressed texture bytes and renderer revision all match, with the previous WebP digest validated. A changed bundle may still contain unchanged individual image dependencies. New or changed bindings are decoded. A missing source is listed explicitly; conflicting/unsupported bindings fail instead of guessing. The output directory is created outside the repository and contains staged original images and one source receipt, not a second production database. Staging is never a publication or release approval. Other native sprite/atlas and dynamic-compositor families still require their existing source-specific extraction steps and candidate closure checks.

## Shared base atlas and dynamic source staging

Use [native icon atlas staging](native-icon-atlas-staging.md) for the normal original UiIcon layer and [dynamic texture staging](dynamic-icon-texture-staging.md) for candidate dynamic masks and original base texels. These reuse the same original SpriteAtlas/Texture2D resolver and decoder; only the transport differs (96px reference cells versus original unresampled RGB/alpha planes). Both preserve unresolved references and remain outside publication until final source route/pack closure.
