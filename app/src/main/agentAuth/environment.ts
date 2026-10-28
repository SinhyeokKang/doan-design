import { validProvider, type Provider } from "./types";
export interface ProviderEnvInput {
  provider: Provider; inherited: Record<string, string | undefined>; path: string; profileDir: string; appRuntime: string; extra?: Record<string, string>;
}
export type ProviderEnv = { ok: true; env: Record<string, string> } | { ok: false; code: "invalid_provider" | "invalid_profile_dir" | "invalid_runtime" | "invalid_path" | "invalid_extra" | "reserved_extra" };
// An allowlist, not a denylist: inherited API keys, other providers' homes and external
// session IDs would otherwise override the dedicated login.
const INHERITED = new Set(["HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "TERM", "TZ", "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS",
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "no_proxy", "all_proxy"]);
// PoC 10 isolated Cursor, Antigravity and Copilot only through a dedicated HOME; Codex needed the real HOME for its keyring.
const PROFILE_VARIABLE: Record<Provider, string> = { claude: "CLAUDE_CONFIG_DIR", codex: "CODEX_HOME", cursor: "HOME", antigravity: "HOME", copilot: "HOME" };
const RESERVED = new Set(["PATH", "DOAN_RUNTIME", "HOME", "CLAUDE_CONFIG_DIR", "CODEX_HOME"]);
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
  const env: Record<string, string> = {};
  for (const [name, text] of Object.entries(input.inherited)) if ((INHERITED.has(name) || name.startsWith("LC_")) && value(text)) env[name] = text;
  Object.assign(env, Object.fromEntries(extra), { PATH: input.path, DOAN_RUNTIME: input.appRuntime, [PROFILE_VARIABLE[input.provider]]: input.profileDir });
  return { ok: true, env };
}
