# LDR LUT generation from the original shader (3.0.1)

The Steam globalgamemanagers.assets source was rehashed locally as 2e0b45213e7b65120e5aa72f5e1dd708e46abcc61ff9ceb2645d6f2e055227d6. Original Shader PathID 69, Hidden/Universal Render Pipeline/LutBuilderLdr, 6116 bytes, SHA-256 5693ecc8016831e30a83a33a604376d42a48058c5c86e2f02304eeac0c3e56fe, has one D3D pixel program (index 2, no keywords, SHA-256 0d40ef7d0c280b001f9b94bb2ebb9bf41a26090a1eb95d98c957c7c9146cd2db, 1561 token words). The distinct HDR builder at PathID 89 (8400 bytes, 32b6d65435c907af040437c811774f0f7ba501312d0bc540cc5b32770d823e6f) has separate no-keyword, ACES and Neutral variants and is not implemented by the LDR code.

The source uses uniforms 135–150: flattened LUT dimensions, white balance LMS coefficients, color filter, channel mixer rows, hue/saturation/contrast, lift/gamma/gain, shadows/midtones/highlights, smooth limits, split shadows and highlights. Curve textures 0–7 are master, red, green, blue, hue-vs-hue, hue-vs-saturation, saturation-vs-saturation and luminance-vs-saturation respectively. Their order is 4,7,5,6,0,0,0,1,2,3. The complete source arithmetic is reproduced, including LogC contrast, split toning in gamma space, signed gamma, epsilon in HSV calculations, single-step hue wrap, two 1/256 curve offsets, and output alpha 1.

Original instruction ranges (exclusive end) and SHA-256:
- 49–121: 8c666f8cd7bf12a9a0317ffee6e2d61627b349c0eb74e6988d094f5283b50c3b
- 121–189: 394360fa46a15b4a31363ec9d0ef0eccedd781be9cc18e3ff252d8304deb6017
- 189–320: 4a5fa13302d1a342b1d8f9920f58bc2d1a51458f6e54dd2f7caeab72c00c0454
- 320–711: b0bcdb654b4b0a0b48d1be31e208fb4161ebff0f29a48c03ffa79567948012ef
- 711–898: a4117ca2a2e592cdfe8590e67c319dd5e481911afa1f584d31fe4b6269b9b169
- 898–957: f0923fb57207a52cb64b021d11b69f6441718145fc0e5b2fd2a4f4439099f350
- 957–1135: e37b74f21728d219397710578984a3af25fdae650cd33415b6ff4ec0b10f05ac
- 1159–1344: d5709ab33969d1f36d3f7c0952702b3595de883d1d6553339b07e3748ba91ee9
- 1368–1438: 62a457e290a1397a006365a7d82e3fd5a47fec1ec0beff0d21f1ca13ddc3740f
- 1450–1455: fe872914f9e4930262f9dbba3471b74b6cee9284f90845a600fe6094052616e4
- 1479–1504: 114d289f637ca7666e20179ab3e010d376a7950dcdd86ac39d942ff7fd2a7c68
- 1516–1521: dd0501005128292045eafa51eaed414b7f05e7eea72fff458c5a1b635bc3efba
- 1545–1561: ffd3f36fa1945d9557274b9c211352e7766261e7e37164960d6448329b2cc5f3

Local independent token evaluation of 1024 synthetic LUT coordinates/uniforms with deterministic injected curve samples (including 21 zero-clamped LogC inputs) compared against the complete independently expressed arithmetic: first portion max absolute Float64 difference 5.551115123125783e-16, complete RGBA max 1.5543122344752192e-15. This does not verify GPU precision, texture sampling, actual volume values or authored curve data.

Switch 3.0.1 native ColorGradingLutPass constructor at 57df7c8–57df7dc writes GraphicsFormat 8 to m_LdrLutFormat (+0xEC); the matching dump defines 8 as R8G8B8A8_UNorm. The implementation generates a bounded diagnostic N²-by-N RGBA8 atlas at pixel centers, with explicit uniforms and curve sample callback, no default identity profile. CPU byte rounding is diagnostic only. The companion clamp/bilinear sampler matches the flattened atlas layout used by the earlier LDR post arithmetic. Tests include one exact original token-output fixture and all 4096 texels of a 16³ synthetic atlas. The size bound 2–65 is a local implementation resource limit, not a claim about the actual native configuration.

Remaining: extract runtime volume settings, curve generation/texture data, HDR/LDR selection, target conversion and final camera integration. No original binary published, no production activation, no complete icon fidelity claim.
