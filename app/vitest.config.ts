import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Runtime support uses node:test; keep it separate from app Vitest.
    exclude: [...configDefaults.exclude, "runtime/**"],
    globalSetup: ["./vitest.globalSetup.ts"],
    // Main-process tests spawn the CLI and watch real files, then wait up to 5 s with vi.waitFor;
    // the test limit must stay above that wait, and half the cores keeps those children from
    // starving each other on a loaded machine.
    testTimeout: 20_000,
    maxWorkers: "50%",
  },
});
