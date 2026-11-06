import { normalize, sliceUnits, spliceUnits, textSegments, unitLength, type FieldSegment } from "./anchorField";

export interface SkillRun { start: number; end: number; name: string }
const SPACE = /\p{White_Space}/u;
const HANGUL = /[\uac00-\ud7a3\u1100-\u11ff\u3130-\u318f]/u;
const TRAILING = /[.,;:!?)\]}"'’”…。、，．！？：；）」』]+$/u;

export function skillWords(text: string, names: ReadonlySet<string>): SkillRun[] {
  const runs: SkillRun[] = [];
  if (names.size === 0) return runs;
  for (const match of text.matchAll(/[^\p{White_Space}]+/gu)) {
    const word = match[0];
    if (!word.startsWith("/")) continue;
    const name = word.slice(1), candidates = new Set([name, name.replace(TRAILING, "")]);
    for (let i = 1; i < name.length; i++) {
      if (!HANGUL.test(name[i - 1]!) && HANGUL.test(name[i]!)) candidates.add(name.slice(0, i));
    }
    const found = [...candidates].filter(candidate => candidate.length > 0 && names.has(candidate)).sort((a, b) => b.length - a.length)[0];
    if (found !== undefined) runs.push({ start: match.index, end: match.index + found.length + 1, name: found });
  }
  return runs;
}

export function fieldSkillRuns(segments: readonly FieldSegment[], names: ReadonlySet<string>): SkillRun[] {
  const runs: SkillRun[] = [];
  let at = 0, afterChip = false;
  for (const segment of normalize(segments)) {
    if (segment.kind === "chip") { at++; afterChip = true; continue; }
    // The sentinel blocks a slash immediately after a chip without changing field offsets.
    const prefix = afterChip ? "x" : "";
    for (const run of skillWords(prefix + segment.text, names)) {
      runs.push({ ...run, start: at + run.start - prefix.length, end: at + run.end - prefix.length });
    }
    at += segment.text.length;
    afterChip = false;
  }
  return runs;
}

export function insertSkillText(segments: readonly FieldSegment[], caret: number | null, name: string): { segments: FieldSegment[]; caret: number } {
  const at = Math.max(0, Math.min(caret ?? unitLength(segments), unitLength(segments)));
  const previous = sliceUnits(segments, at - 1, at)[0];
  const space = previous && (previous.kind === "chip" || !SPACE.test(previous.text)) ? " " : "";
  return spliceUnits(segments, at, at, textSegments(`${space}/${name} `));
}

export function replaceSlashSkill(name: string): { segments: FieldSegment[]; caret: number } {
  const text = `/${name} `;
  return { segments: textSegments(text), caret: text.length };
}

export function skillAnnouncements(before: readonly string[], after: readonly string[]): string[] {
  const previous = new Set(before);
  return [...new Set(after)].filter(name => !previous.has(name)).map(name => `Project skill ${name}`);
}

export function skillTextParts(text: string, at: number, runs: readonly SkillRun[]): { text: string; skill?: true }[] {
  const parts: { text: string; skill?: true }[] = [];
  let cursor = 0;
  for (const run of runs) {
    if (run.start < at || run.end > at + text.length) continue;
    const start = run.start - at, end = run.end - at;
    if (start > cursor) parts.push({ text: text.slice(cursor, start) });
    parts.push({ text: text.slice(start, end), skill: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}

export function sameSkillRanges(expected: readonly { start: number; end: number }[], drawn: readonly { start: number; end: number }[]): boolean {
  return expected.length === drawn.length && expected.every((run, i) => run.start === drawn[i]!.start && run.end === drawn[i]!.end);
}
