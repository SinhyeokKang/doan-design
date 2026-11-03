import { launchEnv } from "../launchEnv";
import { absolutePath, insideRoot } from "./sessions";
import type { DirectoryFacts, Runtime } from "./types";
export interface AgentProbe { env: Record<string, string | undefined>; path: string; configDir: string }
export function agentEnv(probe: AgentProbe, runtime: Runtime, appRuntime: string, directories: DirectoryFacts):
  { cwd: string; env: Record<string, string | undefined> } | null {
  if (!absolutePath(appRuntime) || !absolutePath(directories.root) || !absolutePath(directories.cwd) ||
      !absolutePath(directories.configDir) || directories.configDir !== probe.configDir ||
      !insideRoot(directories.root, directories.cwd) || !probe.path || probe.path.includes("\0")) return null;
  const env: Record<string, string | undefined> = { ...launchEnv(probe.env), PATH: probe.path, DOAN_RUNTIME: appRuntime, DOAN_APP_CONVERSATION: "1" };
  env[runtime === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME"] = directories.configDir;
  return { cwd: directories.cwd, env };
}
