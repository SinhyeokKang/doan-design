# Doany artwork for Home and Welcome

Byte-for-byte copies of the approved draft's `.doan/assets/doany/` files (canvas `.doan/canvases/doan-mascot.html`); provenance details are in that directory's `README.md` and `study/README.md`.

- `doany.png`: from `transparent/doany.png`. The still image shown while the textures load and whenever WebGL is unavailable, fails or loses its context.
- `body.png`, `hat.png`: from `motion/body.png` and `motion/hat.png`. The body and beret textures that `Doany.tsx` draws with WebGL.

The plush artwork and the separate body and beret layers are GPT Image edits of the user-selected six-lobed mascot; the eyes are drawn by the shader, not stored here. The motion code ported from `motion/mascot.js` (`doanyMotion.ts`, `doanyRig.ts`, `Doany.tsx`) is MIT-licensed (`motion/LICENSE`, Doan contributors); that license covers the code only, not this artwork.
