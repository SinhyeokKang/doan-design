import type { CanvasRect } from "./canvasMessage";

// One line of an Option-hover measurement, in board (canvas) px. `axis` is the direction the line runs: an "x" line
// spans x from `from` to `to` at y = `at`, a "y" line spans y at x = `at`. `from` < `to`. A solid line's distance is
// `to - from`, taken from the raw rect values and rounded only when shown; a dashed one is an extension and carries no
// label.
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
// One edge exactly on the other's opposite edge: a gap of 0.
const touching = (a: Span, b: Span) => a.end === b.start || b.end === a.start;

// The lines Figma draws for a selection and the hovered target (the observed cases in measure.test.ts).
export function measureLines(selected: CanvasRect, target: CanvasRect): MeasureLine[] {
  const s = spans(selected);
  const t = spans(target);
  // Figma draws no line at all between touching targets, on either axis and whichever is selected.
  if (touching(s.x, t.x) || touching(s.y, t.y)) return [];
  const apartX = apart(s.x, t.x);
  const apartY = apart(s.y, t.y);
  if (!apartX && !apartY) return [...insets("x", s, t), ...insets("y", s, t)];
  const lines: MeasureLine[] = [];
  if (apartX) lines.push(...gap("x", s, t));
  if (apartY) lines.push(...gap("y", s, t));
  if (apartX !== apartY) lines.push(...edges(apartX ? "y" : "x", s, t));
  return lines;
}

// Overlapping or containing: the same-side edge differences, on the centre lines of the overlap.
function insets(axis: Axis, s: Spans, t: Spans): MeasureLine[] {
  const across = other(axis);
  const at = (Math.max(s[across].start, t[across].start) + Math.min(s[across].end, t[across].end)) / 2;
  const sides: [number, number][] = [[s[axis].start, t[axis].start], [s[axis].end, t[axis].end]];
  return sides.filter(([a, b]) => a !== b).map(([a, b]) => line(axis, a, b, at));
}

// Apart along `axis`: from the selection's near edge to the target's, on the selection's centre line, with a dashed
// extension to the target's edge when that centre line misses the target.
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

// Apart on one axis and overlapping along `axis`: each side's edge difference, shown only when it is not zero and
// either the selection's edge lies strictly inside the target's range or the target's range lies strictly inside the
// selection's (the rule that explains every observed case). The line sits on the selection's centre line; a dashed
// line runs along the target's edge from the target's near edge to the selection's far edge.
function edges(axis: Axis, s: Spans, t: Spans): MeasureLine[] {
  const apartAxis = other(axis);
  const at = middle(s[apartAxis]);
  const targetBefore = t[apartAxis].end < s[apartAxis].start;
  const near = targetBefore ? t[apartAxis].end : t[apartAxis].start;
  const far = targetBefore ? s[apartAxis].end : s[apartAxis].start;
  const within = (value: number, span: Span) => span.start < value && value < span.end;
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
