# Design System

This reference records styles/tokens.css and components/button.css only. No product context document exists. Sample labels are placeholders.

## Colors

- `--color-surface`: secondary button background and primary button text.
- `--color-surface-muted`: not referenced by a shipped component.
- `--color-text`: secondary button text.
- `--color-text-muted`: secondary button border.
- `--color-primary`: primary button background and button focus outline.
- `--color-danger`: not referenced by a shipped component.
- `--color-success`: not referenced by a shipped component.

## Typography

`--type-body-size` sizes button text. `--font-body` is defined, but the component inherits its font. `--type-title-size` is defined and not used by the button; the canvas shows a specimen.

## Spacing and shape

The button uses `--space-2` vertical and `--space-4` horizontal padding, and `--radius` corners. `--space-6` is defined and not referenced by the component. No component shadow is defined.

## Button

Primary: `--color-primary` background and `--color-surface` text. Secondary: `--color-surface` background, `--color-text` text, and `--color-text-muted` border. Focus: 2px `--color-primary` outline offset by 2px. Disabled: 0.5 opacity and not-allowed cursor.

The canvas copies button CSS inline because components/button.css is outside the served scope; the implementation and serving configuration remain unchanged.

## Open decisions

Product context and usage policies. The code establishes values and component behavior, not product voice or rules about how many primary actions a screen may have.
