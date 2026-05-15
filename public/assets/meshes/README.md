Cue stick mesh
==============

Drop the **single shared** cue mesh here as:

  Cue.glb

Authoring conventions
---------------------

* Format: glTF binary (`.glb`). PBR (MeshStandardMaterial) is preferred — the
  renderer reuses the authored roughness / metalness / normal channels and
  only swaps the **diffuse / base color map** per cue id.
* Local axes: **+Y points toward the cue ball (the tip)**. The renderer will
  auto-detect the longest bounding-box axis and rotate it onto +Y, so meshes
  authored along +X or +Z also work — but +Y is the cleanest.
* Length: free. The renderer scales the longest axis to **~292 world units**
  to match the existing aim / stroke physics (`shaftLen` in `GameEngine.ts`).
* Pivot: any. The renderer recenters along the long axis after scaling.
* Material: the **largest mesh** inside the GLB (by bounding-box volume) is
  the one whose diffuse map is swapped per cue. Smaller parts (tip rubber,
  butt ring, etc.) keep the authored material untouched, so bake any fixed
  details into those parts.

Per-cue textures
----------------

Drop one PNG per cue id at:

  cc-vibe-c10-8ballpool/public/textures/cues/<cueId>.png

See `public/textures/cues/README.md` for the full filename list.
