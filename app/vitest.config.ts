import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // e2e drives a real Electron window; `npm test` must stay headless.
    exclude: [...configDefaults.exclude, "e2e/**"],
    globalSetup: ["./vitest.globalSetup.ts"],
  },
});
