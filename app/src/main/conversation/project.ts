import { posix } from "node:path";
import { sameCanvas } from "./sessions";
import type { Canvas } from "./types";
// A canvas the agent wrote shows up in the folder list after the watcher's debounce and an ls; a project turn that just
// ended may still be judged for promotion this long, and keeps its root busy until then.
export const BIND_GRACE_MS = 10_000;
// project: the root of a turn accepted (or being prepared) for a conversation without a canvas. It stays set for that
// turn even when the conversation is bound to a canvas mid-turn.
// failedPersistence: its history stopped taking writes, so its turn never ends; it must not hold the root until a restart.
// holding: its queued messages are about to go out as its next turn, which keeps the root past the window.
export interface ProjectTurn { project?: string; busy: boolean; terminal: boolean; endedAt?: number; failedPersistence?: boolean; holding?: boolean }
// The conversation that keeps another project conversation of this root from starting or sending, if any: one still
// preparing, running or waiting for an answer, or one whose turn ended within the binding window, so that a new
// canvas is never judged against the wrong conversation.
export function projectBusy(live: ReadonlyMap<string, ProjectTurn>, root: string, exceptId: string | undefined, now: number): string | null {
  for (const [id, turn] of live) {
    if (id === exceptId || turn.project !== root || turn.failedPersistence) continue;
    if ((turn.busy && !turn.terminal) || turn.holding || (turn.endedAt !== undefined && now - turn.endedAt <= BIND_GRACE_MS)) return id;
  }
  return null;
}
// edits: the paths of this turn's own edit activities, as the provider reported them. changed: root-relative canvas
// files the folder watcher saw change during the turn.
export interface PromotionTurn { root: string; edits: readonly string[]; changed: readonly string[] }
// The canvas a finished project turn makes its conversation current on, or null to stay a project conversation.
// A canvas that is new since the turn's snapshot wins; without one, an existing canvas qualifies only when the
// conversation's own edit and an observed file change both point at it, since a person's terminal agent or another
// conversation may change the same file and an edit activity is reported even for a refused edit.
// busy: whether the canvas's current conversation is working. turn null: no turn of this run to judge.
export function promotionTarget(turn: PromotionTurn | null, listed: readonly Canvas[], snapshot: readonly Canvas[], busy: (canvas: Canvas) => boolean): Canvas | null {
  if (!turn) return null;
  const rows = listed.filter(row => row.id === undefined || listed.filter(other => other.id === row.id).length === 1);
  const created = rows.filter(row => !snapshot.some(old => sameCanvas(old, row)));
  let target: Canvas | undefined;
  if (created.length) target = created.length === 1 ? created[0] : undefined;
  else {
    const edited = canvasesAt(turn.root, turn.edits, rows, snapshot), changed = canvasesAt(turn.root, turn.changed, rows, snapshot);
    const both = edited.filter(row => changed.some(other => sameCanvas(row, other)));
    target = both.length === 1 ? both[0] : undefined;
  }
  return target && !busy(target) ? target : null;
}
// The listed rows these paths name, once each. A path at a canvas's turn-start location follows its stable ID to
// where it is listed now. A path that held one canvas at the turn's start and another now names neither: the edit
// may have come before or after the move, and no promotion is the safe failure. Paths outside the root (another
// worktree included) name nothing.
function canvasesAt(root: string, paths: readonly string[], rows: readonly Canvas[], snapshot: readonly Canvas[]): Canvas[] {
  const found: Canvas[] = [];
  for (const path of paths) {
    const relative = inside(root, path); if (relative === null) continue;
    const before = snapshot.find(old => old.path === relative), now = rows.find(r => r.path === relative);
    let row: Canvas | undefined;
    if (before && now) row = sameCanvas(before, now) ? now : undefined;
    else if (before) row = before.id !== undefined ? rows.find(r => r.id === before.id) : undefined;
    else row = now;
    if (row && !found.some(other => sameCanvas(other, row))) found.push(row);
  }
  return found;
}
// root is canonical, and on macOS /tmp and /var are links into /private, so an agent may report either spelling.
function inside(root: string, path: string): string | null {
  const candidates = [path];
  if (root.startsWith("/private/") && path.startsWith("/") && !path.startsWith("/private/")) candidates.push(`/private${path}`);
  for (const candidate of candidates) {
    const relative = posix.relative(root, posix.resolve(root, candidate));
    if (relative && !relative.startsWith("../") && relative !== ".." && !posix.isAbsolute(relative)) return relative;
  }
  return null;
}
