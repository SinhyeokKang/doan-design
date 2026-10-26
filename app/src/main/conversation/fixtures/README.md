# Transport fixture provenance

Derived on 2026-10-27 from the reviewed conversation PoC worktree's
`.scratch/agent-conversation/` files:

- `claude.json`: `claude-sdk-probe.jsonl`, SDK 0.3.310 / installed CLI 2.1.310.
- `claude-interrupted.json`: `claude-sdk-interrupt.jsonl` (actual `terminal_reason: aborted_tools`).
- `codex.json`: `fp-codex-decline.jsonl`, installed app-server 0.163.0; file approval was answered with `decline`, then completed.
- `codex-interrupted.json`: `codex-interrupt.jsonl`.

Only representative message, activity, approval and terminal records are retained;
SDK bookkeeping/usage fields are omitted. Wire field names and nesting are preserved.
All paths, IDs and transcript content are synthetic. Numeric RPC ID 0 is preserved
because treating it as falsy would lose a real approval request. Tests separately
construct callback arguments and failure cases; those are synthetic, not additional
real-runtime observations. These fixtures do not establish packaging, authentication,
all permission policies, process ownership or real app integration.
