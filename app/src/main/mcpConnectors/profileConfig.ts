import { CONNECTOR_NAME } from "./names";
import type { ListedServer } from "./status";

// The registrations a provider profile's own config holds, read when the provider's list cannot be (BB review Y3):
// a sign-out or replacement must still know which doan- servers to log out. Only server names and URLs are taken;
// tokens are not in these files (they are in the OS keychain), and nothing else in them is used.

const BASIC = /^"((?:[^"\\]|\\.)*)"$/, LITERAL = /^'([^']*)'$/;
function tomlString(value: string): string | null {
  const literal = LITERAL.exec(value);
  if (literal) return literal[1]!;
  const basic = BASIC.exec(value);
  if (!basic) return null;
  return basic[1]!.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (_, escape: string) => {
    if (escape.length > 1) return String.fromCodePoint(parseInt(escape.slice(1), 16));
    return ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" } as Record<string, string>)[escape] ?? escape;
  });
}

// Codex `config.toml`: `[mcp_servers.<name>]` tables (bare or quoted name) and their `url` line, as `codex mcp add`
// and codexServerToml write them.
export function codexConfigServers(text: string): ListedServer[] {
  const servers: ListedServer[] = [];
  let current: ListedServer | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      const header = /^\[\s*mcp_servers\.(?:"([^"]+)"|([A-Za-z0-9_-]+))\s*\]$/.exec(line);
      const name = header ? header[1] ?? header[2]! : null;
      current = name && CONNECTOR_NAME.test(name) ? { name, url: null, authenticated: null } : null;
      if (current) servers.push(current);
      continue;
    }
    const url = current && /^url\s*=\s*(.+?)\s*$/.exec(line);
    if (current && url) current.url = tomlString(url[1]!);
  }
  return servers;
}

// Claude `.claude.json` in the profile (CLAUDE_CONFIG_DIR): the user-scope `mcpServers` map.
export function claudeConfigServers(text: string): ListedServer[] | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (typeof value !== "object" || value === null) return null;
  const map = (value as { mcpServers?: unknown }).mcpServers;
  if (typeof map !== "object" || map === null) return [];
  return Object.entries(map).filter(([name]) => CONNECTOR_NAME.test(name)).map(([name, entry]) => {
    const url = typeof entry === "object" && entry !== null && typeof (entry as { url?: unknown }).url === "string" ? (entry as { url: string }).url : null;
    return { name, url, authenticated: null };
  });
}
