import { registerHooks } from "node:module";

// prompt.ts is app code written for Vite: app/src imports omit the extension, a
// package subpath (ajv/dist/2020) omits `.js`, and JSON schemas are imported without
// an attribute. These rules let Node load it unchanged, so the R8c and R9 tests compare
// prompt.md with the app's own turnPrompt instead of a copy of its text (as H6 does
// with copyText).
registerHooks({
  resolve(specifier, context, next) {
    if (!context.parentURL?.includes("/app/src/")) return next(specifier, context);
    if (specifier.endsWith(".json")) return { ...next(specifier, context), importAttributes: { type: "json" } };
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(`${specifier}.ts`, context);
    if (/^[^./][^:]*\/[^/.]+$/.test(specifier)) {
      try { return next(specifier, context); } catch { return next(`${specifier}.js`, context); }
    }
    return next(specifier, context);
  },
});

// Ajv logs strict-mode notes about the app's schemas while the imports load; they are
// not part of any test's output.
const { warn, log } = console;
console.warn = console.log = () => {};
export const { turnPrompt } = await import("../../app/src/main/conversation/prompt.ts").finally(() => { console.warn = warn; console.log = log; });
