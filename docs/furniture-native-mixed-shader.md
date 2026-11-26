# Static mixed-shader furniture diagnostic — Steam 3.0.1

Original definitions bundle SHA-256 ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0, CAB-46b8f8fe122147493b3113f7c1c8cd0f:-6681258383375895387, CustomLit SHA-256 7c32f4b3f7c0c0d580af1e22584952aa29d266dfbe98de3b916c3fecb7339931. ForwardLit vertex blob 48 and pixel blob 673 (single CUSTOM_RIMLIGHT_ON, SHA-256 5e438ee43cebafb4fc0ca6e0f22a7fd16e4d8951d14d7f49b902319819c6e26c), parameter blobs 0 and 193. Local original token evaluator verified 128 synthetic surface/lighting inputs including endpoints of cube blend, with max Float64 error 4.44e-16 for lighting. The shared furniture lighting and rim arithmetic matches CustomLit for this ordinary fog branch. The surface does not have patterns, uses base alpha/material-alpha and the sampled combo alpha for emission. Original furniture pixel 103 also uses sampled combo alpha (472 and 1006), so the source-bound multi path selects it rather than a synthetic uniform mask. The legacy direct synthetic diagnostic retains its explicit uniform behavior. CustomLit underwater, animation, non-opaque alpha, other shader variants and other material objects are rejected.

Verified block fingerprints (exclusive end):
- 106–131 5ee7b0a84cbfac0fd9f6c0d2c74dd301f1d9d0c7b10f69a2f8652e320917bb82
- 145–217 e8794c569b8b56824a9d87ff78ca9ae736ddd8636ce5d4334e587acb2280e5cd
- 359–367 d9b34e93382ffeee0c28d8908029b02f66b70492178e0608bdb2f444922a64f8
- 381–525 2a7ff6bd036bb2634d5602aa93c3d3d1a54eaad2de0867bb701c0f6d5a64aea3
- 539–688 fd8e4175647ae70b5a13d3c2fb60916ba0a91719451c755cc4ffe5f4f11a83f4
- 725–743 484b5359d17dba2942d3ff7570a138d2e825f7d4476d5f12897977359feb52d4
- 744–963 196448492b1fcad0fbb54451e1c05e076899a34b491d3b0ef6760fe4671ee360
- 963–1196 3162381f43569c996cd9cad67521a4d0e6df392de51002f75e671299c5150cf0
- 1414–1485 8b083778728d3efb23325f32b4092fb9ca9386c03a250935a0257cbdccf4e4de

Six original GIVE25 items 1084153252, 1415214992, 16221227, 1951204007, 712392454, 746070047: 2 MeshRenderers, 3 authored material ranges each; fixed Sparkle and fixed CustomLit bow plus separately customized candle. All 18 static draw ranges, 73,487 triangles, source textures and both reflection cubes rendered in one Mesa GLES context using adapted local GLSL and explicit diagnostic lighting, camera, and CCW/back culling convention. Three original palette choices (533 default, 518, 520) produced 18 distinct per-item outputs, unchanged alpha planes within each item. Source catalog has 33 or 34 choices per item (201 total); three variants share the same special pattern GUID but different UV transforms, not included in this draw test. The browser implementation now resolves all required materials and uploads all payloads and compiles both programs before first draw; it still fails on unsupported sources. No native scene/vertex-light parity, final sRGB conversion, runtime flame/effects, WebGL2 or Pages verification or complete game icon parity is claimed. No original asset bytes or prerendered combinations are published by this change. Local interpreter/harness not yet part of the canonical CLI.
