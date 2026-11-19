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
// Codex runs with approval_policy="never" (agent.ts), where a command that must leave the sandbox (the app socket, a
// write outside the workspace) is refused outright. The eval measures how agents use the guide, not the person's
// approvals, so its rule is agent setup's plus an allow rule for each command agent setup leaves to the person's Codex
// settings: every `doan` command runs outside the sandbox unasked, as it did before agent setup's rule narrowed.
const EVAL_ALSO_ALLOWED = ["init", "config", "export", "handoff", "remove", "onboarding"];
export const evalCodexRuleText = (): string =>
  codexRuleText() + EVAL_ALSO_ALLOWED.map(command => `prefix_rule(pattern=["doan", "${command}"], decision="allow")\n`).join("");
