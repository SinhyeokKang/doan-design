---
name: orchestrate
description: Use to split one batch plan document across several worker sessions running in parallel, with this session conducting decision gathering, review, integration, and push. A larger unit than /ship.
---

Split a batch plan (usually `docs/features/<slug>/tasks.md`) **across several worker sessions**, and this session **only conducts**. Workers implement with `/ship bypass`. Like `/ship`, start from main with `git switch -c feat/<slug>`; the end is a push of that branch + PR. Do not merge.

> The conductor does not edit batch code. The only things the conductor writes are `orch.md`, integration commits, and docs-freshness commits. Defects go back to the worker that owns the batch.

**Language**: `orch.md` lives under `docs/features/<slug>/`, so it is written in Korean following AGENTS.md 'Korean writing rules'. Worker briefs are written in English. When promoting conclusions, `docs/PRODUCT.md` and `docs/ARCHITECTURE.md` are written in English.

## Usage

- `/orchestrate <plan document>` — all batches. `/orchestrate <plan document> <batch...>` — only the named batches.

## 0. Intake (before launching workers)

1. **Write `orch.md` first** — for a feature, `docs/features/<slug>/orch.md`. Only point to the source spec and tasks. Contents: starting hash, integration branch, decision log, batch table (item · file ownership · prerequisites · model·effort and why · verification gate · status), file overlaps and parallel/serial order.
2. **Get all decisions up front** — ask about points open to interpretation **one at a time** with the runtime's question tool (AskUserQuestion in Claude Code). Include one recommendation with a reason and an 'Other (type your own)' option. Record the answers in the decision log. Do not ask what PRODUCT or AGENTS already answers; write "conductor's call — <basis>". Batches that need design go through `/feature` → `/feature-review` first, here.
3. **Model and effort per batch** — the conductor rates each batch's difficulty (how much judgment it needs, what breaks if it is wrong) and launches the worker that fits; the runtime is not the choice. Give every batch (implementation, review, fix round) its own model and effort and write one line of reasoning in the batch table, e.g. a mechanical batch → Sonnet medium, a security- or concurrency-heavy batch → Opus high.
   - Claude Code conductor: Sonnet or Opus, effort at most `high` (no `xhigh`/`max`). In Orca pass them explicitly: `worker-start … --agent claude --model sonnet --effort medium`, then check `launch.effective`.
   - Codex workers (a Codex conductor, or a Claude Code conductor with crossing permission): **Astra is the stronger model, Sol the lighter one**. Astra goes up to `medium`, Sol up to `high` — the lower effort cap does not mean Astra is weaker. Judgment-heavy batches → Astra `medium`; mechanical batches → Sol `low`/`medium`; use Sol `high` only when a batch needs more steps than judgment. In Orca pass the provider id: `--agent codex --model gpt-6-astra --effort medium` or `--model gpt-6.1-sol` (ids as of 2026-10-22; check `$CODEX_HOME/models_cache.json` when they change), then check `launch.effective`.
   - Runtime boundary (AGENTS.md 'Runtime differences') still holds: a Claude Code conductor launches only Claude workers, a Codex conductor only Codex workers. Crossing needs the user's explicit permission, never because of token shortage, missing tools, failures, or speed.
4. **Split parallel/serial by file overlap** — do not run two batches that edit the same file in parallel. Do not make a worker wait for another batch. For items that depend on a prerequisite, brief: "leave it, finish the rest, then list it as a 'deferred item' in the handoff", and after integrating the prerequisite, send that item as a new Task.
5. **Check that every checkbox item in tasks maps to one batch row.** Zero ownerless items.
6. **Commit `orch.md`, then** launch the first worker. Worktrees branch from commits, so workers cannot read an uncommitted plan.

## 1. Launching workers

- In an Orca environment, read the `orchestration` skill and manage Run, Task, and Dispatch with its procedure.
- Batches with non-overlapping file ownership each run in their own worktree. In Orca, start each with `--worktree new-child --base-branch feat/<slug>`; without `--base-branch` the child branches from main, not from the conductor's checkout (AGENTS.md 'Workflow').
- **Write the brief to a file and send it as one line.** Include: the plan source and assigned items, files not to touch, allowed model, the `/ship` override (**stop before the push step** — no `git push` or `gh pr create`), gate commands (only from AGENTS.md 'Commands'; if none, the worker stops and reports), handoff protocol (write commits, verification results, and incomplete items to `.scratch/handoff-<batch>.md` and send the completion signal once).
- Respect the sessions' permission settings. Do not add permission-bypass flags or click another session's approval prompts on its behalf.

## 2. Monitoring

- Do not rely only on completion notifications. Run a background loop that checks status periodically (ending on the first change).
- Heartbeats, idle waits, and timeouts are not completion. Check the handoff document against the actual commits.
- **Handle heartbeats silently**. The background loop acknowledges deliveries that hold only heartbeats and keeps waiting; it wakes the conductor only for `worker_done`, `question` or `escalation`. Do not report heartbeats to the user. When an "orchestration message" notice turns out to be only heartbeats, acknowledge it and reply with exactly one line per worker, `<batch> heartbeat` (e.g. `BR heartbeat`), and nothing else. Read a heartbeat's `phase` only when judging whether a quiet worker is stuck. In Orca, a loop like this works:
  ```bash
  while true; do
    out=$(orca orchestration check --run <run> --wait --types "worker_done,escalation,question" --timeout-ms 1800000 --json | grep -v _keepalive)
    # if every message in $out is a heartbeat: ack its deliveryId and continue; otherwise print and exit
  done
  ```
- **Detect stalled workers in the same loop.** A worker can stop without `worker_done`, a question or an escalation: Codex on a capacity error, or any agent whose turn simply ends early. Heartbeats do not reveal this, because a worker's own background heartbeat script keeps sending the same `phase`, and Orca's `activity` can stay `working`. On each loop pass, for every in-progress dispatch, also wake the conductor when either check holds on two consecutive passes: `worker-list` `projection.stage.activity` is not `working`, or the tail of its `agentTerminalHandle` (`orca terminal read --terminal <handle> --json`) shows an idle prompt with no busy indicator (no spinner line such as `Brewing… (`, no `esc to interrupt`, no `Working (`). Then read the terminal. If the agent stopped mid-batch, send it a follow-up (`orchestration send --to dispatch:<id>`) naming the remaining steps and confirm it started. If a Codex session cannot continue, tell the user, because resuming it is the user's action.
- An instruction sent to a worker does not count as delivered until you confirm **signs the worker started on it**. Do not queue the next job for a worker mid-turn. Send it as a new Task after completion.

## 3. Review → fix rounds

### Design draft review

When the run includes `/design-draft`, the conductor owns and performs the draft review before handing it to the user for confirmation. A worker's completion report or CLI checks alone do not satisfy this gate.

- Compare the draft against the feature spec and design: every required state must map to a frame or labelled tile, with no unapproved product behavior.
- Check that shipped UI, tokens, English copy, and canvas conventions are preserved, and verify the `doan ls` / `doan check` evidence.
- Inspect the draft rendered in the real app, including long content, errors, focus, overlapping pins, and dialogs when applicable. Record findings and verification evidence in `orch.md`.
- Route fixes to the draft worker, then personally verify the revised result. The conductor does not edit the draft code.
- Only after this review passes, present the concrete draft for user confirmation. Conductor review does not replace the user's draft confirmation gate.

### Implementation batch review

1. Hand the batch diff to an **independent review worker** (same runtime, model and effort chosen for the diff's difficulty, report only) with `/code-review`. Also have it judge the handoff document's claims and "differences from the plan".
2. Separate 🔴/🟡 from user-decision items. Ask decisions one at a time.
3. Send a fix brief to the owning worker. Repeat until 🔴 is 0.

## 4. Integration

- Integration target: this run's single `feat/<slug>` branch (branched from main and recorded in `orch.md`).
- Check that `git status --porcelain` is empty, then cherry-pick the batch commits. Run [/verify](../verify/SKILL.md) at the integration HEAD, selecting `--eval` when applicable and checking affected app behavior with a short `/runtime-test` probe. Coordinate with workers so static gates and GUI probes do not overlap. Worker passes do not verify the combined result; the separate AGENTS `/agent-eval` requirement still applies.
- Like `/ship` step 9, check docs freshness and add PRODUCT and `orch.md` updates as per-document commits.
- Tell workers with deferred items that the prerequisite has landed, and confirm they started.

## 5. Push and cleanup

- When all batches are integrated, push `feat/<slug>` as in `/ship` step 11 and `gh pr create --base main`. Do not merge.
- If the feature is finished, promote the conclusions to PRODUCT (product judgments) and ARCHITECTURE (structure, formats, conventions) as current rules (rationale in the commit message) and delete `docs/features/<slug>/`. Delete `orch.md` along with it.
- Clean up each finished worker as soon as it has no follow-up work; do not wait until the entire run ends. **Releasing a worker terminal does not remove its Orca child worktree or sidebar card**. Finish both cleanup layers:
  1. Confirm accepted Dispatch settlement, then use `orca orchestration worker-release --dispatch <dispatch_id> --json`. Verify the release receipt; follow its recovery instructions if uncertain. Never substitute `terminal close` for supervised release or release a live worker.
  2. Before deleting a batch worktree, confirm no active worker or pending task needs it, `git -C <path> status --porcelain` is empty, and no commit remains unintegrated. For cherry-picked batches, `git -C <path> cherry <integration_branch> HEAD` must have no `+` entries; differing commit hashes alone do not mean work is missing. Preserve unresolved differences instead of forcing deletion.
  3. Promote needed conclusions to the source of truth. Copy handoffs and any still-needed measurement, review, or verification evidence into the conductor checkout's `.scratch/` and verify the copies before removal. A worktree needed by a running reviewer or an unfinished design-sync remains until that dependency is satisfied.
  4. Load the version-matched `orca-cli` guide, resolve the exact full worktree id, and run `orca worktree rm --worktree id:<repo-id>::<path> --json`. Use Orca rather than raw `git worktree remove` or `rm -rf`, so its managed card and lineage are removed too. Note the batch branch's tip first: Orca also deletes the checked-out branch when it is merged, and implementation branches stay until the user says otherwise (AGENTS.md 'Commit conventions'), so recreate it at that tip if the receipt shows it deleted. Do not use `--force` to bypass dirty files, unintegrated work, or an archive-hook failure.
  5. Verify the removal receipt and `orca worktree list --repo id:<repo-id> --json`: the removed child id must be absent. Record any intentionally remaining worktree and its dependency in `orch.md` and the report. Terminal release alone is not completed cleanup.

## 6. Linked runs (chains)

A **chain** runs several `/orchestrate` runs one after another, each feature merged to main before the next starts. The chain file `docs/features/chain-<YYMMDD>/chain.md` (Korean, committed on main) is the single source for the chain: order, the user's standing permissions, the status of each link and the handoff log. Read it at intake; it overrides the defaults below only where it says so.

- **One session per link.** Each link starts in a new Claude Code session in its own Orca top-level worktree created from the freshly pulled `origin/main` (`orca worktree create --name <slug>-orch --no-parent --agent claude ...`). The conductor branches `feat/<slug>` from main inside that worktree as usual. A session never conducts two links.
- **Permissions come from the chain file.** A chain may grant, for its listed links only: merging each link's PR to main (an exception to 'Do not merge PRs'), and crossing the model boundary for workers (for example Codex workers under a Claude conductor; AGENTS.md 'Runtime differences'). Use only what the chain file grants; anything else is asked as usual.
- **Finish before handing off.** The outgoing conductor completes its link: all batches integrated, final `/verify`, docs promoted and the feature directory deleted, PR pushed and merged (when granted), local main pulled, its batch worktrees cleaned up (§5). It then records the result in the chain file (merge commit, PR, unverified items, decisions the next link must know) and pushes that to main.
- **Responsible handoff.** The outgoing conductor starts the next link's session with a brief that points to the chain file, the next feature's documents and anything not yet written down, and lists what the next session must do first. It waits until the new session has visibly started on the brief (the receipt's prompt outcome, then a first message or a chain-file acknowledgement), and answers its questions about the previous link. A handoff that only launched a terminal is not complete.
- **Retire.** After the handoff is acknowledged, the outgoing conductor stops: it releases or closes nothing that belongs to the new session, confirms its own worktree is clean and fully on main (`git cherry` with no `+`), removes that worktree through Orca when it is not the session's own running checkout, or asks the user to close the session, and reports. The last link deletes the chain directory after its merge.

## Report

The report is delivered to the user in Korean.

```
🎼 orchestrate: <plan document>
Incomplete / unverified (first): <checks not run · remaining decisions>
Batches: <table — status · integration hash · rounds · model·effort>
Model crossing: none / <scope of permission>
push: feat/<slug> + PR <url>
Worktrees: <what remains>
```

## Prohibited

- Do not merge PRs, unless a chain file grants it for the current link (§6).
- The conductor does not edit batch code directly.
- Do not cross model families without permission (a chain file may grant it for its links, §6).
- Do not run batches with overlapping files in parallel.
- Do not approve another session's permission prompts or widen permission rules without user approval.
