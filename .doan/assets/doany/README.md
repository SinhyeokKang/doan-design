# Doany assets

The current mascot is V2, the selected Pebble: its artwork, motion prototype and
flat logo are in `v2/` (see `v2/README.md`). `shape-study/` holds the shape
explorations that led to it. Everything else in this directory is the V1
six-lobed mascot, kept as a record; the sections below describe V1.

Source artwork and motion prototype. The app ships copies of the still image and
textures (`app/src/renderer/public/doany/`), a port of the motion
(`app/src/renderer/doanyMotion.ts`, `doanyRig.ts`, `Doany.tsx`) and the icon
resized from `white/doany.png` (`app/resources/icon.png`); these files are the
sources, not loaded by the app.

- `transparent/doany.png`: plush mascot, original pre-accent lavender,
  transparent background with no ground shadow.
- `white/doany.png`: square white logo, composited from the transparent master without
  regeneration or recoloring. The alpha bounding box is scaled proportionally
  to 84% of the square on its longer side and centered on pure white.
- `simple/doany-accent.svg`: preferred favicon master; flat accent body
  (`#973BE1`, `--violet-9` / `--affordance-accent` in renderer tokens), black
  beret and eyes, transparent background. No gradients or texture.
- `simple/favicon.ico`: favicon export containing 16, 32 and 48 px.
- `motion/`: WebGL JavaScript, CSS, body and hat textures, MIT code license.
  Original 2D mesh animation, no external runtime. Preview in the mascot canvas.

Copy the whole motion directory and keep the fallback PNG at
`../transparent/doany.png`, or update the fallback URL in the markup.
Serve textures over HTTP; direct `file:` URLs may block texture loading.
The script resolves textures relative to itself. The optional
`window.MASCOT_ASSETS` map accepts embedded image URLs for offline exports.
Use a `data-mascot-scope` ancestor to scope controls. Reduced motion stops
animation; missing WebGL keeps the PNG fallback. The source remains a prototype,
not a production component or a 3D model.

- `study/`: canvas-only Welcome styles and motion study notes.

## Layout handoff — required alongside the mascot

Reference: `../../canvases/doan-mascot.html`, frames `mascot-home` and
`mascot-welcome`. This proposal changes positioning as well as adding artwork.

| Surface | Visible mascot | Drawing slot | Group optical offset |
| --- | --- | --- | --- |
| Home | approximately 64 px | 114 × 114 px | −64 px |
| Welcome | approximately 80 px | 142.5 × 142.5 px | −72 px |

Center the entire content group using the available content height: Home uses
ContentShell's content panel; Welcome uses the region below window chrome.
Doany participates in normal flow above the title. Home's group includes the
composer and suggestions; Welcome's group includes the wordmark, introduction
and Get started. Keep horizontal centering as well.

Do not reproduce the old fixed 152px top spacing or use a fixed `margin-top`
to position the group. First center from available height, then apply the
negative optical offset. The draft implements this with flex column centering,
`min-height: 100%`, 32px minimum top padding, and bottom padding of
`32px + 2 * offset`: 160px on Home, 176px on Welcome. This produces −64/−72px
center offsets while keeping the top reachable in short, scrollable windows.
The drawing slot includes hop headroom; do not crop it to the visible size.

Verify actual group centers at multiple content heights, scroll access in a
short window, no hop clipping, and Get started in the Welcome group. A screenshot
at one fixed height is insufficient to validate height-based centering.

## Provenance and licensing

Plush artwork and separate body/beret layers are GPT Image edits of the
user-selected six-lobed mascot. White-background artwork is a deterministic Lanczos resize and alpha composite
of the transparent master, with no generated changes to its color or texture. SVG paths
are a manually authored simplification of that mascot. Color is from the
repository renderer tokens. Animation is original JavaScript using native WebGL.
`motion/LICENSE` applies to animation code, not artwork, fonts or UI assets.

## Validation

Chromium loaded all three draft rigs  with
WebGL error 0. Draft slots measured 114 / 142.5 / 420 px. Welcome's group
center measured −72px at 780px and 900px frame heights; at 540px it kept 32px
top access and scrolled (619px content in a 484px viewport). JavaScript syntax
passed. Doan check reported no findings for this canvas/package; at that time the repository
had seven unrelated missing implementation links in older canvases.
These draft-side checks predate the app integration; the app's own
measurements are in `docs/DESIGN.md` (Home, Onboarding).
