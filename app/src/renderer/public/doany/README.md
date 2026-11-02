# Doany artwork for Home and Welcome

Byte-for-byte copies of the V2 draft's `.doan/assets/doany/v2/` files (canvas `.doan/canvases/doan-mascot.html`, frames `doany-v2-home` and `doany-v2-welcome`); provenance details are in that directory's `README.md`.

- `doany.png`: from `v2/doany.png`, the selected Pebble. The still image shown while the textures load and whenever WebGL is unavailable, fails or loses its context.
- `body.png`, `hat.png`: from `v2/body.png` and `v2/hat.png`. The eyeless body and the beret textures that `Doany.tsx` draws with WebGL, in the still image's coordinates.

The artwork was made with the built-in image_gen tool from the earlier six-lobed mascot as a material, face and beret reference; the eyes are drawn by the shader, not stored here. The motion code (`doanyMotion.ts`, `doanyRig.ts`, `Doany.tsx`, ported from `motion/mascot.js` and `v2/mascot.js`) is MIT-licensed (`v2/LICENSE`, Doan contributors); that license covers the code only, not this artwork.
