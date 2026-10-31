# Design preset sources

This file maps every upstream source behind Doan's design presets to the public preset(s) it is reflected in, or records why it is not reflected. It is committed next to the preset data and is **not** embedded in the CLI binary. Update it whenever a preset body changes which upstream files it adapts.

- Upstream: [pbakaus/impeccable](https://github.com/pbakaus/impeccable/tree/d34c87e1a00989ae8dbdd7f6b30b70f23319e860), commit `d34c87e1a00989ae8dbdd7f6b30b70f23319e860`, Apache License 2.0.
- Reviewed scope (2026-10-29): the 24 commands in `skill/SKILL.src.md`, the 41 Markdown files under `skill/reference/`, and the 4 role documents under `skill/agents/` — 69 sources. The upstream `skill/scripts/` engine is not a source; nothing from it is ported.
- Doan adapts the text; it does not port the upstream engine. The launcher, `impeccable <verb>` commands, live mode, hooks, detector, doctor, pin, image generation, subagents, `.impeccable/` files, and template placeholders are removed or rewritten as Doan instructions.

## Public catalog

The public catalog is the 20 IDs below (user decision 2026-10-28; `context` ID 2026-10-29), in this order. `catalog.json`, not this file, is the shipped catalog; it holds all 20 presets in this order.

`context`, `shape`, `document`, `extract`, `critique`, `audit`, `polish`, `distill`, `bolder`, `quieter`, `layout`, `typeset`, `colorize`, `clarify`, `harden`, `onboard`, `adapt`, `animate`, `delight`, `generate`.

Upstream names that are not published (`craft`, `live`, `overdrive`, `optimize`, and `init`, which is published as `context`) are rejected like any unknown ID; there are no aliases.

Decided display names (`title` in `catalog.json`):

| ID | Title | Decision |
|---|---|---|
| `context` | Gather design context | G1, 2026-10-29 |
| `clarify` | Clarify copy | design example contract, 2026-10-29 |
| `document` | Document the design system | user decision, 2026-10-29 |

The other titles were written with their bodies (batch P, 2026-10-29) and live in `catalog.json`.

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

No preset body may keep an upstream engine command, placeholder, rule tag, or harness block. `go test ./cli/internal/designskill` enforces this (`TestPresetsKeepNoUpstreamEngine`, with the pattern itself pinned by `TestEngineCheckPattern` in `designskill_test.go`); Go's regexp has no lookbehind, so the test blanks the allowed tokens below and then matches the rest. The same check by hand, from the repository root:

```sh
rg -n -i -P '(?<!pbakaus/)(?<!`skill/agents/)impeccable|pbakaus/impeccable(?! at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860)|`skill/agents/impeccable(?!-(documenter|finish-reviewer)\.md`)|\{\{|\}\}|<skill-base-dir>|<!-- rule:|</?(codex|claude)>|CONTEXT_STALE|NO_PRODUCT_MD|IMAGE_GEN_AVAILABLE' cli/internal/designskill/presets/
```

The expected result is no output (exit status 1). Only two exact source-notice tokens may contain `impeccable`: `pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860`, and the backticked role-document paths `` `skill/agents/impeccable-documenter.md` `` and `` `skill/agents/impeccable-finish-reviewer.md` `` (the validator requires each catalog source path to appear in the body). A source line must spell them exactly that way and must not call the project "Impeccable" bare. Every other occurrence is caught, including launcher and slash commands (`impeccable context`, `{{command_prefix}}impeccable polish`), `.impeccable/` paths, subagent names (`impeccable-finish-reviewer`), un-backticked or altered role-document paths (`skill/agents/impeccable context`), template placeholders, upstream rule tags, harness-conditional blocks, and engine directives. The validator separately rejects `{{...}}`, `<skill-base-dir>`, relative Markdown link destinations (inline links and link reference definitions), and bare `reference/`, `agents/`, or `scripts/` paths.

This grep is a string check. It cannot tell whether the text around an allowed token tells an agent to run an upstream engine or subagent (for example, a sentence asking the agent to run a role document as a subagent), so it does not replace reading each changed body.

## Status values

- **adapted** — a committed body reflects this source.
- **not reflected** — intentionally left out, with the reason.

## Commands in `skill/SKILL.src.md` (24)

`SKILL.src.md` itself also feeds `context` with its "How to design" principles (the brief wins; refinement preserves, redesign replaces; visual authority is evidence, not a filename). Its "Modes" section (four surface modes, chosen by the requested surface rather than the product) feeds "Name the surface mode" in `shape` and "Respect the surface mode" in `generate`. Its setup, routing, pin, hooks, and doctor sections are engine behavior and are not reflected; Doan's guide carries its own preset mapping rules.

| Upstream command | Doan preset(s) | Status | Notes |
|---|---|---|---|
| `craft` | — | not reflected | Deprecated upstream alias for ordinary new work; it adds no guidance. New-work guidance reaches `shape` and `generate` through `new-work.md`. |
| `shape` | `shape` | adapted | Through `skill/reference/shape.md` (below). |
| `init` | `context` | adapted | Published as `context` so agents do not confuse it with the CLI `doan init`. |
| `document` | `document` | adapted | Through `skill/reference/document.md` (below). |
| `extract` | `extract` | adapted | Through `skill/reference/extract.md` (below). |
| `critique` | `critique` | adapted | Through `skill/reference/critique.md` (below). |
| `audit` | `audit` | adapted | Through `skill/reference/audit.md` (below). |
| `polish` | `polish` | adapted | Through `skill/reference/polish.md` (below). |
| `bolder` | `bolder` | adapted | Through `skill/reference/bolder.md` (below). |
| `quieter` | `quieter` | adapted | Through `skill/reference/quieter.md` (below). |
| `distill` | `distill` | adapted | Through `skill/reference/distill.md` (below). |
| `harden` | `harden` | adapted | Through `skill/reference/harden.md` (below). |
| `onboard` | `onboard` | adapted | Through `skill/reference/onboard.md` (below). |
| `animate` | `animate` | adapted | Through `skill/reference/animate.md` (below). |
| `colorize` | `colorize` | adapted | Through `skill/reference/colorize.md` (below). |
| `typeset` | `typeset` | adapted | Through `skill/reference/typeset.md` (below). |
| `layout` | `layout` | adapted | Through `skill/reference/layout.md` (below). |
| `delight` | `delight` | adapted | Through `skill/reference/delight.md` (below). |
| `overdrive` | `animate`, `delight` | adapted | Not published on its own. Only its expressive guidance is folded in, through `skill/reference/overdrive.md` (below). |
| `clarify` | `clarify` | adapted | |
| `adapt` | `adapt` | adapted | Through `skill/reference/adapt.md` (below). |
| `optimize` | `animate`, `audit`, `harden` | adapted | Not published on its own. Only performance cautions are folded in, through `skill/reference/optimize.md` (below); production bundle, network, and API optimization is out of scope. |
| `live` | `generate`, `polish` | adapted | Not published on its own. Variant planning goes to `generate`, in-place refinement to `polish`, through `skill/reference/live.md` (below); the live server, browser overlay, and poll loop are not ported. |
| `generate` | `generate` | adapted | Through `skill/reference/generate.md` (below). Alternatives are drawn on canvases; no live browser and no comparison or adoption UI. |

## Reference files in `skill/reference/` (41)

| Upstream file | Doan preset(s) | Status | Notes |
|---|---|---|---|
| `adapt.md` | `adapt` | adapted | "Assess the challenge", "Strategies by target", "Responsive mechanics", "Draw it in Doan", "Verify". Device-lab, real-browser, and throttled-network steps are reported as unverified; native routing and the `polish` hand-off are dropped. |
| `adapt.native.md` | `adapt` | adapted | "Principles that carry across" only (restructure, do not stretch; translate idioms, do not transplant; size is not a device; orientation). The iOS/Android idiom table, size classes, and simulator procedures are not reflected. |
| `android.md` | — | not reflected | Native Android platform rules with `adb` verification; Doan canvases are HTML. Derived from ehmo/platform-design-skills: if a preset reflects it later, `platform-design-skills-LICENSE` already covers it. |
| `animate.md` | `animate` | adapted | "Find the job", "Set the motion thesis", "Choose material by meaning", "Timing and easing", "Implement to the runtime", "Accessibility and control", "Verify". Native references and the `polish` hand-off are dropped. |
| `audit.md` | `audit` | adapted | "Dimensions" 1-5, "Severity", "Report", with a Doan "Evidence levels" section (static, computed, runtime, unchecked). The bundled detector, CDP, re-run commands, 0-4 scores, and integrity verdict format are removed. |
| `audit.native.md` | — | not reflected | Native-only audit; its report skeleton duplicates `audit.md`. |
| `bolder.md` | `bolder` | adapted | "Scope is sovereign", "Find why it reads flat", "Amplify", "The skeleton test", "Verify". The direction-round paragraph points to `shape` and `generate` instead; the `polish` hand-off is dropped. |
| `clarify.md` | `clarify` | adapted | Doan adds a rule against unconfirmed outcome or guarantee claims (charges, saves, deliveries, refunds) and requires an empty state's next action to be one the product offers. |
| `colorize.md` | `colorize` | adapted | "Match the surface", "Audit before choosing", "Choose a strategy", "Apply at system scale", "Contrast and perception", "Verify", plus Doan's "Use tokens, propose new ones". The live-mode parameter section, design file loader, and `polish` hand-off are dropped. |
| `component-review.md` | — | not reflected | Review server and manifests for image-comp builds (`.impeccable/review/`); no design guidance beyond "the user approves what ships". |
| `craft-floor.md` | `polish`, `generate`, `critique`, `audit`, `animate` | adapted | "Quality floor" (`polish`, `critique`, and the motion-related subset in `animate`), "Hold the quality floor" (`generate`, where each variant draws the target's states or names on the canvas the ones it leaves out), and "Accessibility" and "Design system integrity" (`audit`). The refusals and the floor's aesthetic items (gray secondary text, depth, display size, tracking, motion, browser surfaces) are review defaults a brief, the user's intent, or an established design can override, not absolute bans; contrast, states, overflow, copy, and truth stay checkable defects, and a departure from a default is a defect only with a confirmed problem; the design-hook enforcement, rule tags, and harness-specific blocks are not ported. |
| `craft.md` | — | not reflected | Same as the `craft` command: an alias that adds nothing. |
| `critique.md` | `critique` | adapted | "Review lens" (specificity, holistic pass, cognitive load, emotional journey, usability heuristics, personas, severity) and "Report". The detector, browser overlay, CDP, subagents, critique storage, the mandatory question gate, and numeric scores are dropped; closing questions remain only when the next step needs the user's decision. |
| `delight.md` | `delight` | adapted | "Find the opportunity", "Define one delight thesis", "Build for the emotional moment", "Protect the experience", "Verify", plus Doan's "Keep serious moments serious". The design file loader and `polish` hand-off are dropped. |
| `distill.md` | `distill` | adapted | "Assess the complexity", "Plan the cuts", "Simplify by dimension", "Avoid", "Verify". The ban on cards inside cards is a default the established system can justify. Removed complexity is reported in the answer; code is simplified only when the request covers implementation. |
| `doctor.md` | — | not reflected | Repairs drift in upstream engine artifacts; no design guidance. |
| `document.md` | `document` | adapted | "Step 1" to "Step 5", "Keep the two in agreement", "Finish in Doan", "Verify". The rules document and the design-system canvases in `.doan/ds/` follow Doan's decisions (below), not upstream's fixed root `DESIGN.md`, YAML frontmatter, sidecar, live panel, or linter. Upstream's seed-mode prerequisite (product context first) becomes a rule in "Before you start": read the `context` preset before writing unless it was already read in the conversation or the project has a product context document. Doan adds to "Step 3" that policies for future screens (primary-action counts, shape mixing, depth, reserved colors, deliberateness) are judgment: a rule cites its token, component, file, or user decision, absence in code is not a prohibition, and unconfirmed calls stay open items in both artifacts; a rule is only as wide as its evidence (it names the tokens, components, or files it covers), instructions for new work stay open unless the user or a project document states them, and no interim rule presupposes an open item; upstream's "Do's and Don'ts" grounding becomes a citation rule, the named-rule example (a limit for any screen) becomes one that cites its scope, "Verify" gains a scope self-check over both artifacts, and the new-document structure gains `## Open Decisions`. |
| `extract.md` | `extract` | adapted | "Find the patterns", "Plan the extraction", "Shape what you propose", "Work in Doan", "Avoid", "Verify". A proposal is the default outcome; app code refactoring needs a separate request; the documentation step points to `document`. |
| `generate.md` | `generate` | adapted | "Read the request" (default count of three; direction words are examples of meaning mapped to Doan presets, and negated directions are constraints; when a direction question gets no answer, the assumed direction is stated). The live session protocol (dev server, selector, poll, accept) is not ported. |
| `harden.md` | `harden`, `onboard` | adapted | `harden`: "Find the weak points", "Draw the states", "Verify". `onboard`: the empty-state guidance under "Empty states". Code samples became rules; server-side validation, memory-leak, polyfill, and test-suite items are dropped. Doan adds, in `harden`, a rule against unconfirmed outcome or guarantee claims in error messages and requires an empty state's next action to be one the product offers. |
| `hooks.md` | — | not reflected | Detector hook management and harness hook manifests. |
| `init.md` | `context` | adapted | Product context capture; recording depends on the user's agreement and uses an existing document or a user-chosen location. |
| `ios.md` | — | not reflected | Native iOS platform rules with Simulator verification; Doan canvases are HTML. Derived from ehmo/platform-design-skills, as for `android.md`. |
| `layout.md` | `layout` | adapted | "Assess the structure", "Set the spatial thesis", "Apply", "Verify". The subagent assessment and detector scan are replaced by a source scan the agent runs; live-mode parameters are dropped. |
| `live-setup.md` | — | not reflected | Live server configuration, framework injection, and CSP patching. |
| `live.md` | `generate`, `polish` | adapted | `generate`: "Plan the alternatives" (identity lock, default and departure modes; distinct primary axes in free exploration, distinct sub-strategies inside a fixed direction, and different theme and hue only for approved departures; squint test) and complete replacements. `polish`: "Lock the identity" (change within the selection). The poll loop, wrap and insert, parameters, accept, and manual-edit flows are not ported. |
| `mode-operate.md` | `shape`, `generate` | adapted | `shape`: "Name the surface mode". `generate`: "Respect the surface mode". The comp prompts and concept seed are not ported. |
| `mode-persuade.md` | `shape`, `generate` | adapted | As for `mode-operate.md`. |
| `mode-read.md` | `shape`, `generate` | adapted | As for `mode-operate.md`. |
| `new-work.md` | `context`, `shape`, `generate` | adapted | `context` adapts section 1 ("Decide what is already true"). `shape`: "Decide what is already true" and "Name the surface mode" (sections 1-3). `generate`: the identity lock in "Plan the alternatives". The concept seed, decision page, direction contract, comp-led build, and finish review are not ported. |
| `onboard.md` | `onboard` | adapted | "Assess the need", "Principles", "Patterns", "Avoid", "Verify", plus Doan's "Do not invent product facts". Tour libraries, storage and analytics code, and the `polish` hand-off are dropped; user-testing metrics are reported as unverified. |
| `operate.md` | `layout`, `typeset`, `quieter`, `harden` | adapted | "Match the surface" (`layout`, `typeset`), "Product surfaces in depth" (`quieter`), and the state vocabulary, loading, empty, and overlay rules under "Draw the states" (`harden`). Its aesthetic absolutes (display faces in UI, page-load sequences, saturated inactive states) are defaults the established system can justify. Rule tags are dropped. |
| `optimize.md` | `animate`, `audit`, `harden` | adapted | "Keep it smooth" (`animate`), "4. Performance cautions" (`audit`), and "Performance cautions" (`harden`). Bundle, network, API, framework, Core Web Vitals, and monitoring guidance is out of scope. |
| `overdrive.md` | `animate`, `delight` | adapted | "Set the motion thesis" and "Propose directions for ambitious motion" (`animate`); "Define one delight thesis" and "Propose directions for ambitious ideas" (`delight`). The toolkit catalogue and browser verification loop are not ported. |
| `polish.md` | `polish` | adapted | "Classify the drift", "Triage", "Polish the path", "Verify". Critique storage, context and hook directives, and native verification are dropped. |
| `quieter.md` | `quieter` | adapted | "Match the surface", "Assess the intensity", "Plan the refinement", "Refine", "Avoid", "Verify". Color changes go through token CSS; the bans on gray text over color and on bounce or elastic easing are defaults the established system can justify; the `polish` hand-off is dropped. |
| `region-map.md` | — | not reflected | Region maps for approved comp images; part of the image pipeline. |
| `routing.md` | `context` | adapted | Only the workflow-question rule (advise without executing). The context menu, signals, and detector run are engine behavior; Doan's guide carries its own mapping rules. |
| `shape.md` | `shape` | adapted | "Ask what will change the result", "Write the brief", "Confirm and stop". The new-work hand-off is replaced by open decisions in the brief; implementation is a separate request. |
| `typeset.md` | `typeset` | adapted | "Assess the typography", "Set the system", "Apply", "Line breaks", "Verify". Sizes and families come from token CSS variables; the ban on display faces in UI labels, buttons, and data is a default the established system can justify; the subagent assessment, detector scan, live-mode parameters, and design file update are dropped. |
| `visualize.md` | — | not reflected | Image generation of comps and plates. |

## Role documents in `skill/agents/` (4)

No subagent is ported. Doan's presets are read by the current agent, which does the work itself.

| Upstream file | Doan preset(s) | Status | Notes |
|---|---|---|---|
| `impeccable-asset-producer.md` | — | not reflected | Regenerates image plates from a comp spec. |
| `impeccable-documenter.md` | `document` | adapted | "Document what shipped": shipped code is the evidence, and confirmed defects are not recorded as house style. The documenter's fixed list of floor violations (system display font, glyph icons, eyebrows, offset shadows) is not ported: aesthetic choices the code uses consistently or the user chose are recorded as rules, and unclear cases are asked. The subagent contract is not ported. |
| `impeccable-finish-reviewer.md` | `critique` | adapted | "Type, material, ground" and the ordered one-line material fixes in "Report". The disposition vocabulary, input contract, capture checks, and comp pipeline are not ported. |
| `impeccable-manual-edit-applier.md` | — | not reflected | Applies live-mode manual edit batches. |

## Decisions the `document` preset must carry

Recorded in the feature spec (§3.1, §3.2) and confirmed in A1-R on 2026-10-29:

- The preset writes two artifacts: a rules document for agents, and design-system canvases for people to check colors, typography, and components.
- Rules document location: update the project's existing design document if there is one; otherwise ask the user where it should go; if there is no answer, propose a root `DESIGN.md` (user decision 2026-10-29). Do not put it under `.doan/`.
- Canvases: in `.doan/ds/`, one canvas per logical unit by default (a token group, a shared component, or a shared surface such as an app shell), never two units in one canvas; the canvas id is the file name without `.html`. A project's existing organization, including a legacy `.doan/canvases/design-system.html`, is kept and moved only with the user's agreement (user decision 2026-10-31). There is no separate display name such as "Design System" (user decision 2026-10-28).
- Respect the project's existing structure. When updating, keep frames and IDs outside the request unchanged; colors and typography reference the project's token CSS variables instead of copying values (user decision 2026-10-29).
- Reuse an existing design system when it is sufficient; a plain CLI setup request is not approval to write one.
- Rules the project does not have are not written as settled facts: a rule is grounded in the code or settled with the user, otherwise it is an open item in both artifacts (spec §3.2).
- Read the `context` preset before writing either artifact, even when the request names the deliverable, unless it was already read in the conversation or the project has a product context document (user decision 2026-10-29).
