# Content-addressed furniture payload transport (v3.0.1)

The existing native mesh, texture and cubemap manifests define the source allowlist. The browser does not trust a downloaded pack index to authorize requests, and does not use unverified inventory fields as filenames. The transport is display-only and does not read or upload a save.

## Local staging

Run the existing stage-furniture-native-assets.py and stage-furniture-chair-patterns.py commands from docs/furniture-multi-renderer.md. Then run:

```sh
node scripts/pack-furniture-native-payloads.mjs --stage /tmp/furniture-stage --patterns /tmp/chair-patterns --out /tmp/furniture-payload-pack
```

The packer checks every extracted file's exact size and SHA-256 against committed manifests, deduplicates equal kind/digest pairs, and builds a new directory outside the repository. It publishes nothing. The four geometry, 25 texture and two cube references (before deduplication) are drawn from the existing original source metadata. The pack contains only extracted renderer inputs, not whole game bundles or individual rendered variants. An index is emitted for offline inspection. A verification failure removes the temporary output.

## Browser consumption

`furniturePayloadReferences` derives references from the same pinned furniture source manifests used by the multi-renderer diagnostic. `createFurniturePayloadReader` implements the existing `ReadRugPayload` signature; pass it directly to `drawFurnitureMultiDiagnostic` when serving a verified pack at an explicitly configured same-origin local diagnostic URL. There is no automatic network fetch on import. The reader rejects invalid or unknown reference triples, redirects and cross-origin roots, reads only the expected byte count, verifies SHA-256 and gives each caller independent bytes. Concurrent equal requests share one fetch; a 32 MiB LRU cache retains verified immutable blobs. Failed loads are retryable. Native mesh/texture/cubemap upload checks remain in force.

This is a diagnostic transport and not an activation of furniture variant art in the editor. The packer and reader have synthetic tests and a manifest-reference agreement test; actual native staging and browser draw verification of this transport are outstanding. Native scene and shader fidelity remain unresolved. No production payloads or new UI routes are added here.
## Export local browser diagnostic images

After staging the pinned four models, 25 textures and two cube payloads, use the existing content-addressed reader and diagnostic image renderer:

```sh
node scripts/furniture-png-native-smoke.mjs --pack /tmp/furniture-payload-pack --item rug --out /tmp/furniture-rug-diagnostics
node scripts/furniture-png-native-smoke.mjs --pack /tmp/furniture-payload-pack --item chair --authored-camera --out /tmp/furniture-chair-diagnostics
```

The rug covers six source material indices (207–212); the chair covers ten source slot combinations. Both use the authored preview camera and static source bounds in these commands. Lighting, runtime root pose, cube orientation and final Unity color/post-processing remain diagnostic. PNG output is optional, local-only, atomic, and accompanied by a report with pixel and PNG hashes. The output must be a new directory outside the repository and source directories. No generated image is promoted to the editor's production artwork.
