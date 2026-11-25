// The oldest provider CLI versions checked live in the real app; moving one is a decision backed by a live check.
// Own module: Settings > About reads it in the renderer, which must not load sessions.ts (ajv's eval breaks the CSP).
export const MINIMUM_VERSIONS = { claude: "2.1.284", codex: "0.158.0", cursor: "2026.10.22", copilot: "1.0.89" } as const;
