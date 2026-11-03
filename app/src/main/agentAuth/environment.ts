import { launchEnv } from "../launchEnv";
import { validProvider, type Provider } from "./types";
export interface ProviderEnvInput {
  provider: Provider; inherited: Record<string, string | undefined>; path: string; profileDir: string; appRuntime: string; extra?: Record<string, string>;
}
export type ProviderEnv = { ok: true; env: Record<string, string> } | { ok: false; code: "invalid_provider" | "invalid_profile_dir" | "invalid_runtime" | "invalid_path" | "invalid_extra" | "reserved_extra" };
// An allowlist, not a denylist: inherited API keys, other providers' homes and external
// session IDs would otherwise override the dedicated login. Read from the launchd environment (launchEnv), so a
// terminal-launched app signs in the way a Dock-launched one does.
const INHERITED = new Set(["HOME", "USER", "LOGNAME", "SHELL", "TMPDIR"]);
// PoC 10 isolated Cursor, Antigravity and Copilot only through a dedicated HOME; Codex needed the real HOME for its keyring.
const PROFILE_VARIABLE: Record<Provider, string> = { claude: "CLAUDE_CONFIG_DIR", codex: "CODEX_HOME", cursor: "HOME", antigravity: "HOME", copilot: "HOME" };
const RESERVED = new Set(["PATH", "DOAN_RUNTIME", "DOAN_APP_CONVERSATION", "HOME", "CLAUDE_CONFIG_DIR", "CODEX_HOME", "GEMINI_HOME", "SSH_AUTH_SOCK", "GIT_CONFIG_GLOBAL"]);
function absolute(value: unknown): value is string { return typeof value === "string" && value.startsWith("/") && !value.includes("\0"); }
function value(text: unknown): text is string { return typeof text === "string" && !text.includes("\0"); }
export function providerEnv(input: ProviderEnvInput): ProviderEnv {
  if (!validProvider(input.provider)) return { ok: false, code: "invalid_provider" };
  if (!absolute(input.profileDir)) return { ok: false, code: "invalid_profile_dir" };
  if (!absolute(input.appRuntime)) return { ok: false, code: "invalid_runtime" };
  if (!value(input.path) || !input.path) return { ok: false, code: "invalid_path" };
  const extra = Object.entries(input.extra ?? {});
  if (extra.some(([name, text]) => !/^[A-Z][A-Z0-9_]*$/.test(name) || !value(text))) return { ok: false, code: "invalid_extra" };
  if (extra.some(([name]) => RESERVED.has(name))) return { ok: false, code: "reserved_extra" };
  const inherited = launchEnv(input.inherited);
  const env: Record<string, string> = {};
  for (const [name, text] of Object.entries(inherited)) if (INHERITED.has(name) && value(text)) env[name] = text;
  Object.assign(env, Object.fromEntries(extra), { PATH: input.path, DOAN_RUNTIME: input.appRuntime, DOAN_APP_CONVERSATION: "1", [PROFILE_VARIABLE[input.provider]]: input.profileDir });
  if (PROFILE_VARIABLE[input.provider] === "HOME") {
    // A dedicated HOME hides the user's git and ssh setup from the agent's tool shell; only these two come back
    // (user decision 2026-10-28). gh and other tokens stay out.
    if (value(inherited.SSH_AUTH_SOCK) && inherited.SSH_AUTH_SOCK) env.SSH_AUTH_SOCK = inherited.SSH_AUTH_SOCK;
    if (absolute(inherited.HOME)) env.GIT_CONFIG_GLOBAL = `${inherited.HOME.replace(/\/+$/, "")}/.gitconfig`;
  }
  // The Antigravity server keeps its token, settings and sessions under GEMINI_HOME (default ~/.gemini).
  if (input.provider === "antigravity") env.GEMINI_HOME = `${input.profileDir}/.gemini`;
  return { ok: true, env };
}
