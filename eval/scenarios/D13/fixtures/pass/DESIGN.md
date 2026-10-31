# Design System: Ledgerly

## Overview

Every value comes from `styles/tokens.css`; the shipped components are in `components/` (button, input, card). This document records what that code does today.

## Colors

| Token | Where the code uses it |
|---|---|
| `--color-surface` | Card and input background; secondary button background; text on primary buttons |
| `--color-surface-muted` | Not used by a component; the reference canvas uses it as the page background |
| `--color-text` | Input text and secondary button text |
| `--color-text-muted` | Input border and secondary button border |
| `--color-primary` | Primary button background; focus outline on buttons and inputs |
| `--color-danger` | Input error border and error message |
| `--color-success` | Not used by a component yet |

## Typography

- Family: `--font-body` is defined in the token CSS; components set `font: inherit` and do not reference it directly.
- Body: `--type-body-size` on buttons and inputs.
- Title: `--type-title-size` on the card title (`.card__title`).

## Layout

- `--space-2`: input padding, vertical button padding, and the gap above an input error message.
- `--space-4`: horizontal button padding and the space below a card title.
- `--space-6`: card padding.

## Shapes

`--radius` on cards, inputs and buttons.

## Elevation & Depth

No component uses a shadow.

## Components

### Button (`components/button.css`)

- `.button`: `--space-2` by `--space-4` padding, `--radius` corners, `--type-body-size` text, inherited font.
- `.button--primary`: `--color-primary` background, `--color-surface` text.
- `.button--secondary`: `--color-surface` background, `--color-text` text, `--color-text-muted` border.
- Focus: 2px `--color-primary` outline offset by 2px. Disabled: half opacity and a not-allowed cursor.

### Input (`components/input.css`)

- `.input`: `--color-surface` background, `--color-text` text, 1px `--color-text-muted` border, `--radius` corners, `--space-2` padding, `--type-body-size` text.
- Focus: 2px `--color-primary` outline offset by 2px. Error: `.input--error` turns the border `--color-danger`, and `.input-error` shows the message in `--color-danger` with `--space-2` above it.

### Card (`components/card.css`)

- `.card`: `--color-surface` background, `--space-6` padding, `--radius` corners, no border or shadow.
- `.card__title`: `--type-title-size`, `--space-4` below.

## Open Decisions

None.

Primary button hover: `--color-primary-hover` background via `.button--primary:hover:not(:disabled)`; disabled buttons retain their original background.
