---
name: chain
description: Use to link several features into a serial chain of /orchestrate runs — write the chain file, settle its order and standing permissions with the user, and start the first conductor. Also the rules every conductor in a chain follows to finish, hand off and retire.
---

A **chain** runs several `/orchestrate` runs one after another, each feature merged to main before the next starts. This skill has two parts: §1–§2 are for the session that sets the chain up (it writes no code and conducts no link), §3 is for every conductor running a link.

The chain file `docs/features/chain-<YYMMDD>/chain.md` is the single source for the chain: order, the user's standing permissions, the start check, the status of each link and the handoff log. It is written in Korean (AGENTS.md 'Korean writing rules') and committed on main. A conductor reads it at intake; it overrides `/orchestrate`'s defaults only where it says so.

## Usage

- `/chain <slug> <slug> ...` — link these features, in the order given or in the order §1 step 2 finds.
- `/chain` — infer the features from the preceding conversation, and say which ones before writing.

## 1. Write the chain file

1. **Check each feature.** `docs/features/<slug>/{spec,design,tasks}.md` exist. Note for each: whether `/feature-review` ran or the user waived it, whether a draft still needs the user's confirmation, any open point left in its documents ('확인 필요' or similar), any task whose verification command is "needs user confirmation", and whether its `/runtime-test` needs a provider login. Do not settle these yourself; they go into the start check.
2. **Order by file overlap.** Read each design's affected files. A link that removes or restructures code another link extends goes first, so the later link starts on top of it; a known bug fix goes early; the largest link usually goes last. Write one line of reasoning per link.
3. **Standing permissions.** Every link merges its own PR to main once its integration gate passes, then hands off to the next link (an exception to `/orchestrate`'s 'Do not merge PRs'). This is the chain default: write it into `상시 권한` without asking. Other grants come only from the user; anything not granted is asked as usual.
   - **Model boundary**: the same rule as `/orchestrate` and AGENTS.md 'Runtime differences'. Nothing crosses it until the user explicitly allows it. Do not ask or offer; record a crossing only when the user states it, with the scope they give (every link, or named links) and any limit they mention. "Same as before" does not carry a previous chain's crossing over unless the user says so.
4. **Facts from the machine, not memory.** The date comes from `date '+%Y-%m-%d'` (it names the directory and the log entries). Absolute paths, such as the shared login profile, come from `git rev-parse --show-toplevel` of the main checkout. A chain directory name may repeat one deleted earlier; refer to that earlier chain by commit.
5. **Write the file** with these sections:
   - `규칙`: a link to this skill and AGENTS.md 'Workflow' Chains.
   - `순서`: each link with links to its spec·design·tasks, its review/draft state and the ordering reason.
   - `시작 점검`: what the first conductor must settle with the user before link 1 — everything step 1 left open — and that it asks them in one batch and records the approval in `인계 기록`. After that approval, conductors decide routine matters themselves and ask only for new product or scope decisions or decisions that touch real user state.
   - `상시 권한`: step 3's grants, and the conductor runtime (the setup session's model family unless the user allowed another). When the user allowed a crossing: its scope, that the conductor checks the other family's remaining usage at link start and when splitting batches, and that each link's `orch.md` records the scope used.
   - `로그인` (only when a link needs one): probes use the real HOME's provider login; the first conductor creates every login the chain needs in the start check; the logged-in userData lives in the main checkout's `.scratch/provider-profile/userData` (absolute path), because each link has its own worktree; links reuse it, copy it for destructive probes, check it before asking for a new login, and do not sign out per link; the last link signs out, confirms the Keychain item is gone and deletes the userData before its merge.
   - `인계와 물러나기`: a pointer to §3 of this skill.
   - `운영 메모`: worker-wait loop notes and whether `/agent-eval` applies to any link.
   - `링크 상태`: a table (link · session·worktree · start · PR·merge · status), all 대기.
   - `인계 기록`: one entry for this session.
6. **Commit and push to main**: `docs(chain): link <slug>, <slug> and <slug> runs`, staging only the chain file. This is a docs change, so it goes straight to main from main (AGENTS.md 'Commit conventions').

## 2. Start the first conductor

Only when the user asks to start. Load the version-matched `orca-cli` guide, fetch `origin`, then create link 1's top-level worktree with the conductor in it:

```
orca worktree create --name <slug>-orch --no-parent --agent <runtime> --prompt "<brief>" --json
```

`<runtime>` is the conductor runtime the chain file names: this session's own model family (`claude` from Claude Code, `codex` from Codex) unless the user allowed another.

The brief points to the chain file and link 1's feature directory, says this conductor is the first and starts with the chain file's start check, lists what the start check must settle, and says to run `/orchestrate docs/features/<slug>/` after the approval. Confirm the session started on it (the receipt's outcome, then the terminal's title or first output via `orca terminal list --worktree <id> --json`) before reporting. This session then stays out of the chain; it does not conduct links.

## 3. Rules for conductors in a chain

- **One session per link.** Each link starts in a new session of the chain file's conductor runtime, in its own Orca top-level worktree created from the freshly pulled `origin/main` (`orca worktree create --name <slug>-orch --no-parent --agent <runtime> ...`). The conductor branches `feat/<slug>` from main inside that worktree as usual. A session never conducts two links.
- **Permissions come from the chain file.** Use only what it grants for its listed links; anything else is asked as usual.
- **The first conductor runs the start check** before link 1 and gets the user's one-time approval.
- **Finish before handing off.** The outgoing conductor completes its link: all batches integrated, final `/verify`, docs promoted and the feature directory deleted, PR pushed and merged, local main pulled, its batch worktrees cleaned up (`/orchestrate` §5). It then records the result in the chain file (merge commit, PR, unverified items, decisions the next link must know) and pushes that to main.
- **Responsible handoff.** The outgoing conductor starts the next link's session with a brief that points to the chain file, the next feature's documents and anything not yet written down, and lists what the next session must do first. It waits until the new session has visibly started on the brief (the receipt's prompt outcome, then a first message or a chain-file acknowledgement), and answers its questions about the previous link. A handoff that only launched a terminal is not complete.
- **Retire.** After the handoff is acknowledged, the outgoing conductor stops: it releases or closes nothing that belongs to the new session, confirms its own worktree is clean and fully on main (`git cherry` with no `+`), removes that worktree through Orca when it is not the session's own running checkout, or asks the user to close the session, and reports.
- **The last link** deletes the chain directory after its merge (`docs(chain): remove chain-<YYMMDD>`), with the login cleanup if the chain had one.

## Report

The report is delivered to the user in Korean.

```
⛓ chain: docs/features/chain-<YYMMDD>/chain.md
Open (first): <start-check items left for the first conductor · anything not verified>
Order: <link — one-line reason>
Standing permissions: <merge · model crossing · source (asked / copied from <commit>)>
Commit: <hash>
First conductor: not started / <worktree> started on the brief
```

## Prohibited

- The setup session does not edit feature documents, settle a feature's open points itself, or conduct a link.
- Do not grant a permission the user did not give, or carry over a previous chain's terms without the user saying so. Never cross the model boundary, for conductors or workers, without the user's explicit permission.
- Do not start the first conductor before the user asks.
