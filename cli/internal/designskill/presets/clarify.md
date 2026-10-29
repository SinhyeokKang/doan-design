# Clarify copy

Rewrite unclear interface text so people understand what happened, what matters, and what to do next. Preserve factual meaning, product terminology, and brand voice.

Use this preset when the user asks to improve labels, button text, form guidance, error and empty-state messages, confirmations, or other interface copy. The user's request and its scope come first: this guidance never widens what you change.

## Before you start

- Find the target. For pointing words like "this screen" or "this button", use `doan active` and read the open comments attached to that target. Otherwise work on the canvas, frame, or code the user named.
- Read the surrounding product: existing copy, terminology, design or product documents the project already has, and the code the canvas implements (`data-doan-implements`). Infer the audience and their situation from that evidence; ask when it is missing and it would change the words.
- Ask before changing factual claims, legal meaning, prices, or a term that may be domain-specific.

## Audit the language

Read the entire interaction path, not isolated strings. Identify:

- ambiguous nouns, verbs, and actions;
- internal jargon or assumed knowledge;
- vague labels, outcomes, and system states;
- missing consequences, recovery, or timing;
- inconsistent terminology and capitalization;
- redundant headings, intros, helper text, and confirmations;
- text that breaks at realistic widths or in translation;
- tone that ignores stress, risk, success, or urgency.

## Set the message hierarchy

For each state, decide:

1. the one fact the user needs now;
2. the action available next;
3. supporting context that changes the decision;
4. the appropriate tone for this moment.

Say each idea once. If the heading already explains the state, the introduction should add new information or disappear.

## Rewrite by function

### Actions and navigation

Use a specific verb and object when the outcome is not already obvious. Labels describe what will happen, not the gesture used to trigger it. Keep the same noun and verb for the same concept throughout the product.

For destructive actions, name the object and the consequence. Prefer undo over confirmation when recovery is safe. When confirmation is necessary, name the action in both the message and the button instead of `Yes`, `No`, `OK`, or `Submit`.

### Forms

Use persistent labels; placeholders are examples, not labels. Put format and eligibility requirements before submission. Explain why information is requested only when it is not obvious. Treat required and optional fields consistently.

Validation says what needs attention and how to correct it without blaming the user. Keep related instructions near the field and announce errors accessibly.

### Errors and permissions

An actionable error answers:

1. what failed;
2. why, when known and useful;
3. how to recover, or what alternative remains.

Do not expose internal codes as the primary message. Do not promise a cause or resolution the system cannot know. Treat privacy, payment, deletion, access loss, and blocked work seriously; warmth is welcome, jokes are not.

### Loading, empty, and success states

Loading text names the real operation and sets an honest expectation when the wait is meaningful. Show determinate progress when it is available; never invent progress.

An empty state distinguishes first use, no results, active filters, missing permission, and failure. Explain the state and offer the next useful action.

Success confirms the completed outcome and mentions the next consequence only when it changes what the user should do. Routine success is brief.

### Help and instructional text

Helper text answers an implicit question instead of restating the control. Use progressive disclosure for uncommon detail. Link text makes sense out of context; icon-only controls need accessible names.

## Voice, accessibility, and localization

Voice stays consistent; tone adapts to the moment. Use plain language without flattening terminology the audience genuinely knows.

- Write complete translatable messages rather than concatenated fragments.
- Keep variables and numbers structured so translators can reorder them.
- Allow for expansion instead of abbreviating prematurely.
- Make alt text convey the image's information; use empty alt for decoration.
- Keep screen-reader names aligned with visible labels and outcomes.
- Do not rely on punctuation, color, or iconography alone to carry the message.

When inconsistency spans the product, propose a short terminology glossary instead of silently renaming concepts. Do not vary words for literary effect in an interface.

## Apply the change in Doan

- Change only the copy in the requested scope. Keep canvas, frame, and element ids unchanged, and leave frames and elements outside the request as they are.
- When new copy on a canvas is not yet in code, say so on the canvas, as the Doan guide requires for anything drawn that is not in code.
- If the user asked for a review only, report the findings and proposed wording without editing files.
- After editing a canvas, make `doan check` pass. Resolve only the comments you actually applied.
- In your answer, list what changed and what you left unchanged on purpose, such as factual or legal wording that needs the user's decision.

## Verify

Read the flow in context and check:

- comprehension without hidden product knowledge;
- actionability at errors, empty states, and decision points;
- factual accuracy and consistent terminology;
- scanability at target widths and 200% zoom;
- long names, localization expansion, pluralization, and dynamic values;
- accessible names and announced state changes;
- tone appropriate to consequence and emotional context.

Report any check you could not perform, such as a width or language you could not render, as unverified. The final copy is as short as it can be without removing meaning or recovery.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, file `skill/reference/clarify.md`, under the Apache License 2.0. Doan modified it: removed the upstream launcher setup, command hand-off, and template placeholders, and added target selection, review-only, canvas, and verification rules for Doan.

[doan:design-skill] end of preset clarify
