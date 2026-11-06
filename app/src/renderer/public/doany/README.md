# Doany artwork for Home and Welcome

Byte-for-byte copies of the V2 draft's `.doan/assets/doany/v2/` files (canvas `.doan/canvases/doan-mascot.html`, frames `doany-v2-home` and `doany-v2-welcome`); provenance details are in that directory's `README.md`.

- `doany.png`: from `v2/doany.png`, the selected Pebble. The still image shown while the textures load and whenever WebGL is unavailable, fails or loses its context.
- `body.png`, `hat.png`: from `v2/body.png` and `v2/hat.png`. The eyeless body and the beret textures that `Doany.tsx` draws with WebGL, in the still image's coordinates.

The artwork was made with the built-in image_gen tool from the earlier six-lobed mascot as a material, face and beret reference; the eyes are drawn by the shader, not stored here. The motion code (`doanyMotion.ts`, `doanyRig.ts`, `Doany.tsx`, ported from `motion/mascot.js` and `v2/mascot.js`) is MIT-licensed (`v2/LICENSE`, Doan contributors); that license covers the code only, not this artwork.

## Doany the artist (canvas notices)

- `artist-painting.gif`, `artist-rest.png`: from `.doan/assets/doany/artist/painting.gif` and `rest.png` (canvas `.doan/canvases/doany-artist.html`), cropped to the draft's 32px window (source box 10,75 460 × 460; the draft draws the picture at 111.3 % and moves it 2.2 % left and 16.3 % up) and scaled to 128 × 128, four times the window. The GIF keeps the source's 8 frames and timings with a 255-colour palette and 1-bit transparency; `artist-rest.png` is its first frame.
