// Test-only: finds the product name in human-facing text; lowercase `doan` is fine only as command, path or identifier.
// cli/internal/cli/brand_test.go follows the same rules and fixture (schema/fixtures/brand/cases.json).

export type BrandKind = "prose" | "command" | "path" | "identifier";
export interface BrandCandidate { index: number; form: "doan" | "Doan"; kind: BrandKind }

// `doan` followed by one of these words is the command itself.
const SUBCOMMANDS = ["active", "check", "config", "design-skill", "export", "handoff", "help", "init", "ls", "onboarding", "open", "remove", "send", "skill", "version", "work"];
// Nouns that name the `doan` command rather than the product.
const COMMAND_NOUNS = ["CLI", "command", "server"];
const COMMAND_AFTER = new RegExp(`^ (?:--?[a-z]|<|(?:${[...SUBCOMMANDS, ...COMMAND_NOUNS].join("|")})(?![\\w-]))`);
const QUOTES = "'\"‘’“”";

function kindOf(text: string, start: number, form: string): BrandKind {
  const before = text.slice(0, start);
  const after = text.slice(start + form.length);
  if ((before.match(/`/g)?.length ?? 0) % 2 === 1) return "command";
  // Code tokens: a bare `doan` string, `window.doan`, `design.doan`, `data-doan`, `doan:`, `doan-app`, `doan.canvas`, `'doan'`.
  if (form === "doan" && text === form) return "identifier";
  if (/[/~]$/.test(before)) return "path";
  if (/\w\.$|[-@]$|named $/.test(before) || /^(?::|[-_]|\.(?!app\b)\w)/.test(after)) return "identifier";
  if (before !== "" && after !== "" && QUOTES.includes(before.at(-1)!) && QUOTES.includes(after[0]!) && after.slice(0, 2) !== "’s") return "identifier";
  if (before.endsWith(".") || /^(?:\/|\.app\b)/.test(after)) return "path";
  if (COMMAND_AFTER.test(after)) return "command";
  return "prose";
}

export function brandCandidates(text: string): BrandCandidate[] {
  return [...text.matchAll(/\b(?:doan|Doan)\b/g)].map(match => {
    const form = match[0] as "doan" | "Doan";
    return { index: match.index, form, kind: kindOf(text, match.index, form) };
  });
}
