import type { ConnectorsRead } from "./files";
import { CONNECTOR_NAME } from "./names";
import { PRESETS, type McpProvider } from "./presets";

// Only names Doan made are ever touched: the doan- prefix keeps the person's terminal registrations out of reach.
const doan = (names: readonly string[]) => names.filter(name => CONNECTOR_NAME.test(name));

// The doan- registrations a provider keeps that are neither a preset nor a URL server in the file: left by a Remove
// while that provider had no Doan connection. Nothing is removed while the file cannot be read, and a missing
// registration is not added back (a server registers at its first Connect).
export function reconcilePlan(registered: readonly string[], file: ConnectorsRead): string[] {
  if (!file.ok) return [];
  const known = new Set([...PRESETS.map(preset => preset.name), ...file.file.servers.map(server => server.name)]);
  return doan(registered).filter(name => !known.has(name));
}

// servers: the doan- registrations read from the provider's own list, so a broken connectors file does not stop
// the logout. Account ids are the stored ones; Codex stores none, so each of its replacements logs out.
export interface McpLogoutInput {
  provider: McpProvider; kind: "signOut" | "replace";
  previousAccountId: string | null; nextAccountId: string | null; servers: readonly string[];
}
// register: servers to write into the Codex staging profile. record: pending logouts to keep (and block Connect on).
// unregister: servers to remove from the live profile.
export interface McpLogoutOutcome { register: string[]; record: string[]; unregister: string[] }

function sameAccount(input: McpLogoutInput): boolean {
  return input.kind === "replace" && input.previousAccountId !== null && input.previousAccountId === input.nextAccountId;
}

// Claude sign-out adds no step: `claude auth logout` already clears its MCP tokens. Codex keys tokens by name and URL
// hash, not profile, so its sign-out logs each server out first and a replacement logs out before the new profile
// can reuse them. A Claude replacement logs the live profile out after commit.
export function mcpLogoutPlan(input: McpLogoutInput): { logout: string[] } {
  if ((input.provider === "claude" && input.kind === "signOut") || sameAccount(input)) return { logout: [] };
  return { logout: doan(input.servers) };
}

export function mcpLogoutOutcome(input: McpLogoutInput, failed: readonly string[]): McpLogoutOutcome {
  const logout = mcpLogoutPlan(input).logout;
  const record = logout.filter(name => failed.includes(name));
  const staging = input.provider === "codex" && input.kind === "replace";
  // The same account keeps its tokens, so the staging profile takes every registration.
  const register = staging ? (sameAccount(input) ? doan(input.servers) : logout.filter(name => !record.includes(name))) : [];
  return { register, record, unregister: input.provider === "codex" && input.kind === "signOut" ? record : [] };
}

function tomlString(text: string): string {
  return `"${text.replace(/[\\"\u0000-\u001f\u007f]/g, ch => ch === "\\" ? "\\\\" : ch === '"' ? '\\"' : `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`)}"`;
}

// The block Doan writes into a Codex staging profile's config.toml (design '계정 교체'): `codex mcp add` would start a
// new OAuth sign-in and open the default browser even when a token exists.
export function codexServerToml(name: string, url: string): string {
  if (!CONNECTOR_NAME.test(name)) throw new Error("Invalid MCP server name");
  if (!URL.canParse(url) || new URL(url).protocol !== "https:") throw new Error("Invalid MCP server URL");
  return `[mcp_servers.${name}]\nurl = ${tomlString(new URL(url).href)}\n`;
}

const PLAINTEXT: Record<McpProvider, readonly string[]> = {
  // Claude falls back to this file when the keychain fails (agentAuth/providers.ts).
  claude: [".credentials.json"],
  // Codex runs with mcp_oauth_credentials_store="keyring", so it writes no token file (design '토큰 저장 확인').
  codex: [],
};

export function plaintextLeftovers(provider: McpProvider, files: readonly string[]): string[] {
  return files.filter(file => PLAINTEXT[provider].includes(file));
}
