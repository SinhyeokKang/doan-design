import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // As electron.vite.config.ts defines it for the renderer.
  define: { __DOAN_BUILD_YEAR__: JSON.stringify(new Date().getFullYear()) },
  test: {
    // Runtime support uses node:test; keep it separate from app Vitest.
    exclude: [...configDefaults.exclude, "runtime/**"],
    globalSetup: ["./vitest.globalSetup.ts"],
    // Main tests spawn the CLI and watch files, waiting up to 5 s in vi.waitFor; keep the limit above that.
    // Half the cores keeps those children from starving each other on a loaded machine.
    testTimeout: 20_000,
    maxWorkers: "50%",
  },
});
