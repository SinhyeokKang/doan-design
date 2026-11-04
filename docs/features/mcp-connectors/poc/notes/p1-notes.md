# P1 (2026-11-04) — Claude Code 2.1.318, Codex 0.166.0, Notion https://mcp.notion.com/mcp, server doan-notion
Isolation: CLAUDE_CONFIG_DIR / CODEX_HOME under .scratch/mcp-poc/p1, real HOME (login keychain). ~/.claude.json and ~/.codex/config.toml sha unchanged.
- claude mcp get: unregistered -> exit 1 "No MCP server named ..."; registered -> exit 0 "Status: ! Needs authentication"; connected -> "Status: ✔ Connected"; after `claude mcp logout` -> "! Needs authentication". No JSON option; parse the Status line.
- claude mcp login (pty via script -q) -> BROWSER hook link (client_id claude.ai CIMD, redirect localhost:<port>/callback) -> "Authenticated with ...". Token in keychain "Claude Code-credentials-<hash(config dir)>"; no .credentials.json; profile gets mcp-needs-auth-cache.json ({} after auth). Keychain item stays after mcp logout (holds the profile's other data).
- codex mcp list --json: [] unregistered; entries carry auth_status: "not_logged_in" | "o_auth".
- codex mcp add --url writes config.toml, then starts OAuth itself, prints the URL and opens the default browser (BROWSER not used). First Notion page showed a Notion-side load error; retry passed.
- Codex with mcp_oauth_credentials_store="keyring": token in "Codex MCP Credentials" account "doan-notion|eac663db915250e7" (same URL hash as the terminal's notion item, different name); profile has only mcp-oauth-locks/*.lock and tmp/, no token file. `codex mcp logout` removes the item; terminal items (figma, notion, stub-*) unchanged.
Not done: calling a logged-out-but-registered Claude server from a conversation (needs an agent sign-in in the profile).

## P1 leftover (2026-11-04, after isolated `claude auth login`)
- Registered but logged-out `doan-notion` in a `claude -p` turn: init `mcp_servers` shows `{"name":"REDACTED","status":"needs-auth","source":"user"}`; no `mcp__doan-notion__*` tools (not even an auth tool); turn ends normally (no link wait, no browser). Evidence: evidence/p1b/claude-loggedout-call.jsonl
- claude.ai account connectors load into the isolated profile once signed in (source "claudeai", e.g. Notion/Atlassian connected) — duplicates possible as spec 59 says.
- `claude auth login` token lands in the same keychain item as MCP tokens: `Claude Code-credentials-7982b197`.
- `codex login` (keyring) adds `Codex Auth | cli|c6614db6c4db8911`.
