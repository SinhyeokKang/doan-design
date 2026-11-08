---
name: tester-build
description: Build a Developer ID signed and notarized (app and dmg) tester dmg of Doan in CI from the latest remote develop and put it on the Desktop as Doan-tester-<date>-<sha>.dmg. Pushes a tester-<date>-<sha> tag that starts .github/workflows/test-build.yml, waits for the maintainer to approve the release environment, and downloads the artifact. Use when the user asks for a test or tester build, a dmg to install locally, or to share with a tester. Pushes only its own tester tag; does not install, commit or push code.
---

# Tester build

Tester builds are signed in GitHub Actions, not on this machine: arm64 only, from the latest `origin/develop`, signed with Developer ID under hardened runtime, with both the app and the dmg notarized and stapled, and without an update feed. The credentials live only in the repository's `release` environment; the one-time setup and renewal are in the release documentation (ARCHITECTURE §9). The workflow is `.github/workflows/test-build.yml`; it starts on a pushed `tester-*` tag, refuses commits that are not on `develop`, runs the CI gate, and then waits for the maintainer to approve the `release` environment before signing.

**The dmg always goes to the Desktop (`~/Desktop`).** Never leave it in the repo, `.scratch/`, `app/dist/` or any other folder, even when asked for "a build" without a location.

**The maintainer approves every run.** The agent never approves a deployment (no `gh api … pending_deployments`). In Codex, `git push` and `gh` need the network outside the sandbox; request out-of-sandbox execution for them.

## Preflight

Stop at any failure and report what the human must do.

1. **gh.** `gh auth status` succeeds for github.com.
2. **Source and target.** `git fetch origin develop`, note `sha=$(git rev-parse --short=7 origin/develop)`, its full sha and today's local date, and `tag=tester-<YYYY-MM-DD>-<sha>`. If `~/Desktop/Doan-<tag>.dmg` exists, stop and ask instead of overwriting.
3. **Earlier run.** If `git ls-remote --tags origin refs/tags/<tag>` shows the tag, an earlier run built this commit today: find it with `gh run list --workflow test-build.yml --branch <tag>` and continue from step 3 below with that run instead of pushing again. If its sign job failed, ask before `gh run rerun <id> --failed`.

## Steps

1. **Tag.** `git push origin <full sha of origin/develop>:refs/tags/<tag>`. No local tag is created; never push any other tag or move an existing one.
2. **Find the run.** `gh run list --workflow test-build.yml --branch <tag> --json databaseId,url,status`; the run can take a few seconds to appear, so retry for up to a minute.
3. **Approval.** After the `source` and `gate` jobs (about 7 minutes) the run status becomes `waiting`. Tell the user the run URL and that they approve the `release` environment there (Review deployments). If the run fails before that, report the failing job and stop (`gh run view <id> --log-failed`).
4. **Wait.** `gh run watch <id> --exit-status`. The sign job takes up to 90 minutes (two packaging passes, app notarization, up to 30 minutes of dmg notarization).
   - Failure: report the failing step and its log lines (`gh run view <id> --log-failed`; secrets are masked there, but do not quote anything that looks like a credential).
   - "dmg notarization not accepted": the log names the submission id and prints the notary log; report both.
   - "not set in the release environment": report the missing names for the human to set.
5. **Download.** `gh run download <id> --name Doan-<tag> --dir <tmp>` into a fresh temporary directory; it holds `Doan-<tag>.dmg`.
6. **Verify on this Mac.** `node app/scripts/verifySignedPackage.mjs <tmp>/Doan-<tag>.dmg` from this checkout. It applies a quarantine flag to a copy and checks every Mach-O signature, the entitlements, the designated requirement, the staples and Gatekeeper (`spctl`) for the dmg and the app, the way a tester's Mac will. Every line must be `ok`; otherwise stop and report the failing checks.
7. **Copy.** Copy the dmg to `~/Desktop/Doan-<tag>.dmg`.
8. **Clean up.** Delete the tag (`git push origin :refs/tags/<tag>`); the run and its artifact (kept 7 days) stay. Remove the temporary directory. When the run failed, keep the tag and say so in the report, so a rerun keeps its ref.

## Report (Korean)

- The dmg path, the source sha and its commit subject, the run URL, and the verification result.
- How a tester installs it: drag to Applications and open; confirm once that it was downloaded from the internet. No Open Anyway and no `xattr`.
- Test builds have no update feed; a tester installs each new build by hand.
- A tester who used an earlier ad-hoc build may be asked again for `doan Safe Storage` keychain access (unverified).
- Opening the copy in `/Applications` runs Agent setup on the real HOME (ARCHITECTURE §7 'Agent setup'): `~/.local/bin/doan`, `~/.local/share/doan`, skill links, the Codex rule, and possibly an administrator dialog for `/usr/local/bin/doan`. The tester-side flow on another Mac is unverified.
- Whether the tag was deleted.

## Prohibited

- Do not read, print or write secrets, and do not set or change environment secrets or variables; the human does that.
- Do not approve the `release` environment deployment.
- Do not sign locally or fall back to an ad-hoc or unsigned build when the run fails.
- Do not push tags other than this run's `tester-<date>-<sha>`, and do not move or delete other tags.
- Do not change `app/package.json` build settings or the workflow.
- Do not install the app, open it, or touch the real HOME's agent setup targets; the user does that.
- Do not overwrite an existing dmg on the Desktop.
