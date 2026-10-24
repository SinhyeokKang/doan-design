# Postmortem

> Pitfalls we hit, newest date first. Preserve existing entry content; insert new entries above older ones.

### 2026-10-24 — Agent shells bypassed the evaluation runner's packaged CLI

- **Area**: `eval/lib/agent.ts`, `eval/run.ts`
- **Symptom**: U-003's first W1/W2 round passed all checks and judges, but W1-Codex printed the old empty check envelope without `summary.canvases`. Automatic checks used the new package; the actual agent did not.
- **Root cause**: the runner only prepended a bin directory to the agent process PATH and never checked resolution inside an agent tool shell. Codex shell snapshots were enabled; disabling them in a real probe made the packaged executable resolve. The full environment-rewrite sequence was not traced.
- **Net**: review of the W1 transcript caught the mismatch; the reported CLI path/version in meta.json described the runner, not observed agent execution. Regression tests reject missing, stale, and multiline path evidence while accepting aliases to the measured binary.
- **Prevention**: pin Codex snapshots off and require the agent's own shell lookup evidence on every real run; the new automatic provenance check cannot be overridden by the judge. Search executed: `rg -n 'agentCommand|PATH:|cliProvenance' eval`; real runs go through the single command builder and workspace PATH owner. A startup lookup does not prove every subsequent invocation; retain transcript review.

### 2026-10-24 — Empty check results looked like a validated canvas

- **Area**: `cli/internal/check/check.go`, `cli/internal/cli/check.go`, `run.go`
- **Symptom**: after a W1 generator failed before writing HTML, `doan check` returned zero errors and warnings without saying that it checked zero canvases (USABILITY-EVAL U-003; loop3 Codex rollout). The agent recovered, but the result did not distinguish absence from validation.
- **Root cause**: the summary counted findings only; an empty scan and a valid canvas both produced an empty finding list.
- **Net**: agent-eval exposed the ambiguous result; existing empty-input tests explicitly expected no findings. Regression tests now pin the warning, canvas count, human count line, and matching MCP envelope; they failed before implementation.
- **Prevention**: retain empty-input coverage alongside valid and unparsable canvas cases, and count unparsable files so they do not trigger a false absence warning. Search executed: `rg -n 'Summarize|len\(.*Canvases' cli/internal/check cli/internal/cli/check.go`; the only summary caller is the shared CLI check path, also used by MCP.

### 2026-10-24 — Full rollout output displaced active-call evidence in the judge prompt

- **Area**: `eval/lib/agent.ts`, `eval/lib/judge.ts`, evaluation invocation evidence.
- **Symptom**: appending a large Codex rollout after stdout/stderr let the judge's last-40k transcript omit both an earlier active call and the original answer, although automatic checks still saw the call.
- **Root cause**: checks and the bounded judge prompt shared one raw transcript despite needing different evidence; large tool results competed with invocation records for the same tail budget.
- **Net**: R-L1 review identified the loss; the earlier tests only checked rollout inclusion. Regression tests now reproduce more than 40k of later rollout output and oversized command summaries, then assert retained shell/MCP active evidence and original log tails while the complete rollout remains on disk.
- **Prevention**: keep extracted calls separate from raw output and preserve active invocation flags before truncating a command summary. Run `rg -n 'readAgentTranscript|callSummary|limits.transcript' eval` and retain the large-output regressions in `agent.test.ts` and `judge.test.ts`; only the agent evidence reader and judge builder own these boundaries.

### 2026-10-24 — Codex transcript parsing truncated executed commands at prose inside the command

- **Area**: `eval/lib/transcript.ts`, Codex exec header extraction.
- **Symptom**: R2 missed a real `doan active` invocation after `echo look in app;`, and other scenario checks could miss later command text.
- **Root cause**: the cwd-removal regex matched the first ` in ` inside the shell command rather than the trailing absolute working-directory field.
- **Net**: review R-S2-1 reproduced the false negative; earlier transcript tests covered only a plain command. Two new regression tests failed before the fix and pass with the final ` in /` boundary, including single/double quotes, loops, absolute paths inside commands, separate/inline status lines, and echo/tool-result exclusions.
- **Prevention**: retain the transcript boundary regressions and separate executed command headers from guide/output content. Run `rg -n 'lastIndexOf\(" in /"\)|replace\(/ in ' eval` when changing Codex transcript parsing; the only current match is the corrected boundary in `eval/lib/transcript.ts`. Multiline headers and cwd paths containing ` in /` remain outside the tested format.

### 2026-10-24 — Focus did not return to the row when Set Up… closed from outside

- **Area**: `app/src/renderer/Sidebar.tsx`, `ProjectTree` setup dialog close effects.
- **Symptom**: with a Not initialized row's Set Up… dialog open, running `doan init` from a terminal (or deleting, renaming or re-rooting the folder) closed the dialog, but focus ended on `<body>` instead of the row (or the root row).
- **Root cause**: the effect that closed the dialog called `setSetup(null)` and `focus()` on the row in the same tick. The modal `<dialog>` was still open, so everything behind it was inert and `focus()` was a no-op; the later unmount left focus on the body. Closes started by the dialog worked only because they call `dialog.close()` first.
- **Net**: batch I's onboarding runtime probe caught it; unit tests could not (no DOM, and the rule is Chromium's inert/modal focus behavior). A new runtime step (`setupClosedOutside` in `app/e2e/runtime.ts`) covering terminal init, delete, rename and terminal re-root failed with focus on BODY before the fix and passes after.
- **Prevention**: never focus content behind an open modal dialog; close the dialog (or wait for it to unmount) before focusing. Run `rg -n 'showModal|focusRow|focusAfterSetup' app/src/renderer` to find modal owners and focus moves that may run while a modal is open.

### 2026-10-24 — Setup rejected linked configuration directories

- **Area**: `app/src/main/onboarding/machine.ts`, setup display.
- **Symptom**: on the real HOME, Claude Connect was unavailable because the selected Orca profile's `skills` directory is a symlink to `~/.claude/skills`; the same restriction affected linked CLI and shared-skill parents.
- **Root cause**: ancestor lstat classification treated every symlink as blocked, conflating directory traversal with final-target ownership. Relative skill-link values were derived from the alias path, although the OS resolves a relative symlink from its real containing directory.
- **Net**: the packaged-app real-HOME run (batch L) exposed the layout. The original unit tests explicitly expected all parent links to be blocked. G2's real temporary-directory regression cases failed before the fix and verify both reachability and exact link contents afterward; the L2 rerun then connected Claude on the real HOME.
- **Prevention**: retain directory-link, dangling/file/loop, stale-ancestor and staging-cleanup regressions. Run `rg -n 'blockedParent|realTarget|realDirectory|lstatSync' app/src/main/onboarding --glob '*.ts'` when changing setup writes (2026-10-24: production matches are confined to `machine.ts`). Do not infer ancestor write permission from final-target classification.
- **Recurrence (2026-10-24, G2 review)**: once aliases were followed, Connect installed the shared stub and then classified that same directory as an occupied Claude link target when Claude's skills directory resolved to `~/.agents/skills`, blocking MCP setup permanently; an invalid relative `CLAUDE_CONFIG_DIR` was also resolved against the app's working directory for display. The earlier regressions covered distinct destinations only. Two-direction real-filesystem tests and an invalid-config display test failed before the fix. Prevention, in addition: test identical as well as distinct destinations, and assert the MCP call happens with no nested or self link; `rg -n 'claudeSharedSkills|claudeLinkValue|realPaths' app/src/main/onboarding/machine.ts app/src/renderer/onboardingView.ts`.

### 2026-10-24 — The setup menu discarded an open wizard session

- **Area**: `app/src/main/index.ts`, `openWizard`.
- **Symptom**: choosing Set Up doan… after Cmd+W revealed the window but reset the wizard to its first step.
- **Root cause**: the menu handler always allocated a new session, conflating revealing a hidden window with starting a wizard.
- **Net**: batch I's real Electron probe caught the reset. The old unit test expected a new session on every menu click. G2's visible/hidden active-session tests failed before the fix; a separate closed-session test keeps reopening working, and batch I2 asserts it in the real window.
- **Prevention**: verify visibility changes separately from session creation. Run `rg -n 'openWizard|wizardSession = randomUUID' app/src/main/index.ts` (2026-10-24: the menu handler and the first-run allocation).

### 2026-10-24 — The onboarding wizard lost keys and clicks to focus and modal stacking

- **Area**: `app/src/renderer/Onboarding.tsx`, `onboardingView.ts`.
- **Symptom**: in a real run, Escape after Copy did nothing; the wizard opened from the menu over an open setup or comment dialog could not be clicked; after Set Up Project the wizard sometimes stayed on step 3.
- **Root cause**: a button disabled while its action runs drops focus to `<body>`, so a key handler on the overlay element never saw Escape or Tab. A modal `<dialog>` already open in `<main>` stays in the top layer above a non-modal overlay, and `inert` on `<main>` made both unclickable. `doan init` success can arrive before main publishes the re-read when a watcher read supersedes it, so advancing on the first non-loading state missed the list.
- **Net**: H's real-window script found the first two (step 13 reproduces the stacking); the independent review found the third. Fixes: a window `keydown` listener in capture, the wizard itself as a modal `<dialog>`, and `advanceAfter` waiting for the listed project (seen red first). Batch I's e2e covers Escape after a delayed copy, the wizard over both modals, and an init reply held until the list is published.
- **Prevention**: for overlays, handle keys on the window and do not assume focus stays inside after a control disables itself; stack a new layer as a modal when other modals may be open. Run `rg -n 'showModal|addEventListener\("keydown"|advanceAfter' app/src/renderer`.

### 2026-10-24 — Setup writes to missing targets could overwrite a competitor

- **Area**: `app/src/main/onboarding/machine.ts`, link and stub writes.
- **Symptom**: a deterministic race test inserted a file after the final "missing" lstat; both the CLI link install and the stub install then replaced it.
- **Root cause**: re-checking before rename does not stop a competing creation between the check and the rename, and rename overwrites. While fixing it, macOS `link(sourceSymlink, destination)` followed the symlink and created a hard link to its referent (caught by the existing install tests).
- **Net**: G's review asked for the race; the reproduction failed for both targets before the fix. Missing links are now created with `symlink` directly and missing stubs by `link` from the staged regular file, both exclusive; EEXIST answers "Target changed. Check Again." and keeps the competitor. Approved replacements still use rename.
- **Prevention**: create missing targets exclusively and keep rename only for confirmed replacements; never `link` a symlink. Run `rg -n 'renameSync|linkSync|symlinkSync' app/src/main --glob '!*.test.ts'` (2026-10-24: rename only for approved replacement and `onboarding.json`).

### 2026-10-23 — Re-hovering a dismissed tooltip did not reopen it

- **Area**: `app/e2e/runtime.ts`, restart tooltip preconditions and `hoverTooltip`.
- **Symptom**: in actual Electron, hover added.html, close its tooltip with Escape, then hover the same row again: the tooltip wait times out even though a trusted pointermove reaches the row.
- **Root cause**: the installed Radix tooltip trigger sets `hasPointerMoveOpenedRef` on entry and resets it only on pointerleave. Closing content with Escape leaves that latch set. The restart regression used a bare hover, unlike the existing path reader's explicit exit/dismiss/entry sequence. This demonstrates a precondition defect; it does not establish the event history of the original intermittent restart timeout, which had no input trace.
- **Net**: a deterministic actual-Electron regression failed before the change and passed with the shared precondition helper. Eight isolated ordinary restart probes passed; window hide/show and title refresh probes also passed, while an induced ancestor scroll closed the tooltip. These observations do not prove which event caused the original failure. The previous stale-path regression remains intact: a visible added.html tooltip must be replaced by the exact project path. Bounded input history plus window readiness, focus and trigger-state diagnostics now accompany runtime failures.
- **Prevention**: use `hoverTooltip` for tooltip reads so a real pointer exit resets the latch and preceding content is dismissed before entry; do not rely on repeated hover or longer timeouts. Keep the Escape-without-pointerleave regression and exact stale-path assertion. Run `rg -n 'getByRole\("tooltip"\)|hoverTooltip' app/e2e app/src --glob '*.ts*'`; the remaining S11 and comments-ui uses only dismiss tooltips before testing Escape ownership. Evidence and original-event limits: `.scratch/comments-ui/tooltip-fix/handoff.md`.

### 2026-10-23 — A full-width message assertion included the native scrollbar

- **Area**: `app/e2e/comments-ui.ts`, Comments panel recovery geometry.
- **Symptom**: the final integrated runtime failed the new recovery-width assertion although the message filled the available panel content. Measured panel border-box width was 279px, client width 268px, and message width 268px.
- **Root cause**: exact equality compared the child's rendered width to the scroll container's outer width, including its 11px native scrollbar. Earlier runs without that geometry passed; the selected heading and message parent were correct.
- **Net**: the final gate caught the invalid assumption; an instrumented Electron reproduction captured rect/client/scroll metrics. A corrected assertion compares both edges against the panel header's content span and requires the recovery to be a direct panel child. It passes at the reproducing geometry; restoring the original nested composer layout fails with a false direct-child check and 12px insets on both sides. No product layout change was needed.
- **Prevention**: compare matching box domains for scroll containers and retain a negative control for the layout defect. Run `rg -n 'getBoundingClientRect\(\).*width|clientWidth' app/e2e/comments-ui.ts app/e2e/runtime.ts`; remaining matches include intentional dialog outer width and iframe viewport/scale calculations, not another parent-child width-equality assertion. Never replace a geometric failure with an arbitrary tolerance before measuring scrollbar, border and content edges.

### 2026-10-23 — Accepted comment timestamps crashed relative-time rendering

- **Area**: `app/src/renderer/CommentsPanel.tsx`, `CommentsPanel.test.tsx`.
- **Symptom**: a schema-valid event with `2026-10-23T00:00:60.000Z` survived folding but crashed the Comments render with a RangeError.
- **Root cause**: presentation assumed that every format-valid timestamp produced a finite Date.parse result, then passed NaN to Intl.RelativeTimeFormat. Calendar validation is deliberately not part of the existing v1 reader contract.
- **Net**: independent R-U2 review supplied a failing fold-to-render probe; ordinary presentation fixtures used calendar-valid dates. The regression now retains the comment and displays its original timestamp as text when parsing is not finite, and the actual App helper reads the same event.
- **Prevention**: run `rg -n 'RelativeTimeFormat|Date.parse' app/src/renderer app/src/comments`; keep accepted-data-to-render coverage rather than testing the formatter with only valid dates. The search also finds event-time validation in `comments/events.ts`, which intentionally rejects unsafe writes and was not changed.

### 2026-10-23 — Draft guards changed existing transition timing

- **Area**: `app/src/renderer/CanvasController.ts`, `CommentsSession.ts`, `useComments.tsx`, and their tests.
- **Symptom**: the existing runtime's synchronous Loading spinner check failed even without a draft; a real Escape opened and immediately cancelled the new draft dialog.
- **Root cause**: wrapping every approval in a Promise delayed an established synchronous path. Separately, the Escape which initiated confirmation still had its browser default action, so it could cancel the dialog opened during that event.
- **Net**: actual App tests caught Escape cancellation, while the unchanged full runtime caught delayed Loading. Static modal callbacks and isolated asynchronous session tests missed both timing boundaries. No existing expectation was relaxed.
- **Prevention**: run `rg -n 'transitionGuard|showModal|onCancel|preventDefault' app/src/renderer`; preserve an immediate boolean result when no draft exists, and prevent the initiating Escape's default only when guarding a draft. Keep both the synchronous controller regression and actual Escape/Continue/focus interaction. Existing tooltip Escape ownership remains covered by the earlier runtime regression.

### 2026-10-23 — Comment copy reported success before the clipboard committed

- **Area**: `app/src/main/comments/service.ts`, `service.test.ts`, `app/e2e/comments-ui.ts`.
- **Symptom**: a rejected Electron clipboard write returned `copied:true`, and a held write reported success before completion.
- **Root cause**: Electron 45 exposes `clipboard.writeText` as a Promise, while the service dependency was typed as void and invoked without await. A callback that returned a Promise still satisfied the void callback type.
- **Net**: integration work checked the installed Electron declarations, and two red service tests pinned rejection and delayed completion. Existing synchronous clipboard mocks did not exercise settlement. The App helper now also verifies an injected native clipboard rejection and Retry through the real service.
- **Prevention**: run `rg -n 'clipboard\(|writeText' app/src/main`; the production write path is the awaited comments service dependency, with the main callback returning Electron's Promise. Require a delayed-completion and rejection test for APIs whose success is asynchronous. Runtime cleanup reconstructs ClipboardItems from eagerly captured data because Electron 45 does not accept items returned by read directly in write.

### 2026-10-23 — Comment saves retried after an unconfirmed directory worker exit

- **Area**: `app/src/main/comments/service.ts`, `service.test.ts`.
- **Symptom**: a directory child whose termination was unconfirmed released the per-canvas queue; identical and new requests could launch another append, including another canvas sharing the root directory.
- **Root cause**: the service classified only append uncertainty and treated directory-worker uncertainty as ordinary failure. The serialization scope was narrower than directory creation's shared root.
- **Net**: independent M review injected the real error class and observed re-entry. Existing immutable-event retry tests covered write uncertainty after preparation, not child lifecycle uncertainty before preparation.
- **Prevention**: serialize saves per root and quarantine that root for the service lifetime after unconfirmed termination. Return unknown with `recovery: child-exit-required`; disk absence and project reopen cannot release it. Recovery requires external confirmation of child exit followed by an app restart. Retain concurrent cross-canvas, same/new request, status, reopen and independent-root tests. Search `rg -n 'MkdirTerminationUnconfirmedError|blockedRoots' app/src/main`; the only production producer is mkdir and the service is its quarantine consumer.

### 2026-10-23 — Response eviction and OOPIF swaps lost a live comment document

- **Area**: `app/src/main/comments/document.ts`, `document.test.ts`, `app/src/main/inspector.ts`, `inspector.test.ts`.
- **Symptom**: unrelated HTML responses evicted the currently loaded response after 256 records. A focused real-app check also found that the initial comment origin remained unverified before any fetch load.
- **Root cause**: FIFO bounds did not distinguish active bindings from unbound records. Separately, inspector treated a parent-session process swap as document removal; observed order was parent Network response, child Page frame commit, parent frame detach with reason swap, then child Network loading finish.
- **Net**: independent review caught response eviction with a deterministic probe; unit joins omitted the swap notification and missed the initial-load runtime failure. Regression tests now preserve active records under 600 unrelated responses/documents, bound unbound storage, retire replaced/removed records, and reproduce that cross-session order.
- **Prevention**: retain active frame/loader evidence until replacement or removal, bound only unbound records, and distinguish process swaps from actual detach. Search `rg -n 'frameDetached|responses.delete|trimResponses' app/src/main`; inspector owns the lifecycle notification and DocumentBindings owns response retirement. Test actual first-load, fetch load, reload and iframe removal without replacing streamed-response validation with disk hashes.

- **Recurrence (2026-10-23, inspector session ownership)**: Independent review found that a delayed `Target.detachedFromTarget` for the former OOPIF session retired the frame already committed by its replacement. The same-loader migration and new-loader replacement schedules both failed deterministic tests. Session-to-frame history alone did not identify the current owner; queued former-session Page navigation/start/removal and Network response/completion/failure events crossed the same boundary.
- **Net**: The initial-load Electron probe covered parent response → child commit → parent swap → child completion, but did not produce overlapping old/new OOPIF sessions. The new migration schedules remain mocked evidence; actual Electron first load, 300 fetches, reload and removal are separate regression evidence.
- **Prevention**: Track the frame's current session owner, ignore events from a superseded or detached session, and invalidate on actual current-owner detach and debugger loss. Pin both replacement schedules and late-event cases, including current-owner invalidation controls. Run `rg -n 'frameDetached|detachedFromTarget|sessionFrames|frameOwners' app/src/main`; this run found lifecycle handling only in inspector.ts and its tests (see postmortem-search.log).

### 2026-10-23 — Ancestor visibility treated as cumulative opacity

- **Area**: canvasScript commentAnchors geometry.
- **Symptom**: visible child under visibility:hidden ancestor had no pin.
- **Root cause**: visibility was tested on every ancestor like display:none/opacity:0, despite the child's computed visibility overriding inherited visibility.
- **Net**: independent review and actual computed-style Electron fixture caught it; prior fake geometry tests did not model CSS inheritance.
- **Prevention**: check visibility on the target's computed style, but retain ancestor display and opacity checks. Electron fixture asserts visible child pin and absence of inherited-hidden, display-none and opacity-zero target pins. Search executed: rg -n 'style.visibility' app/src/main/canvasScript.ts app/src/renderer. Other results are controller board visibility assignments, not ancestor visibility classification.

### 2026-10-23 — Anchor measurement preceded selected-node recovery

- **Area**: canvasScript schedule/send and commentAnchors selected callback.
- **Symptom**: same-id, same-size DOM replacement produced a new lookup token but null selected token until another external event.
- **Root cause**: anchor rAF was queued before layout rAF, while only layout recovered disconnected selection.
- **Net**: independent review plus a fake producer regression and real Electron clone replacement caught it. Existing layout-only replacement tests never compared selected token with lookup identity.
- **Prevention**: resolve disconnected selection before anchor identity is reported, leaving unresolved disappearance for the layout lost-selection protocol. Search executed: rg -n 'isConnected|selectionSeq' app/src/main/canvasScript.ts app/src/renderer/CanvasController.ts. Layout recovery and pin find still intentionally check connectivity; no additional recovery owner found.

### 2026-10-23 — Pin completion outlived the guarded intent

- **Area**: CanvasController.activatePin/onSelectionMessage.
- **Symptom**: A's held completion opened A after a newer B guard or after A's binding was removed; it also cancelled B's pending guard.
- **Root cause**: validation existed only before command dispatch; pending completion retained only seq and destination. Every acknowledgement was counted as a new user intent. Query refresh on an acknowledgement also invalidated an unrelated waiting guard.
- **Net**: independent review found both schedules; old tests covered only reload before guard completion. New unit and Electron cases verify actual document selection separately from cancelled panel-open effects, and verify B subsequently selects and opens.
- **Prevention**: carry intent, document generation and binding revision through completion. Keep query freshness independent from binding lifetime; command uses the current exact anchor request, and producer/consumer request checks remain intact. Search executed: rg -n 'pinIntent|pendingPin|requestAnchors' app/src/renderer/CanvasController.ts. The same controller is the only owner; clear, reload and non-pin command paths were reviewed.

### 2026-10-23 — A preceding canvas tooltip was cached as a project path

- **Area**: `app/e2e/runtime.ts`, `tooltipPath` and the folders-after-restart gate.
- **Symptom**: the runtime harness cached `/repos/ok/design/added.html` as the `/repos/ok` project path after restart, so valid visible folders never satisfied the path comparison.
- **Root cause**: hovering the next row did not guarantee that the previous tooltip had closed. The global tooltip role matched that previous content, and the only validity check required an absolute path. Caching retained the wrong result across retries.
- **Net**: two full runtime failures exposed the issue. A new actual-Electron regression deliberately opens the added.html tooltip before reading the project path; it fails before the fix with the exact canvas path instead of the project path (`retry-tooltip-red.log`). Previously the harness assumed no tooltip was already open. No baseline-only claim is needed or made.
- **Prevention**: before reading a new uncached path, park the pointer away from tooltip triggers, dismiss a still-visible tooltip with Escape, and wait for the previous tooltip role to disappear; then hover the intended row and read its tooltip. Keep the deterministic preceding-tooltip regression and exact project-path assertion. Search: `rg -n 'getByRole\("tooltip"\)' app/e2e app/src --glob '*.ts*'`. The search also found the later S11 Escape precondition: a visible tooltip consumes Escape before selection clearing. Dismiss it conditionally and assert selection survives, then test selection clearing with no tooltip. Pointer parking alone did not close the retained tooltip. The integration branch still contains the old helper until batch A is integrated.

### 2026-10-23 — Hover stayed hidden across direct reentry and Alt focus transfer

- **Area**: `app/src/main/canvasScript.ts`, `app/src/renderer/CanvasController.ts`, `canvasMessage.ts`, `app/e2e/runtime.ts`.
- **Symptom**: moving directly from an element to the app margin and back to the same element left hover hidden. Holding Alt in the app, Alt-clicking a canvas input, releasing Alt there, and moving to another element also left hover hidden.
- **Root cause**: the OOPIF did not reliably receive pointerout on exit. The renderer cleared its rectangle but the script retained its deduplication cache, so an identical rectangle never reached the renderer again. Separately, Alt down and up could land in different documents; the renderer kept its own Alt flag after the canvas received the release. Blindly trusting a delayed state message would instead revive hover while Alt was held.
- **Net**: the EF review's real-input probe caught both bugs. The original e2e crossed intermediate elements with stepped movement and tested Alt press/release without a focus transfer. Its normal run passed. New S5 direct same-element reentry and S9 Alt focus-transfer checks both failed before these fixes and compare the restored mark's rectangle, not merely visibility.
- **Prevention**: invalidating a consumer's cached display must also invalidate the producer's deduplication cache. The app now sends a sequenced hover-leave command without changing selection; the next move supplies the current rectangle. Modifier snapshots travel from the canvas through validated Alt key messages, while app modifier commands advance seq to reject snapshots sent before the current press. Unit tests retain selection/layout updates and reject stale Alt release and hover messages while Alt is held. Keep actual-input checks with single pointer jumps and focus-changing key sequences. Search: `rg -n 'lastHover|hoverRect|altHeld|hover-alt|hover-leave' app/src/main/canvasScript.ts app/src/renderer/CanvasController.ts`.

### 2026-10-23 — Hover commands discarded pending selection replies

- **Area**: `app/src/main/canvasScript.ts`, `app/src/renderer/CanvasController.ts`, `canvasMessage.ts`, `app/e2e/runtime.ts`.
- **Symptom**: Alt or pointer exit between a frame/path pick, reload reanchor or canvas click and its selection reply left the Inspector empty, retained the previous selection, or kept the reanchor mark hidden.
- **Root cause**: F2 shared one sequence between selection validity and hover/modifier freshness. A hover-only command advanced the renderer's selection floor after the script had already posted its selection reply. Later layout messages carried geometry but could not reconstruct the missing selection payload. Preserving an established selection was therefore insufficient evidence that hover did not change selection behavior.
- **Net**: the independent F2 review caught the race with controlled reply ordering and a real-click Electron message gate. Existing tests only interleaved hover with an already received selection. New controller cases failed for pending frame, ancestor, reload and click replies; the actual-input gate failed while the existing EF hover checks still ran. Producer tests also reject shared-sequence behavior for a retrying anchor and independently ordered commands.
- **Prevention**: keep selection and hover/modifier counters independent at both producer and consumer, including reload reset. The internal `seq` field is interpreted by message kind: selection commands and select/clear/selected-layout use selection order; hover commands and hover/Alt snapshots use hover order. Escape remains intent, and stale selection replies after Escape or a newer selection remain rejected. Retain the deterministic pending-reply tests, actual click gate, EF direct reentry/focus-transfer checks, and source/href/viewport/reset boundary checks. Search: `rg -n 'seq|hoverSeq|sendCommand|sendHoverCommand' app/src/main/canvasScript.ts app/src/renderer/CanvasController.ts`; matches are the two protocol endpoints covered here, with no other production sequence owner.
- **Recurrence (2026-10-23, comments-ui)**: The anchor channel treated a sent selection command floor as proof that its response had been accepted. With A accepted and B sent, a held B selection reply allowed B into the Selection projection early. Separate acceptedSelectionSeq now fences that projection; pending snapshots publish null until the actual selection reply triggers a new query. The controller projection test and real Electron adapter both failed before the fix.

### 2026-10-23 — A utility-process kill request left its caller pending

- **Area**: `app/src/main/comments/mkdir.ts`, `mkdir.test.ts`, `app/e2e/comments-filesystem.ts` (comments-ui M1).
- **Symptom**: the first directory-worker wrapper waited forever if `child.kill()` returned false or no exit event followed the timeout. Two deterministic lifecycle tests timed out before the correction.
- **Root cause**: caller settlement depended solely on process exit, while the timeout only requested termination. The stopping flag prevented another termination attempt, and a kill request was treated as enough progress without a bounded exit wait.
- **Net**: conductor review identified the path and the worker reproduced it red before fixing it. Initial normal-result/crash tests did not cover failed kill or missing exit. Real Electron tests additionally check PID disappearance for observable child exits; they do not prove an unobservable OS process has terminated.
- **Prevention**: bound caller settlement independently of confirmed child cleanup. After the job deadline, use a bounded termination grace; report unconfirmed termination distinctly, settle once, and retain only the observations needed to kill a late spawn or clean up a late exit. Test failed/throwing kill, missing exit, late spawn/exit and duplicate results. Search `rg -n '\.kill\(|once\("exit"|on\("exit"' app/src/main --glob '*.ts' --glob '!*.test.ts'`. The existing `cli.ts` match already settles at its deadline independently of close; no matching unbounded wait was found there.

### 2026-10-22 — Guessing the repo root in TS after a failed CLI run re-created a discovery rule differently

- **Area**: `app/src/main/view.ts` (`openDecision`), `shell.ts` (folder open)
- **Symptom**: opening a subfolder of a repo with a broken config (or with no CLI) stored the subfolder; the next read with `--repo <subfolder>` became `repo_not_found` and told the person to run `doan init`, which would create a nested repo. The first fix checked for a `.doan` directory, but the CLI's marker is `.doan/config.json`, so a subfolder holding only `.doan/` still slipped through.
- **Root cause**: a failing envelope carries no root, and the plan only covered `repo_not_found`; filling the gap in TS meant writing a second, slightly different copy of the Go discovery rule.
- **Net**: the first case was caught by batch B4's self-review, the `.doan/`-only case by the B4 independent review reproducing it with the CLI. The e2e plan had no "subfolder of a failing repo" case.
- **Prevention**: when the CLI does not answer a question about the repo, ask it again in a narrower form (`doan ls --repo <path>`) instead of inferring in TS. Grep for TS code that inspects repo markers: `grep -rnE '"\.doan"|config\.json' app/src | grep -v test` — only the watcher should match.

### 2026-10-22 — A served directory wiped and rebuilt silently stopped live reload

- **Area**: `app/src/main/watch.ts` (`rearm`, `servedTargets`), `shell.ts` (`servedRev`)
- **Symptom**: with `serve: ["dist"]`, `rm -rf dist && mkdir dist && write dist/a.css` reached the refresher only as `{reread: true, served: false}`; `doan ls` returned the same scope, so `servedRev` did not move and an open canvas kept the old file. With `serve: ["web/dist"]`, the watcher closed when `web/dist` was deleted and nothing watched `web/`, so after the directory came back no call arrived at all until an unrelated `design/` or comment event re-armed it.
- **Root cause**: a watcher on a deleted directory dies with its inode, and the re-arm only ran on some other watcher's event. Served directories had no parent watcher (served files did), and re-arming a target with a new inode was treated as bookkeeping, not as a change to what is served. The scope comparison in the shell cannot see a replacement because the path set stays the same.
- **Net**: caught by the batch B2 independent review with a probe on a cloned worktree (2/2 runs). Missed by the batch's own tests, which deleted and recreated only `design/` (covered by the root watcher and always a re-read) and never a served path.
- **Prevention**: every watched path needs a watcher on its parent that sees it come back, and replacing or removing a served target must count as served (`a served directory at the root that is replaced is a served change`, `a nested served directory deleted and created again is watched again`, `a serve directory at the root that is replaced bumps`). When adding a watch target, add a delete-and-recreate test for it. Grep: `grep -rnE '\bwatch\(' app/src --include='*.ts' | grep -v '\.test\.ts'`.

### 2026-10-22 — Filtering root `fs.watch` events by known names loses the root's own deletion on macOS

- **Area**: `app/src/main/watch.ts` (`classify`, root watcher)
- **Symptom**: narrowing root events to known names (`design`, `.doan`, served root files) made a deleted folder root never reach `notFound`; the shell test `re-opening a folder that came back watches it again` timed out 3/3.
- **Root cause**: deleting the watched root reports one event on the root's non-recursive watcher, named after the root itself, not after its children. A standalone single `fs.watch` on a directory removed with `rm -rf` did report child names in a separate experiment, so the shape depends on the set of watchers libuv's FSEvents stream shares.
- **Net**: caught by the existing shell test during batch B2 implementation, and confirmed by the independent review's mutation on a clone. A unit test with a single watcher would have passed.
- **Prevention**: keep the catch-all in `classify` (unknown root names re-read) and the shell test that pins it. Before filtering any watcher's events by name, check that the watcher's own path being deleted is still handled (for name-filtered parent watchers, the child's own watcher or the root watcher covers it). Grep: `grep -rnE 'filename (===|!==)|names\.has\(filename\)|rootNames\.has' app/src --include='*.ts' | grep -v '\.test\.ts'`.

### 2026-10-22 — A linked 100vh canvas kept the inherited iframe height after the 150px reset

- **Area**: `app/src/renderer/canvasView.ts` (`layoutHeight`), `main.ts` (`onLayout`), `app/src/main/canvasScript.ts` (layout message)
- **Symptom**: after an in-canvas link from a 2,500px canvas to a `min-height: 100vh` canvas with 300px of content, the iframe stayed at 2,500px. Probe log: the new document's layout (2,500) triggered the reset to 150, then another layout from the same document, still measured at the inherited 2,500px viewport, arrived and set 2,500 again; the canvas never saw a 150px viewport.
- **Root cause**: the canvas runs in another process and posts layouts on its own schedule (load, `fonts.ready`, observers), so messages already in flight do not know about the parent's last resize. The plan's rule ("reset to 150 when `href` changes") assumed the next layout would be measured after the reset, and the message carried no measurement context to tell stale from fresh.
- **Net**: caught by e2e step 9 (height after a link) in batch B4. The design noted that the PoC never checked the height after a link; the unit tests of the rule passed because they fed layouts in the order the plan assumed.
- **Prevention**: a value the canvas measures against something the renderer changes (viewport height, width, scale) must carry that input (`viewport` in `layout`), and the renderer must ignore a measurement taken against a stale input (`layoutHeight` keeps the height when `|viewport - current| > 1`). Test the out-of-order case (a stale message after the change), not only the planned order. Grep for renderer code applying canvas measurements: `grep -rnE 'message\.(height|frames)|layout\.(height|frames)' app/src/renderer --include='*.ts' | grep -v '\.test\.ts'`.
- **Recurrence (2026-10-22, B4 fix round 1)**: `app/src/renderer/main.ts` (`load`). A live reload set `src` on the same iframe after the reset to 150; the replaced document, still alive until the new one committed, saw the reset, re-measured and posted its old height with `viewport: 150`, which passed the stale check. The new document's layouts at 150 were then rejected, and a `min-height: 100vh` canvas whose content shrank never got below the old height (independent review probe, 4/4 shrink rounds). The `viewport` tag cannot tell documents apart, only inputs. Fix: a new iframe for every `src` set, so the old document ends with its element and `acceptCanvasMessage` drops anything of it still in flight; e2e C7 live-reloads a 100vh canvas from 3,000 to 300 (red when the iframe is reused). Prevention, in addition: when several documents can post to the same window, tag or isolate the sender, not only the measurement input. Grep: `grep -rnE '\.src\s*=' app/src/renderer --include='*.ts' | grep -v '\.test\.ts'` — the only match should be a new iframe in `load`.
- **Grep hit kept on purpose**: `main.ts` `message.frames[jumpTo]` applies a frame jump from the first layout after `measure`, which may be a layout already in flight rather than the reply. It is acceptable: since every load has its own iframe and a jump is dropped on a new `href`, that layout comes from the same document at the same viewport, and frame positions are board px.

### 2026-10-22 — A canvas link to a document without the canvas script left a dead board

- **Area**: `app/src/renderer/main.ts` (`frameLoaded`, `noCanvasDocument`)
- **Symptom**: after a link inside a canvas to `https://example.com/` (blocked by the window's CSP, so a Chromium error page) or to `about:blank`, the board kept the old height, frame list and sidebar mark, the status layer stayed empty, and a frame jump stayed armed forever. The plan relied on the 5 s first-layout timeout, which only an app-started load arms.
- **Root cause**: the renderer learns about documents only from their layouts, and a document without the injected script never posts one, so its arrival was invisible. The obvious detector, "an iframe `load` with no layout since the previous `load`", does not work either: the script posts again after its own document's `load` (rAF after `load`, resize after our height change), so the previous document's late layouts always fill the gap.
- **Net**: caught by the B4 independent review with a probe (`probe-blocked.mjs`). The e2e step for the blocked link only checked that a reload brought the canvas back, never the screen in between.
- **Prevention**: on the iframe element's `load`, ask the loaded document directly (`measure`) and treat no answer within 1 s as a document without the script (e2e C9 checks the unlisted line, empty frame list and no mark after `about:blank` and after the blocked link; red with `frameLoaded` disabled). For any state that depends on a message from inside the iframe, write the e2e step for the document that never sends it. Grep: `grep -rnE 'addEventListener\("load"' app/src/renderer --include='*.ts'`.

### 2026-10-22 — A fullscreen window stayed visible after Close Window

- **Area**: `app/src/main/index.ts` (window `close` handler)
- **Symptom**: with close turned into hide (app-ui), Cmd+W and `close()` hid a normal window, but after entering fullscreen, Close Window left `isVisible()` true for 10 s; the window neither hid nor closed.
- **Root cause**: on macOS a fullscreen window does not hide while it is in its own Space; `preventDefault()` followed by `hide()` is silently ignored. The window must leave fullscreen first and hide on `leave-full-screen`. That wait opens a race: an `activate` or Cmd+O before `leave-full-screen` must cancel the pending hide, or the window ends hidden after being shown.
- **Net**: caught by the app-ui batch E real-window e2e step (fullscreen → Close Window → activate), added because the C review suspected it from reports in other frameworks. The lifecycle unit tests mocked only normal windows.
- **Prevention**: keep the fullscreen unit tests (leave then hide, cancelled by activate/Cmd+O) and the e2e step. Any change to how the window hides must be tried from fullscreen too. Grep: `grep -rnE '\.hide\(|leave-full-screen' app/src/main --include='*.ts' | grep -v '\.test\.ts'`.

### 2026-10-22 — The fresh-iframe rule survived its mutation after the renderer moved to React

- **Area**: `app/src/renderer/CanvasController.ts` (`load`), `app/e2e/runtime.ts` (C7)
- **Symptom**: during the app-ui mutation proof, reusing the iframe (`this.frame ?? document.createElement("iframe")`) passed the whole e2e. The rule from the "linked 100vh canvas" entry above was no longer guarded.
- **Root cause**: C7 checked the rule only through its effect (a 100vh canvas shrinking from 3,000 to 300 after a live reload). With the new renderer's timing, the replaced document's stale layout no longer won the race, so the effect check passed with a reused iframe. An effect-only check depends on the timing it was written against.
- **Net**: caught by re-running ARCHITECTURE §3's mutation proof on the rebuilt screen (task 6), not by any review.
- **Prevention**: C7 now also checks the rule directly: after a live reload the previous iframe handle is detached and the new one is a different node (red with the reuse mutation). When a guarantee is pinned only by an effect that depends on timing, add a structural assertion too, and re-run the mutation proof whenever the code around it is rewritten. Grep: `grep -rnE 'createElement\("iframe"\)|\.src\s*=' app/src/renderer --include='*.ts' | grep -v '\.test\.ts'`.

### 2026-10-22 — A zero-mismatch table missed a newly styled child

- **Area**: `app/src/renderer/Sidebar.tsx`, `styles.css`, app-shell design-sync measurement pairs.
- **Symptom**: the no-frames hint gained a colored `data-doan-frame` code chip even though the draft used plain text; the computed-style table still reported zero rendered mismatches.
- **Root cause**: the comparison paired the hint container but not its child. A shared `.hint code` rule intended for the project's `doan init` instruction also styled the existing child in the frame hint. Matching the parent's computed styles said nothing about the child's background, padding, or text color.
- **Net**: the independent review's child-level Electron probe caught it; the original measurement table and behavior-only e2e missed it. The new no-frames e2e assertion failed with one child element before the fix and passes with plain text. The table now records child absence and each pair's `textContent`.
- **Prevention**: when pairing a container, also pair children that carry text, background, or spacing; record `textContent` so a wrong selector is visible. Pin the plain-text hint's zero element children in the runtime test. Run `rg -n '\.hint code|<code[ >]' app/src/renderer` when changing hint/code styles: the remaining matches are the intended project instruction chip, its CSS rule, and the first-launch `.doan/` text whose system-sans deviation is documented in DESIGN.md.


- **Recurrence (2026-10-23, comments-ui)**: the green behavioral suite did not pin heading weight, recovery-action line-height, nested recovery width/spacing, the loading heading, focused pin outline or the card-conflict warning rule. Child/state-level Electron measurements exposed these differences; eleven presentation checks were observed failing before localized fixes in `CommentsPanel.tsx`, `CommentPins.ts` and `styles.css`.
- **Prevention**: read computed values on the actual recovery/loading/focus state, including its own call-site severity and empty action containers. Run `rg -n 'comments-message|comments-tools|comments-head h3|comment-pin:focus-visible' app/src/renderer/CommentsPanel.tsx app/src/renderer/styles.css`; the search finds both card and editor recovery call sites, which must be checked separately. Keep unmatched elements and incomplete states explicit: cross-specimen primitive/property comparisons do not establish whole-state equivalence, even when every compared row is classified.

- **Recurrence (2026-10-24, onboard)**: project fields reused the Inspector's `.value` class. Its unscoped `display: flex; gap: 6px` silently changed project-name/path flow despite 1,286 passing unit tests. Child-level Electron comparison found block → flex and inline → block differences. The onboarding E2E assertion failed with `flex / 6px / block` before `.ob-field .value` restored `block / normal / inline`; the Inspector remains unchanged.
- **Prevention**: when reusing a short presentation class, inspect all matching selectors and read computed display/gap on its children. `rg -n 'className=.*value|\.value \{' app/src/renderer` finds the Inspector value components and the two onboarding field call sites. Keep the computed-style assertion in `app/e2e/onboarding.ts`; color-only comparisons would miss this inheritance.

### 2026-10-21 — TS and Go comment folding diverged on inputs the shared fixtures did not cover

- **Area**: `app/src/formats/fold.ts`, `cli/internal/formats/fold.go` (`parseLines`/`fold`)
- **Symptom**: Both implementations passed all 28 shared fold fixtures, yet on the same JSONL they disagreed: a line with only U+FEFF or U+0085 was skipped by one and reported as `invalid_event` by the other; `"v":1e400` was `unknown_version` in TS but `invalid_event` (without `event`/`comment`) in Go; `fold()` returned warnings in a different order; identical duplicate events kept the first array entry instead of the smallest line.
- **Root cause**: Each implementation leaned on its language's defaults — JS `String.prototype.trim` and Go `strings.TrimSpace` strip different Unicode sets, `JSON.parse` yields `Infinity` while Go `json.Unmarshal` errors on overflow — and the design text ("whitespace-only line", "merge and sort warnings") did not pin which set or where. Merge/sort lived only in the test harness, so the unsorted `fold()` output was never compared.
- **Net**: Caught by an independent reviewer that fed 42 identical inputs to both implementations and diffed the outputs. Missed by the fixture suite and by both workers' self-reviews, because fixtures only exercised inputs the plan listed.
- **Prevention**: For any rule implemented in both TS and Go, state the exact character set / numeric range in design and add a fixture at the boundary (BOM, U+0085, NBSP, CR-only, `1e400`, reversed duplicate order). Expose the composed public function (`foldText`) and test that, not a harness-side composition. Grep for language-default trimming in shared-format code: `grep -rnE '\.trim\(\)|TrimSpace|trimStart|trimEnd' app/src cli`.
- **Recurrence (2026-10-21, cli-core)**: `repo.ParseConfig` checked `v` with `json.Number.Float64()` but passed the original number to the schema, so `{"v":1.0000000000000001}` was `invalid_config` while `parseLines` accepts the same `v` as 1. Caught by the batch A independent review, not by the batch's own fixtures. Fixed by writing the float back before validation, as `fold.go` does.

### 2026-10-21 — Filesystem APIs did not match "missing" and "same file" as the product means them

- **Area**: `cli/internal/repo/resolve.go`, `find.go`; `cli/internal/cli/init.go`
- **Symptom**: a canvas href such as `tokens.css/x.css` or `%00` made `doan check` exit 1 (`internal_error`) instead of reporting `local_css_not_found`; an ancestor `.doan` regular file stopped repo discovery; `DESIGN/A.CSS` and `design/a.css` became two keys on macOS (false `css_not_served`, duplicate findings); `doan init` followed a dangling `.doan/config.json` symlink and created a file outside the repo.
- **Root cause**: `os.IsNotExist` covers only `ENOENT`, while `ENOTDIR`, `EINVAL`, `ENAMETOOLONG` and Go's unwrapped "EvalSymlinks: too many links" also mean "no such file" for content-derived paths; `filepath.EvalSymlinks` resolves links but keeps the caller's letter case on case-insensitive filesystems; "missing" is safe for reading but not for writing, because `os.WriteFile` follows a dangling symlink.
- **Net**: caught by the independent reviews of batches A and D with concrete inputs, and by D's self-review for the write path. Missed by the planned case lists, which only had `ENOENT`-shaped inputs and one spelling per file.
- **Prevention**: for every path that comes from canvas or config content, test `ENOTDIR`, a NUL byte, an over-long name, a symlink loop, a different letter case, and a dangling symlink at each write target. Grep: `grep -rnE 'IsNotExist|EvalSymlinks|os\.WriteFile' cli app/src`.
- **Recurrence (2026-10-21, app-shell)**: `doan ls` `result.root` kept the caller's letter case from `--repo` or `$PWD` (`repo.Find` used `EvalSymlinks` alone), so one repo could be stored twice by the app and every served path would miss `relInside`. Caught by the batch B1 independent review; fixed by passing the root through `diskSpelling`. `doan init`'s `result.repo` (`init.go`) still keeps the caller's spelling.
- **Recurrence (2026-10-24, onboard)**: in app main, JS `realpathSync` kept the caller's letter case on this macOS volume while `realpathSync.native` returns the on-disk spelling, so a same-file link written with another case was not recognized as ours. Caught by the G review; fixed by using native realpath for setup identities, with a case-alias regression (an `ELOOP` link stays foreign). Grep: `rg -n 'realpathSync\(' app/src/main --glob '!*.test.ts'` should find no caller (2026-10-24: only `realpathSync.native` is used).

### 2026-10-21 — An HTML parser fed from memory can still fail, and dropping the error looks like a missing meta

- **Area**: `cli/internal/canvas/canvas.go` (`Parse`)
- **Symptom**: a canvas nested deeper than 512 elements parsed to an empty model, which would have produced `missing_canvas_id` and `missing_width` for a canvas that has both.
- **Root cause**: `golang.org/x/net/html` returns an error when the open-element stack exceeds 512 nodes, even with an infallible `bytes.Reader`; the planned signature had no error because input from memory "cannot fail".
- **Net**: caught by batch B's self-review; no planned case covered parser resource limits. Fixed by returning `(Canvas, error)` and reporting `unparsable_canvas` instead of failing the command.
- **Prevention**: when wrapping a third-party parser, read its error paths before choosing a signature without `error`, and add a resource-limit case (deep nesting, huge input). Grep: `grep -rnE 'html\.Parse|_ = .*Parse' cli`.

### 2026-10-21 — A character device is not necessarily a terminal

- **Area**: `cli/internal/cli/run.go`, `terminal_*.go` (`doan init` prompt)
- **Symptom**: `doan init < /dev/null` asked the token CSS question even though no human can answer.
- **Root cause**: `os.ModeCharDevice` marks any character device, `/dev/null` included, not an interactive terminal; tests injected `Context.Terminal` and a `strings.Reader`, so a real non-terminal device never reached the check.
- **Net**: caught by batch D's self-review, then pinned with a `cli.Run` test on `/dev/null`; the batch D reviewer confirmed the real-terminal path with a pty.
- **Prevention**: decide "interactive" with a terminal ioctl (termios), and test with `/dev/null` and a pipe besides the injected prompt. Grep: `grep -rn 'ModeCharDevice' cli app/src`.

### 2026-10-21 — Sorting file names does not sort the ids derived from them

- **Area**: `cli/internal/cli/read.go` (`doan comments`)
- **Symptom**: comments for canvas `foo-bar` came before `foo`, against the documented sort by canvas id.
- **Root cause**: results were emitted in `os.ReadDir` order of `<id>.jsonl`; `-` (0x2D) sorts before `.` (0x2E), so `foo-bar.jsonl` < `foo.jsonl` while `foo` < `foo-bar`. Every planned test used one id, or ids that sort the same either way.
- **Net**: caught by the batch D independent review running the binary on `foo` and `foo-bar`; missed by single-id tests.
- **Prevention**: sort explicitly on the logical key after deriving it from a file name, and include an id that is a prefix of another (`foo`, `foo-bar`) in ordering tests. Grep: `grep -rn 'ReadDir\|CommentFiles' cli/internal/cli`.

### 2026-10-21 — Local server guarantees lived in comments and echoed constants, not in behavior

- **Area**: `app/src/main/serve/server.ts`, `server.test.ts`
- **Symptom**: the "listens on 127.0.0.1 only" test stayed green with `listen(0, "0.0.0.0")`; a directory swapped for a symlink between the realpath check and `open` served a file outside the repo with 200 (reproduced with a delay); a file growing mid-transfer sent more bytes than `Content-Length` on a keep-alive socket. The code comment claimed the swap could not happen.
- **Root cause**: the server returned its `HOST` constant, so the test compared the constant with itself; `open(realPath)` re-walks the path, so resolving first and opening by name is not atomic; `createReadStream()` reads to EOF, not to the `fstat` size sent in the header.
- **Net**: caught by the batch B3 independent review, which mutated the bind address, widened the race window with a delay, and grew a file during a transfer. Missed by the batch's own 39 server tests, which only exercised static trees.
- **Prevention**: assert observed state (`server.address().address`), and prove each security test with a mutation that must turn it red. Open resolved paths with `O_NOFOLLOW_ANY` (macOS) and cap streamed bodies at the `fstat` size. Grep: `grep -rnE 'host: HOST|open\([^)]*"r"\)|createReadStream\(\)' app/src`.
