# Doan mascot motion study

Prototype only; not integrated into the application. Open
`.doan/canvases/doan-mascot.html` in Doan. The desktop export's `index.html`
embeds image and font data and can be opened offline.

`../motion/mascot.js` is original MIT-licensed JavaScript using browser WebGL directly.
There is no Spine, paid runtime, CDN, npm dependency, or network API.
A 64-by-64 triangle mesh deforms the body; procedural eyes blink and track;
a separately generated beret follows a damped spring. This is a 2D rig,
not a 3D model.

## Interactions

- Pointer: eye tracking and a small body lean.
- Typing in the Home composer: gaze toward the input.
- Click the character or press Enter/Space on it: squash, hop, settle.
- Send: previews the hop and clears the demo text; no message is sent.
- Study controls: greet, blink, hop, pause/resume.
- Reduced motion: static resting pose. Off-screen and hidden tabs stop drawing.
- No WebGL or a lost context: the original PNG remains visible.

## Provenance

- UI fixture: first frame of `.doan/canvases/buzz-home.html`; dimensions and
  roles checked against `docs/DESIGN.md`, Home. Navigation remains a fixture.
- Motion design: Doan `animate` preset, read via the repository CLI.
- `../transparent/doany.png`: user-selected six-lobed GPT Image mascot, with transparent
  background and no ground shadow, restored to the original pre-accent lavender palette.
- `../motion/body.png`, `../motion/hat.png`: GPT Image edits of that selected mascot, requested
  to remove eyes/hat and extract the beret respectively. These are generated
  replacement layers, not exact pixel extractions; inspect seams at final size.
- Eyes: procedural ellipses, recreated in the fragment shader.
- No external animation source code was copied. The code license does not
  relicense the mascot artwork or the repository's UI/fonts.

Home uses a fixed 114px slot in normal layout flow with approximately 64px of
visible character. The drawing projection reserves headroom throughout a hop.
The enlarged study uses a 420px slot. Welcome reuses the same mascot above its wordmark.

## Verification

- JavaScript syntax check passed.
- Isolated Doan check: one canvas, zero errors; 12 pre-existing color warnings
  from the reused `mock.css`. Whole-repository check is blocked by seven stale
  implementation links in other existing canvases.
- Chromium browser: both rigs load, WebGL reports no error; input enables Send,
  Send starts the hop, blinking reaches a closed pose, the hat moves, pause
  stops drawing, and live reduced-motion emulation produces a static pose.
- Browser sandbox probe with Doan's `allow-scripts` policy and
  `Access-Control-Allow-Origin: null`: both rigs load without WebGL errors.
- Desktop `file:` export: both rigs load and all images resolve offline.
- Not verified inside the native Doan window. No claim of a 60 fps budget,
  mobile-device coverage, or production integration is made.

The still fallback is the original pre-accent transparent image. The body layer
was recolored by GPT Image using that image as the color reference.

Size revision verification: resting Home character measured 64 × 64.5 CSS px.
The old projection touched the top edge at the hop apex (135 opaque pixels).
The revised projection had no edge contacts across 819 sampled hop/turn/hat
poses; the minimum top clearance was 6 CSS px at the Home size.

Centered Home study: current Home-specific CSS was copied from
`app/src/renderer/styles.css` because that file is outside canvas serving scope.
The input is a native two-row textarea. Only the stage positioning changes:
32px minimum padding, min-height 100%, normal-flow Doany, centered contents,
a 64px upward optical offset using 128px extra bottom padding. At 1238 × 780, content-panel height is 716px and the
group has 57.40px top space and 185.40px bottom space (center offset −64px).
Short panels retain top access and scroll instead of clipping the translated group.


## Welcome

Welcome uses a 142.5px drawing area and approximately 80px character.
Home stays at 64px; both share `../motion/mascot.js` with no separate choreography or rear-view asset.
Doany, the 104px Doan wordmark, introduction, and Get started are one centered
group, offset upward 72px. The action follows the original Welcome spacing:
40px above the 48px-high button. Short windows scroll from the top.
`../../onboarding-grain.svg` is the shared copy of the app public asset.
Get started is a visual fixture; the next onboarding step is not simulated.
