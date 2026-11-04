// The oldest provider CLI versions checked live in the real app. Newer ones run until a new-session handshake shows
// a protocol shape doan cannot read; moving one, up or down, is a decision backed by a live check of that version.
// Its own module because Settings > About shows these in the renderer, which must not load sessions.ts: that loads the
// ajv validators, and the renderer's CSP forbids the eval they compile with.
export const MINIMUM_VERSIONS = { claude: "2.1.284", codex: "0.158.0", cursor: "2026.10.22", copilot: "1.0.89" } as const;
