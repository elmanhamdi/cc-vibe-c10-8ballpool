Cue stick textures
==================

Drop one diffuse / albedo image per cue here. The renderer picks the file by
**cue id** (the same id used in `src/core/ShopCatalog.ts`).

Expected filenames (PNG is preferred; JPG also accepted as a fallback):

  classic.png     # default starter cue
  street.png      # street cue
  pro.png         # pro cue
  neon.png        # neon cue
  carbon.png      # (optional — style exists, not yet sold in shop)
  legend.png      # (optional — style exists, not yet sold in shop)
  default.png     # fallback used when a per-cue file is missing

Notes
-----

* These textures are applied as the **diffuse (base color) map** on the
  cue mesh's material. Roughness / metalness / normal channels come from
  the GLB's authored material — keep those baked into the mesh itself.
* The renderer clones the material per cue id, so swapping cues never
  bleeds one texture into another.
* If the file is missing the game falls back to `default.png`; if that's
  also missing the procedural cylinder cue is used as a last resort.
* Color space: sRGB (standard PNG/JPG). Power-of-two dimensions are not
  required but recommended for mipmapping.

Where the cue **mesh** goes
---------------------------

The shared cue mesh lives next to the table mesh, OUTSIDE `public/`:

  cc-vibe-c10-8ballpool/assets/meshes/Cue.glb

Author it with **+Y pointing toward the cue ball (tip up)**. The renderer
auto-scales the longest axis to ~292 world units to match the existing
aim / stroke physics.
