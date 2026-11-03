// What a Dock (LaunchServices) launch gives the app, measured with a throwaway bundle opened through `/usr/bin/open`
// from an empty caller environment. `open`, the executable and `npm run dev` pass the launching terminal's whole
// environment on instead (Orca's per-terminal CLAUDE_CONFIG_DIR/CODEX_HOME, the launching agent's session ID and
// hook tokens), and that must reach neither the login-shell probe nor an agent: Doan behaves the same wherever it
// is launched from. An allowlist, not a denylist of known terminal tools, because any terminal can add keys.
const LAUNCHD_KEYS = new Set(["HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "SSH_AUTH_SOCK", "COMMAND_MODE",
  "XPC_FLAGS", "XPC_SERVICE_NAME", "OSLogRateLimit", "__CF_USER_TEXT_ENCODING", "__CFBundleIdentifier"]);
// `launchctl setenv` reaches Dock launches too, and that is where a corporate proxy or CA, or a locale, is set for GUI
// apps. These name no terminal session, so they stay when present; TERM and TERM_PROGRAM describe the terminal and do not.
const NETWORK_LOCALE_KEYS = new Set(["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy",
  "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE", "LANG", "TZ"]);
const kept = (name: string) => LAUNCHD_KEYS.has(name) || NETWORK_LOCALE_KEYS.has(name) || name.startsWith("LC_");
// launchd's default PATH; a terminal's PATH would otherwise change what the login shell builds on top of it.
export const LAUNCHD_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

export function launchEnv(inherited: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(inherited)) if (kept(name) && value !== undefined) env[name] = value;
  return { ...env, PATH: LAUNCHD_PATH };
}
