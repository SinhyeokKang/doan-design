---
name: runtime-test
description: Check the changed behavior in the real Electron app with a short isolated probe, preserving user state and recording screenshots. Does not fix code or commit.
---

# Focused runtime verification

There is no screen-specific e2e suite. Until the app is complete, use static/unit verification plus a short real-app check of the changed behavior. Do not rebuild a full workflow suite or require unrelated screens to pass. Future end-to-end scenarios must be designed against the completed app, not restored from the retired scripts.

## Scope

1. Read the change and identify the actual behavior at risk. State the input/action, expected result and relevant failure/recovery case. Keep the probe bounded to that scope.
2. Reuse valid evidence for unaffected behavior. A changed implementation invalidates the checks it affects, not every prior runtime observation.
3. Build the app and temporary CLI when needed. Do not rebuild unchanged artifacts only to repeat a check.

## Run safely

- Write one-off probes under `.scratch/runtime-test/<task>/`; use Playwright `_electron` or native computer-use when OS behavior matters. Keep screen selectors and fixtures in the probe, not in the reusable foundation.
- Reuse `app/runtime/environment.ts` (`isolatedEnv`), `harness.ts` (bounded waits, owned-app cleanup), `real-state.ts` (before/after fingerprints), `desktop.ts` (unlocked desktop/native focus), `windows.ts` (native window/menu targeting), and `clipboard.ts` when touching the clipboard. `intrinsic.ts` supports same-renderer size comparisons.
- Create a temporary parent directory, userData and repos. `isolatedEnv(userData, cli)` isolates HOME, TMPDIR, SHELL, agent config directories, DOAN_CLI and DOAN_RUNTIME and writes the v1 onboarding completion record (`{v: 1, completed: true, projectRoot}`), so first run does not open. Remove that record only when testing first run. Pass `--user-data-dir=<temp>` on every app launch and explicit temp repo/runtime paths to CLI/MCP calls.
- `real-state.ts` needs `python3.12` for TOML. Run its before/after checks even when the behavior assertion fails. Close owned apps before deleting temporary files; retain fixtures if exit is unconfirmed. Never use real user setup targets for convenience.
- Check desktop availability before native interactions. DOM screenshots/focus do not establish native material, window dragging or AppKit input. Avoid overlapping GUI probes.
- Prefer state-based waits over fixed sleeps. Assert the observed behavior; do not weaken expectations or change product code to make the probe pass.
- Save relevant screenshots and inspect them. A probe must exit 0 with its explicit completion marker; partial steps or successful cleanup do not prove the behavior passed.

## Report

Report the changed behavior checked, command and exit status, screenshot/log paths, and user-state/cleanup outcome. Put failures and untested scope first. A focused pass is not a whole-app acceptance claim. Return failures to the implementation workflow; this skill does not fix or commit.
