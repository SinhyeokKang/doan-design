# Usage fixtures

Real responses from the provider-usage PoC (2026-11-05, macOS 26.3.1 arm64), read through a Doan connection. Account IDs, emails, user IDs and tokens are removed; only the shape and plan names are kept.

| File | Source | Version | Plan |
|---|---|---|---|
| `claude-usage.json` | Claude Agent SDK `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })` (control request `get_usage`), new session | SDK 0.3.312, CLI 2.1.318 (2.1.284 answered the same shape) | team |
| `codex-usage.json` | Codex app-server `account/rateLimits/read` result, `accountId` removed | 0.166.0 (0.158.0 answered the same shape) | free |
| `copilot-usage.json` | Copilot CLI `--headless --stdio` JSON-RPC `account.getQuota` result | 1.0.105 | free |
| `cursor-usage.json` | Body of `GET https://cursor.com/api/usage-summary` (status 200) | cursor-agent 2026.10.22-27dcf5f | free |
