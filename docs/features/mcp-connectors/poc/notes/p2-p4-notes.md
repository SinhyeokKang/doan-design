# P2–P4 (2026-11-04, Claude Code 2.1.318, Codex 0.166.0)

## P3 presets
- Atlassian https://mcp.atlassian.com/v1/mcp — DCR (not CIMD) for both. Claude: connect + atlassianUserInfo OK. Codex: connect + atlassianUserInfo OK.
- Figma https://mcp.figma.com/mcp — DCR, scope mcp:connect. Claude: connect + whoami OK. Codex: first `mcp add` OAuth ended "timed out waiting for OAuth callback" before approval (registration kept, not_logged_in); `codex mcp login doan-figma` retry approved after 4m27s OK; whoami OK. Codex tool name shown as mcp__doan_figma__whoami (hyphen→underscore).
- Background `script -q … &` from a shell gets EOF on stdin and claude mcp login exits 1 with no link; foreground/pty with open stdin works (node-pty unaffected).

## P2 app-server (probe p2/probe.mjs, log p2/probe.log, p2/probe-approval.log)
- New thread/start re-reads config.toml: server added by an external `codex mcp add` after the app-server started appears in the next thread (no restart, no reload).
- Already-started thread does not see it until `config/mcpServer/reload` ({} → {}); after reload every loaded thread re-emits startup status and picks it up.
- mcpServer/startupStatus/updated params: {threadId, name, status: starting|ready|failed|cancelled, error, failureReason: null|reauthenticationRequired}. threadId IS set. No events before the first thread/start.
- Not-logged-in server: status failed ~45ms, error "The doan-notion MCP server is not logged in. Run `codex mcp login doan-notion`."
- Remote ready times after thread/start: ~0.95–1.6 s (Atlassian, Figma, codex_apps); stdio ~30 ms. Each turn/start re-emits starting→ready for the thread (~110 ms).
- mcpServerStatus/list {detail:"toolsAndAuthOnly"}: authStatus oAuth|notLoggedIn|unsupported|bearerToken, tool counts (Atlassian 33, Figma 46).
- Tool approval: approvalPolicy "never" → call fails "MCP tool call requires approval, but approval policy is never". "on-request" → server request `mcpServer/elicitation/request` with _meta.codex_approval_kind "mcp_tool_call", persist ["session","always"], message "Allow the <server> MCP server to run tool "<tool>"?". A wrong answer shape counted as "user rejected MCP tool call". Atlassian atlassianUserInfo ran with no approval request (read-only). Doan's dispatcher answers unknown server requests with -32601.

## P4
- Codex: a fresh CODEX_HOME with no account login and only `[mcp_servers.doan-atlassian] url=…` written to config.toml reports auth_status o_auth → the `<name>|<URL hash>` token is reused across profiles. `codex mcp add` starts OAuth even when a token exists (approving it overwrote the same keychain item), so a replacement profile must get config.toml written directly.
- Claude same-profile `claude auth login` while MCP connected: MCP stays Connected and atlassianUserInfo works (same keychain item, mdat updated).
- `claude auth logout`: MCP servers go `! Needs authentication`; keychain item stays with only mcpOAuth entries whose accessToken is empty (discovery state kept).
