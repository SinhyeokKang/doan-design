# Mascots

Doany and four friends, one asset set each. The feature plan is `docs/features/mascot-choice/`; drafts are
`.doan/canvases/mascot-accent.html` and `.doan/canvases/mascot-choice.html`.

| id | Name | Colour | Accessory |
|---|---|---|---|
| `doany` | Doany | violet | beret |
| `saemi` | Saemi | mint | sprout |
| `dungdung` | Dungdung | yellow | headphones |
| `popo` | Popo | peach | glasses |
| `dori` | Dori | sky blue | scarf |

## One mascot's set

Doany's motion sources stay in `../doany/` (with the V1 record); only its card lives here.
Doany's equivalent of each file is in brackets.

| File | What | State |
|---|---|---|
| `card.png` | 1254² RGB, white with a soft contact shadow: the selection-card picture | friends: the supplied drafts as they are; Doany: composite draft (below) |
| `still.png` | 1254² RGBA, transparent, no shadow: the still and WebGL fallback [`../doany/v2/doany.png`] | to do (Codex) |
| `body.png` | 1254² RGBA, same coordinates, eyes and accessory removed, hidden body restored [`v2/body.png`] | to do (Codex) |
| `accessory.png` | 1254² RGBA, same coordinates, accessory only [`v2/hat.png`] | to do (Codex) |
| `prompts.json` | generation prompts, in the form of `v2/layer-prompts.json` | to do (Codex) |
| `artist.gif` | 512², 8 frames, 2.2 s: the working-notice painter, frames aligned (below) [`../doany/artist/painting.gif`] | done |
| `artist-original.gif` | the painter GIF as supplied | kept |
| `artist-rest.png` | 512² RGBA, first frame of `artist.gif` [`artist/rest.png`] | done |

Rig numbers (eye centres and radii, body and accessory pivots, accessory tilt range, hop scale; Doany's are in
`../doany/v2/README.md`) go in this README per mascot once the layers exist.

## Provenance

- Friends' cards and painter GIFs were made by the maintainer outside this repository and supplied as files.
- The supplied painter GIFs drew frames 2–5 at another scale and position than frames 0, 1, 6 and 7, so they
  wobbled. `artist.gif` refits each frame to frame 0: the character and the easel are separated at the emptiest
  column between them and each is fitted on its own (uniform scale about its centroid plus translation, by alpha
  difference), then recomposited; a frame already within half a pixel is kept untouched. Frames, timings and loop
  are unchanged; each frame has its own 255-colour palette with 1-bit transparency, like the Doany exports.
  Measured fits (scale, x, y in source px) for the character in frames 2–5: saemi .99, +7; dungdung .93–.96, +13–21,
  +4–7; popo 1.02, −1–2; dori .97, +7–11. Residual drift after the fit is at most 2 px at 512 (0.14 px in the
  32 px window).
- Doany's `card.png` is a draft: `../doany/v2/doany.png` cropped to its alpha box, scaled to 940 px high, its
  bottom at y 1095 and centred, over a two-ellipse contact shadow fitted by eye to the friends' cards (Gaussian
  blur 18 and 40). A generated card in the friends' style replaces it.

## Working-notice source boxes

Same method as Doany's (`app/src/renderer/public/doany/README.md` 'Doany the artist'): every box is 460 source px,
like Doany's painter, so the characters keep the scale they were drawn at; the eyes' centre sits where Doany's does
(235.35 px down the box, 51.2 % of the window) and the opacity-weighted centroid of all frames sits at 50 % of the
width.

| id | Eyes' centre (first frame) | Box (x, y, size) | Clipped at 32 px |
|---|---|---|---|
| doany | 202, 310 | 17, 75, 460 | easel foot under 0.5 px |
| saemi | 222, 337 | 27, 101, 460 | none |
| dungdung | 226, 302 | 33, 67, 460 | none |
| popo | 196, 287 | 13, 52, 460 | easel foot 0.7 px |
| dori | 195, 245 | 19, 10, 460 | easel foot 0.3 px |
