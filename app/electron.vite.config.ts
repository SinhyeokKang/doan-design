import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// The built window loads only its own files, plus canvas iframes from the
// local server, whose port changes every run. electron-vite dev serves the
// renderer over http with an HMR websocket, so only dev names that origin.
function contentSecurityPolicy(): Plugin {
  return {
    name: "doan-csp",
    transformIndexHtml(_html, ctx) {
      const devUrl = ctx.server?.resolvedUrls?.local[0];
      const frames = "frame-src http://127.0.0.1:*";
      const policy = devUrl
        ? `default-src 'self' ${new URL(devUrl).origin} ${new URL(devUrl).origin.replace(/^http/, "ws")}; ${frames}`
        : `default-src 'self'; ${frames}`;
      return [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: policy }, injectTo: "head-prepend" }];
    },
  };
}

export default defineConfig({
  main: {
    // Bundled, not externalized: the main bundle is ESM, and Node's ESM resolver
    // rejects ajv's extensionless subpath import (`ajv/dist/2020`).
    build: { externalizeDeps: false, rolldownOptions: { input: { index: fileURLToPath(new URL("./src/main/index.ts", import.meta.url)), "mkdir-child": fileURLToPath(new URL("./src/main/comments/mkdir-child.ts", import.meta.url)) } } },
  },
  preload: {
    build: {
      // A sandboxed preload cannot load ESM, and package.json is "type": "module",
      // so electron-vite would otherwise emit index.mjs.
      rolldownOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } },
    },
  },
  renderer: {
    resolve: { alias: { "@": fileURLToPath(new URL("./src/renderer", import.meta.url)) } },
    plugins: [contentSecurityPolicy(), tailwindcss()],
  },
});
