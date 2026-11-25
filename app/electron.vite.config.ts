import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Canvas iframes come from the local server (new port per run) and thumbnails are blob: URLs; only dev adds its origin.
// Under file:, 'self' covers local files, so <base>, plugins and form submits are refused outright.
function contentSecurityPolicy(): Plugin {
  return {
    name: "doan-csp",
    transformIndexHtml(_html, ctx) {
      const devUrl = ctx.server?.resolvedUrls?.local[0];
      const rest = "; frame-src http://127.0.0.1:*; img-src 'self' blob:; base-uri 'none'; object-src 'none'; form-action 'none'";
      const policy = devUrl
        ? `default-src 'self' ${new URL(devUrl).origin} ${new URL(devUrl).origin.replace(/^http/, "ws")}${rest}`
        : `default-src 'self'${rest}`;
      return [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" }];
    },
  };
}

export default defineConfig({
  main: {
    // Only node-pty is externalized (native binary); the rest is bundled because Node's ESM resolver rejects
    // ajv's extensionless `ajv/dist/2020` import.
    build: { externalizeDeps: false, rolldownOptions: { external: ["node-pty"], input: { index: fileURLToPath(new URL("./src/main/index.ts", import.meta.url)) } } },
  },
  preload: {
    build: {
      // A sandboxed preload cannot load ESM, and package.json is "type": "module",
      // so electron-vite would otherwise emit index.mjs.
      rolldownOptions: {
        // The prototype window gets its own preload; neither imports a value the other does, so no shared chunk.
        input: {
          index: fileURLToPath(new URL("./src/preload/index.ts", import.meta.url)),
          prototype: fileURLToPath(new URL("./src/preload/prototype.ts", import.meta.url)),
        },
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    // Home's copyright year is the build's (HomeCredit.tsx).
    define: { __DOAN_BUILD_YEAR__: JSON.stringify(new Date().getFullYear()) },
    resolve: { alias: { "@": fileURLToPath(new URL("./src/renderer", import.meta.url)) } },
    plugins: [contentSecurityPolicy(), tailwindcss()],
    build: {
      rolldownOptions: {
        input: {
          index: fileURLToPath(new URL("./src/renderer/index.html", import.meta.url)),
          prototype: fileURLToPath(new URL("./src/renderer/prototype.html", import.meta.url)),
        },
      },
    },
  },
});
