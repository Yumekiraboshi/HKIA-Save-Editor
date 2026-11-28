# Auxiliary source extraction for icon release updates

Run against the exact source snapshot and original definitions before family runtime manifest assembly:

```sh
python scripts/extract-icon-auxiliary-source.py --snapshot candidate.json --definitions /original/definitions.bin --reviewed-layout native-icon-auxiliary-v1 --out auxiliary.json
```

Review the candidate native type trees and managed detail layout before selecting this adapter. The script uses the existing typed original object reader, walks the parallel native key/value arrays, preserves exact characteristic IDs and swatch references, magic icon PPtrs and RGBA, Fleck material references and RGBA, seed/troweled Sprite references, and nine (3.0.1) authored wand overlay transforms. Counts are not assumed for later releases. Source snapshot/version and raw configuration identities are retained. For the pinned Switch 3.0.1 baseline the source projection is compared to the current chef, wand, growth and overlay manifests. Missing swatch RGB remains explicitly unresolved until the matching original dye-config bundle is extracted; no prior-version color is inferred. External Sprite dependencies must still be resolved and staged by the shared atlas pipeline. This does not activate new save support or claim game-framebuffer parity.
