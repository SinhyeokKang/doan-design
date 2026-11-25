import type { EditLines } from "./types";

// Counting runs synchronously in main; past these caps the count is unknown (ARCHITECTURE 'Edit line counts').
export const EDIT_LINES_MAX = 20_000;
export const EDIT_DISTANCE_MAX = 1_000;

const HUNK = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

// Hunks are bounded by their headers' counts, so a "--" or "++" content line is never read as a file header.
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

// Integer ids keep a comparison independent of line length. A last line without a newline gets its own key (it alone
// ends in "\n"), so gaining or losing that newline counts as a change, as git counts it.
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

// Forward Myers yields only the distance D: LCS = (N + M − D) / 2.
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
