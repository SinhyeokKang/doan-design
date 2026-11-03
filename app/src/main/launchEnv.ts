// What a Dock (LaunchServices) launch gives the app, measured with a throwaway bundle opened through `/usr/bin/open`
// from an empty caller environment. `open`, the executable and `npm run dev` pass the launching terminal's whole
// environment on instead (Orca's per-terminal CLAUDE_CONFIG_DIR/CODEX_HOME, the launching agent's session ID and
// hook tokens), and that must reach neither the login-shell probe nor an agent: Doan behaves the same wherever it
// is launched from. An allowlist, not a denylist of known terminal tools, because any terminal can add keys.
// Consequence: a key a person set only with `launchctl setenv` is dropped too; the login shell is the place for it.
const LAUNCHD_KEYS = new Set(["HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "SSH_AUTH_SOCK", "COMMAND_MODE",
  "XPC_FLAGS", "XPC_SERVICE_NAME", "OSLogRateLimit", "__CF_USER_TEXT_ENCODING", "__CFBundleIdentifier"]);
// launchd's default PATH; a terminal's PATH would otherwise change what the login shell builds on top of it.
export const LAUNCHD_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

export function launchEnv(inherited: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(inherited)) if (LAUNCHD_KEYS.has(name) && value !== undefined) env[name] = value;
  return { ...env, PATH: LAUNCHD_PATH };
}
