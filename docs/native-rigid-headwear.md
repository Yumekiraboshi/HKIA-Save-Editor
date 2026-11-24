# Source rigid headwear batch diagnostic (3.0.1)

The local prototype rendered 22 actual Item IDs in four headwear families: WitchHat (5), FrankenHat (7), MonsterBeanie (7), DetectiveHat (3). It used the original definitions SHA-256, actual item-to-outfit and outfit-to-shared PPtrs, source GameObject/MeshFilter/MeshRenderer/Material and map PPtrs, plus the original dye palette. The shared definition to GameObject association is based on the exact matching original name and pinned identifiers, not a recovered prefab GUID binding. The missing palette channels retain Material defaults. Vertex channel records specify the 32- or 36-byte layout. Three families use BC1 PatternMap, whereas WitchHat uses BC3. The original mesh projection is reused per family across variants.

Run the common offline diagnostic with NumPy and Pillow:

`python3 scripts/render-native-headwear.py /path/to/definitions --out /tmp/hkia-headwear`

The local prototype produced unlit 128px renders; the checked-in refactor reuses the existing projection and scalar-checked albedo path. The committed source-run is still to be checked. The shared camera is a diagnostic parameter and does not imply the actual game camera. Normal and tangent attributes are read and validated, but no lighting, GPU sampling/gamma, ComboMap effect or cross-family reference fidelity is established. Do not publish or register the results as original or exact icons.
