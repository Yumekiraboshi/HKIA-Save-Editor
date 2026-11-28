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

## Assemble the release candidate

Use [icon release pack assembly](icon-release-pack.md) after the base/override/dynamic stages. Keep the output outside the repository until every required source route and native runtime dependency is verified; the candidate receipt never activates a release.

The [version-bound browser adapter](versioned-dynamic-source.md) consumes the candidate dynamic page transport with an explicit reviewed version/index digest pin. It is not an automatic release activation.

## Run all reviewed extraction and candidate assembly stages

Use the [one-command icon update pipeline](icon-update-pipeline.md) for a reviewed game release. It verifies original bundle identities, supports exact checkpoint resume and prior-run asset reuse, and emits candidate source blockers without altering current public assets or activating a release.


### Steam 3.0.1 original-resolution execution evidence (2026-11-28)

Executed against the original definitions, atlas_global and all 11 dynamicinventory_icons bundles, fingerprinted against the existing source evidence. No raw bundles were committed. Native source snapshot: `4a648fd546d4538eb37e1b719003e768cb2d9d71a0c3e858e92322619aac6eee`.

- Base UiIcon: 12,163/12,163 item references, 5,020 unique WebPs, 135,168,196 bytes; receipt `0f5267c517e4770548e5d23252e5486e2d27fb9c48f53ea25e50a36dc230cc62`. Initial 47 failures were all 512×512 BC1 textures with ten mip levels; validated whole-chain length and decoded level zero, reusing 4,973 already verified images. No unresolved base references.
- Original override: 5,384/5,384 Steam references, 5,384 unique WebPs, 153,498,222 bytes; receipt `facb49a7c47092f5fac6b68e15b40528bf7ba4d74ecbd83d0c4b6d4ea5ec472f`. Steam count must not be replaced by earlier Switch count.
- Combined item stages: 10,404 distinct content-addressed images, 288,666,418 bytes, excluding indexes and other artwork. Not the final served distribution size.
- Achievement: actual typed LocalAchievementData extraction matched all 820 catalog identities; 559 native nulls, 261 non-null references. Native conversion resolved 254 references (226 unique files, 10,763,774 bytes); 7 references to 3 distinct Sprites unresolved. Receipt `f2f3c9dcc0222e18c6ebe6d3920dae867a05aac60274245c7aa19a8f6e3ea5b8`. Reviewed hierarchy remains required; no inferred fallback for unresolved images.
- Method 3 selected provisionally after a 24-image native sample: 571,608 bytes / 0.629 s vs method 6 549,076 bytes / 2.531 s; exact decoded pixels in both. Not a browser performance measurement.

These are local source-stage results, not a deployed release. Dynamic materials, category/auxiliary coverage, final distribution size, browser memory/performance and Pages still require verification. Existing served artwork remains unchanged.


### Steam 3.0.1 native view/auxiliary completion

- Reused the previously verified achievement stage and resolved all seven remaining non-null references (three Sprite objects) by validating direct texture subrect origin against texture rect minus trim offset. All 820 identities accounted for: 261 original image references, 559 explicit nulls, zero unresolved. 229 unique WebPs, 10,795,666 bytes. Receipt `7e41c8229ac7c66cd0385384b245156c866a40e9ca19a0f732b052e39584b171`.
- Direct typed GameCollectionsGroupDefinition.Icon extraction yielded 25 collection category sprites. The 13 reviewed Inventory tabs match the required CategoryIcons PPtrs across all four original prefab dictionaries (unrelated key differences do not affect these tabs). Required external CAB was recovered from `d_23_7e3a06d4` SHA-256 `062c4326eea8d464adead7874c131da9b1c0942f237876b1eb68df03b3704e99`. All 38 native category routes resolved, 888,856 bytes. Receipt `78bff00d0fafa30fe9edea1a6193d975f873bedace0527b9b607d5cd27773cd0`. Reviewed colored navigation representatives are unchanged.
- Dynamic definition scan: 50 flagged definitions; all recognized families, 181 distinct mask GUIDs. Auxiliary source scan: 132 characteristics, 34 swatch mappings, 13 magic, 3 fleck, 25 flower growth definitions, 9 wand transforms. The original `deferredserviceconfigs` SHA-256 `890b742411b05ecc36d21646994549d69074f64e9452b2332ecc34fe37364f8c` contains 556 swatches with the typed `m_Keys`/`m_Values` dictionary. Swatch colors matched the previously verified 34 mappings exactly. 79/79 auxiliary sprite routes packed into four original-resolution source pages, zero unresolved swatches or sprites. Receipt `5374a8e36e87da91d2abd1b220ba6351cd05a525af7deee76381ee5a074686ba`.
- All four static source stages were archived into 13 ZIP_STORED parts (317,036,623 bytes including indexes and ZIP overhead), with per-part SHA-256 and ZIP CRC validation. Auxiliary and reviewed source census artifacts archived separately (3,114,124 bytes; SHA-256 `8d729325c35e3bb1304989b7e4bbaed3ca3e456d7ed0e8b34aeafe65ae23b2df`). Stored in Owner-controlled Drive, not public raw-game distribution. Upload acceptance and static part sizes verified; remote full byte readback pending.

Candidate only; no production image activation, no save version changes. Full guarded dynamic mask/base/overlay staging, integrated distribution, legacy removal, and real-browser performance remain outstanding.


### Steam 3.0.1 full original-resolution item distribution

- The exact existing catalog Git blob `ba442727afa02d5e40a7e8adda446ad459c97db0` (10,262 items, 25 groups) joins the 12,163 original item definitions. Actual source extraction yields 762 result routes and 152 original placeholder IDs. All 5,384 original override references are bound. Collection keeps its own source route.
- All nine missing standalone wand mask bundles were recovered and matched their recorded Steam SHA-256. Dynamic staging resolved 12,394/12,394 routes (12,163 ordinary UiIcon overlay routes, 50 dynamic base routes, 181 mask GUIDs), 5,201 distinct guarded textures and zero unresolved references. 5,145 textures reused; 47 BC1 assets now record their actual ten mip levels; nine wand masks newly resolved. 129,815,470 original guarded texture bytes. Receipt `ea7ac5908c7da4b96a373b731f6755a0f92bb8510465804d3f39bf74d17c481e`.
- The shared original lossless encoder assembled 327 dynamic source pages (133,677,000 bytes) and the four verified auxiliary pages. Item release receipt file SHA-256 `d1616ee6fe5a454cb0901a124ccdefa05d0d204109fc647293abe089d6df9deb`. Dynamic index SHA-256 `55ba4a635ece156e3b0b3dc885353dfae1795ba5b0bbc957a2c12efa2a4fb9fb`; auxiliary index `daa451fa361ce5e71fcac49b639b0d13f1628b3ac1da9a85096392852e7789a1`; family manifest `98c4aebfdde07bab223123c073751eb736e5ae33ff6a98fa40461fe809cc87d6`. All 12,163 inventory and 10,262 collection own routes have zero source blockers.
- Unified candidate distribution: 10,542 unique static WebPs (296,511,002 bytes), 327 dynamic pages, four auxiliary pages, 10,882 total files, 454,455,436 total bytes including distribution manifest. All file bytes/SHA-256 recorded. The final distribution assembler validates exact original-source identity, file partition and content hashes; it does not regenerate images. This measurement excludes retained old production assets and any future layouts or unimplemented auxiliary presentation features.
- Actual TypeScript decoders accepted all 12,163 base, 5,384 override, 10,262 collection, 12,394 dynamic, 79 auxiliary and 50 family bindings. Real static transport checked the four inventory selection paths, collection, all 38 categories and all 820 achievement detail routes (261 original and 559 direct-parent). Node runtime with SHA-verified Pillow-decoded RGB pages rendered 30 representative native-resolution PNG cases (256×256, 128×128, 54×54), including every dynamic family and all 16 pattern decorator icons. Full family matrix run exceeded the execution limit; not a complete appearance enumeration or native game framebuffer parity test. Chromium local HTTP access was blocked by environment policy, so no real-browser or Pages performance verification is claimed.
- Existing 13 static-stage ZIPs were locally reopened and checked against every one of the 10,542 final static file hashes. Seven additional ZIP_STORED parts (158,035,066 bytes) plus `distribution-backup.json` preserve the remainder in the existing Owner-controlled Drive candidate folder. All ZIP CRCs checked locally; uploads accepted. Remote full byte readback pending. Reconstruct only manifest-referenced static WebP basenames plus additional parts; verify distribution file hashes. No raw game or personal save publication.

Candidate remains review-only. Production UI integration, publishing verified assets on the existing hosting, legacy delivery retirement and live browser performance are not yet complete.
