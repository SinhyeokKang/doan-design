// The authorization link `claude mcp login` hands to the BROWSER hook. Main fixes every URL it opens (ARCHITECTURE §7),
// but each MCP server authorizes on its own host (mcp.notion.com, mcp.atlassian.com, www.figma.com), so the host is
// not checked: the link must be an https PKCE code request that returns to the CLI's own loopback listener.
// The same checks as agentAuth/providers.ts claudeLink, without its fixed origin.
export function mcpAuthLink(raw: string): string | null {
  if (raw.length > 16384 || /\s/.test(raw) || !URL.canParse(raw)) return null;
  const url = new URL(raw);
  const one = (name: string) => url.searchParams.getAll(name).length === 1 ? url.searchParams.get(name) ?? "" : "";
  const redirect = URL.canParse(one("redirect_uri")) ? new URL(one("redirect_uri")) : null;
  const port = Number(redirect?.port);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || raw.includes("#") ||
      one("response_type") !== "code" || !/^\S{1,512}$/.test(one("code_challenge")) ||
      !redirect || redirect.protocol !== "http:" || (redirect.hostname !== "localhost" && redirect.hostname !== "127.0.0.1") ||
      !Number.isInteger(port) || port < 1024 || port > 65535 || redirect.pathname !== "/callback" || redirect.username || redirect.password) return null;
  return raw;
}
