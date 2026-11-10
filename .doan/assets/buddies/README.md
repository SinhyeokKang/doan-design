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

Doany's motion sources stay in `../doany/` (with the V1 record); only its card lives here.
Doany's equivalent of each file is in brackets.

| File | What | State |
|---|---|---|
| `card.png` | 1254² RGB, white with a soft contact shadow: the selection-card picture | friends: the supplied drafts as they are; Doany: generated card, approved (below) |
| `still.png` | 1254² RGBA, transparent, no shadow: the still and WebGL fallback [`../doany/v2/doany.png`] | Puri: approved; other friends: to do |
| `body.png` | 1254² RGBA, same coordinates, eyes and accessory removed, hidden body restored [`v2/body.png`] | Puri: approved; other friends: to do |
| `accessory.png` | 1254² RGBA, same coordinates, accessory only [`v2/hat.png`] | Puri: approved; other friends: to do |
| `shadow.png` | 1254² RGBA, same coordinates, only the card's contact shadow: black, alpha from how much it darkens the white, completed under the body [Doany's lives here too, as `doany/shadow.png`] | Puri: approved; Doany and other friends: to do |
| `prompts.json` | generation prompts, in the form of `v2/layer-prompts.json` | Puri: approved; other friends: to do |
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

## Next: transparent still and layers (per friend)

Done the way Doany V2's layers were (`../doany/v2/README.md`, `../doany/v2/layer-prompts.json`), with the image
generation tool, from `card.png` as the only reference, and the way Puri's were (above), whose layers are approved.
Dungdung, Popo and Dori remain.

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
