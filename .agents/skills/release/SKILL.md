---
name: release
description: Cut a Doan release from develop to main, or a hotfix release from the last stable tag. Bumps the version, merges develop into main through a PR, pushes the v<version> tag that starts .github/workflows/release.yml, approves its own release run, checks the draft Release and publishes it. Only the maintainer invokes it, as /release <version> or /release hotfix <slug>.
disable-model-invocation: true
---

# Release

`/release` is the only way code reaches `main` (AGENTS.md 'Commit conventions'); `/publish` brings public-facing documentation there between releases and merges `main` back into `develop`, so a release still starts from a `main` that `develop` contains. The maintainer's invocation approves everything the release needs: the `develop` → `main` merge, the `release` environment deployment of the release run, and publishing. The skill stops only on a failure and reports it.

The workflow, its checks and the asset names are in ARCHITECTURE §9 'Signing in CI' and 'Release builds'. This skill calls only the names given there; the logic stays in the workflow and in `app/scripts/`.

In Codex, `git push` and `gh` need the network outside the sandbox; request out-of-sandbox execution for them.

## Usage

- `/release <version>` — from a `develop` checkout. `<version>` is `x.y.z` or `x.y.z-rc.N`.
- `/release hotfix <slug>` — starts a hotfix branch from the last stable tag ('Hotfix mode').
- `/release <version>` from a `hotfix/<slug>` checkout — releases that hotfix.

Throughout, `R` is `gh repo view --json nameWithOwner --jq .nameWithOwner`, and working files go in `.scratch/release/<version>/`.

## Release mode

0. **Invocation.** Continue only if the user typed `/release` in this conversation. If another skill, a chain, a worker or the model itself started it, stop. (Claude Code also refuses model invocation through `disable-model-invocation`; Codex has no such switch, so this check is the guard there.)
1. **Preflight.** Stop and report at the first failure.
   - The checkout is `develop`, the working tree is clean, and `HEAD` equals `origin/develop` after `git fetch origin`.
   - No chain is running: no `docs/features/chain-*/chain.md` whose '링크 상태' table has a link past 대기 (started, a PR, merged). A chain file written ahead whose links are all still 대기 does not block; name it in the report. List open pull requests against `develop` in the report; they are not blockers.
   - `git rev-list --count --no-merges origin/develop..origin/main` is 0 (nothing reached `main` outside a release; each release's merge commit stays only on `main`, so merges are not counted).
   - The `gate` check on `origin/develop`'s HEAD passed (`gh run list --workflow ci.yml --branch develop --event push --limit 1 --json headSha,conclusion`, with that `headSha`; `--event push` skips a release PR's own run, which can end cancelled).
   - `node app/scripts/checkReleaseVersion.mjs <version>` exits 0. On failure report its code (`bad_semver`, `published_exists`, `draft_exists`, `not_newer`) and stop, except that `draft_exists` for this `<version>` with the tag already pushed and its `release.yml` run succeeded (`gh run list --workflow release.yml --branch v<version> --json conclusion,headSha`) means a run finished before the session ended: continue from step 6 with that draft instead of stopping. With a failed run, follow the 'Tag exists, run failed or timed out' row.
   - If the state matches a row of 'Resume', continue from that row instead.
   - Report, without stopping, any `docs/features/<slug>/` whose tasks are all checked but which was not deleted.
2. **Version bump.** If `app/package.json` `version` differs from `<version>`, run `npm --prefix app version <version> --no-git-tag-version` (it also updates `app/package-lock.json`). npm rewrites `app/package.json` with its own formatting, expanding the inline arrays under `build`, so write the committed file back with only its `"version"` line changed (`git show HEAD:app/package.json | sed 's/^  "version": "<old>",$/  "version": "<version>",/' > app/package.json`) and check that `git diff --stat` shows one changed line there. Commit both as `chore(release): <version>` and push to `develop`.
3. **Notes.** List the pull requests merged into `develop` since the last tag: for a stable version the last stable tag (`git tag -l 'v*' --sort=-v:refname | grep -v -- '-rc\.' | head -1`), for an rc the last `v*` tag; with no tag, all of them. Use `gh pr list --base develop --state merged --search "merged:>=<tag date>" --limit 300 --json number,title,mergedAt`, keep those merged after the tag's commit time, and group the titles by their Conventional Commit type (Features, Fixes, Other) as `- <title> (#<n>)`. Commits pushed straight to `develop` without a pull request are not listed. Write `notes.md`. The notes need no approval.
   - The notes open with one download line: download `Doan-macos-arm64.dmg`; the zip, `.blockmap` and `latest-mac.yml` are for the app's own updates, and the Source code archives are GitHub's.
   - **First stable release** (no earlier stable tag): most of the product reached `main` before `develop` existed, so a PR list says little. Lead with an introduction drawn from the README: its one-line description and the first 'Why Doan' item; one line per 'Features' heading; install (the `releases/latest/download/Doan-macos-arm64.dmg` link, move to Applications, first run, the five supported agents); that the app updates itself from GitHub Releases; known limits (Apple silicon only, and a link to `docs/BACKLOG.md`). Then the PR list since the last rc tag, under "Since <last rc>".
4. **Merge into main.** `gh pr create --base main --head develop --title "Release <version>" --body-file notes.md`, wait for `gh pr checks <n> --watch`, then `gh pr checks <n> --required` until it lists `gate` as passed (`gate` appears only after the shards finish), then `gh pr merge <n> --merge`. If the gate fails, stop and report ('Resume'). Never push to `main` directly.
5. **Tag.** `git fetch origin main`, take the merge commit (`gh pr view <n> --json mergeCommit --jq .mergeCommit.oid`), and `git tag -a v<version> <merge sha> -m "Doan <version>"` then `git push origin v<version>`. The push starts `release.yml`.
   - Find the run: `gh run list --workflow release.yml --branch v<version> --json databaseId,headSha,status,url`, retrying for up to a minute.
   - After `source` and the gate (about 7 minutes) the run waits for the `release` environment. Check that the run's `headSha` is the merge sha, then approve it: get the environment id with `gh api repos/$R/environments/release --jq .id` and `gh api -X POST repos/$R/actions/runs/<id>/pending_deployments -F 'environment_ids[]=<env id>' -f state=approved -f comment='/release <version>'`. Approve only this run, only after the sha check. If the API refuses, give the user the run URL to approve under Review deployments and wait.
   - `gh run watch <id> --exit-status`. On failure report the failing job and step (`gh run view <id> --log-failed`; do not quote anything that looks like a credential) and stop ('Resume'). If the run is still going 60 minutes after the approval, report its id and stop.
6. **Check the draft.** Find the draft: `gh release view v<version> --json isDraft,isPrerelease,tagName,assets`, or, when that does not find it, the entry for the tag in `gh release list --json tagName,isDraft,name` and its id.
   - The assets are exactly `Doan-macos-arm64.dmg`, `Doan-<version>-arm64-mac.zip`, its `.blockmap` and `latest-mac.yml`.
   - `gh release download v<version> --dir .scratch/release/<version>/assets` (or by the release id), then `node app/scripts/verifySignedPackage.mjs <dmg> <zip>` with `latest-mac.yml` next to the zip. Every check line must be `ok` and the last line `all checks passed`.
   - `git rev-parse v<version>^{commit}` is the merge sha. An rc draft is a prerelease; a stable one is not.
   - Any failure: do not publish; follow the 'Draft fails its checks' row.
7. **Publish.** When every check in 6 passed, `gh release edit v<version> --notes-file notes.md --draft=false`. An rc stays a prerelease.
8. **Report** (Korean): the version, the tag and its commit, the release PR, the workflow run, the assets and check results, the release URL, the notes, open pull requests left on `develop`, and anything not done.

## Hotfix mode

Two invocations; never run `/ship` inside one, because a broken session could not resume.

1. **`/release hotfix <slug>`.** Step 0, then find the last stable tag (as in step 3; rc tags never count, so a released rc does not leak into the hotfix). `git push origin <tag>^{commit}:refs/heads/hotfix/<slug>`, check it out, and stop. The report says: fix it on this branch with `/ship`, then call `/release <next patch>` from it.
2. **The user fixes it with `/ship` on `hotfix/<slug>`.** `/ship` keeps that branch and opens its PR against `main` (its 'Branch' rule). A regression fix also gets `/postmortem`.
3. **`/release <version>` from the `hotfix/<slug>` checkout.** `<version>` is the next patch after that tag.
   - Preflight as in step 1, against `origin/hotfix/<slug>` instead of `develop`: clean tree equal to the remote branch, the PR's `gate` passed, the version check passes. The `--no-merges origin/develop..origin/main` check still applies.
   - Bump on the hotfix branch (step 2) and push it.
   - The notes are the titles of the PRs from `hotfix/<slug>` into `main`.
   - Merge the `/ship` PR from `hotfix/<slug>` into `main` (`gh pr merge --merge` after its gate), then steps 5–7.
   - **Back to develop.** `gh pr create --base develop --head hotfix/<slug> --title "Merge hotfix <version> into develop"`; after its gate, `gh pr merge --merge`. If it conflicts, merge `origin/develop` into a local `hotfix/<slug>`: for `app/package.json` and `app/package-lock.json` keep the higher version; for any other conflicting file, abort the merge, stop and report the files.
   - Report: step 8 plus the back-merge PR.

Hotfix mode has not been run for real yet (BACKLOG.md 'Undecided').

## Resume

Calling `/release <version>` again resumes from the state preflight detects. Tags are never moved or deleted.

| State | Detected by | Action |
|---|---|---|
| Only the bump commit is on `develop` | `app/package.json` is `<version>`, no open release PR | Continue from step 3 |
| Release PR open, gate failed | `gh pr list --base main --head develop` | Stop and report. Fix on `develop` (a normal `/ship` PR); calling again continues from step 4 |
| Merged, no tag | `main` has the merge commit, `git ls-remote --tags origin v<version>` is empty | Continue from step 5 |
| Tag exists, run failed or timed out | `gh run list --workflow release.yml --branch v<version>` | Delete a leftover draft first (`gh release delete v<version> --yes`, keeping the tag; otherwise the version check fails with `draft_exists`), then `gh run rerun <id> --failed` and continue from the approval in step 5 |
| Draft fails its checks | Draft present, step 6 failed | Do not publish. Delete the draft (`gh release delete v<version> --yes`, keeping the tag) and report why. A code fix goes out as the next rc or patch |
| Published | A published release for the tag | Stop and report; never overwrite it |

## One-time setup (the human)

The human creates and renews the signing credentials; an agent never reads, prints or sets them.

**Environment.** Repository Settings → Environments → `release`: required reviewer = the maintainer; deployment refs = the tags `v*` (releases), `tester-*` (tester builds) and `release-dryrun-*` (release dry runs). Only the `sign` jobs use it. On a free account environments work only in public repositories.

**Secrets and variable** (in the `release` environment)

| Name | Kind | Value |
|---|---|---|
| `MAC_CERT_P12_BASE64` | secret | base64 of the `.p12` export of the Developer ID Application certificate with its private key |
| `MAC_CERT_PASSWORD` | secret | that `.p12`'s password |
| `APPLE_API_KEY_P8` | secret | the content of the App Store Connect API Team key's `.p8` file |
| `APPLE_API_KEY_ID` | secret | that key's Key ID (ten capitals or digits) |
| `APPLE_API_ISSUER` | secret | the Issuer ID (a UUID) |
| `MAC_IDENTITY_NAME` | variable | `<Name> (<Team ID>)`, the part after `Developer ID Application: ` in `security find-identity -v -p codesigning`; with the prefix electron-builder stops with `InvalidConfigurationError` |

**First setup**

1. Certificate: the Account Holder creates a Developer ID Application certificate in Xcode > Settings > Accounts > Manage Certificates (`+`), or uploads a Keychain Access CSR at developer.apple.com. The private key is created in the login keychain of the Mac that made the CSR.
2. In Keychain Access, export the certificate with its private key as a `.p12` with a strong password. Keep the `.p12` as a backup and the password in a password manager.
3. API key: the first time, the Account Holder presses Request Access under App Store Connect > Users and Access > Integrations (Team keys cannot be created before that). The Account Holder or an Admin creates a Team key with the Developer role. The `.p8` can be downloaded only once. The Issuer ID is shown above the Team keys list.
4. Set them, passing values on standard input or a prompt so they stay out of the screen and shell history, and with no quotes or spaces inside the values:
   ```
   base64 -i <cert.p12> | gh secret set MAC_CERT_P12_BASE64 --env release
   gh secret set MAC_CERT_PASSWORD --env release
   gh secret set APPLE_API_KEY_P8 --env release < <AuthKey_XXXX.p8>
   gh secret set APPLE_API_KEY_ID --env release
   gh secret set APPLE_API_ISSUER --env release
   gh variable set MAC_IDENTITY_NAME --env release --body '<Name> (<Team ID>)'
   ```
5. Move the `.p8` content into the password manager and delete the file.
6. Check with one `/tester-build`. The first `sign` step names any missing secret and the shape of a malformed one; wrong values fail at signing or notarization.

**Renewal**

- The certificate is valid for five years. After renewing, export a new `.p12` and replace `MAC_CERT_P12_BASE64` and `MAC_CERT_PASSWORD`. With the same name and Team ID `MAC_IDENTITY_NAME` stays; the Team ID must stay the same so installed copies keep their designated requirement (`certificate leaf[subject.OU]`).
- After revoking or replacing the API key, replace `APPLE_API_KEY_P8` and `APPLE_API_KEY_ID`; the Issuer ID belongs to the team and stays.
- Check again with one `/tester-build`.

## Prohibited

- Running when the user did not invoke `/release` in this conversation.
- Pushing to `main` directly, or merging into `main` any branch other than `develop` or this release's `hotfix/<slug>`.
- Moving or deleting a tag, or overwriting a published release.
- Approving any deployment other than this release's run after its sha check (tester builds and dry runs are approved by the maintainer).
- Reading, printing or setting secrets or environment variables.
- Publishing a draft that failed a check.
- Changing the workflows, `app/scripts/` or build settings during a release; a fix goes through `/ship` on `develop` and the next version.
