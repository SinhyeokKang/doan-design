import { expect, test } from "vitest";
import { agentEnv, promptSuggestionEnv } from "./environment";
import { DOCK, TERMINAL } from "../launchEnv.fixture";
test("marks app conversations even when an inherited value tries to disable the marker", () => {
  const result = agentEnv({ env: { DOAN_APP_CONVERSATION: "0" }, path: "/bin", configDir: "/profile" }, "codex", "/data/runtime.json", { root: "/repo", cwd: "/repo", configDir: "/profile" });
  expect(result?.env.DOAN_APP_CONVERSATION).toBe("1");
});
test("an agent gets the launchd environment, not the launching terminal's", () => {
  for (const runtime of ["claude", "codex"] as const) {
    const configDir = `/profile/${runtime}`;
    const result = agentEnv({ env: TERMINAL, path: "/shell/bin", configDir }, runtime, "/data/runtime.json", { root: "/repo", cwd: "/repo", configDir });
    expect(result?.env).toEqual({ ...DOCK, PATH: "/shell/bin", DOAN_RUNTIME: "/data/runtime.json", DOAN_APP_CONVERSATION: "1",
      [runtime === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME"]: configDir, ...(runtime === "claude" ? { CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: "true" } : {}) });
  }
});
// prompt-suggestion decision 2: Claude Code makes no suggestion near a usage limit unless this is true, so Doan turns
// it on; the login shell's own value wins, and nothing inherited from the launching terminal counts.
test("a Claude run gets the login shell's CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION, or true", () => {
  const facts = { root: "/repo", cwd: "/repo", configDir: "/profile" };
  const inherited = { CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: "terminal" };
  expect(agentEnv({ env: inherited, path: "/bin", configDir: "/profile" }, "claude", "/data/runtime.json", facts)?.env.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION).toBe("true");
  for (const value of ["false", "0", "true"]) expect(agentEnv({ env: inherited, path: "/bin", configDir: "/profile", promptSuggestion: value }, "claude", "/data/runtime.json", facts)?.env.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION).toBe(value);
  expect(agentEnv({ env: inherited, path: "/bin", configDir: "/profile", promptSuggestion: "true" }, "codex", "/data/runtime.json", facts)?.env).not.toHaveProperty("CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION");
  expect(promptSuggestionEnv(undefined)).toEqual({ CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: "true" });
  expect(promptSuggestionEnv("")).toEqual({ CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: "true" });
  expect(promptSuggestionEnv("false")).toEqual({ CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: "false" });
});
