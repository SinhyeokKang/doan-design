# Doany artwork for Home

Byte-for-byte copies of the V2 draft's `.doan/assets/doany/v2/` files (canvas `.doan/canvases/doan-mascot.html`, frames `doany-v2-home` and `doany-v2-welcome`); provenance details are in that directory's `README.md`.

- `doany.png`: from `v2/doany.png`, the selected Pebble. The still image shown while the textures load and whenever WebGL is unavailable, fails or loses its context.
- `body.png`, `hat.png`: from `v2/body.png` and `v2/hat.png`. The eyeless body and the beret textures that `Doany.tsx` draws with WebGL, in the still image's coordinates.

The artwork was made with the built-in image_gen tool from the earlier six-lobed mascot as a material, face and beret reference; the eyes are drawn by the shader, not stored here. The motion code (`doanyMotion.ts`, `doanyRig.ts`, `Doany.tsx`, ported from `motion/mascot.js` and `v2/mascot.js`) is MIT-licensed (`v2/LICENSE`, Doan contributors); that license covers the code only, not this artwork.

## Doany the artist (canvas notices)

Three variants (canvas `.doan/canvases/doany-family.html`; the notice picks one at random), each from `.doan/assets/doany/artist/`:

| Variant | App files | Source GIF · first frame | Source box (x, y, size) | Frames · loop |
|---|---|---|---|---|
| painting | `artist-painting.gif`, `artist-rest.png` | `painting.gif` · `rest.png` | 17, 75, 460 | 8 · 2.2 s |
| typing | `artist-typing.gif`, `artist-typing-rest.png` | `typing.gif` · `typing-rest.png` | −16, −18, 590 | 24 · 2.4 s |
| reading | `artist-reading.gif`, `artist-reading-rest.png` | `reading.gif` · `reading-rest.png` | −16, −16, 590 | 8 · 1.76 s |

The boxes give Doany the same size, eye line (52 % of the window height) and optical centre in all three; the canvas explains how they were derived. Each GIF frame is cropped to its box (transparent where the box leaves the source), scaled to 128 × 128 (four times the 32px window) with Lanczos, and quantized to a 255-colour palette of its own with 1-bit transparency (alpha below 128 is transparent) in the last index; every frame and its timing is kept, frames dispose to background and the GIF loops forever. The PNG is the first frame cropped and scaled the same way, alpha kept. The typing source's laptop lid carries a Doany silhouette in place of the generated Apple logo.

## The other buddies (`public/buddies/`)

Doany's motion files stay here; `public/buddies/` holds everything else the buddy registry (`buddies.ts`) names. The sources, their provenance, rig numbers and source boxes are in `.doan/assets/buddies/` and its `README.md`.

| App files | Source | How |
|---|---|---|
| `<id>/still.png`, `body.png`, `accessory.png`, `shadow.png` (Puri, Dungdung, Popo, Dori) | `<id>/` same names, 1254² RGBA | Lanczos to 512² RGBA; the rig's coordinates are UV, so they carry over |
| `doany/shadow.png` | `doany/shadow.png`, 1254² RGBA | Lanczos to 512² RGBA |
| `<id>/card.png` (all five) | `<id>/card.png`, 1254² RGB | Lanczos to 588² RGB, three times the 196px selection card |
| `<id>/artist.gif`, `artist-rest.png` (the four friends) | `<id>/artist.gif`, `artist-rest.png`, 512² | The source boxes in that README, then Doany's artist method above: 128², a 255-colour palette per frame with 1-bit transparency, every frame and its timing kept |
| `eye.png` | `eye.png`, 118 × 193 RGBA | Byte copy: the one eye every buddy's shader draws |
| `group/` | `group/group.png`, 1478 × 789 | The Welcome group photo, recompressed losslessly |

PNGs are recompressed losslessly (oxipng, colour type kept); the folder apart from `group/` stays under 5 MB, which `buddyAssets.test.ts` checks with the sizes, frames and timings above.
