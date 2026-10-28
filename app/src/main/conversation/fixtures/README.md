# Transport fixture provenance

Derived on 2026-10-27 from the reviewed conversation PoC worktree's
`.scratch/agent-conversation/` files:

- `claude.json`: `claude-sdk-probe.jsonl`, SDK 0.3.310 / installed CLI 2.1.310.
- `claude-interrupted.json`: `claude-sdk-interrupt.jsonl` (actual `terminal_reason: aborted_tools`).
- `codex.json`: `fp-codex-decline.jsonl`, installed app-server 0.163.0; file approval was answered with `decline`, then completed.
- `codex-interrupted.json`: `codex-interrupt.jsonl`.

Only representative message, activity, approval and terminal records are retained;
SDK bookkeeping/usage fields are omitted. Wire field names and nesting are preserved.
All paths, IDs and transcript content are synthetic. Equal wire IDs retain equal
synthetic IDs across stream and completion records. Numeric RPC ID 0 is preserved
because treating it as falsy would lose a real approval request. Tests separately
construct callback arguments and failure cases; those are synthetic, not additional
real-runtime observations. These fixtures do not establish packaging, authentication,
all permission policies, process ownership or real app integration.

Synthetic command-policy and additional-permission cases use the PoC-generated
`codex-schema/CommandExecutionRequestApprovalParams.json` and
`codex-schema/PermissionsRequestApproval{Params,Response}.json` from 0.163.0.
These exercise schema mappings, not observed live permission-policy combinations.

On 2026-10-27, F-T restored `phase` and `itemsView` enum values by inspecting
only those protocol fields in the original source records: decline commentary /
final_answer and summary; interruption commentary and notLoaded. Synthetic private
fields were left intact. `codexIngress.test.ts` also constructs form elicitation
with omitted/null turnId and global attestation from the generated 0.163.0
`McpServerElicitationRequestParams.json` and `ServerRequest.json`, plus the R-T
reviewer's extra-error notification probes. These are synthetic boundary tests.

`index-v1.json` and `index-v2.json` are synthetic conversation index documents
(2026-10-28, agent-auth), not runtime observations. The v1 file includes a forged
`owner` to pin that v1 entries are never attributed to a doan account.
