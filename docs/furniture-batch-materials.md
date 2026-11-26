# Furniture batch material closure

After offline geometry extraction (PR #205), resolve exact CAB/PathID material, shader and texture dependencies for each successfully extracted model:

```sh
python scripts/batch-furniture-base-materials.py --root /path/to/Steam-source --catalog /path/to/Steam-source/catalog.bin --batch /tmp/hkia-furniture-batch --out /tmp/hkia-furniture-materials
```

The existing material extractor now accepts an optional lazy CAB resolver; its original eager CLI is unchanged. The batch runner indexes only UnityFS directory metadata of original catalog dependency names, then loads only exact referenced CABs within that item's catalog dependency set. It verifies source catalog, geometry receipts and payloads, rejects ambiguous CAB copies and incomplete material closure, preserves per-item metadata and deduplicates identical texture payloads by SHA-256. Unsupported shaders/texture layouts remain unresolved. This is extraction, not proof of native render parity or a production asset pack. Actual game-file batch execution remains unverified.
