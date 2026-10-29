# Design preset sources

This file maps every upstream source behind Doan's design presets to the public preset(s) it is reflected in, or records why it is not reflected. It is committed next to the preset data and is **not** embedded in the CLI binary. Update it whenever a preset body changes which upstream files it adapts.

- Upstream: [pbakaus/impeccable](https://github.com/pbakaus/impeccable/tree/d34c87e1a00989ae8dbdd7f6b30b70f23319e860), commit `d34c87e1a00989ae8dbdd7f6b30b70f23319e860`, Apache License 2.0.
- Reviewed scope (2026-10-29): the 24 commands in `skill/SKILL.src.md`, the 41 Markdown files under `skill/reference/`, and the 4 role documents under `skill/agents/` — 69 sources. The upstream `skill/scripts/` engine is not a source; nothing from it is ported.
- Doan adapts the text; it does not port the upstream engine. The launcher, `impeccable <verb>` commands, live mode, hooks, detector, doctor, pin, image generation, subagents, `.impeccable/` files, and template placeholders are removed or rewritten as Doan instructions.

## Public catalog

The public catalog is the 20 IDs below (user decision 2026-10-28; `context` ID 2026-10-29), in this order. `catalog.json`, not this file, is the shipped catalog; it holds the presets whose bodies have been adapted so far, which are marked **adapted** in the tables below.

`context`, `shape`, `document`, `extract`, `critique`, `audit`, `polish`, `distill`, `bolder`, `quieter`, `layout`, `typeset`, `colorize`, `clarify`, `harden`, `onboard`, `adapt`, `animate`, `delight`, `generate`.

Upstream names that are not published (`craft`, `live`, `overdrive`, `optimize`, and `init`, which is published as `context`) are rejected like any unknown ID; there are no aliases.

Decided display names (`title` in `catalog.json`):

| ID | Title | Decision |
|---|---|---|
| `context` | Gather design context | G1, 2026-10-29 |
| `clarify` | Clarify copy | design example contract, 2026-10-29 |
| `document` | Document the design system | user decision, 2026-10-29 |

The remaining titles are written with their bodies.

## Notices shipped in the CLI

Embedded from `notices/` and checked by the validator:

| File | Content |
|---|---|
| `LICENSE` | Upstream `LICENSE` at the pinned commit, byte-for-byte (Apache License 2.0, "Copyright 2025 Paul Bakaus"). |
| `NOTICE.md` | Upstream `NOTICE.md` at the pinned commit, byte-for-byte. It names ehmo/platform-design-skills (MIT) as the source of `skill/reference/ios.md` and `skill/reference/android.md`. |
| `platform-design-skills-LICENSE` | A three-line header (source URL and commit, and the fact that upstream `NOTICE.md` names this project), followed by the `LICENSE` of [ehmo/platform-design-skills](https://github.com/ehmo/platform-design-skills) at commit `dc2be825d8b439caea78e9eaa8fb3ac23b0ff3e9`, byte-for-byte. Its copyright line reads "Copyright (c) 2026" with no holder name; Doan does not add one. The text was not in the Impeccable clone; it was fetched from GitHub on 2026-10-29. |
| `MODIFICATIONS.md` | Doan's modification notice: bodies are adapted from the pinned commit and modified. |

Every preset body also ends with its own source line naming the upstream commit and files and stating that Doan modified them; the validator requires each catalog source path and commit to appear in the body.

## Upstream engine check

No preset body may keep an upstream engine command, placeholder, rule tag, or harness block. Run from the repository root:

```sh
rg -n -i -P '(?<!pbakaus/)impeccable|\{\{|\}\}|<skill-base-dir>|<!-- rule:|</?(codex|claude)>|CONTEXT_STALE|NO_PRODUCT_MD|IMAGE_GEN_AVAILABLE' cli/internal/designskill/presets/
```

The expected result is no output (exit status 1). The only allowed `impeccable` is the repository name `pbakaus/impeccable` in a body's source line, so a source line must spell the repository that way and must not call it "Impeccable" bare. The pattern catches launcher and slash commands (`impeccable context`, `{{command_prefix}}impeccable polish`), `.impeccable/` paths, subagent names (`impeccable-finish-reviewer`), template placeholders, upstream rule tags, harness-conditional blocks, and engine directives. The validator separately rejects `{{...}}`, `<skill-base-dir>`, relative Markdown link destinations (inline links and link reference definitions), and bare `reference/`, `agents/`, or `scripts/` paths.

## Status values

- **adapted** — a committed body reflects this source.
- **planned** — the named preset(s) will reflect it when that body is written; replace with **adapted** then.
- **not reflected** — intentionally left out, with the reason.

## Commands in `skill/SKILL.src.md` (24)

`SKILL.src.md` itself also feeds `context` with its "How to design" principles (the brief wins; refinement preserves, redesign replaces; visual authority is evidence, not a filename). Its setup, routing, pin, hooks, and doctor sections are engine behavior and are not reflected; Doan's guide carries its own preset mapping rules.

| Upstream command | Doan preset(s) | Status | Notes |
|---|---|---|---|
| `craft` | — | not reflected | Deprecated upstream alias for ordinary new work; it adds no guidance. New-work guidance reaches `shape` and `generate` through `new-work.md`. |
| `shape` | `shape` | planned | |
| `init` | `context` | adapted | Published as `context` so agents do not confuse it with the CLI `doan init` or MCP `init`. |
| `document` | `document` | planned | |
| `extract` | `extract` | planned | |
| `critique` | `critique` | planned | |
| `audit` | `audit` | planned | |
| `polish` | `polish` | planned | |
| `bolder` | `bolder` | planned | |
| `quieter` | `quieter` | planned | |
| `distill` | `distill` | planned | |
| `harden` | `harden` | planned | |
| `onboard` | `onboard` | planned | |
| `animate` | `animate` | planned | |
| `colorize` | `colorize` | planned | |
| `typeset` | `typeset` | planned | |
| `layout` | `layout` | planned | |
| `delight` | `delight` | planned | |
| `overdrive` | `animate`, `delight` | planned | Not published on its own. Only its expressive guidance (propose directions first, progressive enhancement, one extraordinary moment) is folded in. |
| `clarify` | `clarify` | adapted | |
| `adapt` | `adapt` | planned | |
| `optimize` | `animate`, `audit`, `harden` | planned | Not published on its own. Only performance cautions are folded in; production bundle, network, and API optimization is out of scope. |
| `live` | `generate`, `polish` | planned | Not published on its own. Variant planning goes to `generate`, in-place refinement to `polish`; the live server, browser overlay, and poll loop are not ported. |
| `generate` | `generate` | planned | Alternatives are drawn on canvases; no live browser and no comparison or adoption UI. |

## Reference files in `skill/reference/` (41)

| Upstream file | Doan preset(s) | Status | Notes |
|---|---|---|---|
| `adapt.md` | `adapt` | planned | Drop device-lab and throttled-network steps the agent cannot run, or report them as unverified. |
| `adapt.native.md` | `adapt` | planned | Principles only (restructure, do not stretch; translate idioms, do not transplant). Native procedures are not reflected. |
| `android.md` | — | not reflected | Native Android platform rules with `adb` verification; Doan canvases are HTML. Derived from ehmo/platform-design-skills: if a preset reflects it later, `platform-design-skills-LICENSE` already covers it. |
| `animate.md` | `animate` | planned | |
| `audit.md` | `audit` | planned | Remove the bundled detector, CDP, and re-run commands; separate checked from unchecked items. |
| `audit.native.md` | — | not reflected | Native-only audit; its report skeleton duplicates `audit.md`. |
| `bolder.md` | `bolder` | planned | |
| `clarify.md` | `clarify` | adapted | |
| `colorize.md` | `colorize` | planned | Drop the live-mode parameter section. |
| `component-review.md` | — | not reflected | Review server and manifests for image-comp builds (`.impeccable/review/`); no design guidance beyond "the user approves what ships". |
| `craft-floor.md` | `polish`, `generate`, `critique`, `audit`, `animate` | planned | The quality floor and refusals are merged into each preset that edits or reviews UI; the design-hook enforcement is not ported. |
| `craft.md` | — | not reflected | Same as the `craft` command: an alias that adds nothing. |
| `critique.md` | `critique` | planned | Keep the design review, heuristics, cognitive load, personas, and severity; drop the detector, browser overlay, subagents, and critique storage. |
| `delight.md` | `delight` | planned | |
| `distill.md` | `distill` | planned | |
| `doctor.md` | — | not reflected | Repairs drift in upstream engine artifacts; no design guidance. |
| `document.md` | `document` | planned | The rules document and the `design-system` canvas follow Doan's decisions (below), not upstream's fixed root `DESIGN.md`, sidecar, live panel, or linter. |
| `extract.md` | `extract` | planned | |
| `generate.md` | `generate` | planned | Keep the direction-word mapping and default count; the live session protocol is not ported. |
| `harden.md` | `harden`, `onboard` | planned | Empty and first-use states also inform `onboard`. |
| `hooks.md` | — | not reflected | Detector hook management and harness hook manifests. |
| `init.md` | `context` | adapted | Product context capture; recording depends on the user's agreement and uses an existing document or a user-chosen location. |
| `ios.md` | — | not reflected | Native iOS platform rules with Simulator verification; Doan canvases are HTML. Derived from ehmo/platform-design-skills, as for `android.md`. |
| `layout.md` | `layout` | planned | Drop the detector scope and live-mode parameters. |
| `live-setup.md` | — | not reflected | Live server configuration, framework injection, and CSP patching. |
| `live.md` | `generate`, `polish` | planned | Only the variant-planning rules (identity lock, variants that differ on distinct primary axes). |
| `mode-operate.md` | `shape`, `generate` | planned | Surface-mode questions and constraints only; the concept-roll procedure is not ported. |
| `mode-persuade.md` | `shape`, `generate` | planned | As above. |
| `mode-read.md` | `shape`, `generate` | planned | As above. |
| `new-work.md` | `context`, `shape`, `generate` | adapted (`context`); planned (`shape`, `generate`) | `context` adapts section 1 ("Decide what is already true"). The concept seed, decision page, comp-led build, and finish review are not ported. |
| `onboard.md` | `onboard` | planned | |
| `operate.md` | `layout`, `typeset`, `quieter`, `harden` | planned | Operate and Read depth for app and document surfaces. |
| `optimize.md` | `animate`, `audit`, `harden` | planned | Performance cautions only, as for the `optimize` command. |
| `overdrive.md` | `animate`, `delight` | planned | As for the `overdrive` command. |
| `polish.md` | `polish` | planned | Drop critique storage and context or hook directives. |
| `quieter.md` | `quieter` | planned | |
| `region-map.md` | — | not reflected | Region maps for approved comp images; part of the image pipeline. |
| `routing.md` | `context` | adapted | Only the workflow-question rule (advise without executing). The context menu, signals, and detector run are engine behavior; Doan's guide carries its own mapping rules. |
| `shape.md` | `shape` | planned | |
| `typeset.md` | `typeset` | planned | Drop the detector scope and live-mode parameters. |
| `visualize.md` | — | not reflected | Image generation of comps and plates. |

## Role documents in `skill/agents/` (4)

No subagent is ported. Doan's presets are read by the current agent, which does the work itself.

| Upstream file | Doan preset(s) | Status | Notes |
|---|---|---|---|
| `impeccable-asset-producer.md` | — | not reflected | Regenerates image plates from a comp spec. |
| `impeccable-documenter.md` | `document` | planned | Only the principle that a design system is documented from shipped evidence, and floor refusals are not canonized as house style. |
| `impeccable-finish-reviewer.md` | `critique` | planned | Only the review lens (type, material, ground) and ordered, one-line material fixes; the contract and comp pipeline is not ported. |
| `impeccable-manual-edit-applier.md` | — | not reflected | Applies live-mode manual edit batches. |

## Decisions the `document` preset must carry

Recorded in the feature spec (§3.1, §3.2) and confirmed in A1-R on 2026-10-29:

- The preset writes two artifacts: a rules document for agents, and a canvas for people to check colors, typography, and components.
- Rules document location: update the project's existing design document if there is one; otherwise ask the user where it should go; if there is no answer, propose a root `DESIGN.md` (user decision 2026-10-29). Do not put it under `.doan/`.
- Canvas: `.doan/canvases/design-system.html`, canvas id `design-system` (the file name without `.html`). There is no separate display name such as "Design System" (user decision 2026-10-28).
- Respect the project's existing structure. When updating, keep frames and IDs outside the request unchanged; colors and typography reference the project's token CSS variables instead of copying values (user decision 2026-10-29).
- Reuse an existing design system when it is sufficient; a plain CLI setup request is not approval to write one.
