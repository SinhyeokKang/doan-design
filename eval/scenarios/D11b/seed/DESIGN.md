# Design System: Ledgerly

## Overview

Calm, plain and specific, like the product voice. Neutral surfaces carry most of each screen and a single blue accent marks the primary action. Every value comes from `styles/tokens.css`; components live in `components/`.

## Colors

| Token | Role |
|---|---|
| `--color-surface` | Card and dialog background; text on the primary accent |
| `--color-surface-muted` | Page background behind cards |
| `--color-text` | Body text and headings |
| `--color-text-muted` | Secondary text, input and secondary button borders |
| `--color-primary` | The one accent: primary buttons, focus rings, links |
| `--color-danger` | Errors and destructive actions only |
| `--color-success` | Paid and saved confirmations only |

**The One Accent Rule.** `--color-primary` marks the primary action of a screen and nothing decorative.

## Typography

- Family: `--font-body` (the system UI stack) for all text.
- Body: `--type-body-size`.
- Titles: `--type-title-size`, used once per card or screen.

## Layout

Spacing uses `--space-2`, `--space-4` and `--space-6`. Cards sit on the muted page background with `--space-6` padding and `--space-6` gaps.

## Shapes

Gently rounded corners (`--radius`) on cards, inputs and buttons.

## Elevation & Depth

Flat. Depth comes from the surface and muted surface pair, not shadows.

## Components

### Button (`components/button.css`)

- `.button--primary`: `--color-primary` background, `--color-surface` text.
- `.button--secondary`: `--color-surface` background, `--color-text` text, `--color-text-muted` border.
- Focus: 2px `--color-primary` outline offset by 2px. Disabled: half opacity.

### Input (`components/input.css`)

- `.input`: `--color-surface` background, `--color-text` text, 1px `--color-text-muted` border, `--radius` corners, `--space-2` padding.
- Focus: 2px `--color-primary` outline offset by 2px. Error: `.input--error` turns the border `--color-danger`, and `.input-error` shows the message in `--color-danger` below the field.

### Card (`components/card.css`)

- `.card`: `--color-surface` background, `--space-6` padding, `--radius` corners, no border or shadow; it sits on `--color-surface-muted`.
- `.card__title`: `--type-title-size`, once per card.

## Do's and Don'ts

- Do use one primary button per screen.
- Don't use `--color-danger` or `--color-success` for decoration.

## Open items

None.
