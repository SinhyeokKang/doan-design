import { registerHooks } from "node:module";

// app/src imports omit the extension (Vite resolves them; Node does not), so the
// workspace commits the app's own rule text instead of a copy of it.
registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL?.includes("/app/src/"))
      return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});

// At the project layer, so no run writes the rule into the real HOME.
export const CODEX_RULE = ".codex/rules/doan.rules";
export const { codexRuleText } = await import("../../app/src/main/agentSetup/plan.ts");
