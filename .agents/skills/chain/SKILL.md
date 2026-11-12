---
name: chain
description: Use to link several features into a chain of /orchestrate runs, serial unless they share no code — the lead writes the chain file, settles its order and standing permissions with the user, starts each link's conductor, and reviews and merges each link's PR. Also the rules a link's conductor follows.
---

A **chain** runs several `/orchestrate` runs, one feature per link. Links run one after another, each starting after the one before has merged, except links whose code does not overlap, which run in parallel (§1 step 2). The **lead** (the develop-checkout session, AGENTS.md 'Workflow' Lead and conductors) sets the chain up, starts every link's conductor, and reviews and merges every link's PR; it writes no feature code and conducts no link. §1–§2 and §3 'Lead' are for the lead, §3 'Conductor' for each link's conductor.

The chain file `docs/features/chain-<YYMMDD>-<n>/chain.md` is the single source for the chain: order, the user's standing permissions, the start check, the status of each link and the handoff log. It is written in Korean (AGENTS.md 'Korean writing rules'), and only the lead writes it, committed and pushed on develop; a conductor never edits it on its branch. A conductor reads it at intake; it overrides `/orchestrate`'s defaults only where it says so.

## Usage

- `/chain <slug> <slug> ...` — link these features, in the order given or in the order §1 step 2 finds.
- `/chain` — infer the features from the preceding conversation, and say which ones before writing.

## 1. Write the chain file

1. **Check each feature.** `docs/features/<slug>/{spec,design,tasks}.md` exist. Note for each: whether `/feature-review` ran or the user waived it, whether a draft still needs the user's confirmation, any open point left in its documents ('확인 필요' or similar), any task whose verification command is "needs user confirmation", and whether its `/runtime-test` needs a provider login. Do not settle these yourself; they go into the start check.
2. **Order by file overlap.** Read each design's affected files. A link that removes or restructures code another link extends goes first, so the later link starts on top of it; a known bug fix goes early; the largest link usually goes last. Write one line of reasoning per link.
   - **Parallel when nothing overlaps.** Compare the files each design says it changes: code and tests (`app/`, `cli/`, `eval/`), schemas and fixtures, skills, and drafts (`.doan/canvases/`). The shared documents every link promotes into (PRODUCT, ARCHITECTURE, DESIGN, BACKLOG, POSTMORTEM, USABILITY-EVAL, DIRECTORY, README) do not count. Adjacent links with no overlapping file form a parallel group: the lead starts them together, each from the latest `origin/develop`, and merges their PRs in link order. A link that overlaps any link of a group waits until that group has fully merged. When unsure whether two links overlap, run them in series.
3. **Standing permissions.** The lead merges each link's PR into develop, in link order, once its review and gate pass, then starts the next link. This is the chain default: write it into `상시 권한` without asking. Other grants come only from the user; anything not granted is asked as usual.
   - **Model boundary**: the same rule as `/orchestrate` and AGENTS.md 'Runtime differences'. Nothing crosses it until the user explicitly allows it. Do not ask or offer; record a crossing only when the user states it, with the scope they give (every link, or named links) and any limit they mention. "Same as before" does not carry a previous chain's crossing over unless the user says so.
4. **Facts from the machine, not memory.** The date comes from `date '+%Y-%m-%d'` (it names the directory and the log entries). `<n>` is the chain's place among that day's chains, from 1: one more than the number of `chain-<YYMMDD>-*` directories that date has ever had, deleted ones included (`git log --all --format= --name-only --diff-filter=A -- 'docs/features/chain-<YYMMDD>-*'`), so a name never repeats. Absolute paths, such as the shared login profile, come from `git rev-parse --show-toplevel` of the main checkout.
5. **Write the file** with these sections:
   - `규칙`: a link to this skill and AGENTS.md 'Workflow' Chains.
   - `순서`: each link with links to its spec·design·tasks, its review/draft state and the ordering reason, and which links form a parallel group with the overlap check behind it (or that the chain is serial and why).
   - `시작 점검`: what the lead must settle with the user before link 1 — everything step 1 left open — and that it asks them in one batch and records the approval in `인계 기록`. After that approval, conductors decide routine matters themselves and ask only for new product or scope decisions or decisions that touch real user state.
   - `상시 권한`: step 3's grants, and the conductor runtime (the lead's model family unless the user allowed another). When the user allowed a crossing: its scope, that the conductor checks the other family's remaining usage at link start and when splitting batches, and that each link's `orch.md` records the scope used.
   - `로그인` (only when a link needs one): probes use the real HOME's provider login; the lead creates every login the chain needs in the start check; the logged-in userData lives in the main checkout's `.scratch/provider-profile/userData` (absolute path), because each link has its own worktree; links reuse it, copy it for destructive probes, check it before asking for a new login, and do not sign out per link; once the last link's PR has arrived, the lead signs out, confirms the Keychain item is gone and deletes the userData before merging it.
   - `진행 규칙`: a pointer to §3 of this skill.
   - `운영 메모`: worker-wait loop notes and whether `/agent-eval` applies to any link.
   - `링크 상태`: a table (link · session·worktree · start · PR·merge · status), all 대기.
   - `인계 기록`: one entry for this session.
6. **Commit and push to develop**: `docs(chain): link <slug>, <slug> and <slug> runs`, staging only the chain file. This is a docs change, so it is committed on develop and pushed straight to develop (AGENTS.md 'Commit conventions').

## 2. Start the chain

Only when the user asks to start. Run the start check with the user in one batch and record the approval in `인계 기록`, then start link 1 (or link 1's parallel group) as §3 'Lead' describes.

## 3. Running the links

### Lead

- **Start a link.** Follow `/ship` 'Lead' step 1 with `feat/<slug>` from the freshly fetched `origin/develop`: worktree name `<slug>-orch`, branch `feat/<slug>`, `<runtime>` being the conductor runtime the chain file names. The brief points to the chain file, the link's feature directory and anything not yet written down (decisions or unverified items from earlier links the link must know), and says to run `/orchestrate docs/features/<slug>/`. One session per link; a session never conducts two links. Record the session and worktree in `링크 상태` and push it.
- **Parallel groups.** Start every link of a group together, each in its own worktree. Merge their PRs in link order; contention between them follows `/ship` 'Lead' step 4.
- **Merge a link.** Review and merge as in `/ship` 'Lead' steps 3–5. Then record the result in the chain file (merge commit, PR, unverified items and decisions the next link must know, from the PR body and the conductor), push it, and start the next link once every link it waits on has merged.
- **After the last merge,** delete the chain directory (`docs(chain): remove chain-<YYMMDD>-<n>`), with the login cleanup done before that merge if the chain had one.

### Conductor

- **Permissions come from the chain file.** Use only what it grants for its listed links; anything else is asked as usual.
- **Finish the link** as `/orchestrate` §5 does: all batches integrated, final `/verify`, docs promoted and the feature directory deleted, batch worktrees cleaned up, PR pushed against develop. Put what the next link must know (unverified items, decisions made during the link) in the PR body, not in the chain file. Then stay available for the lead's findings and its request to merge `origin/develop` in, until the lead merges; the lead removes the conductor's worktree.

## Report

The report is delivered to the user in Korean.

```
⛓ chain: docs/features/chain-<YYMMDD>-<n>/chain.md
Open (first): <start-check items still open · anything not verified>
Order: <link — one-line reason>
Standing permissions: <merge · model crossing · source (asked / copied from <commit>)>
Commit: <hash>
Links: <link — not started / conductor <worktree> / PR <url> / merged <hash>>
```

## Prohibited

- The lead does not edit feature documents, settle a feature's open points without the user, or conduct a link. A conductor does not merge or edit the chain file.
- Do not grant a permission the user did not give, or carry over a previous chain's terms without the user saying so. Never cross the model boundary, for conductors or workers, without the user's explicit permission.
- Do not start the chain before the user asks.
