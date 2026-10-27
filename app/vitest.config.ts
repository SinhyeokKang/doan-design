import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Runtime support uses node:test; keep it separate from app Vitest.
    exclude: [...configDefaults.exclude, "runtime/**"],
    globalSetup: ["./vitest.globalSetup.ts"],
  },
});
