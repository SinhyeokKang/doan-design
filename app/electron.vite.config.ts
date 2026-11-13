import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// The built window loads only its own files, plus canvas iframes from the
// local server, whose port changes every run. electron-vite dev serves the
// renderer over http with an HMR websocket, so only dev names that origin.
// Overview thumbnails arrive as PNG bytes over IPC and show as blob: URLs.
function contentSecurityPolicy(): Plugin {
  return {
    name: "doan-csp",
    transformIndexHtml(_html, ctx) {
      const devUrl = ctx.server?.resolvedUrls?.local[0];
      const frames = "; frame-src http://127.0.0.1:*; img-src 'self' blob:";
      const policy = devUrl
        ? `default-src 'self' ${new URL(devUrl).origin} ${new URL(devUrl).origin.replace(/^http/, "ws")}${frames}`
        : `default-src 'self'${frames}`;
      return [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" }];
    },
  };
}

export default defineConfig({
  main: {
    // Only node-pty is externalized because its native binary cannot be bundled.
    // Other dependencies stay bundled: Node's ESM resolver rejects ajv's
    // extensionless subpath import (`ajv/dist/2020`).
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
