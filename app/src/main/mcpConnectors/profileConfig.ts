import { CONNECTOR_NAME } from "./names";
import type { ListedServer } from "./status";

// The registrations a provider profile's own config holds, read when the provider's list cannot be (BB review Y3):
// a sign-out or replacement must still know which doan- servers to log out. Only server names and URLs are taken;
// tokens are not in these files (they are in the OS keychain), and nothing else in them is used. null: the config
// could not be read for certain, which is never "no servers": the caller then falls back to every server Doan knows.

const BARE_KEY = "[A-Za-z0-9_-]+", QUOTED_KEY = '"[^"\\\\]*"';
const KEY = `(?:${BARE_KEY}|${QUOTED_KEY})(?:\\s*\\.\\s*(?:${BARE_KEY}|${QUOTED_KEY}))*`;
const HEADER = new RegExp(`^\\[\\s*(${KEY})\\s*\\]\\s*(?:#.*)?$`);
const KEY_VALUE = new RegExp(`^(${KEY})\\s*=\\s*(.*)$`);
const unquote = (part: string) => part.startsWith('"') ? part.slice(1, -1) : part;
const keyParts = (key: string) => (key.match(new RegExp(`${BARE_KEY}|${QUOTED_KEY}`, "g")) ?? []).map(unquote);

// One single-line TOML value and an optional trailing comment. string: the decoded value of a string; ok: false for
// anything not positively read (unterminated, multi-line, unbalanced, trailing text).
function value(text: string): { ok: true; string: string | null } | { ok: false } {
  const rest = (after: string) => /^\s*(?:#.*)?$/.test(after);
  if (text.startsWith('"""') || text.startsWith("'''")) return { ok: false };
  const basic = /^"((?:[^"\\\u0000-\u001f]|\\(?:["\\btnfr]|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}))*)"(.*)$/.exec(text);
  if (basic) {
    if (!rest(basic[2]!)) return { ok: false };
    return { ok: true, string: basic[1]!.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (_, escape: string) =>
      escape.length > 1 ? String.fromCodePoint(parseInt(escape.slice(1), 16)) : ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" } as Record<string, string>)[escape] ?? escape) };
  }
  const literal = /^'([^'\u0000-\u001f]*)'(.*)$/.exec(text);
  if (literal) return rest(literal[2]!) ? { ok: true, string: literal[1]! } : { ok: false };
  if (text.startsWith('"') || text.startsWith("'")) return { ok: false };
  if (text.startsWith("[") || text.startsWith("{")) {
    // An inline array or table on one line: brackets outside strings must close, then only a comment may follow.
    let depth = 0, quote: string | null = null, end = -1;
    for (let i = 0; i < text.length && end < 0; i++) {
      const ch = text[i]!;
      if (quote) { if (ch === "\\" && quote === '"') i++; else if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "[" || ch === "{") depth++;
      else if (ch === "]" || ch === "}") { depth--; if (depth === 0) end = i; }
    }
    return end >= 0 && rest(text.slice(end + 1)) ? { ok: true, string: null } : { ok: false };
  }
  // Numbers, booleans and dates.
  return /^[A-Za-z0-9_.:+-]+(?:[ T][0-9:.+-]+Z?)?\s*(?:#.*)?$/.test(text) ? { ok: true, string: null } : { ok: false };
}

// Codex `config.toml`: `[mcp_servers.<name>]` tables (bare or quoted name, sub-tables allowed) with a one-line `url`, as
// `codex mcp add` and codexServerToml write them. Elsewhere only multi-line strings are tracked (so a `[` line inside
// one is not a header); any other way of naming MCP servers (dotted keys, inline tables, arrays of tables, the bare
// `[mcp_servers]` table) or an unreadable line inside a server table is a failure.
export function codexConfigServers(text: string): ListedServer[] | null {
  const servers: ListedServer[] = [];
  let server: ListedServer | null = null, inServers = false, multiline: string | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (multiline) {
      if (inServers) return null;
      // Odd count of the delimiter on the line closes the string.
      if ((line.split(multiline).length - 1) % 2 === 1) multiline = null;
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("[[")) {
      if (/^\[\[\s*"?mcp_servers/.test(line)) return null;
      inServers = false; server = null; continue;
    }
    if (line.startsWith("[")) {
      const header = HEADER.exec(line);
      if (!header) { if (/^\[\s*"?mcp_servers/.test(line)) return null; inServers = false; server = null; continue; }
      const parts = keyParts(header[1]!);
      if (parts[0] !== "mcp_servers") { inServers = false; server = null; continue; }
      if (parts.length < 2) return null;
      inServers = true;
      if (parts.length > 2) { server = null; continue; }
      const name = parts[1]!;
      server = CONNECTOR_NAME.test(name) ? { name, url: null, authenticated: null } : null;
      if (server) servers.push(server);
      continue;
    }
    const pair = KEY_VALUE.exec(line);
    if (!pair) { if (inServers) return null; continue; }
    const key = keyParts(pair[1]!);
    if (!inServers && key[0] === "mcp_servers") return null;
    const read = value(pair[2]!.trim());
    if (!read.ok) {
      if (inServers) return null;
      // A multi-line string outside the servers: skip to its end.
      const opener = /^("""|''')/.exec(pair[2]!.trim());
      if (opener && (pair[2]!.trim().split(opener[1]!).length - 1) % 2 === 1) multiline = opener[1]!;
      continue;
    }
    if (server && key.length === 1 && key[0] === "url") {
      if (read.string === null) return null;
      server.url = read.string;
    }
  }
  return multiline && inServers ? null : servers;
}

// Claude `.claude.json` in the profile (CLAUDE_CONFIG_DIR): the user-scope `mcpServers` map. Absent is no servers;
// a map or entry of another shape is a failure.
export function claudeConfigServers(text: string): ListedServer[] | null {
  let doc: unknown;
  try { doc = JSON.parse(text); } catch { return null; }
  const object = (item: unknown): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item);
  if (!object(doc)) return null;
  if (!Object.hasOwn(doc, "mcpServers")) return [];
  const map = doc.mcpServers;
  if (!object(map)) return null;
  const servers: ListedServer[] = [];
  for (const [name, entry] of Object.entries(map)) {
    if (!CONNECTOR_NAME.test(name)) continue;
    if (!object(entry) || (entry.url !== undefined && typeof entry.url !== "string")) return null;
    servers.push({ name, url: typeof entry.url === "string" ? entry.url : null, authenticated: null });
  }
  return servers;
}
