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
// Codex runs with approval_policy="never" (agent.ts), where a `prompt` rule refuses the command outright. The eval
// measures how agents use the guide, not the person's approvals, so its rule is agent setup's without the prompt
// rules: every `doan` command runs outside the sandbox unasked, as it did before agent setup's rule asked for any.
export const evalCodexRuleText = (): string => codexRuleText().split("\n").filter(line => !line.includes('decision="prompt"')).join("\n");
