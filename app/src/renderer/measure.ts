import type { CanvasRect } from "./canvasMessage";

// `axis` is the direction the line runs; `from` < `to`. A solid line's distance is `to - from`, rounded only when
// shown; a dashed one is an extension and carries no label.
export interface MeasureLine {
  axis: "x" | "y";
  from: number;
  to: number;
  at: number;
  dashed: boolean;
}

type Axis = MeasureLine["axis"];
interface Span { start: number; end: number }
type Spans = Record<Axis, Span>;

const spans = (rect: CanvasRect): Spans => ({ x: { start: rect.x, end: rect.x + rect.width }, y: { start: rect.y, end: rect.y + rect.height } });
const other = (axis: Axis): Axis => (axis === "x" ? "y" : "x");
const middle = (span: Span) => (span.start + span.end) / 2;
const line = (axis: Axis, a: number, b: number, at: number, dashed = false): MeasureLine => ({ axis, from: Math.min(a, b), to: Math.max(a, b), at, dashed });
const apart = (a: Span, b: Span) => a.end < b.start || b.end < a.start;
const touching = (a: Span, b: Span) => a.end === b.start || b.end === a.start;

// Matches the lines Figma draws (the cases in measure.test.ts).
export function measureLines(selected: CanvasRect, target: CanvasRect): MeasureLine[] {
  const s = spans(selected);
  const t = spans(target);
  const apartX = apart(s.x, t.x);
  const apartY = apart(s.y, t.y);
  if (!apartX && !apartY) {
    // Figma draws no line here, whichever is selected.
    if (touching(s.x, t.x) || touching(s.y, t.y)) return [];
    return [...insets("x", s, t), ...insets("y", s, t)];
  }
  const lines: MeasureLine[] = [];
  if (apartX) lines.push(...gap("x", s, t));
  if (apartY) lines.push(...gap("y", s, t));
  if (apartX !== apartY) lines.push(...edges(apartX ? "y" : "x", s, t));
  return lines;
}

// On the centre lines of the overlap.
function insets(axis: Axis, s: Spans, t: Spans): MeasureLine[] {
  const across = other(axis);
  const at = (Math.max(s[across].start, t[across].start) + Math.min(s[across].end, t[across].end)) / 2;
  const sides: [number, number][] = [[s[axis].start, t[axis].start], [s[axis].end, t[axis].end]];
  return sides.filter(([a, b]) => a !== b).map(([a, b]) => line(axis, a, b, at));
}

// A dashed extension reaches the target's edge when the selection's centre line misses the target.
function gap(axis: Axis, s: Spans, t: Spans): MeasureLine[] {
  const across = other(axis);
  const before = s[axis].end < t[axis].start;
  const end = before ? t[axis].start : t[axis].end;
  const at = middle(s[across]);
  const lines = [line(axis, before ? s[axis].end : s[axis].start, end, at)];
  const reach = Math.min(Math.max(at, t[across].start), t[across].end);
  if (reach !== at) lines.push(line(across, at, reach, end, true));
  return lines;
}

// Shown only when not zero and one side's range lies strictly inside the other's, the rule that explains every Figma
// case; when the two touch, a selection edge on the shared coordinate counts as inside.
function edges(axis: Axis, s: Spans, t: Spans): MeasureLine[] {
  const apartAxis = other(axis);
  const at = middle(s[apartAxis]);
  const targetBefore = t[apartAxis].end < s[apartAxis].start;
  const near = targetBefore ? t[apartAxis].end : t[apartAxis].start;
  const far = targetBefore ? s[apartAxis].end : s[apartAxis].start;
  // An equal same-side edge is a zero difference and is skipped below, so taking both ends in is the same as taking the
  // touching one in.
  const touches = touching(s[axis], t[axis]);
  const within = (value: number, span: Span) => (touches ? span.start <= value && value <= span.end : span.start < value && value < span.end);
  const targetInside = s[axis].start < t[axis].start && t[axis].end < s[axis].end;
  const lines: MeasureLine[] = [];
  for (const side of ["start", "end"] as const) {
    const edge = s[axis][side];
    const targetEdge = t[axis][side];
    if (edge === targetEdge || !(within(edge, t[axis]) || targetInside)) continue;
    lines.push(line(axis, edge, targetEdge, at), line(apartAxis, near, far, targetEdge, true));
  }
  return lines;
}
