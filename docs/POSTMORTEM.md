# Postmortem

> Pitfalls we hit, stacked in date order. Append-only — do not edit or delete existing entries.

### 2026-10-21 — TS and Go comment folding diverged on inputs the shared fixtures did not cover

- **Area**: `app/src/formats/fold.ts`, `cli/internal/formats/fold.go` (`parseLines`/`fold`)
- **Symptom**: Both implementations passed all 28 shared fold fixtures, yet on the same JSONL they disagreed: a line with only U+FEFF or U+0085 was skipped by one and reported as `invalid_event` by the other; `"v":1e400` was `unknown_version` in TS but `invalid_event` (without `event`/`comment`) in Go; `fold()` returned warnings in a different order; identical duplicate events kept the first array entry instead of the smallest line.
- **Root cause**: Each implementation leaned on its language's defaults — JS `String.prototype.trim` and Go `strings.TrimSpace` strip different Unicode sets, `JSON.parse` yields `Infinity` while Go `json.Unmarshal` errors on overflow — and the design text ("whitespace-only line", "merge and sort warnings") did not pin which set or where. Merge/sort lived only in the test harness, so the unsorted `fold()` output was never compared.
- **Net**: Caught by an independent reviewer that fed 42 identical inputs to both implementations and diffed the outputs. Missed by the fixture suite and by both workers' self-reviews, because fixtures only exercised inputs the plan listed.
- **Prevention**: For any rule implemented in both TS and Go, state the exact character set / numeric range in design and add a fixture at the boundary (BOM, U+0085, NBSP, CR-only, `1e400`, reversed duplicate order). Expose the composed public function (`foldText`) and test that, not a harness-side composition. Grep for language-default trimming in shared-format code: `grep -rnE '\.trim\(\)|TrimSpace|trimStart|trimEnd' app/src cli`.
