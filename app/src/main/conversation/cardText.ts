// Agent text on an approval card: bidi controls can reorder what is read against what runs, and default-ignorable code
// points draw as nothing, so each reads as `<U+XXXX>`. Line feeds and tabs stay: commands span lines.
const INVISIBLE = /(?![\n\t])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/gu;
const escaped = (char: string) => `<U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}>`;
export function visibleText(text: string): string { return text.replace(INVISIBLE, escaped); }
// Invisible characters are escaped before the cut, so the escapes count toward the bound; a cut text ends in "…", so
// the person sees that more would run than the card shows.
export function clip(value: string, max: number): string { const shown = visibleText(value); return shown.length > max ? `${shown.slice(0, max - 1)}…` : shown; }
// An agent's value inside Doan's own sentence: its curly quotes are escaped, so it cannot close Doan's quotes and add
// words that read as Doan's.
export function quoted(value: string): string { return `“${value.replace(/[“”]/g, escaped)}”`; }
