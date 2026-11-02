# Focused runtime support

These helpers support short checks of changed behavior in the real Electron app. There are no screen-specific e2e scenarios and no full-suite gate; write temporary probes under `.scratch/runtime-test/<task>/`. Do not add a replacement full-flow suite while the app is under development.

- `environment.ts`: `isolatedEnv(userData, cli)` creates a fake login shell and isolated HOME/config/runtime locations beside temporary userData. It inherits only an allowlist of the parent environment, so provider API keys, GitHub/Copilot tokens and config-dir overrides never reach the probed app. Supply absolute temporary paths. It writes a v1 onboarding completion record (`{"v":1,"completed":true,"projectRoot":<temporary HOME>}`) so the app opens past first run; remove that temporary `onboarding.json` only when checking first-run onboarding.
- `harness.ts`: bounded waits, retained owned-process handles and `suiteGuard` cleanup. Register the app with `rememberApp`, and finish the guard in `finally`; uncertain exit retains temporary artifacts.
- `real-state.ts`: fingerprint the actual user's setup, registration, runtime and agent state before launch; assert it is unchanged even when the probe fails. Provider credential files are compared by stat metadata only and Keychain items by attributes only (`security dump-keychain` without `-d`), so no secret is read. Requires `python3.12` for TOML.
- `desktop.ts`, `windows.ts`: unlocked-desktop/native-focus checks and explicit window/menu targeting. A hidden thumbnail window is not the main app window.
- `clipboard.ts`: snapshot and restore the native clipboard when testing clipboard behavior.
- `intrinsic.ts`: compare a control's actual and natural height in one renderer.

Build the app and a temporary CLI before launching. Use Playwright `_electron.launch` with `--user-data-dir=<temp>`, the isolated environment, temporary repositories and explicit `DOAN_RUNTIME` for CLI calls. Capture screenshots, inspect the relevant state, require exit 0 plus an explicit completion marker, and report the behavior actually checked. Never treat successful cleanup as proof of a passed assertion. Avoid concurrent GUI probes.

`node --test 'app/runtime/*.test.ts'` checks this foundation without launching the real app. The shared verify command includes these tests, Go checks, app typecheck/unit tests and build. Real-app probes remain separate and scoped to the change; unaffected observations can be reused.
