import type { McpFacts } from "./state";

// Status outputs as of Claude Code 2.1.318 and Codex 0.166.0 (mcp-connectors design 'PoC 결과' P1). null: unreadable,
// shown as Couldn’t check rather than guessed.

// `claude mcp get <name>` has no JSON option. An unknown name exits 1; a registered one prints a block headed
// `<name>:` whose Status line says whether its sign-in works (the command also health-checks the server).
export function parseClaudeMcpGet(name: string, output: string, exitCode: number): McpFacts | null {
  if (exitCode === 1) return output.trim().startsWith(`No MCP server named "${name}".`) ? { registered: false } : null;
  const lines = output.split("\n").map(line => line.trim());
  if (exitCode !== 0 || lines[0] !== `${name}:`) return null;
  const status = lines.find(line => line.startsWith("Status:"))?.slice("Status:".length).trim();
  if (status === "✔ Connected") return { registered: true, authenticated: true };
  if (status === "! Needs authentication") return { registered: true, authenticated: false };
  return null;
}

// `codex mcp list --json`: every registered server with its auth_status. authenticated is null for a status Doan does
// not know (bearer tokens, unsupported), which reads as Couldn’t check rather than as signed out.
export function parseCodexMcpList(text: string): { name: string; authenticated: boolean | null }[] | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(value)) return null;
  const servers: { name: string; authenticated: boolean | null }[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || typeof item.name !== "string" || !item.name) return null;
    servers.push({ name: item.name, authenticated: item.auth_status === "o_auth" ? true : item.auth_status === "not_logged_in" ? false : null });
  }
  return servers;
}
