# Native local achievement icon routing (v3.0.1)

Switch main SHA-256 `64bd5fb69239f57eb0578a1897a45a3c6f5e187480903f83df503b46bf827bfb`, dump.cs SHA-256 `4b4eb6a543722e1dfaf8aad5593e9e1300723aff55e9e750d489744960feb738`. The Steam v3.0.1 source atlas mapping remains unchanged: 198 individual icons, 63 category icons and 559 null individual PPtrs.

- `LocalAchievementModel.get_Icon` (0x2FF1C00) returns runtime data Icon at +0x50; `get_DynamicIcon` (0x2FF1C30) returns null. No item/reward or dynamic reference is inferred for these local definitions.
- `ILocalAchievementModel` interface slots 1 Parent, 4 Icon, 5 DynamicIcon, 16 HasParent. `LocalAchievementViewModel.RefreshData` (0x3B4FF40–0x3B51160, SHA-256 `7fc1b89a52b6ddc8195a228a3bfa4f6c532e442dd5e10420660936fc1fa7ea09`) reads own Icon at 0x3B500E8–0x3B50110; tests alwaysShowIcon (+0x40) at 0x3B50120–0x3B50124. If enabled and own Icon is null, tests HasParent at 0x3B5022C–0x3B50258, gets Parent at 0x3B50298–0x3B502C0, and reads that direct parent's Icon at 0x3B502FC–0x3B50324. Stores selected Sprite in IconViewModel (+0x58, Sprite +0x40) at 0x3B5032C–0x3B50394. It does not recursively walk ancestors.
- `LocalAchievementButtonViewModel` constructs LocalAchievementViewModel(false) at 0x3B4B294–0x3B4B2A0. `LocalAchievementDetailsViewModel` constructs LocalAchievementViewModel(true) at 0x3B4CA40–0x3B4CA4C. Thus the parent fallback belongs to details, not individual list tiles.
- `get_IconIsVisible` (0x3B4F390–0x3B4F4D0, SHA-256 `e4d9d8ed91bda647b6b3e4ae7286ead98f3e2e861661a8c392ebe944a50bad03`) tests the selected Sprite for Unity null. No distinct native Sprite exists for the 559 null definitions in this list route.

The editor uses its existing source-verified hierarchy and atlases. All 559 null leaves resolve to a direct category parent in the edit dialog after both image atlases load successfully, only for v3.0.1; list tiles retain their previous neutral placeholders. Parent images are marked as such in display metadata, not registered as individual source images. No new image assets, inferred item/reward icons, save changes or product scope changes. This is static native evidence, not an in-game capture.

## Independent verified identity and image delivery

The verified individual manifest is sufficient to distinguish the 198 non-null individual source PPtrs from 559 native null leaves. Previously the detail resolver required the individual WebP to be delivered as well, incorrectly withholding parent artwork from all 559 null leaves if only the individual image failed. The individual loader now publishes the validated identity map separately before requesting image bytes; the detail route uses that map and the verified category image. A missing or altered individual manifest still withholds the fallback. A leaf with a non-null individual PPtr never inherits its parent just because its image is unavailable; the list remains unchanged. The test uses the real pinned manifest and synthetic HTTP image failure and verifies all 559/198 cases and corrupt manifest refusal. No new assets or save changes.


## Offline staging from a reviewed original pointer census

`scripts/stage-achievement-art.py` reuses the existing UnityFS, typed Sprite, SpriteAtlas, texture and lossless sheet generation implementation. It requires a complete, separately extracted and reviewed `HKIA.AchievementPointerCensus.1` document with version, platform, definitionsSha256, catalogIndexFileSha256, catalogHierarchyFileSha256, reviewedRouting (`native-local-achievement-direct-parent-v1`), definitionCount, and rows containing saveGuid, sourceKey, sourceGuid (asset GUID, not save GUID), parent (direct parent save GUID or null), and the native iconPPtr pair [fileId, decimalPathIdString]. Only [0,"0"] represents a native null reference. A non-null reference that cannot be resolved or decoded remains explicitly unresolved.

The accompanying `HKIA.AchievementArtBundleInput.1` document binds version, platform, censusFileSha256, and the original bundles list (name, file relative to input, SHA-256). Supply the actual definitions bundle and all Sprite/atlas/texture dependencies.

```sh
python scripts/stage-achievement-art.py --census reviewed-achievement-pointers.json --index candidate-achievement-index.json --hierarchy candidate-achievement-groups.json --bundles achievement-bundles.json --out /staging/achievement-art
```

The tool verifies original bundle fingerprints, complete catalog/hierarchy identity, resolves actual Sprite pointers, groups shared textures, deduplicates Sprite cells and writes verified lossless pages and the `HKIA.AchievementArtCandidate.1` manifest. The output matches the versioned achievement reader contract; it is not live artwork. This stage trusts the separately reviewed pointer census: it does **not** extract the native managed-reference registry or independently prove its per-record pointer offsets and asset GUID crosswalk. The original extraction adapter and real-source proof remain required; never synthesize the census from icon names or a prior release. No production activation.
