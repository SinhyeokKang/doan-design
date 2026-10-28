import { describe, expect, it } from "vitest";
import { PROVIDER_AUTH } from "./providers";
import { PROVIDERS } from "./types";

const run = (code: number | null, stdout = "", stderr = "") => ({ code, stdout, stderr, profileDir: "/data/profiles/x" });

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
  it("reads Codex status from stderr, where 0.163.0 prints it", () => {
    expect(PROVIDER_AUTH.codex.parseStatus(run(1, "", "Not logged in\n"))).toEqual({ status: "disconnected" });
    expect(PROVIDER_AUTH.codex.parseStatus(run(0, "", "Logged in using ChatGPT\n"))).toEqual({ status: "connected", account: { id: null, workspace: null } });
    expect(PROVIDER_AUTH.codex.parseStatus(run(1, "", "Error loading configuration"))).toEqual({ status: "failed", code: "check_failed" });
  });
});
