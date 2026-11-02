# Doany V2 — selected Pebble

Status: the app's mascot. Approved still artwork and runnable canvas prototype;
the app ships copies of `doany.png`, `body.png` and `hat.png`
(`app/src/renderer/public/doany/`) and the icon resized from `white.png`.

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
- `white.png`: square white logo, the V1 `../white/` method applied to
  `doany.png`: the alpha bounding box scaled proportionally (Lanczos) to 84% of
  the square on its longer side, centred and alpha-composited on pure white, with
  no generated changes. `app/resources/icon.png` is `sips -z 1024 1024` of it,
  as the V1 icon was of `../white/doany.png`.
- `simple/doany-accent.svg`: flat V2 favicon master; accent body (`#973BE1`,
  `--violet-9` / `--affordance-accent` in renderer tokens), black beret and eyes,
  transparent background, no gradients or texture. It traces `doany.png`: the
  body, beret and eye areas were smoothed, reduced to about 35 outline points
  per shape and joined with cubic curves (eyes as fitted ellipses). No generated
  artwork.
- `simple/favicon.ico`: 16, 32 and 48 px Chromium rasters of that SVG.
- `source-prompt.txt`, `layer-prompts.json`: artwork provenance.
- `LICENSE`: MIT license for motion code, not artwork.

Do not overwrite `../motion/` or the other V1 directories.

The canvas reuses V1 screen CSS. V2 fallback padding is 16.5%; shader scale is
1.34, neutral vertical offset .10, body pivot (.5,.60), hat pivot (.67,.30).
Both textures use the same UV coordinates with no extra hat scaling. Eye centers
are (.421,.550) and (.619,.550), radii (.035,.056). The app uses the same
anchors; `doanyRender.test.ts` checks them against the shipped artwork (padding,
eyes, hop headroom). See the feature design for handoff.

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

In the app (built, packaged and development builds; isolated probe, evidence local
in `.scratch/runtime-test/doany-v2/`): the reduced-motion rest frame is
byte-identical to this prototype's, the still image and the rest frame share
their bounds within 1 device pixel, the packaged app loads all three images from
`app.asar`, a texture-load failure and a lost context leave the still image, and
24 Home visits under StrictMode print no WebGL context warning. In the app's
sweep (re-hops while settling, pointer at the far left) the beret came within 1
device pixel of the top in both 228 and 286 buffers, never past it.

Not verified: exact neutral pixel equivalence of the generated layers to the
selected still, sustained frame rate. V1 frames and motion remain separately
labeled in the same canvas.
