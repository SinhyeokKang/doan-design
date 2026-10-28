import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AccountIdentity, CheckResult, Provider } from "./types";

export interface StatusRun { code: number | null; stdout: string; stderr: string; profileDir: string }
export interface ProviderAuth {
  command: string;
  // Prepended to every invocation, including B2/B3 runs, so no path can fall back to another store.
  args: string[]; env: Record<string, string>;
  login: string[]; status: string[];
  // Keychain providers only: vault providers sign out by deleting doan's copy, because a provider logout
  // cannot reach the vault and Copilot's /logout left its token behind in PoC 10.
  logout: string[] | null;
  // Profile-relative credential files kept in the encrypted vault, or null when the OS keychain holds them.
  vault: string[] | null;
  // For keychain providers: files whose presence means the CLI fell back to plaintext.
  plaintext: string[];
  parseStatus(run: StatusRun): CheckResult;
}
const failed: CheckResult = { status: "failed", code: "check_failed" };
function json(text: string): Record<string, unknown> | null {
  try { const value = JSON.parse(text); return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null; } catch { return null; }
}
const label = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 512 && !value.includes("\0") ? value : undefined;
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
function cursorStatus(run: StatusRun): CheckResult {
  const status = json(run.stdout);
  if (!status || typeof status.isAuthenticated !== "boolean") return failed;
  if (!status.isAuthenticated) return { status: status.hasRefreshToken === true ? "expired" : "disconnected" };
  return { status: "connected", account: account(status.userId, status.teamId, status.name, status.email) };
}
function codexStatus(run: StatusRun): CheckResult {
  const out = run.stdout.trim();
  if (/^Not logged in\b/m.test(out)) return { status: "disconnected" };
  if (run.code === 0 && /^Logged in\b/m.test(out)) return { status: "connected", account: { id: null, workspace: null } };
  return failed;
}

export const PROVIDER_AUTH: Record<Provider, ProviderAuth> = {
  // PoC 10: a non-default CLAUDE_CONFIG_DIR gets its own Keychain item; .credentials.json would be the plaintext fallback.
  claude: { command: "claude", args: [], env: {}, login: ["auth", "login"], status: ["auth", "status", "--json"], logout: ["auth", "logout"],
    vault: null, plaintext: [".credentials.json"], parseStatus: claudeStatus },
  // The keyring entry is keyed by the canonical CODEX_HOME; "auto" could silently write auth.json instead.
  codex: { command: "codex", args: ["-c", 'cli_auth_credentials_store="keyring"'], env: {}, login: ["login"], status: ["login", "status"], logout: ["logout"],
    vault: null, plaintext: ["auth.json"], parseStatus: codexStatus },
  // AGENT_CLI_CREDENTIAL_STORE=file is Cursor's official switch; the default macOS Keychain item is shared by every profile.
  // On macOS the file store is ~/.cursor/auth.json (getAuthFilePath in the 2026.10.22 bundle).
  cursor: { command: "cursor-agent", args: [], env: { AGENT_CLI_CREDENTIAL_STORE: "file" }, login: ["login"], status: ["status", "--format", "json"], logout: null,
    vault: [".cursor/auth.json"], plaintext: [], parseStatus: cursorStatus },
  antigravity: { command: "agy", args: [], env: {}, login: ["login"], status: ["status"], logout: null,
    vault: [".gemini/antigravity-cli/credentials.json"], plaintext: [], parseStatus: () => failed },
  copilot: { command: "copilot", args: [], env: {}, login: ["login"], status: ["status"], logout: null,
    vault: [".copilot/config.json"], plaintext: [], parseStatus: () => failed },
};
