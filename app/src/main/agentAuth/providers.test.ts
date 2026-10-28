import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROVIDER_AUTH } from "./providers";
import { PROVIDERS } from "./types";

const run = (code: number | null, stdout = "", stderr = "") => ({ code, stdout, stderr, profileDir: "/data/profiles/x" });

// Shapes observed from cursor-agent 2026.10.22-27dcf5f "status --format json" (personal values replaced).
const cursorSignedIn = { status: "authenticated", isAuthenticated: true, hasAccessToken: true, hasRefreshToken: true,
  userInfo: { email: "ada@example.com", userId: 384452313, firstName: "Ada", lastName: "Lovelace", createdAt: "2026-07-13T14:35:33.123Z" } };
const cursorSignedOut = { status: "unauthenticated", isAuthenticated: false, hasAccessToken: false, hasRefreshToken: false, message: "Not logged in" };

describe("provider auth adapters", () => {
  it("covers every provider and keeps credentials in the vault or the OS keychain, never both", () => {
    expect(Object.keys(PROVIDER_AUTH).sort()).toEqual([...PROVIDERS].sort());
    for (const provider of PROVIDERS) {
      const auth = PROVIDER_AUTH[provider];
      expect(auth.vault === null ? auth.plaintext.length > 0 : auth.vault.length > 0).toBe(true);
      for (const rel of [...(auth.vault ?? []), ...auth.plaintext]) expect(rel.startsWith("/") || rel.split("/").includes("..")).toBe(false);
    }
  });
  it("forces Codex onto the OS keyring and Cursor onto its official file store", () => {
    expect(PROVIDER_AUTH.codex.args).toEqual(["-c", 'cli_auth_credentials_store="keyring"']);
    expect(PROVIDER_AUTH.codex.plaintext).toEqual(["auth.json"]);
    expect(PROVIDER_AUTH.cursor.env).toEqual({ AGENT_CLI_CREDENTIAL_STORE: "file" });
  });
  it("signs Copilot out locally instead of relying on its logout command", () => {
    expect(PROVIDER_AUTH.copilot.logout).toBeNull();
  });
  it("reads a signed-out Claude profile and refuses unreadable output", () => {
    const out = JSON.stringify({ loggedIn: false, authMethod: "none", apiProvider: "firstParty" });
    expect(PROVIDER_AUTH.claude.parseStatus(run(1, out))).toEqual({ status: "disconnected" });
    expect(PROVIDER_AUTH.claude.parseStatus(run(0, "not json"))).toEqual({ status: "failed", code: "check_failed" });
    expect(PROVIDER_AUTH.claude.parseStatus(run(null))).toEqual({ status: "failed", code: "check_failed" });
  });
  it("takes only Claude's localhost-callback sign-in link from the browser hook", () => {
    // claude 2.1.312 `auth login`: $BROWSER gets the localhost redirect; the printed link is the manual-code one.
    const query = "code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&scope=user%3Ainference&code_challenge=abc&code_challenge_method=S256&state=st-1";
    const link = (redirect: string, rest = query) => `https://claude.com/cai/oauth/authorize?${rest}&redirect_uri=${encodeURIComponent(redirect)}`;
    const hookLink = PROVIDER_AUTH.claude.hookLink!;
    expect(hookLink(link("http://localhost:52595/callback"))).toBe(link("http://localhost:52595/callback"));
    for (const raw of [link("https://platform.claude.com/oauth/code/callback"), link("http://localhost:52595/callback").replace("claude.com", "evil.example"),
      link("http://example.com:52595/callback"), link("http://localhost:80/callback"), link("http://localhost:52595/other"),
      link("http://localhost:52595/callback", query.replace("&state=st-1", "")), link("http://localhost:52595/callback", query.replace("response_type=code", "response_type=token")),
      `${link("http://localhost:52595/callback")}&state=two`, `${link("http://localhost:52595/callback")} extra`, "not a url"]) {
      expect(hookLink(raw)).toBeNull();
    }
    for (const provider of PROVIDERS.filter(p => p !== "claude")) expect(PROVIDER_AUTH[provider].hookLink).toBeNull();
  });
  it("takes Claude's stable account from the dedicated profile's OAuth record", () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-claude-profile-"));
    try {
      const status = JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty" });
      expect(PROVIDER_AUTH.claude.parseStatus({ ...run(0, status), profileDir: dir })).toEqual({ status: "connected", account: { id: null, workspace: null } });
      writeFileSync(join(dir, ".claude.json"), JSON.stringify({ oauthAccount: { accountUuid: "acct-1", organizationUuid: "org-1", displayName: "Ada", emailAddress: "ada@example.com" } }));
      expect(PROVIDER_AUTH.claude.parseStatus({ ...run(0, status), profileDir: dir })).toEqual({ status: "connected",
        account: { id: "acct-1", workspace: "org-1", displayName: "Ada", email: "ada@example.com" } });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("reads Cursor's account from its JSON status", () => {
    expect(PROVIDER_AUTH.cursor.parseStatus(run(0, JSON.stringify(cursorSignedIn)))).toEqual({ status: "connected",
      account: { id: "384452313", workspace: null, displayName: "Ada Lovelace", email: "ada@example.com" } });
    expect(PROVIDER_AUTH.cursor.parseStatus(run(0, JSON.stringify(cursorSignedOut)))).toEqual({ status: "disconnected" });
    expect(PROVIDER_AUTH.cursor.parseStatus(run(0, JSON.stringify({ ...cursorSignedOut, hasRefreshToken: true })))).toEqual({ status: "expired" });
    expect(PROVIDER_AUTH.cursor.parseStatus(run(1, "Error"))).toEqual({ status: "failed", code: "check_failed" });
  });
  it("reads Antigravity's sign-in state from the exit of doan's ACP status call", () => {
    expect(PROVIDER_AUTH.antigravity.parseStatus(run(2, ""))).toEqual({ status: "disconnected" });
    expect(PROVIDER_AUTH.antigravity.parseStatus(run(0, ""))).toEqual({ status: "connected", account: { id: null, workspace: null } });
    expect(PROVIDER_AUTH.antigravity.parseStatus(run(1, "", "connect ECONNREFUSED"))).toEqual({ status: "failed", code: "network", detail: "connect ECONNREFUSED" });
    expect(PROVIDER_AUTH.antigravity.parseStatus(run(1, "", "unexpected ACP server x 2"))).toEqual({ status: "failed", code: "check_failed", detail: "unexpected ACP server x 2" });
  });
  it("runs Antigravity on the pinned server with its file store and keeps the sign-in link away from a real browser", () => {
    expect(PROVIDER_AUTH.antigravity).toMatchObject({ command: "agy_acp_server.par", vault: [".gemini/antigravity-acp/acp_token.json"], acpAuth: { method: "oauth-personal", agent: "antigravity-acp", version: "1.3.0" } });
    // $BROWSER is set at launch to doan's hook script under the auth root (manager.test.ts, antigravity.test.ts).
    expect(PROVIDER_AUTH.antigravity.env).toEqual({ AGY_ACP_FORCE_FILE_STORAGE: "1", PYTHONUNBUFFERED: "1" });
    expect(PROVIDER_AUTH.copilot.verifyByRun).toBe(true);
    for (const provider of ["claude", "codex", "cursor", "antigravity"] as const) expect(PROVIDER_AUTH[provider].verifyByRun).toBe(false);
  });
  it("reads Copilot's login from a tool-free print run and its account from config.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-copilot-profile-"));
    try {
      expect(PROVIDER_AUTH.copilot.parseStatus({ ...run(1, "", "Error: No authentication information found.\n"), profileDir: dir })).toEqual({ status: "disconnected" });
      expect(PROVIDER_AUTH.copilot.parseStatus({ ...run(1, "", "rate limited"), profileDir: dir })).toEqual({ status: "failed", code: "check_failed" });
      mkdirSync(join(dir, ".copilot"));
      writeFileSync(join(dir, ".copilot/config.json"), '// User settings belong in settings.json.\n// This file is managed automatically.\n{\n  "lastLoggedInUser": { "host": "https://github.com", "login": "ada" }\n}\n');
      expect(PROVIDER_AUTH.copilot.parseStatus({ ...run(0, "OK\n"), profileDir: dir })).toEqual({ status: "connected",
        account: { id: "ada", workspace: "https://github.com", displayName: "ada" } });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("reads Codex status from stderr (only the Not logged in stream was observed, on 0.163.0 and 0.164.0)", () => {
    expect(PROVIDER_AUTH.codex.parseStatus(run(1, "", "Not logged in\n"))).toEqual({ status: "disconnected" });
    expect(PROVIDER_AUTH.codex.parseStatus(run(0, "", "Logged in using ChatGPT\n"))).toEqual({ status: "connected", account: { id: null, workspace: null } });
    expect(PROVIDER_AUTH.codex.parseStatus(run(1, "", "Error loading configuration"))).toEqual({ status: "failed", code: "check_failed" });
  });
  it("gives Claude and Codex dedicated profiles the doan discovery stub and no other provider files", () => {
    const stub = readFileSync(join(__dirname, "../onboarding/SKILL.md"), "utf8");
    for (const provider of ["claude", "codex"] as const) expect(PROVIDER_AUTH[provider].settings).toEqual({ "skills/doan/SKILL.md": stub });
  });
});
