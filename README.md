# Doan Design

> The agent draws; the human views and points. Design drafts live in the code repo.

A doan (도안, 圖案) is a drawing made in advance of the shape of something to be built. Doan Design is a tool where a coding agent (Claude Code, Codex, etc.) writes an HTML canvas (a design spec) inside a code repo, and a human views that canvas in a local Mac app and selects elements to leave comments.

Naming: product `Doan Design` · domain `doan.design` · CLI and identifiers `doan`

> **Status: in development, not released.** The source of truth for planning decisions is [docs/PRODUCT.md](./docs/PRODUCT.md). This README keeps only the background and the references consulted (2026-10-21). The earlier draft, which covered principles, the loop, repo conventions, the CLI, and the MVP, remains in the git history of `README.md`.

---

## Background — friction from working with Claude Design

These are the problems actually hit while running the Claude Design handoff → `/design-sync` loop during malmoi (`~/code/malmoi`) development, 2026-09 to 10.

**Conversation and tools are split**
- Conversation about design drafts piled up inside Claude Design, and implementation conversation piled up separately in code sessions. The same decisions were scattered across two places.
- Design drafts are made in Claude Design, and code sessions have to fetch them with DesignSync (`list_files` · `get_file`). Every time, you switch back and forth between tools.
- **Codex cannot use Claude Design or DesignSync.** So the `/design-sync` skill splits by runtime — Claude Code uses DesignSync, while Codex needs "the user to provide the path to a local handoff folder".

**Agents cannot read design drafts properly**
- Large design drafts **get truncated at 256 KiB** (gitlab-repositories v5 — the G10b · G11a · G11b frames could not be read). The fix was a human hand: "please split dark and es into separate files".
- Reviewing design drafts was possible **only through DOM text and structure** — screenshots were not available, so spacing and color could not be judged.
- Content written in canvas notes (e.g. a sentence about insufficient scope) was outside the frames, so it had to be tracked separately.

**Design drafts live in a different world from the code**
- Design drafts **do not know the project's real tokens and primitives.** So a class of errors kept recurring where the values were right but the structure was wrong:
  - 2026-09-13 new-project modal: the handoff was pinned down to the px, yet the implementation diverged in **29 places** while all 3,000 tests were green.
  - 2026-09-14 Dialog: the draft's `padding:16 16 0` rested on an **implicit assumption** that "the footer carries the bottom spacing"; once that value was moved into the primitive, forms stuck to the bottom in consumers without a footer.
  - `/account`: all values were right, and there were eight classes of divergence where **only "which row it is in" was wrong**.
- Design drafts draw **things that do not exist** — e.g. an image (`ghcr.io/…/malmoi-cli:1`) and command (`malmoi push`) that do not exist in the CI YAML, and a date notation (`(UTC+09:00)`) that differs from the code rules.

**The source of truth wavers**
- 2026-09-24 **the old canvas was lost.**
- The period during which the design draft was the source of truth was ambiguous, so the rule was revised three times — "the handoff is the source of truth" (09-25) → "after implementation the code is the source of truth, and a new draft is a change request" (09-27) → "if a human approved the draft for a change, compare against it again" (10-03). Because the drafts lived only in an external service, **which board was the approved one** was not recorded on the draft side.
- Every time the draft version grew through v3 · v4 · v5 · v6, a human wrote "what changed" into a document by hand.
- And standalone Claude Design **shuts down on 2026-12-14** — chats and comments are not migrated. That is where a source of truth that exists only in an external service ends up.

**Multiple machines, multiple agents**
- Work happened on two machines, and the path to access design drafts differed per session and runtime.
- In orchestration (10-odd workers, mixing Claude and Codex), only some workers could read the design drafts.

## References

These are what we intended to consult at the draft stage. What was actually adopted, and why, is written in [docs/PRODUCT.md](./docs/PRODUCT.md).

| Reference | What we intended to consult |
|---|---|
| Orca · ego-browser | Skill stub + binary guide, `status --json`, response envelope · `nextSteps`, runtime file discovery |
| open-claude-design | Router skill, meaningful exit codes, content-hash-based writes, width × theme render bundles |
| Doop · Agentation | Click-an-element notes, note lifecycle, mandatory screenshot review checklist |
| Storybook | Source of truth inside the repo, stable iframe URLs, width and theme as globals, render-complete signal |
| baoyu-design | In-repo `designs/` HTML conventions, allowed-token list, undefined-variable checks |
| Pencil.dev (now pen.dev) | Design files living in the repo, partial reads, text layout snapshots |
| Chromatic · git-appraise | Approval-complete rule, append-only JSONL review log |
