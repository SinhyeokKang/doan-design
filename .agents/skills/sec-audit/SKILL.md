---
name: sec-audit
description: Audit the whole doan codebase for security along its trust boundaries — untrusted canvas content, the local server and app socket, agent processes and credentials, machine setup, updates, CI and the supply chain — with specialist subagents and a refuting pass on every candidate. Writes a local report only; does not fix, commit or publish findings.
---

# Security audit

Read [AGENTS.md](../../../AGENTS.md), [PRODUCT.md](../../../docs/PRODUCT.md), [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) and [SECURITY.md](../../../docs/SECURITY.md) first. SECURITY.md 'Scope' names what Doan treats as security-relevant; PRODUCT and ARCHITECTURE define intended behavior. A documented non-goal (for example ARCHITECTURE §14: the eval is not a sandbox) is not a finding unless a document claims more than the code does.

## Disclosure

The repository is public, and SECURITY.md routes vulnerabilities through private reporting. Findings, reproduction steps and payloads stay local until their fix is released:

- The report is `.scratch/sec-audit/<YYMMDD>[-n]/report.md` (gitignored), never committed, and never copied into issues, PRs, commits, `docs/` (BACKLOG and postmortem included) or chat with other services.
- Whatever public text a fix needs (PR title and body, commit message, code comment, test name, postmortem entry) names the defect class and the fix, not the exploit path or a payload. A regression test that pins the fix is expected; it is not described as an attack.
- Never read, print or copy secret values (keychain items, `auth.json`, tokens, CI secrets, signing material). Check how they are stored, passed and logged, not what they are.
- Send no source or finding to an outside service. The dependency checks below only query public advisory databases with public dependency names.

## Threat model

Before reviewing, the lead writes the run's threat model into the report: assets (provider credentials, the user's files and repositories, agent permissions, the signing and update chain), attackers, and the trust boundaries below. Check each boundary against the current code and ARCHITECTURE and add any the code now has.

| Boundary | Untrusted side | Must not reach |
|---|---|---|
| Canvas content | agent-written HTML/CSS/JS, `.doan/assets`, attachments, `doan active` `html`/`text` | Node, IPC beyond the canvas's own channels, files outside the serving scope, other canvases or roots, the app's origin, the inspector's CDP session, the prototype window's host |
| Exported canvas | a shared export file opened in a browser | the viewer shell's privileges beyond the file |
| Local server and app socket | other local users, web pages in the user's browser (DNS rebinding, requests to localhost), processes without the runtime token | app actions, files, conversation content |
| Links | `doan://` deep links, Markdown links and images in agent output, `openExternal` targets | navigation of app windows, arbitrary schemes, local files |
| Agent processes | prompts built from canvas and agent text, MCP servers, provider output | tools beyond the permission mode, other sessions' state, credentials in argv, env or logs |
| Machine setup | the app's writes outside its own folders (`~/.local/bin`, `/usr/local/bin` through the administrator dialog, skill links, the Codex rule, Claude Code allow rules) | other paths through symlinks or races; allow rules wider than the `doan` commands |
| CLI on a cloned repository | `.doan/config.json`, symlinks, paths and file sizes in an untrusted checkout | files outside the repository, command execution |
| Updates and distribution | the update feed and downloads | an unsigned or downgraded app; fuses, entitlements and hardened runtime weaker than ARCHITECTURE §9 states |
| CI/CD | pull requests from forks, workflow inputs, third-party actions | secrets, the `release` environment, tags, `main` |
| Supply chain | npm and Go dependencies, install scripts, unpinned actions | build output and the signed app |
| Dev tooling | eval and runtime-test runs | the user's real agent state and credentials |

## Automated checks

Run by the lead, read-only. Output is a lead to trace, not a finding.

- `npm --prefix app audit --json` and `npm --prefix app audit --omit=dev --json`: separate advisories reachable in the shipped app from dev-only ones.
- `govulncheck ./...` only when it is installed; otherwise record "not run". Install nothing.
- The Electron version against Electron's supported release lines (check the releases page, do not answer from memory).
- An inventory search, recorded with counts: `webPreferences`, `nodeIntegration`, `contextIsolation`, `sandbox`, `webSecurity`, `setWindowOpenHandler`, `will-navigate`, `will-redirect`, `openExternal`, `protocol.handle`, `setPermissionRequestHandler`, `executeJavaScript`, `debugger.attach`, `child_process`, `shell: true`, `eval(`, `new Function`, `innerHTML`, `dangerouslySetInnerHTML`, `os/exec`, `filepath.Join`, `os.Symlink`, `pull_request_target`, `workflow_run`, `${{ github.event`, actions referenced by tag instead of commit SHA.

## Specialist subagents

The lead launches one read-only subagent per perspective, in the invoking agent's model family (AGENTS.md 'Runtime differences'), in parallel up to the available limit. Each gets the threat model, the inventory results, the decision documents, the postmortem prevention rules for its area (month files under `docs/postmortem/`), its perspective and its own evidence path under `.scratch/sec-audit/<run>/`. Reviewers write only that file; they run no tests, builds or apps, fix nothing and never `rm` a variable path. Each perspective spans every module its boundaries touch.

1. **Electron hardening and canvas content.** The [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security) (20 items) applied to every BrowserWindow, WebContentsView, iframe and webview: CSP, navigation and new windows, permission request handlers, custom protocols and serving scope, IPC sender validation, what each preload exposes, `openExternal`, fuses. Then every path from canvas content to the renderer, main, CDP and the prototype window, and the export viewer.
2. **Local IPC surfaces.** The app socket (v1–v7) and the local server: token, file modes of `runtime.json` and the socket, origin and host checks, request validation, path traversal and symlink escape in serving, DNS rebinding; deep links.
3. **Agents and credentials.** Prompt construction and injection paths to tools, argv and env, permission-mode enforcement, MCP connectors and OAuth, provider profiles and keychain use, session files and their modes, logs and crash output, eval and runtime-test isolation.
4. **Setup, updates, CI and supply chain.** Agent setup writes (targets, symlink and TOCTOU races, privilege, the scope of allow rules), the update feed and signature checks, fuses and entitlements, workflows (triggers, permissions, secrets, action pinning), dependency risks (install scripts, abandoned packages), the CLI run on an untrusted checkout.

**Exclusions** (adapted from `anthropics/claude-code-security-review`, inspected 2026-11-18): denial of service and resource exhaustion, rate limiting, generic input validation without a shown impact, and anything that needs an attacker who already runs code as the same macOS user, unless it crosses a boundary that code could not cross otherwise (a sandboxed agent, another user, a web page, a canvas, the signing chain).

## Verification

Every candidate is refuted before it is reported (adapted from Trail of Bits `fp-check` and `insecure-defaults`, inspected 2026-11-18): the lead, or a separate verifier subagent for a High or Critical candidate, tries to show that the input is not attacker-controlled across the stated boundary, that an existing check stops it on the way to the operation, or that a test pins the safe behavior. A finding survives only with a traced source → sink path at file:line and stated preconditions. Classify it **confirmed** (path traced, preconditions realistic), **needs execution**, or **refuted** (one line why, kept in the report). Runtime proof only through isolated probes under the `/runtime-test` rules: never against the user's real state, credentials or any network target.

Severity:
- **Critical**: canvas content, a web page or a cloned repository gets code execution, credential access or file writes outside its scope with no user action.
- **High**: the same with one ordinary user action; an escape from an agent's permission mode; an update or signature bypass; secrets exposed to forks in CI.
- **Medium**: data exposure or integrity loss with significant preconditions, or missing hardening that would turn another bug into High.
- **Low**: a defense-in-depth gap with a concrete consequence.

## Coverage gate

As in [/audit](../audit/SKILL.md): a boundary-by-perspective table with an owner per applicable cell, partial cells reassigned in further waves until the static scope is covered, a real blocker reported as **incomplete**. Static completion does not certify runtime behavior.

## Output

The lead writes the Korean report to the local path under 'Disclosure': execution date, HEAD and worktree state, completion status, the threat model, automated check results, unreviewed areas and limits first, then findings by severity. Each finding gives the boundary, the attacker and preconditions, the source → sink trace at file:line, the impact, the refutation attempts, the smallest fix and the next verification step. Then refuted candidates (one line each), the coverage table and the postmortem checklist. In the conversation, summarize counts and severities with the report path; give exploit detail only as far as the user needs to decide.

## Limits

Report only: no fixes, commits, pushes, package installs or tests. Fixes go through [/sec-audit-loop](../sec-audit-loop/SKILL.md) or `/deliver`, under 'Disclosure'.
