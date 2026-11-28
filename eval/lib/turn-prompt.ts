import { registerHooks } from "node:module";

// Lets Node load the app's prompt.ts (extensionless imports, `ajv/dist/2020` without `.js`, bare JSON imports),
// so scenario tests compare prompt.md with the app's own turnPrompt, not a copy.
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
export const { turnPrompt, handoffPrompt } = await import("../../app/src/main/conversation/prompt.ts").finally(() => { console.warn = warn; console.log = log; });
