---
name: tester-build
description: Build an ad-hoc signed tester dmg of Doan from the latest remote main and put it on the Desktop as Doan-tester-<date>-<sha>.dmg. Use when the user asks for a test or tester build, a dmg to install locally, or to share with a tester. Builds only; does not install, commit or push.
---

# Tester build

A local stand-in until release packaging exists (BACKLOG 'Release packaging'): arm64 only, ad-hoc signed, not notarized. It changes no build settings; everything happens in a temporary worktree.

## Steps

1. **Source.** `git fetch origin main`, note `sha=$(git rev-parse --short=7 origin/main)`, and add a temporary worktree at `origin/main` under `.scratch/tester-build/<sha>` (detached). Never build from a dirty or unpushed checkout.
2. **Setup** (AGENTS.md 'Commands'): in that worktree run `npm --prefix app ci`, then `node -e "require('electron')"` from `app/` once.
3. **Package**: `npm --prefix app run package` → `app/dist/mac-arm64/Doan.app`.
4. **Re-sign a copy.** The packaged app's ad-hoc seal is broken, so a downloaded copy reads as damaged. In a fresh staging directory: `ditto <worktree>/app/dist/mac-arm64/Doan.app <stage>/Doan.app`, then `codesign --force --deep --sign - --identifier design.doan.app <stage>/Doan.app`, then `codesign --verify --deep --strict <stage>/Doan.app` (must pass; stop and report if not).
5. **Image.** `ln -s /Applications <stage>/Applications`, then `hdiutil create -volname Doan -srcfolder <stage> -format UDZO ~/Desktop/Doan-tester-<YYYY-MM-DD>-<sha>.dmg` (local date of the build). If that file exists, stop and ask instead of overwriting.
6. **Clean up.** Remove the staging directory and the temporary worktree (`git worktree remove`), after checking it has no changes worth keeping.

## Report (Korean)

The dmg path, the source sha and its commit subject, the `codesign --verify` result, and how a tester installs it: drag to Applications, open once, then System Settings > Privacy & Security > Open Anyway (or `xattr -dr com.apple.quarantine /Applications/Doan.app`); right-click Open no longer bypasses Gatekeeper on macOS 15+. Opening the copy in `/Applications` runs Agent setup on the real HOME (ARCHITECTURE §7 'Agent setup'): `~/.local/bin/doan`, `~/.local/share/doan`, skill links, the Codex rule, and possibly an administrator dialog for `/usr/local/bin/doan`. The tester-side flow has not been checked on another Mac yet.

## Prohibited

- Do not change `app/package.json` build settings or add signing identities.
- Do not install the app, open it, or touch the real HOME's agent setup targets; the user does that.
- Do not overwrite an existing dmg on the Desktop.
