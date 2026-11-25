import { launchEnv } from "../launchEnv";
import { absolutePath, insideRoot } from "./sessions";
import type { DirectoryFacts, Runtime } from "./types";
// promptSuggestion: the login shell's CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION, when it set one.
export interface AgentProbe { env: Record<string, string | undefined>; path: string; configDir: string; promptSuggestion?: string }
// Claude Code makes no prompt suggestion unless its rate-limit state is "allowed", and this variable set to true overrides
// that. Doan sets it on every Claude run; the login shell's own value wins, as the person's way to turn it off.
export function promptSuggestionEnv(shell: string | undefined): { CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: string } {
  return { CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: shell || "true" };
}
export function agentEnv(probe: AgentProbe, runtime: Runtime, appRuntime: string, directories: DirectoryFacts):
  { cwd: string; env: Record<string, string | undefined> } | null {
  if (!absolutePath(appRuntime) || !absolutePath(directories.root) || !absolutePath(directories.cwd) ||
      !absolutePath(directories.configDir) || directories.configDir !== probe.configDir ||
      !insideRoot(directories.root, directories.cwd) || !probe.path || probe.path.includes("\0")) return null;
  const env: Record<string, string | undefined> = { ...launchEnv(probe.env), PATH: probe.path, DOAN_RUNTIME: appRuntime, DOAN_APP_CONVERSATION: "1" };
  env[runtime === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME"] = directories.configDir;
  if (runtime === "claude") Object.assign(env, promptSuggestionEnv(probe.promptSuggestion));
  return { cwd: directories.cwd, env };
}
