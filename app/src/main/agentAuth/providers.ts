import { readFileSync } from "node:fs";
import { join } from "node:path";
import stub from "../onboarding/SKILL.md?raw";
import { ANTIGRAVITY_COMMAND, ANTIGRAVITY_SERVER } from "./antigravity";
import type { AccountIdentity, CheckResult, Provider } from "./types";

export interface StatusRun { code: number | null; stdout: string; stderr: string; profileDir: string }
export interface ProviderAuth {
  command: string;
  // Prepended to every invocation, including B2/B3 runs, so no path can fall back to another store.
  args: string[]; env: Record<string, string>;
  login: string[]; status: string[];
  // Sign-in, status and sign-out are calls on the provider's ACP server (Antigravity) instead of CLI subcommands.
  // Its processes get $BROWSER pointed at doan's hook (antigravity.ts), set at launch because the path is the auth root's.
  acpAuth: { method: string; agent: string; version: string } | null;
  // Conversations: the ACP server arguments and the authenticate method to select, or null for Claude and Codex,
  // which have their own runners. sessions is the profile-relative directory holding each session's stored record.
  acp: { args: string[]; authenticate: string | null; sessions: string } | null;
  // The status check costs a provider request (Copilot), so a stored connection is only checked on a user's action
  // and a run's first completed request verifies it instead (user decision 2026-10-28).
  verifyByRun: boolean;
  // The sign-in link reaches doan only through its $BROWSER hook (Claude): printed links are ignored, and a link the
  // hook received is shown when this returns it. Null for providers whose printed link is the sign-in.
  hookLink: ((raw: string) => string | null) | null;
  // Keychain providers only: vault providers sign out by deleting doan's copy, because a provider logout
  // cannot reach the vault and Copilot's /logout left its token behind in PoC 10.
  logout: string[] | null;
  // Profile-relative credential files kept in the encrypted vault, or null when the OS keychain holds them.
  vault: string[] | null;
  // The login logs the profile out (revoking its tokens) before it starts, so a replacement that does not finish
  // has already lost the previous login: Codex 0.164.0 login_with_chatgpt calls clear_existing_auth_before_login.
  loginClears: boolean;
  // How the manager looks up the account email a status does not show (identity.ts): Codex app-server account/read,
  // or Google userinfo with the Antigravity server's stored client and refresh token. Null: the status shows it.
  identity: "codex-app-server" | "google-userinfo" | null;
  // For keychain providers: files whose presence means the CLI fell back to plaintext.
  plaintext: string[];
  // Non-secret profile files written before every provider process, such as Copilot's storage setting.
  settings: Record<string, string>;
  parseStatus(run: StatusRun): CheckResult;
}
const failed: CheckResult = { status: "failed", code: "check_failed" };
function json(text: string): Record<string, unknown> | null {
  try { const value = JSON.parse(text); return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null; } catch { return null; }
}
export const label = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 512 && !value.includes("\0") ? value : undefined;
function account(id: unknown, workspace: unknown, displayName: unknown, email: unknown): AccountIdentity {
  const name = label(displayName), mail = label(email);
  return { id: label(id) ?? null, workspace: label(workspace) ?? null, ...(name ? { displayName: name } : {}), ...(mail ? { email: mail } : {}) };
}

// Claude's status JSON carries no stable account ID; the profile's own .claude.json records the OAuth account it holds.
function claudeStatus(run: StatusRun): CheckResult {
  const status = json(run.stdout);
  if (!status || typeof status.loggedIn !== "boolean") return failed;
  if (!status.loggedIn) return { status: "disconnected" };
  if (run.code !== 0) return failed;
  let oauth: Record<string, unknown> = {};
  try { const doc = json(readFileSync(join(run.profileDir, ".claude.json"), "utf8")); if (doc && typeof doc.oauthAccount === "object" && doc.oauthAccount) oauth = doc.oauthAccount as Record<string, unknown>; }
  catch { /* Without the record the connection has no stable ID; resume then refuses as account_unverifiable. */ }
  return { status: "connected", account: account(oauth.accountUuid, oauth.organizationUuid ?? status.orgId, oauth.displayName, oauth.emailAddress ?? status.email) };
}
// claude 2.1.312 `auth login` prints a link whose redirect shows a code to paste, which doan has no way to take, and
// hands $BROWSER a second link with the same state that returns to its own localhost listener (user decision 2026-10-28).
function claudeLink(raw: string): string | null {
  if (raw.length > 16384 || /\s/.test(raw) || !URL.canParse(raw)) return null;
  const url = new URL(raw);
  const one = (name: string) => url.searchParams.getAll(name).length === 1 ? url.searchParams.get(name) ?? "" : "";
  const redirect = URL.canParse(one("redirect_uri")) ? new URL(one("redirect_uri")) : null;
  const port = Number(redirect?.port);
  if (url.origin !== "https://claude.com" || url.pathname !== "/cai/oauth/authorize" || url.username || url.password || url.hash ||
      one("response_type") !== "code" || !/^\S{1,512}$/.test(one("state")) || !redirect || redirect.protocol !== "http:" || redirect.hostname !== "localhost" ||
      !Number.isInteger(port) || port < 1024 || port > 65535 || redirect.pathname !== "/callback" || redirect.username || redirect.password) return null;
  return raw;
}
function cursorStatus(run: StatusRun): CheckResult {
  const status = json(run.stdout);
  if (!status || typeof status.isAuthenticated !== "boolean") return failed;
  if (!status.isAuthenticated) return { status: status.hasRefreshToken === true ? "expired" : "disconnected" };
  const user = typeof status.userInfo === "object" && status.userInfo !== null ? status.userInfo as Record<string, unknown> : {};
  const name = [user.firstName, user.lastName].filter(part => typeof part === "string" && part).join(" ");
  // userId is numeric in 2026.10.22 output; identity compares strings.
  const id = typeof user.userId === "number" && Number.isSafeInteger(user.userId) ? String(user.userId) : user.userId;
  return { status: "connected", account: account(id, null, name, user.email) };
}
// The ACP status call reports in its exit: 0 after authenticate succeeded, 2 when the server asked for a new sign-in.
// The server exposes no account; such a connection resumes only on its own connection (user decision 2026-10-28).
function antigravityStatus(run: StatusRun): CheckResult {
  if (run.code === 2) return { status: "disconnected" };
  return run.code === 0 ? { status: "connected", account: { id: null, workspace: null } } : { status: "failed", code: /network|connect|timed out/i.test(run.stderr) ? "network" : "check_failed", detail: run.stderr.slice(-2000) };
}
// config.json is JSONC with leading comment lines; lastLoggedInUser names the account the token belongs to.
function copilotStatus(run: StatusRun): CheckResult {
  if (/No authentication information found/.test(`${run.stdout}\n${run.stderr}`)) return { status: "disconnected" };
  if (run.code !== 0) return failed;
  let user: Record<string, unknown> = {};
  try {
    const text = readFileSync(join(run.profileDir, ".copilot/config.json"), "utf8").split("\n").filter(line => !line.trimStart().startsWith("//")).join("\n");
    const doc = json(text);
    if (doc && typeof doc.lastLoggedInUser === "object" && doc.lastLoggedInUser) user = doc.lastLoggedInUser as Record<string, unknown>;
  } catch { /* No record: the connection runs but cannot resume (account_unverifiable). */ }
  return { status: "connected", account: account(user.login, user.host, user.login, undefined) };
}
// codex login status reports on stderr.
function codexStatus(run: StatusRun): CheckResult {
  const out = `${run.stdout}\n${run.stderr}`.trim();
  if (/^Not logged in\b/m.test(out)) return { status: "disconnected" };
  if (run.code === 0 && /^Logged in\b/m.test(out)) return { status: "connected", account: { id: null, workspace: null } };
  return failed;
}

// The dedicated profile gets its own discovery stub instead of a copy of or link to the user's global skill;
// Claude reads <CLAUDE_CONFIG_DIR>/skills and Codex <CODEX_HOME>/skills (skills/list, scope "user", 0.163.0 and 0.164.0).
const SKILL_STUB = { "skills/doan/SKILL.md": stub };
// Personal skill directories under the dedicated HOME: Cursor ~/.cursor/skills, Copilot ~/.copilot/skills,
// Antigravity <GEMINI_HOME>/skills (B3 live check 2026-10-28).
const HOME_STUB = (dir: string) => ({ [`${dir}/skills/doan/SKILL.md`]: stub });
const CLI_RUN = { acpAuth: null, acp: null, verifyByRun: false, hookLink: null, loginClears: false, identity: null };
export const PROVIDER_AUTH: Record<Provider, ProviderAuth> = {
  // PoC 10: a non-default CLAUDE_CONFIG_DIR gets its own Keychain item; .credentials.json would be the plaintext fallback.
  claude: { command: "claude", args: [], env: {}, login: ["auth", "login"], status: ["auth", "status", "--json"], logout: ["auth", "logout"],
    vault: null, plaintext: [".credentials.json"], settings: SKILL_STUB, ...CLI_RUN, hookLink: claudeLink, parseStatus: claudeStatus },
  // The keyring entry is keyed by the canonical CODEX_HOME; "auto" could silently write auth.json instead. MCP OAuth
  // tokens are forced into the keyring the same way, on every Codex process: a conversation's token refresh stores too.
  codex: { command: "codex", args: ["-c", 'cli_auth_credentials_store="keyring"', "-c", 'mcp_oauth_credentials_store="keyring"'], env: {}, login: ["login"], status: ["login", "status"], logout: ["logout"],
    vault: null, plaintext: ["auth.json"], settings: SKILL_STUB, ...CLI_RUN, loginClears: true, identity: "codex-app-server", parseStatus: codexStatus },
  // AGENT_CLI_CREDENTIAL_STORE=file is Cursor's official switch; the default macOS Keychain item is shared by every profile.
  // On macOS the file store is ~/.cursor/auth.json (getAuthFilePath in the 2026.10.22 bundle).
  // Conversations: official `agent acp` (https://cursor.com/docs/cli/acp); it needs authenticate("cursor_login").
  cursor: { command: "cursor-agent", args: [], env: { AGENT_CLI_CREDENTIAL_STORE: "file" }, login: ["login"], status: ["status", "--format", "json"], logout: null,
    vault: [".cursor/auth.json"], plaintext: [], settings: HOME_STUB(".cursor"), acpAuth: null,
    acp: { args: ["acp"], authenticate: "cursor_login", sessions: ".cursor/acp-sessions" }, verifyByRun: false, hookLink: null, loginClears: false, identity: null, parseStatus: cursorStatus },
  // Google's ACP server (antigravity.ts) replaces the agy CLI, whose dedicated-HOME keyring save raised a macOS
  // Keychain dialog (B1). AGY_ACP_FORCE_FILE_STORAGE=1 selects its file backend, <GEMINI_HOME>/antigravity-acp/acp_token.json
  // (credential_store.py in 1.3.0; undocumented, user-approved 2026-10-28); GEMINI_HOME is set by providerEnv.
  antigravity: { command: ANTIGRAVITY_COMMAND, args: [], env: { AGY_ACP_FORCE_FILE_STORAGE: "1", PYTHONUNBUFFERED: "1" }, login: [], status: [], logout: null,
    vault: [".gemini/antigravity-acp/acp_token.json"], plaintext: [], settings: HOME_STUB(".gemini"), acpAuth: { method: "oauth-personal", agent: "antigravity-acp", version: ANTIGRAVITY_SERVER.version },
    acp: { args: [], authenticate: "oauth-personal", sessions: ".gemini/antigravity-acp/conversations" }, verifyByRun: false, hookLink: null, loginClears: false, identity: "google-userinfo", parseStatus: antigravityStatus },
  // storeTokenPlaintext (official setting, 1.0.x changelog and settings schema) keeps the token in config.json, which
  // doan keeps in the vault; a dedicated HOME also keeps gh and the shared "copilot-cli" Keychain item out of reach.
  // 1.0.105 has no status command: a tool-free print request fails fast without a login and costs one request with one.
  // Conversations: official `copilot --acp --stdio` (https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server).
  copilot: { command: "copilot", args: [], env: {}, login: ["login"], status: ["-p", "Reply with exactly OK", "--available-tools", ""], logout: null,
    vault: [".copilot/config.json"], plaintext: [], settings: { ".copilot/settings.json": '{\n  "storeTokenPlaintext": true\n}\n', ...HOME_STUB(".copilot") }, acpAuth: null,
    acp: { args: ["--acp", "--stdio"], authenticate: null, sessions: ".copilot/session-state" }, verifyByRun: true, hookLink: null, loginClears: false, identity: null, parseStatus: copilotStatus },
};
