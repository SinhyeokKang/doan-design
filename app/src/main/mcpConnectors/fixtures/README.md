# MCP connector fixture provenance

From the 2026-11-04 mcp-connectors PoC (Claude Code 2.1.318, Codex 0.166.0), via the sanitized copies committed
with the feature documents (task A0):

- `claude-get-*.txt`: `claude mcp get <name>` output. The probe's trailing `exit N` annotation is dropped; tests
  pass the exit code (1 for `claude-get-unregistered.txt`, 0 otherwise).
- `codex-list-*.json`: `codex mcp list --json` output. The committed copy had the server name redacted; it is set
  to `doan-notion`, the server those runs registered at the Notion URL.
- `link-*.txt`: authorization links `claude mcp login` handed to the BROWSER hook. `state` and `code_challenge` are
  placeholders, and the Atlassian and Figma DCR `client_id` values are replaced with fake ones.
