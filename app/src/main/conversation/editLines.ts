import type { EditLines } from "./types";

// The count runs synchronously in main while a turn streams (only main receives the texts), so both limits keep the
// worst case at O((N+M)·D) short enough not to stall it; past them the count is unknown.
export const EDIT_LINES_MAX = 20_000;
export const EDIT_DISTANCE_MAX = 1_000;

const HUNK = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

// A hunk is read by its header's counts, so a removed line whose text starts with "--" (or an added one with "++") is
// never taken for the next file's header. Lines outside hunks are headers; a binary diff has no hunk and stays unknown.
export function countUnifiedDiff(text: string): EditLines | null {
  const rows = text.split("\n");
  if (rows.at(-1) === "") rows.pop();
  let added = 0, removed = 0, hunks = 0, left = 0, right = 0;
  for (const raw of rows) {
    const row = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (row.startsWith("\\")) continue;
    if (left > 0 || right > 0) {
      const mark = row[0];
      if (mark === "-" && left > 0) { removed++; left--; }
      else if (mark === "+" && right > 0) { added++; right--; }
      else if (mark === " " && left > 0 && right > 0) { left--; right--; }
      else return null;
      continue;
    }
    const header = HUNK.exec(row);
    if (header) { hunks++; left = Number(header[1] ?? 1); right = Number(header[2] ?? 1); continue; }
    if (row.startsWith("@@") || row.startsWith(" ") || (row.startsWith("+") && !row.startsWith("+++ ")) || (row.startsWith("-") && !row.startsWith("--- "))) return null;
  }
  return hunks > 0 && left === 0 && right === 0 ? { added, removed } : null;
}

// Claude Code's structuredPatch: hunks whose lines carry a +, - or space prefix.
export function countStructuredPatch(hunks: unknown): EditLines | null {
  if (!Array.isArray(hunks)) return null;
  let added = 0, removed = 0;
  for (const hunk of hunks as unknown[]) {
    if (typeof hunk !== "object" || hunk === null || !("lines" in hunk) || !Array.isArray(hunk.lines)) return null;
    for (const row of hunk.lines as unknown[]) {
      if (typeof row !== "string") return null;
      const mark = row[0];
      if (mark === "+") added++;
      else if (mark === "-") removed++;
      else if (mark !== " " && mark !== "\\") return null;
    }
  }
  return { added, removed };
}

// Lines become integer ids, so a comparison costs the same however long the lines are (a long shared prefix would
// otherwise make every comparison as long as the line). CRLF and LF read as the same line end. A last line without a
// newline counts as a different line from the same text with one, as git counts it: its key alone ends in "\n", which
// no split line holds.
function lineIds(text: string, ids: Map<string, number>): Int32Array {
  const rows = text.replaceAll("\r\n", "\n").split("\n");
  const last = rows.pop()!;
  if (last !== "") rows.push(last + "\n");
  return Int32Array.from(rows, row => {
    let id = ids.get(row);
    if (id === undefined) { id = ids.size; ids.set(row, id); }
    return id;
  });
}

// The lines between two texts, from the edit distance D alone (forward Myers after trimming the common ends):
// added = M − LCS and removed = N − LCS, where LCS = (N + M − D) / 2.
export function countTextChange(oldText: string, newText: string): EditLines | null {
  const ids = new Map<string, number>();
  const a = lineIds(oldText, ids), b = lineIds(newText, ids);
  if (a.length + b.length > EDIT_LINES_MAX) return null;
  let start = 0, endA = a.length, endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const n = endA - start, m = endB - start;
  const distance = editDistance(a, b, start, n, m);
  if (distance === null) return null;
  const common = (n + m - distance) / 2;
  return { added: m - common, removed: n - common };
}

function editDistance(a: Int32Array, b: Int32Array, start: number, n: number, m: number): number | null {
  if (n === 0 || m === 0) return n + m <= EDIT_DISTANCE_MAX ? n + m : null;
  const max = Math.min(n + m, EDIT_DISTANCE_MAX);
  const offset = max + 1;
  // v[offset + k]: the furthest x reached on diagonal k.
  const v = new Int32Array(2 * max + 3);
  for (let d = 0; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[start + x] === b[start + y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) return d;
    }
  }
  return null;
}
