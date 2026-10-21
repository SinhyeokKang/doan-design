import { fold, parseLines } from "./fold";
import type { FoldResult } from "./types";

export function foldText(text: string): FoldResult {
  const parsed = parseLines(text);
  const folded = fold(parsed.events);
  const warnings = [...parsed.warnings, ...folded.warnings].sort((a, b) =>
    a.line - b.line || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return { comments: folded.comments, warnings };
}
