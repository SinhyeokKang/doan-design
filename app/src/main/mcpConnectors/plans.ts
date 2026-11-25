import type { ConnectorsRead } from "./files";
import { CONNECTOR_NAME } from "./names";
import { PRESETS, type McpProvider } from "./presets";

// Only names Doan made are ever touched: the doan- prefix keeps the person's terminal registrations out of reach.
const doan = (names: readonly string[]) => names.filter(name => CONNECTOR_NAME.test(name));

// doan- registrations neither a preset nor a URL server in the file, or under a known name at another URL: left by a
// Remove while signed out. url null: the list gave none. Nothing is removed while the file cannot be read.
export function reconcilePlan(registered: readonly { name: string; url: string | null }[], file: ConnectorsRead): string[] {
  if (!file.ok) return [];
  const known = new Map([...PRESETS, ...file.file.servers].map(server => [server.name, server.url]));
  return registered.filter(server => CONNECTOR_NAME.test(server.name) && (!known.has(server.name) || staleUrl(server.url, known.get(server.name)!)))
    .map(server => server.name);
}

// Whether a registration's URL is not the one Doan stores for its name. Both are the stored string Doan registered,
// compared as is (ARCHITECTURE §7 'MCP connectors' 'URLs').
export function staleUrl(registered: string | null, stored: string): boolean {
  return registered !== null && registered !== stored;
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

// A Claude sign-out adds no step: `claude auth logout` clears its MCP tokens. Codex keys tokens by name and URL hash, not
// profile, so its sign-out and replacement log each server out first; a Claude replacement logs out after commit.
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

// `codex mcp add` would start a new OAuth sign-in even when a token exists (ARCHITECTURE §7 'MCP connectors'). The URL
// string is written as registered: Codex derives the keychain key from it, so re-serializing could name another entry.
export function codexServerToml(name: string, url: string): string {
  if (!CONNECTOR_NAME.test(name)) throw new Error("Invalid MCP server name");
  // The URL parser drops tabs and line breaks silently; the string written is the one checked.
  if (/[\u0000-\u001f\u007f]/.test(url) || !URL.canParse(url) || new URL(url).protocol !== "https:") throw new Error("Invalid MCP server URL");
  return `[mcp_servers.${name}]\nurl = ${tomlString(url)}\n`;
}

const PLAINTEXT: Record<McpProvider, readonly string[]> = {
  // Claude falls back to this file when the keychain fails (agentAuth/providers.ts).
  claude: [".credentials.json"],
  // Codex runs with mcp_oauth_credentials_store="keyring", so it writes no token file (ARCHITECTURE §7 'MCP connectors').
  codex: [],
};

export function plaintextLeftovers(provider: McpProvider, files: readonly string[]): string[] {
  return files.filter(file => PLAINTEXT[provider].includes(file));
}
