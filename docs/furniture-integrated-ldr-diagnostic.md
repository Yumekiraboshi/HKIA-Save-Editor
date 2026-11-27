# Integrated LDR preview diagnostic and original side-table alpha evidence

The forward draw entry point now supports explicit transparent RGB clear on the raw-frame path, verifies the actual clear readback is uniform and alpha zero, and records raw changes relative to that baseline. A clear-only frame is rejected. The existing transparent PNG path still uses zero clear and refuses hidden RGB contributions. No new production PNG path or forced alpha repair.

The new `renderFurnitureLdrDiagnostic` connects the existing shared furniture renderer to the LDR builder, source curve sampler, prepared uniforms and LDR UberPost arithmetic. The caller supplies the plan, clear RGB and raster size. The convenience function for the serialized default volume is explicit and does not choose effective camera values. The raw forward framebuffer and the graded framebuffer remain separate. Spatially varying vignette compares each graded pixel with its own graded clear, not a single global RGB. The optional opaque comparison view requires an explicit backdrop, UI color/add and stored-to-blend / blend-to-display transforms; it never changes the source alpha. This path is diagnostic-only: no HDR, bloom, native target color-space or actual final-pass selection is established.

## Original base texture alpha, not a guessed mask

Steam 3.0.1 PAPE26 side-table bundle SHA-256 0cbabe9237cce8ea1daa0a7aa385e609db0466454ea418aac018231c524913bf, CAB-9a3da43ca266ea5645a6445a7d9fd3c3. The fixed glass material PathID 8738455483337011380 (a1d4aa4fd2c08828c06ae21279fb288a95bc8a4acb8108b5b59928188725796f) binds _BaseMap directly to local Texture2D 8265208118387264786, Decor_PAPE26_Sidetable_C, SHA-256 5bddd429446d9670b38ff1443662a5ed071755620433ce04ed968d4fc51706e4, identity ST. Its original BC3 stream SHA-256 ad0dfa46a56171cf207e3f317e49d949ef0308874c1c93fcf6c5517c3afec027 is 349552 bytes. An independent local inspection of all 21,847 BC3 blocks (10 mip levels, 349,525 logical texels, 349,552 block-padded alpha samples) found both alpha endpoints zero in every block and no selectors with nonzero alpha. This also holds at the smallest mips, not just mip 0. The exact native program 191 outputs BaseMap alpha times _BaseColor alpha, so this material's source fragment alpha is zero independent of the pattern choice or lighting. The RGB blend can still change the scene. This is not evidence of missing alpha during asset extraction. Do not replace it with an invented mask or alpha channel. CLI: `python scripts/audit-furniture-side-table-alpha.py /path/to/original_pape26_bundle` (committed CLI not executed locally; independent source-object and block inspection did execute).

## Local real-geometry re-render

Re-ran the prior adapted Chromium WebGL2 diagnostic with the exact same original geometry, textures, two cubes, camera-relative transforms, eleven treatments and diagnostic lighting. The only change was explicit clear RGB (0.1921568661928177, 0.3019607961177826, 0.4745098054409027), alpha zero, taken from the serialized Steam camera. This passes the serialized numeric values directly as framebuffer clear values; Unity runtime color conversion is not asserted. Chromium read back [49,77,121,0]. All eleven raw frames were distinct; each contained 62903 nonzero-RGB zero-alpha pixels including the clear itself, but only 1057 of those differed from the clear, 3690 changed pixels total, 2633 visible pixels and zero partial-alpha pixels. The glass draw changed 2573 pixels relative to the preceding opaque pass. Prior zero-clear result had exactly the same coverage counts. Changing clear alone cannot resolve the native UI treatment of zero-alpha glass contributions.

Raw RGBA8 frame hashes (bottom-up, adapted local WebGL2 diagnostic only):
| Treatment | SHA-256 |
|---|---|
| 376 | 96207d6f9f11fd972aa23e7e7fb2e50deb9d3d915ea4ce53e4bc990520398d45 |
| 377 | ea5805d8838cdb1736ed337e5bf0b29722e6748310b41c4ce15bfcb03e79fa2d |
| 378 | feff845ecde1eabd34c899abc99f250028d5db2a68c3f2ba49813eb0567d5a87 |
| 379 | 6f315bd5cd0959b0e5a6865ea648a75c77d612557b2a18c1acb71e6f7f73c9e5 |
| 380 | 6925fe3903873f1048af9e952f7dc6b849375bdf2b4e742a2a628b5d2df1820d |
| 381 | ec5b218c65d328e55c62aa73400623758486df3665c1395aa5ab37855cc5409b |
| 382 | fa50f6f252768e486012c055fff9eee6864ba908283f6c5eff846e8cc8105f4c |
| 383 | 5324f5796c38bc714aec24e79efc408efca2180558f20df03e65f4b6e792992b |
| 384 | d0aea2a407b8170c10b7971de842dba97bbaa9322e9a320fafb15acd034a0bad |
| 385 | 2fa77b7b194e1fee8ab76803595c888185971ce3b1bbb5dddd2afc92439de748 |
| 386 | 2beedb92b50e48750b501580436f82d15362a29987f384b4b95f10fe93eb9a46 |

Tests cover explicit clear readback and rejection, alpha preservation across the connected LDR pipeline, per-pixel clear comparison with vignette and explicit UI comparison. The local re-render is still the adapted diagnostic, not execution of the new canonical entry point on original assets. The canonical integration uses synthetic regression fixtures. Actual camera settings, actual native preview output and inventory activation remain unverified. No original binaries or rendered production icons are committed.
