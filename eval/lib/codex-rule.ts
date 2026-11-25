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
export const { codexRuleText, CLAUDE_ALLOW_RULES } = await import("../../app/src/main/agentSetup/plan.ts");
// Codex runs with approval_policy="never", which refuses commands leaving the sandbox, and the eval measures guide
// use: its rule also allows each command agent setup leaves to the person's Codex settings.
const EVAL_ALSO_ALLOWED = ["init", "config", "export", "handoff", "remove", "onboarding"];
export const evalCodexRuleText = (): string =>
  codexRuleText() + EVAL_ALSO_ALLOWED.map(command => `prefix_rule(pattern=["doan", "${command}"], decision="allow")\n`).join("");
