# Original mipmapped wand sources (v3.0.1)

The final 47 distinct Sprite PathIDs in the 5,020-definition-Sprite census are
HK50 anniversary-card originals. Each belongs to exactly one Item ID and
references a distinct 512 x 512 standalone Texture2D. The Steam definitions
bundle SHA-256 is `ba9f3f97d1598a6923d2f804a704ab356c33866aa2d5f03bf11003735419e9e0`.
All 47 have format 10 (BC1), ten mip levels, zero stripped levels, sRGB,
bilinear filtering (1), anisotropy 2, mip bias 0, clamp U/V and repeat W.
Every Sprite has a 512 x 512 zero-origin rect, centered pivot, zero border
and zero trim offset. Each original texture stream is 174,776 bytes.

For the editor's 84-pixel content grid and original 0.4 source transform,
the texture minification ratio is 512 / (84 * float32(0.4)), giving
LOD 3.9296106506. Use the original nearest mip level 4 (32 x 32), decode
BC1 and bilinearly sample in linear RGB at the same 34 pixel centers
used by the ordinary source pack. This is a fixed editor-grid source
sampling choice, not an observation of the game's GPU mip selection,
streaming residency, native viewport, or framebuffer.

The 47 source cells are packed in one 340 x 340 lossless WebP with separate
RGB and alpha planes. Extraction verified every decoded level-4 alpha
sample is opaque and lossless WebP readback matches the generated RGB
bytes. The 72,600-byte WebP SHA-256 is
`5036ed1c7f0d08315364d34dff8f77a62cd10ec9d2a0f1f2c7120486fe23002a`.
The 22,293-byte manifest SHA-256 is
`173d88da94f5bdc04f9401a67d559cf245db9e45a1d8dbeea981844f7dd297c6`.
Individual original texture stream, level-4 block, and sampled RGBA
hashes are retained. The runtime validates asset hashes, source Item ID,
geometry and exact original Sprite identity before using the common
nine-shape compositor. Neither edit eligibility nor save mutation changes.

The remaining-single-mip pack (#407) excludes precisely these 47 sprites.
Together with its 1,816 sprites, the earlier 3,150-sprite pack and the
seven dedicated template/non-square sprites, the source census is
5,020/5,020. This count is conditional on integration of all the scoped
PRs and does not establish game framebuffer parity. The renderer still
composites locally on demand, with existing cache bounds.
