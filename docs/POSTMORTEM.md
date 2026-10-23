# Postmortem

> Pitfalls we hit, newest date first. Preserve existing entry content; insert new entries above older ones.

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
