# Design first use

Design how people start: first-run flows, empty states, and the next action that gets them to their first real result. Onboarding's job is not to teach the whole product; it is to get people to the moment that proves the product is worth their time.

Use this preset when the user asks for a welcome or setup flow, first-use or empty states, contextual hints, or a clearer next step for new users. The user's request and its scope come first: this guidance never widens what you change.

## Before you start

- Find the target. For pointing words like "this screen" or "this empty state", use `doan active` and read the open comments attached to that target. Otherwise work on the canvas, frame, or code the user named.
- Read the design system: token CSS (`doan config --json` shows `tokenCss`), existing components, a design rules document if the project has one, and the design-system canvases in `.doan/ds/` (or a legacy `.doan/canvases/design-system.html`) if present. Onboarding uses the product's own components, not a separate visual language.
- Read the code the frame implements (`data-doan-implements`) and the surrounding flow: what a new user sees before and after the target, and which actions really exist.
- Onboarding depends on two facts: the first real result users should reach, and their experience level. When the repository and the request do not show them, ask. When broader product context is missing and it would change the result, suggest the `context` preset (`doan design-skill context --json`).

## Do not invent product facts

Onboarding copy tempts invention. Never write claims the product does not support:

- no invented features, integrations, templates, or sample content that does not exist;
- no testimonials, customer names, logos, user counts, ratings, or benchmarks;
- no time estimates ("2 minutes"), prices, or guarantees unless the user or the repository confirms them.

When a screen needs such content and none is confirmed, use an obvious placeholder and list it as an open question.

## Assess the need

1. **The challenge**: what are new users trying to do, where do they get stuck or drop off, and which first result proves the value?
2. **The users**: beginners, experts, or mixed; exploring by choice or required by work; how much time they have; which alternatives they already know.
3. **Success**: the minimum they must learn, the one key action (first project, first invite), and how the team would know onboarding worked.

Get users to value as quickly as possible; do not teach everything possible.

## Principles

- **Show, do not tell.** Use the real product with working examples, not a separate tutorial mode. Teach one thing at a time.
- **Make it optional.** Let experienced users skip; never block access to the product. Keep "Skip" visible.
- **Time to value.** Front-load the concept that delivers most of the value and leave advanced features for contextual discovery.
- **Context over ceremony.** Teach a feature when people meet it. Empty states and hints at the point of use do more than an upfront tour.
- **Respect intelligence.** Be concise and do not explain standard patterns.

## Patterns

### First run

- **Welcome**: what the product is for, what the user will accomplish next, and a way to skip. Give a time estimate only if it is known and honest.
- **Setup**: ask for the minimum and collect the rest later. Explain why a field is needed when it is not obvious. Use sensible defaults.
- **Core concepts**: at most one to three, in plain language, ideally by doing rather than reading, with progress shown ("Step 1 of 3").
- **First success**: guide the user to something real, offer a template or example only when the product has one, confirm completion without overdoing it, and show the next step.

### Empty states

Every empty state answers:

1. what will appear here;
2. why it matters, in one short line;
3. how to start, with a clear primary action and a secondary option when one exists;
4. where to get help, when help exists.

Add an icon or illustration from the design system when it helps, but text that explains the state comes first.

Distinguish the kinds of empty, because each needs a different message and action:

- **First use**: never used; emphasize value and the first action.
- **User cleared**: deleted everything on purpose; keep it light and make recreating easy.
- **No results**: search or filters returned nothing; suggest another query or clearing filters, and show which filters are active.
- **No permission**: explain why and how to get access.
- **Failed to load**: say what happened and offer retry. This is an error, not an empty state; do not present it as "nothing here". Error and loading states in general belong to the `harden` preset.

Example shape, with placeholder wording to replace with the product's real terms:

```text
No projects yet
Projects keep related work together.
[Create project]   [Start from template]   (only if templates exist)
```

### Contextual guidance

- **Hints** appear the first time a user meets a feature, point at the element, say what it does and why it helps, and can be dismissed for good.
- **Feature announcements** say what changed and why it matters, let users try it immediately, and can be dismissed.
- **Progressive disclosure**: reveal complexity as users need it; a quiet marker on a new or unused feature is enough.

### Tours and practice

Use a guided tour only for complex interfaces, significant changes, or domain-specific tools. Keep it to 3-7 steps, let users click the real interface, focus on a workflow ("Create a project") rather than naming buttons, and make it skippable and replayable from help.

Use a practice sandbox only when stakes are high or concepts are unfamiliar: clear objective, step guidance, confirmation the user did it right. Sample data must be labeled as sample.

### Help in context

Put help next to complex features: a help icon, "Learn more" links in hints, and shortcut hints on the controls they trigger. Link only to help that exists.

### Show once

Design for the returning user: onboarding appears once, completion is remembered, dismissals are respected, and initial onboarding never reappears for someone who finished or skipped it. State these rules on the canvas when they are not in code yet.

## Avoid

- long mandatory onboarding before the product is usable;
- explaining the obvious;
- the same hint shown again after dismissal;
- blocking the whole interface during a tour;
- a tutorial mode disconnected from the real product;
- everything up front instead of progressive disclosure;
- a hidden or hard-to-find "Skip".

## Apply the change in Doan

- Change only the requested target. Keep canvas, frame, and element ids unchanged, and leave frames and elements outside the request as they are.
- When the user asks for flows or states on the canvas, draw each step or empty state as its own frame next to the screen it belongs to, with a stable id (for example `projects-empty-first-use` and `projects-empty-no-results` for `projects`) and a `data-doan-title` that names it. Reuse the product's components and reference token CSS variables instead of raw hex or rgb values.
- When a step, message, hint, or component you draw is not in code yet, say so on the canvas, as the Doan guide requires.
- If the user asked for a review only, report the gaps and proposals without editing files.
- After editing a canvas, make `doan check` pass. Resolve only the comments you actually applied.
- In your answer, list what you added or changed, the placeholders and unconfirmed facts that need the user's input, and what you left unchanged on purpose.

## Verify

Walk the flow as a new user and as a returning user, and check:

- the first real result is reachable in few steps, and skipping is always possible;
- every empty state says what goes there, why, and the next action, and the kinds of empty are distinct;
- no claim, sample, or time estimate goes beyond what is confirmed;
- dismissed hints and finished onboarding stay dismissed in the drawn behavior;
- the flow holds at target widths, with long labels and translations.

Completion rate, skip rate, time to value, and comprehension need real users and analytics; report them as unverified, never as passed.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, files `skill/reference/onboard.md` and `skill/reference/harden.md` (empty states), under the Apache License 2.0. Doan modified them: replaced the additional-context note with a "Before you start" section, removed tooltip and tour library recommendations, the storage and analytics code, and the closing hand-off to the upstream `polish` command and its template placeholder, turned user-testing metrics into unverified checks, and added the rule against invented product facts, target selection, state frames, review-only, and canvas rules for Doan.

[doan:design-skill] end of preset onboard
