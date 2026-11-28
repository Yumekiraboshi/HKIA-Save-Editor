# One-command native icon update

Use the original game bundles and the same-version candidate shared collection catalog. Review the native layouts first; the input file is an explicit assertion of that review, not an automatic compatibility guess. Keep all originals and candidate outputs outside the repository.

Example local input (replace paths and hashes with actual original SHA-256 values):

```json
{
  "schema": "HKIA.IconUpdateInput.1",
  "version": "3.0.1",
  "platform": "steam",
  "reviewedLayouts": {
    "outfit": "outfit-icon-override-v1",
    "atlas": "unity-v22-uiicon-v1",
    "dynamic": "native-dynamic-v1",
    "auxiliary": "native-icon-auxiliary-v1",
    "result": "native-result-icon-v1"
  },
  "bundles": [
    {"name":"definitions","file":"original/definitions.bundle","sha256":"<actual sha256>"},
    {"name":"atlas_global","file":"original/atlas_global.bundle","sha256":"<actual sha256>"}
  ],
  "overrideBundles": ["definitions"],
  "catalog": {"file":"candidate-catalog.json","sha256":"<actual sha256>"}
}
```

Include all actual base/mask/override/auxiliary bundles, not just the example two. `overrideBundles` selects actual completed-image containers; `overrideDefinitions` optionally specifies an explicitly reviewed separate platform definition bundle (platform/file/sha256). Cross-platform ID/key/GUID closure is checked by the existing assembler. Add the reviewed original swatch layout described in [auxiliary assets](icon-auxiliary-assets.md) when the dye configuration is available. Missing source data is never substituted with guessed or previous-version artwork.

```sh
python scripts/update-icon-release.py --input release-input.json --out /staging/3.0.1-candidate
python scripts/update-icon-release.py --input next-input.json --out /staging/next-candidate --previous-run /staging/3.0.1-candidate
# After an interrupted command, repeat the exact invocation with --resume.
```

The command fingerprints the provided originals/catalog, checks the reviewed source layouts, runs each existing extraction/assembly script, and atomically commits completed stage directories with content digests. Resume verifies the exact run input and implementation identity, dependency digests and every retained stage file; changed code/input requires a fresh run. Previous-run reuse uses validated previous-stage receipts and the existing source-identity checks. No original or live public file is changed. Stage subprocesses release large decoded bundles between stages. The final summary is steps/summary/candidate.json; it links the generated release, auxiliary pages and family manifest and lists source blockers. This is intentionally a review-only candidate, not automatic publishing. All original definition UiIcon PPtrs are staged for wand overlays, with shared lossless guarded source pages and rectangular logical geometry. The summary reports unresolved original UiIcon IDs separately from inventory main icon routes. This does not change wand ingredient eligibility. Full-source staging size and actual candidate browser/game behavior require measurement before release; source-specific decorators also remain to be verified.


## Include achievement and category artwork in the same run

In the existing update input, optionally supply both reviewed original pointer censuses and their exact same-version catalog files. All entries use the existing `{"file":"relative/path","sha256":"actual SHA-256"}` shape:

- `achievementArt`: `census`, `index`, `hierarchy` (see [achievement icon routing](achievement-icon-routing.md)).
- `categoryArt`: `census`, `scope` (see [inventory categories](inventory-native-categories.md)).

Include actual source bundles for these references in the existing `bundles` list. The pipeline checks each input hash, source platform, definition fingerprint and category scope against the current item/collection catalog, then invokes both existing native staging tools in atomic, independently resumable stages. The summary includes manifest paths and exact file SHA-256 pins in `viewArtwork`, explicit unresolved references, and `missingViewArtInputs` for omitted reviewed inputs. Explicit native nulls are not counted as delivery failures. A partial candidate remains review-only; omission does not authorize production activation. This extension does not extract the pointer censuses themselves or prove new game-version rendering compatibility. Existing growth/magic/chef swatch stages remain in the same command. Additional decorator routes, prior-stage reuse for the two view-art stages, and actual original-source/browser validation are still required.
