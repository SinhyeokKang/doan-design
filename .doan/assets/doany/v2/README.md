# Doany V2 — selected Pebble

Status: approved still artwork and runnable canvas prototype; not implemented in the app.

## Source of truth

`doany.png` is an exact copy of `../shape-study/pebble.png`, the user's selected
original Pebble. SHA-256:
`42346ecd5e16cd421bbfffc17d04826f278495f8997cd62564dd6e67d09e6e9c`.
It is not Pebble-D or any D-shape iteration. Do not regenerate or recolor it.

Artwork was created with the built-in image_gen tool using the existing
`../transparent/doany.png` as the material, face and beret reference.
`source-prompt.txt` preserves the original Pebble prompt. The artwork is not
covered by the MIT license of the V1 motion code.

## Review and handoff

Use the SAME canvas, `../../../canvases/doan-mascot.html`:

- `doany-v2-home`, `doany-v2-welcome`: runnable screen drafts. Move the pointer,
  click Doany or press Enter/Space; type and Send in Home to preview a hop.
  No message is sent.
- `doany-v2-selected`: selected still, scale references and delivery status.
- `doany-v2-motion-spec`: static motion storyboard, timings and runtime rules.

Detailed implementation handoff: `../../../../docs/features/doany-v2/`
(`spec.md`, `design.md`, `tasks.md`). When the feature is promoted, replace this
link with the current PRODUCT, ARCHITECTURE and DESIGN references.

## Asset inventory

Ready:

- `doany.png`: unchanged selected still and fallback.
- `body.png`, `hat.png`: generated animation layers in the same 1254 × 1254
  coordinate space. They are visual reconstructions, not pixel-exact crops.
- `mascot.js`: runnable V2 WebGL prototype, isolated with `data-mascot-v2` and
  `window.doanyV2Demo`; retains V1 timing, removes radial edge waves.
- `source-prompt.txt`, `layer-prompts.json`: artwork provenance.
- `LICENSE`: MIT license for motion code, not artwork.

Pending: white app-icon export, application copies/integration, final visual
approval and real-app verification. Do not overwrite `../motion/`.

The canvas reuses V1 screen CSS. V2 fallback padding is 16.5%; shader scale is
1.34, neutral vertical offset .10, body pivot (.5,.60), hat pivot (.67,.30).
Both textures use the same UV coordinates with no extra hat scaling. Eye centers
are (.421,.550) and (.619,.550), radii (.035,.056). These are prototype anchors;
verify visual matching again in the app. See the feature design for handoff.

## Motion contract

Retain V1's time model from `app/src/renderer/doanyMotion.ts`: approximately
3.31-second breathing; initial blink at 2 seconds, then 2.5–6 seconds apart with
260 ms blinks; pointer target held 1.8 seconds; typing attention held 1.4 seconds;
hop 180 ms anticipation + 570 ms flight + 600 ms settling; spring-following beret.
V2 uses its own layer anchors and removes six-lobed radial deformation,
preserving the smooth Pebble outline with whole-body squash/stretch/tilt.
The canvas storyboard is illustrative, not measured animation output.

Preserve Home/Welcome drawing slots (114/142.5 px), keyboard and send triggers,
reduced-motion rest, hidden-view draw gating, static fallback and context cleanup.
Browser preview verified: both textures loaded, WebGL error 0, click hop,
Home typing attention and Enter-send hop, Welcome Enter/Space hop, pointer target,
hidden-view draw pause, reduced-motion rest and injected context-loss fallback.
A rendered 82-pose sweep over the hop with beret tilt sampled at ±.12 rad left
at least 6/7 device pixels of top margin in 228/286 buffers (Home/Welcome).
This sampled probe is not a proof for every possible input combination.
Screenshots and probe evidence are local in `.scratch/doany-shape/`.

Not verified: exact neutral pixel equivalence to the selected still, actual blink
intervals by observation, injected texture-load failure, sustained frame rate,
packaged paths, StrictMode/remount cleanup in the app. The app port must use its
existing rig cleanup and tests rather than copying this preview shell verbatim.
V1 frames and motion remain separately labeled in the same canvas.
