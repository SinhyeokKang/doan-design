import { normalize, sliceUnits, spliceUnits, textSegments, unitLength, type FieldSegment } from "./anchorField";
import { fieldListItems, type ListKind } from "./composerLists";

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

// The field's highlighted words: skills wherever they are, and a provider command only as the field's first word, the
// one place a provider runs it. A skill of the same name is the skill.
export function fieldHighlightRuns(segments: readonly FieldSegment[], skills: ReadonlySet<string>, commands: ReadonlySet<string>): SkillRun[] {
  const runs = fieldSkillRuns(segments, skills);
  const first = normalize(segments)[0];
  if (commands.size === 0 || first?.kind !== "text") return runs;
  const lead = skillWords(first.text, commands)[0];
  const word = /[^\p{White_Space}]/u.exec(first.text);
  if (!lead || lead.start !== word?.index || runs.some(run => run.start === lead.start)) return runs;
  return [lead, ...runs];
}

// What the field draws apart from plain text: the highlighted words, and for each list item its marker and the depth
// spaces before it (a depth-0 item's leading spaces are a depth run of depth 0). The text under every run stays text.
export type FieldRun =
  | ({ kind: "skill" } & SkillRun)
  | { kind: "mark"; start: number; end: number; list: ListKind; depth: number }
  | { kind: "depth"; start: number; end: number; depth: number };
export function fieldRuns(segments: readonly FieldSegment[], skills: ReadonlySet<string>, commands: ReadonlySet<string>): FieldRun[] {
  const runs: FieldRun[] = fieldHighlightRuns(segments, skills, commands).map(run => ({ kind: "skill", ...run }));
  for (const item of fieldListItems(segments)) {
    if (item.lead > 0) runs.push({ kind: "depth", start: item.start, end: item.start + item.lead, depth: item.depth });
    runs.push({ kind: "mark", start: item.start + item.lead, end: item.start + item.body, list: item.list, depth: item.depth });
  }
  return runs.sort((a, b) => a.start - b.start);
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

export function sameSkillNames(before: ReadonlySet<string>, after: ReadonlySet<string>): boolean {
  return before.size === after.size && [...before].every(name => after.has(name));
}
