# Native flower crown source assets — Steam 3.0.1

The original `definitions` and binary Addressables catalog are pinned by SHA-256. All 25 flower crown inventory definitions have UiIconUsesDynamicColor=false and an empty dynamic mask. Their Visual3D GUID resolves to the precise prefab in the original bundle container. The selected prefab's FlowerRenderer/FlowerRenderers and FlowerItem PPtrs identify the actual mesh, material, and source species. There is one selected static MeshRenderer and one material slot for every crown. Another renderer in the bundle is not substituted for this selected prefab.

The actual 25 original model bundles and 25 material bundles were acquired from the authorized original Steam 3.0.1 files. All 25 exact materials point to CAB-2b27edbfe7f08bad1cd631865ee4eb15:5128141501501259665, not the furniture shader. The meshes have 16-bit triangle indices and either 40-byte vertex stride (17) or 44-byte stride including vertex color (8). The original 75 local texture payloads and 25 mesh payloads were staged and hashed (31,109,700 and 4,567,252 bytes respectively). No game bundles or binary payloads are committed by this PR. The remaining six external texture object references include the three Tulias base/normal/metallic textures, common pattern and surface-effect textures and the reflection cubemap. They are not substituted. The native treatment rules, runtime camera/light/pose, shader behavior and final thumbnail fidelity remain unresolved.

Reproduce from a directory of original file copies named `definitions.bin`, `catalog.bin`, `l_shared_headaccessory_flowercrown*.bin`, and the 25 `ga_art_flowers_flower_*.bin` dependencies recorded in `data/flower-crown-source-index-v3.0.1.json`:

```sh
python scripts/extract-flower-crown-source.py --root /path/to/local/source-copies --out /path/to/local/manifest.json --stage /path/to/private/staging
```

The output metadata contains exact CAB/PathID links, source bundle/object hashes, original vertices/indices, material float/color properties and texture payload hashes. It is pinned to the independently measured manifest digest. Staging is outside the repository. The extractor reuses the original UnityFS and typed-object readers. Local verification used a compatible LZ4/type-tree reader because the repository checkout is not available in the execution container; actual canonical script execution remains pending. No pre-generated color combinations or inventory UI changes.
