---
name: publish
description: Bring public-facing documentation commits (README, docs, issue and PR templates, the landing page under web/) from develop to main without a release — no version bump, no tag, no GitHub Release. Cherry-picks the chosen develop commits onto a branch from main, merges it through a PR after the CI gate, then merges main back into develop. Only the maintainer invokes it, as /publish <slug> [<commit>...].
disable-model-invocation: true
---

# Publish

`main` changes in two ways only: `/release` (a versioned release of everything on `develop`) and this skill (public-facing documentation that should not wait for the next release, such as a README fix or a landing page update). `/publish` never moves app, CLI, workflow or build code to `main`; that only goes out with `/release`.

The maintainer's invocation approves the PR merge into `main` and the merge of `main` back into `develop`. The skill stops only on a failure and reports it.

In Codex, `git push` and `gh` need the network outside the sandbox; request out-of-sandbox execution for them.

## Usage

- `/publish <slug> <commit>...` — publish those `develop` commits.
- `/publish <slug>` — list the candidates and ask which to publish (one question), then continue.

`<slug>` names the branch `publish/<slug>`. `R` is `gh repo view --json nameWithOwner --jq .nameWithOwner`.

## Publishable paths

A commit can be published only when every file it touches is under:

- `README.md`
- `docs/`, except `docs/features/` (plans are not published)
- `.github/ISSUE_TEMPLATE/` and `.github/pull_request_template.md` (not `.github/workflows/`, which is code)
- `web/` (the landing page)

`docs/PRODUCT.md`, `docs/ARCHITECTURE.md` and `docs/DESIGN.md` describe `develop`, including behaviour not released yet. Publish a commit to them only when it does not describe unreleased behaviour; say so in the report.

## Steps

0. **Invocation.** Continue only if the user typed `/publish` in this conversation. If another skill, a chain, a worker or the model itself started it, stop.
1. **Preflight.** Stop and report at the first failure.
   - `git fetch origin`. The working tree is clean.
   - `git rev-list --count --no-merges origin/develop..origin/main` is 0: everything on `main` is already on `develop` (a missing back-merge from an earlier `/publish` or hotfix shows here).
   - No open PR into `main` (`gh pr list --base main --state open`); a release or publish already in flight goes first.
2. **Candidates.** `git log --cherry-pick --right-only --no-merges --reverse --format='%H %s' origin/main...origin/develop` lists the `develop` commits whose change is not on `main` yet. Keep those whose files (`git show --name-only --format= <sha>`) are all publishable. Without commits in the invocation, show these and ask once which to publish. A named commit that touches a path outside the publishable list, or is not in the list, stops the run with its files; a mixed commit cannot be split here.
3. **Branch.** `git switch -c publish/<slug> origin/main`, then `git cherry-pick -x <sha>...` in `develop` order. A conflict means the commit depends on an earlier unpublished one: `git cherry-pick --abort`, stop and report both commits.
4. **PR and merge.** `git push -u origin publish/<slug>`, `gh pr create --base main --head publish/<slug> --title "Publish: <slug>"` with the commit list as the body, wait for `gh pr checks <n> --watch --required`, then `gh pr merge <n> --merge`. A failed gate stops the run; report it.
5. **Back to develop.** `git switch develop && git pull --rebase`, `git merge -X ours --no-edit origin/main` (on a conflict `develop` wins: every change on `main` came from `develop`), and push `develop` directly (no PR, so release notes do not list it). Then `git rev-list --count --no-merges origin/develop..origin/main` must be 0. This step is what keeps the next `/release` merge free of conflicts; never skip it.
6. **Report** (Korean): the commits published, the PR and merge commit, the back-merge commit, anything touching PRODUCT/ARCHITECTURE/DESIGN and whether it describes released behaviour, and anything not done. Keep the `publish/<slug>` branch (AGENTS.md 'Keep implementation branches').

## Resume

- PR open, gate failed: fix on `develop`, then call `/publish <slug>` again with the fixed commits; close the old PR first.
- Merged into `main`, back-merge not done: run step 5 only.

## Prohibited

- Publishing app, CLI, schema, eval, workflow or build changes, or any file outside the publishable paths.
- Pushing to `main` directly, bumping the version, creating a tag or a GitHub Release.
- Running when the user did not invoke `/publish` in this conversation.
- Skipping the back-merge into `develop`.
