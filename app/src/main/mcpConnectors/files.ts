import { CONNECTOR_NAME, parseConnectorUrl, storedConnectorUrl } from "./names";
import { MCP_PROVIDERS, PRESETS, type ConnectorServer, type McpProvider } from "./presets";

// `<userData>/mcp-connectors.json` and `<userData>/mcp-connectors-pending.json` (mcp-connectors design '포맷 변경').
// Only TS reads and writes them, so, like preferences.json, their tests are their schema. Unlike preferences, an
// unreadable connectors file is not read as defaults: the providers keep Doan's registrations, so an empty list
// would drift from them (design 'store'). Exact keys keep anything else from riding along.

// everConnected: per server, presets included, the providers it ever connected under; Reconnect needed derives from it.
export interface ConnectorsFile { v: 1; servers: ConnectorServer[]; everConnected: Record<string, McpProvider[]> }
// broken: unreadable or invalid. newer: a later Doan wrote it; never read or written.
export type ConnectorsRead = { ok: true; file: ConnectorsFile } | { ok: false; code: "broken" | "newer" };
export type ConnectorsPatch =
  | { add: ConnectorServer }
  | { remove: string }
  | { everConnected: { name: string; provider: McpProvider; value: boolean } };

// A logout that failed during a sign-out or replacement, retried at startup and before that server's Connect. url is
// the one the provider registered, kept verbatim: Codex rebuilds its keychain key from it.
export interface PendingLogout { provider: McpProvider; name: string; url: string }
export interface PendingLogoutsFile { v: 1; logouts: PendingLogout[] }
export type PendingLogoutsRead = { ok: true; file: PendingLogoutsFile } | { ok: false; code: "broken" | "newer" };
export type PendingLogoutsPatch = { add: PendingLogout[] } | { remove: { provider: McpProvider; name: string } };

export const EMPTY_CONNECTORS: ConnectorsFile = { v: 1, servers: [], everConnected: {} };
export const EMPTY_PENDING: PendingLogoutsFile = { v: 1, logouts: [] };

const PRESET_NAMES = new Set(PRESETS.map(preset => preset.name));
const PRESET_URLS = new Set(PRESETS.map(preset => preset.url));

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const provider = (value: unknown): value is McpProvider => MCP_PROVIDERS.some(p => p === value);
const name = (value: unknown): value is string => typeof value === "string" && CONNECTOR_NAME.test(value);
const unique = (values: readonly string[]) => new Set(values).size === values.length;

function version(text: string | null): { v: 1; value: Record<string, unknown> } | { v: "none" } | { v: "broken" | "newer" } {
  if (text === null) return { v: "none" };
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { v: "broken" }; }
  if (!record(value) || typeof value.v !== "number" || !Number.isInteger(value.v) || value.v < 1) return { v: "broken" };
  return value.v > 1 ? { v: "newer" } : { v: 1, value };
}

// Stored URLs are already normalized, so a duplicate is an equal string.
function validServer(value: unknown): value is ConnectorServer {
  if (!record(value) || !exactKeys(value, ["name", "url"]) || !name(value.name) || PRESET_NAMES.has(value.name) || typeof value.url !== "string") return false;
  return storedConnectorUrl(value.url) && !PRESET_URLS.has(value.url);
}

function validConnectors(value: Record<string, unknown>): value is Record<string, unknown> & ConnectorsFile {
  if (!exactKeys(value, ["v", "servers", "everConnected"]) || !Array.isArray(value.servers) || !value.servers.every(validServer) || !record(value.everConnected)) return false;
  const servers: ConnectorServer[] = value.servers;
  if (!unique(servers.map(s => s.name)) || !unique(servers.map(s => s.url))) return false;
  const known = new Set([...PRESET_NAMES, ...servers.map(s => s.name)]);
  return Object.entries(value.everConnected).every(([key, providers]) =>
    known.has(key) && Array.isArray(providers) && providers.length > 0 && providers.every(provider) && unique(providers));
}

export function parseConnectorsFile(text: string | null): ConnectorsRead {
  const read = version(text);
  if (read.v === "none") return { ok: true, file: EMPTY_CONNECTORS };
  if (read.v !== 1) return { ok: false, code: read.v };
  return validConnectors(read.value) ? { ok: true, file: read.value } : { ok: false, code: "broken" };
}

// null: the patch does not apply (a taken name or URL, a preset, an unknown server, a malformed server).
export function patchConnectors(file: ConnectorsFile, patch: ConnectorsPatch): ConnectorsFile | null {
  if ("add" in patch) {
    const next = { ...file, servers: [...file.servers, { name: patch.add.name, url: patch.add.url }] };
    return validServer(patch.add) && validConnectors(next) ? next : null;
  }
  if ("remove" in patch) {
    if (!file.servers.some(server => server.name === patch.remove)) return null;
    const { [patch.remove]: _, ...everConnected } = file.everConnected;
    return { ...file, servers: file.servers.filter(server => server.name !== patch.remove), everConnected };
  }
  const { name: target, provider: which, value } = patch.everConnected;
  if (!PRESET_NAMES.has(target) && !file.servers.some(server => server.name === target)) return null;
  const current = new Set(file.everConnected[target] ?? []);
  if (value) current.add(which); else current.delete(which);
  const providers = MCP_PROVIDERS.filter(p => current.has(p));
  const { [target]: _, ...rest } = file.everConnected;
  return { ...file, everConnected: providers.length ? { ...rest, [target]: providers } : rest };
}

function validLogout(value: unknown): value is PendingLogout {
  return record(value) && exactKeys(value, ["provider", "name", "url"]) && provider(value.provider) && name(value.name) &&
    typeof value.url === "string" && parseConnectorUrl(value.url).ok && value.url === value.url.trim();
}

const logoutKey = (logout: Pick<PendingLogout, "provider" | "name">) => `${logout.provider}\0${logout.name}`;

function validPending(value: Record<string, unknown>): value is Record<string, unknown> & PendingLogoutsFile {
  return exactKeys(value, ["v", "logouts"]) && Array.isArray(value.logouts) && value.logouts.every(validLogout) && unique(value.logouts.map(logoutKey));
}

export function parsePendingLogouts(text: string | null): PendingLogoutsRead {
  const read = version(text);
  if (read.v === "none") return { ok: true, file: EMPTY_PENDING };
  if (read.v !== 1) return { ok: false, code: read.v };
  return validPending(read.value) ? { ok: true, file: read.value } : { ok: false, code: "broken" };
}

// Each server is recorded once per provider; a later record replaces an earlier one in place.
export function patchPendingLogouts(file: PendingLogoutsFile, patch: PendingLogoutsPatch): PendingLogoutsFile | null {
  if ("remove" in patch) return { ...file, logouts: file.logouts.filter(logout => logoutKey(logout) !== logoutKey(patch.remove)) };
  if (!patch.add.every(validLogout)) return null;
  const logouts = [...file.logouts];
  for (const entry of patch.add) {
    const copy = { provider: entry.provider, name: entry.name, url: entry.url };
    const at = logouts.findIndex(logout => logoutKey(logout) === logoutKey(entry));
    if (at === -1) logouts.push(copy); else logouts[at] = copy;
  }
  return { ...file, logouts };
}
