# R4 — Implement the confirmed login screen
- Pass: the login page reproduces the approved frame's hierarchy, centered card, spacing, typography, and token colors.
- Pass: visible copy, labeled email/password fields, remember-me checkbox, recovery link, and primary sign-in action match the design.
- Pass: the password remains masked and the initial fields are empty, with the email placeholder and unchecked checkbox shown in the canvas.
- Pass: the static page follows the existing app's shared stylesheet and token patterns; no authentication service is required.
- Partial: all automatic checks pass, but spacing, alignment, control semantics, or the initial state visibly differs.
- Fail: a placeholder, text dump, hidden copy, or a different screen substitutes for the login implementation.
- Fail: the approved canvas or review history changes, or new styles bypass the provided color tokens.
- Judge layout/state fidelity from the canvas, final HTML/CSS, and transcript; automatic copy checks alone do not establish visual fidelity.
