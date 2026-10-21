# Postmortem

> Pitfalls we hit, stacked in date order. Append-only — do not edit or delete existing entries.

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
