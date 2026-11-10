# Buddies

Doany and four friends, one asset set each. The feature plan is `docs/features/buddy-choice/`; drafts are
`.doan/canvases/buddy-accent.html` and `.doan/canvases/buddy-choice.html`.

| id | Name | Colour | Accessory |
|---|---|---|---|
| `doany` | Doany | violet | beret |
| `puri` | Puri | mint | sprout |
| `dungdung` | Dungdung | yellow | headphones |
| `popo` | Popo | peach | glasses |
| `dori` | Dori | sky blue | scarf |

## One buddy's set

Doany's motion sources stay in `../doany/` (with the V1 record); its card and shadow live here.
Doany's equivalent of each file is in brackets.

| File | What | State |
|---|---|---|
| `card.png` | 1254² RGB, white with a soft contact shadow: the selection-card picture | friends: the supplied drafts as they are; Doany: generated card, approved (below) |
| `still.png` | 1254² RGBA, transparent, no shadow: the still and WebGL fallback [`../doany/v2/doany.png`] | Puri: approved; Dungdung, Popo and Dori: ready for review |
| `body.png` | 1254² RGBA, same coordinates, eyes and accessory removed, hidden body restored [`v2/body.png`] | Puri: approved; Dungdung, Popo and Dori: ready for review |
| `accessory.png` | 1254² RGBA, same coordinates, accessory only [`v2/hat.png`] | Puri: approved; Dungdung, Popo and Dori: ready for review |
| `shadow.png` | 1254² RGBA, same coordinates, only the card's contact shadow: black, alpha from how much it darkens the white, completed under the body [Doany's lives here too, as `doany/shadow.png`] | Puri: approved; Doany and other friends: ready for review |
| `prompts.json` | generation prompts, in the form of `v2/layer-prompts.json` | Puri: approved; Dungdung, Popo and Dori: ready for review |
| `artist.gif` | 512², 8 frames, 2.2 s: the working-notice painter, frames aligned (below) [`../doany/artist/painting.gif`] | done |
| `artist-original.gif` | the painter GIF as supplied | kept |
| `artist-rest.png` | 512² RGBA, first frame of `artist.gif` [`artist/rest.png`] | done |

Rig numbers (eye centres and radii, body and accessory pivots, accessory tilt range, hop scale; Doany's are in
`../doany/v2/README.md`) go in this README per buddy once the layers exist.

## Provenance

- Friends' cards and painter GIFs were made by the maintainer outside this repository and supplied as files.
- The supplied painter GIFs drew frames 2–5 at another scale and position than frames 0, 1, 6 and 7, so they
  wobbled. `artist.gif` refits each frame to frame 0: the character and the easel are separated at the emptiest
  column between them and each is fitted on its own (uniform scale about its centroid plus translation, by alpha
  difference), then recomposited; a frame already within half a pixel is kept untouched. Frames, timings and loop
  are unchanged; each frame has its own 255-colour palette with 1-bit transparency, like the Doany exports.
  Measured fits (scale, x, y in source px) for the character in frames 2–5: puri .99, +7; dungdung .93–.96, +13–21,
  +4–7; popo 1.02, −1–2; dori .97, +7–11. Residual drift after the fit is at most 2 px at 512 (0.14 px in the
  32 px window).
- `group/group-original.png` (1536 × 1024) is the five buddies' group photo, supplied by the maintainer. `group/group.png`
  (1478 × 789) is it trimmed to its content at 3% fuzz, given a 16 px white border, and its near-white backdrop
  flood-filled to pure white at 4% fuzz from the corner, so it sits on a white panel without a visible box. It is
  used by `.doan/canvases/buddy-welcome.html` and `buddy-installer.html`.
- Doany's `card.png` was made with built-in image_gen (one generation), using `../doany/v2/doany.png` as the only
  character reference and Puri's and Dungdung's cards as white-background, framing and contact-shadow references.
  The prompt preserves the original violet Pebble, black beret, pose, proportions, texture and colour, asking
  for the friends' soft floor shadow. The generated square was uniformly reduced to 1154², placed at (50, 30)
  on white and saved as 1254² RGB to match their scale and bottom line. The original still is unchanged.
  The full prompt, generation and five-card comparison are local in `.scratch/buddy-assets/`; human review is pending.

## Working-notice source boxes

Doany's and Puri's boxes follow Doany's method (`app/src/renderer/public/doany/README.md` 'Doany the artist'):
460 source px, the eyes on Doany's line and the opacity-weighted centroid at 50 % of the width. That method left
Dungdung, Popo and Dori low and to the left (their eyes sit high on bigger bodies), so their boxes are fitted to the
character instead: the box size scales with the square root of the character's opaque area (first frame, left of the
easel) against the mean of Doany's and Puri's, and the character's bounding-box centre sits where theirs does
(36.2 % across, 47.4 % down). Dori's box is a little larger again so its tip keeps clear of the top.

| id | Eyes' centre (first frame) | Box (x, y, size) | Clipped at 32 px |
|---|---|---|---|
| doany | 202, 310 | 17, 75, 460 | easel foot under 0.5 px |
| puri | 222, 337 | 27, 101, 460 | none |
| dungdung | 226, 302 | 34, 98, 455 | none |
| popo | 196, 287 | −4, 79, 510 | none |
| dori | 195, 245 | 6, 57, 490 | none |

## Puri layers and rig

`puri/still.png`, `body.png` and `accessory.png` are 1254 × 1254 RGBA with transparent backgrounds and no floor
shadow. Built-in image_gen made three edits: card → transparent still, still → eyeless body, and still → sprout.
`puri/prompts.json` preserves all three prompts. ImageMagick removes isolated alpha noise and near-white fringe,
keeps the still's visible pixels for the final body and accessory boundaries, and uses the generated body only to
fill the eyes and restore the mint plush hidden by the stem. The generated accessory guides the extraction;
the final accessory retains the still's own pixels rather than the redrawn sprout. The supplied card is unchanged.

All coordinates below are UV of the complete 1254² canvas, with y down. Eye bounds use opaque pixels whose
maximum RGB channel is below 85, measured separately in the two eye windows. Centres use the bounds' midpoint;
radii use half their inclusive width and height. Ground contact uses alpha ≥ 128, with width sampled 50 px above
the bottom and x at that sample's midpoint.

| Rig value | Puri |
|---|---|
| Left eye centre | `.433, .528` (543, 661.5 px) |
| Right eye centre | `.607, .528` (761, 661.5 px) |
| Eye radii, left / right | `.035, .057` / `.033, .057`; shared shader radius `.034, .057` is within `.003` of both |
| Eye highlight y | `.501` (eye centre y minus `.027`) |
| Gaze offset | `.018, .014` |
| Body skew | `.018` |
| Body pivot | `.5, .60` |
| Accessory pivot | `.515, .307` (stem base) |
| Scale / neutral vertical offset | `1.34` / `.10` |
| Still fallback padding | `16.5%` |
| Accessory tilt range | `[-.12, +.12]` radians |
| Hop height multiplier | `.9` |
| Ground contact x / y / width | `.498` / `.847` / `.672` |

Measured: body + accessory stays within 1 source px of the still's 50% alpha boundary outside the eyes (8 threshold
pixels differ, all within 1 px); both eye windows in the body contain zero dark eye pixels. Maximum eye UV rounding
error is `.000489`; the shared radius differs by at most `.001` UV. No opaque near-white pixels remain in any layer.
Measurement scripts, source generations and results are local in `.scratch/buddy-assets/`. Human visual approval
is pending; the app has not implemented this buddy yet. CPU headroom verification uses the actual alpha hulls and
`doanyRender.test.ts`'s motion sequences: 735,160 poses retained at least 6.57 device px in Home's 228 px buffer
and 8.24 in the 286 px buffer. It does not establish WebGL rendering parity.

## Doany's card review

`doany/card.png` replaces the composite draft at the same path, so picker canvases need no markup change.
The maintainer compared all five cards in `buddy-choice.html` and approved the generated card's identity, scale and shadow.

## Dungdung layers and rig

`dungdung/still.png`, `body.png`, `accessory.png` and `shadow.png` are 1254² RGBA. Three initial image_gen edits
(still, body, accessory) are recorded in `dungdung/prompts.json`. The body now keeps the still's exposed pixels and
cast shading outside the accessory and eye edit windows. Existing reconstructed plush is used only beneath
the accessory and in the eyes, with a one-pixel compact accessory feather and local colour matching; its yarn
texture is not substituted across the exposed body. Source cast shadows are preserved rather than redrawn.
The supplied still, accessory, shadow, card and artist files are unchanged by this body correction.
One additional image generation repairs the cup regions; the hidden body alpha is rounded beneath the cups.
The side zones contain zero dark headphone-fragment pixels (maximum RGB below 90).
The black-alpha ground shadow remains the extracted card shadow. Human visual approval is pending.

| Rig value | Dungdung |
|---|---|
| Eye centres, left / right | `.404,.482` / `.585,.482` |
| Measured eye radii, left / right | `.033,.057` / `.033,.057` |
| Shared shader eye radius | `.033,.057` |
| Eye highlight y | `.455` |
| Gaze offset / body skew | `.018, .014` / `.018` |
| Body / accessory pivot | `.5, .60` / `.5,.43` |
| Scale / neutral vertical offset / still padding | `1.34` / `.10` / `16.5%` |
| Accessory tilt range (radians) / hop multiplier | `[-0.025, 0.025]` / `.9` |
| Ground contact x / y / width | `.494` / `.86` / `.49` |

Measurements use the same opaque dark-eye component and 50 % alpha ground sampling as Puri. The shared eye
radius and centres agree with the still within `.003` UV. Body + accessory matches the still's alpha boundary
within 1 source px outside the eyes. Neither body eye contains a dark eye pixel. Eye checks: left 0.3729% mean luminance difference, texture ratios 0.951/1.001/1.023; right 0.0796% mean luminance difference, texture ratios 0.922/0.953/0.972.
Texture ratios are high-pass RMS at Gaussian sigma 1/2/4 px; each eye's measuring ellipse adds 22/28 px to the
eye's measured x/y radii, with the surrounding ring at 1.25–1.5 times that ellipse. Mean luminance uses linear-light
Rec.709 weights, relative to the ring. The eyes are measured after the final composite.
CPU motion verification checks 735,160 poses against the actual alpha hulls, retaining at least
11.49 device px inside Home's 228 px buffer (14.42 in 286 px).
This is an asset transform check, not app WebGL parity. Scripts, generation sources and measurements remain in
`.scratch/buddy-assets/dungdung/` and the shared scripts in `.scratch/buddy-assets/`.

Source-pixel check: exclude positive accessory alpha dilated by a Euclidean 2 px disk and the eye edit
ellipses (1.2 times the measuring windows). Of 439,409 opaque still pixels (alpha ≥ 250),
100% match exactly in RGB and alpha, with maximum channel difference 0; the gate is ≤ 8 for at least 99.5%.
Final correction scripts, source-match, eye/alpha checks, CPU hull results and browser pose comparisons are in
`.scratch/buddy-assets/body-fixes/dungdung/` and its parent directory.


## Popo layers and rig

`popo/still.png`, `body.png`, `accessory.png` and `shadow.png` are 1254² RGBA. Three initial image_gen edits
(still, body, accessory) are recorded in `popo/prompts.json`. The body now keeps the still's exposed pixels and
cast shading outside the accessory and eye edit windows. Existing reconstructed plush is used only beneath
the accessory and in the eyes, with a one-pixel compact accessory feather and local colour matching; its yarn
texture is not substituted across the exposed body. Source cast shadows are preserved rather than redrawn.
The supplied still, accessory, shadow, card and artist files are unchanged by this body correction.
This correction uses the existing reconstructed plush with no new generation. Eye fills use unshadowed plush
for their comparison ring: exclude the glasses alpha and its surrounding 12 px (2663/2082 left/right samples).
The frame's real soft shadow outside the rims remains exactly as in the still.
The black-alpha ground shadow remains the extracted card shadow. Human visual approval is pending.

| Rig value | Popo |
|---|---|
| Eye centres, left / right | `.411,.42` / `.607,.42` |
| Measured eye radii, left / right | `.032,.055` / `.032,.055` |
| Shared shader eye radius | `.032,.055` |
| Eye highlight y | `.393` |
| Gaze offset / body skew | `.018, .014` / `.018` |
| Body / accessory pivot | `.5, .60` / `.503,.42` |
| Scale / neutral vertical offset / still padding | `1.34` / `.10` / `16.5%` |
| Accessory tilt range (radians) / hop multiplier | `[0, 0]` / `.9` |
| Ground contact x / y / width | `.494` / `.858` / `.595` |

Measurements use the same opaque dark-eye component and 50 % alpha ground sampling as Puri. The shared eye
radius and centres agree with the still within `.003` UV. Body + accessory matches the still's alpha boundary
within 1 source px outside the eyes. Neither body eye contains a dark eye pixel. Eye checks: left 0.3042% mean luminance difference, texture ratios 0.896/0.956/0.991; right 0.4138% mean luminance difference, texture ratios 0.852/0.899/0.905.
Texture ratios are high-pass RMS at Gaussian sigma 1/2/4 px; each eye's measuring ellipse adds 22/28 px to the
eye's measured x/y radii, with the surrounding ring at 1.25–1.5 times that ellipse. Mean luminance uses linear-light
Rec.709 weights, relative to the ring. The eyes are measured after the final composite.
CPU motion verification checks 735,160 poses against the actual alpha hulls, retaining at least
14.27 device px inside Home's 228 px buffer (17.90 in 286 px).
This is an asset transform check, not app WebGL parity. Scripts, generation sources and measurements remain in
`.scratch/buddy-assets/popo/` and the shared scripts in `.scratch/buddy-assets/`.

Source-pixel check: exclude positive accessory alpha dilated by a Euclidean 2 px disk and the eye edit
ellipses (1.2 times the measuring windows). Of 657,108 opaque still pixels (alpha ≥ 250),
99.99635% match exactly in RGB and alpha; the gate is ≤ 8 for at least 99.5%. The 24 exceptions remove
the uncovered lens stroke (maximum difference 191); the 99.5th-percentile difference remains 0.
Final correction scripts, source-match, eye/alpha checks, CPU hull results and browser pose comparisons are in
`.scratch/buddy-assets/body-fixes/popo/` and its parent directory.
The original large-ring comparison is retained as frame-cast-shadow-affected, not the approved eye gate:
left 12.9224% luminance difference and texture ratios 1.094/1.161/1.169; right 5.5125% luminance difference and texture ratios 1.044/1.079/1.077.


The right opening's inner-left dark stroke is refilled from the existing reconstructed plush, including both
ends; this lens correction uses zero new image generations. It changes 1262 source pixels, leaves alpha
identical, and leaves every pixel outside its compact correction mask untouched. The targeted dark component
falls from 499 pixels to zero. The surrounding frame cast shadow is retained.
The lens-interior gate uses linear Rec.709 luminance smoothed by Gaussian sigma 3 px, evaluated in the two
lens openings after excluding the frame and its 12 px cast-shadow band. Each remaining smoothed pixel must
be at least 75% of its approved plush-ring mean. The 22651/22322 checked left/right pixels contain zero failures;
minimum ratios are `.780997` / `.820639`. Raw-pixel minima and counts remain reference-only, since yarn grooves
and the rim shadow naturally fall below that bound. Final before/after detail images, raw figures, approved
lens gate, eye checks and pixel matches are local in `.scratch/buddy-assets/popo-lens-fix/`.


## Dori layers and rig

`dori/still.png`, `body.png`, `accessory.png` and `shadow.png` are 1254² RGBA. Three initial image_gen edits
(still, body, accessory) are recorded in `dori/prompts.json`. The body now keeps the still's exposed pixels and
cast shading outside the accessory and eye edit windows. Existing reconstructed plush is used only beneath
the accessory and in the eyes, with a one-pixel compact accessory feather and local colour matching; its yarn
texture is not substituted across the exposed body. Source cast shadows are preserved rather than redrawn.
The supplied still, accessory, shadow, card and artist files are unchanged by this body correction.
This correction uses the existing reconstructed plush with no new generation. No cream scarf-colour pixels
remain in the opaque body below y 480.
The black-alpha ground shadow remains the extracted card shadow. Human visual approval is pending.

| Rig value | Dori |
|---|---|
| Eye centres, left / right | `.424,.364` / `.563,.365` |
| Measured eye radii, left / right | `.027,.045` / `.027,.045` |
| Shared shader eye radius | `.027,.045` |
| Eye highlight y | `.337` |
| Gaze offset / body skew | `.018, .014` / `.018` |
| Body / accessory pivot | `.5, .60` / `.51,.535` |
| Scale / neutral vertical offset / still padding | `1.34` / `.10` / `16.5%` |
| Accessory tilt range (radians) / hop multiplier | `[-0.02, 0.02]` / `.65` |
| Ground contact x / y / width | `.504` / `.888` / `.463` |

Measurements use the same opaque dark-eye component and 50 % alpha ground sampling as Puri. The shared eye
radius and centres agree with the still within `.003` UV. Body + accessory matches the still's alpha boundary
within 1 source px outside the eyes. Neither body eye contains a dark eye pixel. Eye checks: left 0.5019% mean luminance difference, texture ratios 0.948/1.002/1.064; right 0.2891% mean luminance difference, texture ratios 0.916/0.972/1.014.
Texture ratios are high-pass RMS at Gaussian sigma 1/2/4 px; each eye's measuring ellipse adds 22/28 px to the
eye's measured x/y radii, with the surrounding ring at 1.25–1.5 times that ellipse. Mean luminance uses linear-light
Rec.709 weights, relative to the ring. The eyes are measured after the final composite.
CPU motion verification checks 735,160 poses against the actual alpha hulls, retaining at least
8.43 device px inside Home's 228 px buffer (10.58 in 286 px).
This is an asset transform check, not app WebGL parity. Scripts, generation sources and measurements remain in
`.scratch/buddy-assets/dori/` and the shared scripts in `.scratch/buddy-assets/`.

Source-pixel check: exclude positive accessory alpha dilated by a Euclidean 2 px disk and the eye edit
ellipses (1.2 times the measuring windows). Of 382,214 opaque still pixels (alpha ≥ 250),
100% match exactly in RGB and alpha, with maximum channel difference 0; the gate is ≤ 8 for at least 99.5%.
Final correction scripts, source-match, eye/alpha checks, CPU hull results and browser pose comparisons are in
`.scratch/buddy-assets/body-fixes/dori/` and its parent directory.


## Doany shadow

`doany/shadow.png` is 1254² RGBA, black RGB only. It was extracted from `doany/card.png` as the amount the exposed
floor darkens white, with smooth Gaussian completion under the body; no image generation was used. The card's
939 px character height maps uniformly to the original still's 1085 px height (scale `1.155485`). Its measured
card contact `(587.5, 1061)` maps to `(573, 1179)` in `../doany/v2/doany.png`; the ground pivot remains `.458, .941`.
This preserves the original still's coordinates rather than using the card coordinates in the motion slot.
The shadow's exposed-floor fit RMS is `.012665` alpha; its nonzero bounds are `(9, 1048)–(1200, 1250)` (exclusive).
Extraction script and measurements are local in `.scratch/buddy-assets/`; human visual review is pending.

## Next: transparent still and layers (per friend)

Done the way Doany V2's layers were (`../doany/v2/README.md`, `../doany/v2/layer-prompts.json`), with the image
generation tool, from `card.png` as the only reference, and the way Puri's were (above), whose layers are approved.
Dungdung, Popo and Dori now have layers ready for human review.

1. `still.png`: the same character, pose, size and position as `card.png` on a 1254² transparent canvas, without
   the contact shadow or the white. Do not regenerate, recolour, reshape or recentre the character.
2. `body.png`: `still.png` with both eyes removed (filled with the surrounding plush) and the accessory removed,
   the body hidden under it restored as a natural continuation; same canvas, scale and position.
3. `accessory.png`: only the accessory (sprout, headphones, glasses, scarf) at its exact coordinates; everything
   else transparent.
4. `shadow.png`: the card's contact shadow lifted out as Puri's was: black, alpha from how much the shadow darkens
   the card's white, on the still's coordinates; where the body covers it, complete it so it reads as one smooth
   contact shadow. Prefer extracting over generating. Doany gets one too, from `doany/card.png`, at
   `doany/shadow.png` on the coordinates of `../doany/v2/doany.png` (scale it the way the card scaled the still).
5. `prompts.json`: the prompts used, as `[["still", "..."], ["body", "..."], ["accessory", "..."]]`.
6. Rig numbers in this README: eye centres and radii in UV (0–1) of the 1254² canvas, measured on `still.png`;
   accessory pivot; for the scarf and headphones, a tilt range small enough that the accessory does not slide off
   the body; and the ground contact, the point the shadow shrinks about during a hop: contact centre x, the
   bottom of the alpha (y), and the alpha width 50 px above that bottom, all in UV and measured on `still.png` at
   50 % alpha. Doany's are `.458`, `.941`, `.447` (from `../doany/v2/doany.png`).

Checks before handing back: all four PNGs are 1254² RGBA; `body.png` + `accessory.png` composited match `still.png`
outside the eyes within 1 px at the alpha edge; the eyes are fully gone from `body.png`, and each eye area matches
the ring around it (mean luminance within 2 %, texture contrast ratio .85–1.15, as Puri's eye fill was checked);
no shadow or white remains in still, body or accessory; `shadow.png` holds only black with alpha.
Do not edit app code, `tokens.css` or other buddies' files. Canvases to update as layers land:

- `.doan/canvases/buddy-home.html`: switch the friend's slot as Puri's was: drop `card-stand-in` from its `.doany`
  button, point the still `img` at `../assets/buddies/<id>/still.png`, and add
  `<img class="buddy-shadow-image" src="../assets/buddies/<id>/shadow.png" alt="" aria-hidden="true"/>` before it.
  Add Doany's shadow the same way once `doany/shadow.png` exists. The picker cards in `buddy-choice.html` keep
  `card.png`.
- `.doan/canvases/buddy-assets.html`: add the buddy to `BUDDIES` in `motion-preview.js` (layer paths, eyes, radius,
  shine, accessory pivot, tilt range, lift scale), give its frame live slots like Puri's (the still must be the
  slot's first `img`, then the shadow, then the canvas; `--contact-x`/`--contact-y` on the slot), and turn its
  pending tiles into the new files. Add Doany's shadow slot and tile when it exists.

The hand-off (branch, commits, checks) is in `docs/features/buddy-choice/tasks.md` 'Codex 워커 인계'.
