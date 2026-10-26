import { registerHooks } from "node:module";

// app/src imports omit the extension (Vite resolves them; Node does not), so
// H6 and H7 can compare their prompts with the app's own copyText instead of a copy of its text.
registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.includes("/app/src/"))
      return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});

export const { copyText } = await import("../../../app/src/comments/projection.ts");
