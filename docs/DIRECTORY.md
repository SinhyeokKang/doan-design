# Directory layout

- `go.mod` and `go.sum`: root Go module and pinned dependencies.
- `cli/internal/formats/`: Go validation and comment-event folding, with tests.
- `app/`: npm project and TypeScript test/type-check configuration.
- `app/src/formats/`: TypeScript validation and comment-event folding, with tests.
- `schema/`: shared JSON Schema 2020-12 definitions; `embed.go` embeds them for Go.
- `schema/fixtures/`: shared valid/invalid JSON and JSONL folding fixtures used by both languages.
- `docs/`: product, architecture, and working documents.
- `.scratch/`: ignored experiments and local handoff evidence.

Schemas define the wire formats. Both implementations read the same fixtures;
there is no schema copy or type-generation step.
