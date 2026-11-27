# Multi-model native source pack smoke

Run on a local machine with the repository's installed dependencies, Chromium and an original-source pack staged using the existing assembler/stager:

```sh
node scripts/furniture-pack-native-smoke.mjs \
  --pack /path/to/staged-pack \
  --manifest-sha256 <independently-recorded-sources.json-digest> \
  --manifest-bytes <independently-recorded-byte-length> \
  --item 302413286 --limit 64 --size 160
```

Use --offset and --limit (1–256 cases per invocation) for bounded scans; omit --item to scan every model in the pack. CHROME_BIN overrides executable selection. Input path must be a staged directory, not a ZIP. Manifest pin must come from independently reviewed extraction/staging evidence, not the untrusted downloaded manifest itself. Staged files stay local: Playwright fulfils same-origin requests from the allowlisted directory, checks SHA-256 and exact length before sending bytes to the browser, rejects path escape, and the existing browser pack reader revalidates the manifest and individual payloads. No remote server, original binary publication or pre-generated production artwork. Do not publish the local source directory automatically.

The original 3.0.1 catalog contains 649 customizable models, 1089 assigned slots and 26274 slot choices (including source defaults once per slot). Enumerating each model's single all-default tuple, then changing one slot at a time to each allowed nondefault index, yields 25834 diagnostic cases across the full catalog, rather than a Cartesian product. The four previously committed sample model identities yield 108 cases; side table 302413286 yields 11. These counts describe the schedule, not render readiness. The actual run is restricted to model IDs present in the pinned pack and can still fail on absent pattern data, unsupported shader/geometry or payload validation.

The smoke invokes the canonical source-pack fetcher, authored camera, static bounds fit and raw framebuffer renderer for each case. All draw errors are recorded by case and summarized; successful raw frames retain alpha/RGB counts and SHA-256. No PNG export or forced alpha, no rejection merely because two source appearances may legitimately look identical. Synthetic scene lighting, cube orientation, BC1 RGB choice, identity root, zero clear and native camera relative transforms are explicit diagnostics; the report is not proof of Unity scene/output parity. Exits nonzero for any failed cases or route failures, while retaining the JSON report in stdout. No actual live volume or LDR pipeline activation by this script.

Local work environment has the original side-table and other source bundles, but the earlier 118-model staged pack is not present and git checkout via container cannot resolve GitHub. The actual pack runner has not yet been executed on the complete original asset pack here. Catalog counts were computed from the current committed catalog; tests verify the complete schedule and known original side-table choices. No new models, native icons, Pages deployment or product UI activation are claimed.
