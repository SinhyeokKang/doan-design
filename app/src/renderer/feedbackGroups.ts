import { sortResolved } from "../comments/resolution";
import { targetLabel } from "../comments/targetLabel";
import type { Comment } from "../formats/types";
import type { CanvasRow, OrphanFile } from "../main/view";
import { canvasLabel, frameLabel } from "./canvasTree";
import { focusAfterRemoval, overviewSections } from "./overviewOrder";

// One comment file as `comments:project` read it: a canvas row's id or an
// orphan's. `toReview` is the canvas's resolutions to review (none for orphans).
export type FeedbackFile = { id: string; comments: readonly Comment[]; toReview?: number } | { id: string; error: string };

export interface FeedbackRow { comment: string; status: Comment["status"]; label: string; title: string; line: string }

// `whole`: targets without a frame. `missing`: a stored frame `doan ls` does
// not list, "<id> (not in canvas)". A stored frame past a truncated list may
// still be in the canvas, so it is a `frame` group named by its id.
export interface FrameGroup { key: string; kind: "whole" | "frame" | "missing"; label: string; rows: FeedbackRow[] }

// `fileName` is set when another canvas has the same name. `pending`: no
// reply entry for the id yet, so `count` is the ls count of the chosen status.
// `countOnly`: ls lists no id (invalid or duplicate doan:canvas, which ls
// cannot tell apart) but counts the comments, so only those counts show.
export type CanvasGroup = { key: string; row: CanvasRow; name: string; fileName?: string } & (
  | { kind: "comments"; count: number; toReview: number; frames: FrameGroup[] }
  | { kind: "pending"; count: number }
  | { kind: "countOnly"; count: number; open: number; resolved: number; note: string }
  | { kind: "error"; error: string }
);

export const NEEDS_CANVAS_ID = "This canvas needs a unique, valid ID — run doan check";

// `countOnly`: a file whose name is not a canvas id; main cannot read it, so
// only the ls counts show.
export type OrphanGroup = { key: string; id: string; file: string } & (
  | { kind: "cards"; count: number; comments: Comment[] }
  | { kind: "pending"; count: number }
  | { kind: "countOnly"; count: number; open: number; resolved: number }
  | { kind: "error"; error: string }
);

// `readOnly`: some canvas could not be read, so these files may be its own.
export interface OrphanSection { readOnly: boolean; count: number; files: OrphanGroup[] }

export interface FeedbackView { counts: { open: number; resolved: number }; orphans: OrphanSection | null; canvases: CanvasGroup[] }

const CANVAS_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// project-feedback spec 'Feedback 패널', design §3 and the confirmed draft.
// A group shows only when it holds a comment of `status`, except error groups,
// and a canvas head with resolutions to review in Open. Segment counts cover
// every group that was read, and ls counts for groups that were not
// (count-only, pending), whichever status is chosen.
export function feedbackGroups(files: readonly FeedbackFile[], rows: readonly CanvasRow[], orphans: readonly OrphanFile[], status: Comment["status"]): FeedbackView {
  const byId = new Map(files.map((entry) => [entry.id, entry]));
  const counts = { open: 0, resolved: 0 };
  const tally = (comments: readonly Comment[]) => {
    for (const comment of comments) counts[comment.status] += 1;
  };
  // A group nobody read: ls counts go to the segments, and the chosen
  // status's count decides whether it shows.
  const lsCount = (open: number, resolved: number) => {
    counts.open += open;
    counts.resolved += resolved;
    return status === "open" ? open : resolved;
  };

  const orphanGroups: OrphanGroup[] = [];
  for (const orphan of orphans) {
    const base = { key: `orphan:${orphan.file}`, id: orphan.id, file: orphan.file };
    const read = byId.get(orphan.id);
    if (orphan.error) orphanGroups.push({ ...base, kind: "error", error: orphan.error.message });
    else if (!CANVAS_ID.test(orphan.id)) {
      const { open, resolved } = orphan.comments ?? { open: 0, resolved: 0 };
      const count = lsCount(open, resolved);
      if (count > 0) orphanGroups.push({ ...base, kind: "countOnly", count, open, resolved });
    } else if (read === undefined) {
      const count = lsCount(orphan.comments?.open ?? 0, orphan.comments?.resolved ?? 0);
      if (count > 0) orphanGroups.push({ ...base, kind: "pending", count });
    } else if ("error" in read) orphanGroups.push({ ...base, kind: "error", error: read.error });
    else {
      const all = read.comments;
      tally(all);
      const comments = ordered(all.filter((comment) => comment.status === status), status);
      if (comments.length > 0) orphanGroups.push({ ...base, kind: "cards", count: comments.length, comments });
    }
  }

  const names = new Map<string, number>();
  for (const row of rows) names.set(canvasLabel(row), (names.get(canvasLabel(row)) ?? 0) + 1);
  const canvases: CanvasGroup[] = [];
  for (const node of overviewSections(rows).flatMap((section) => section.canvases)) {
    const { row } = node;
    if (row.error) continue;
    const base = { key: `canvas:${row.path}`, row, name: node.name, ...((names.get(node.name) ?? 0) > 1 ? { fileName: node.fileName } : {}) };
    const read = row.id ? byId.get(row.id) : undefined;
    if (row.commentsError) canvases.push({ ...base, kind: "error", error: row.commentsError.message });
    else if (!row.id) {
      const count = lsCount(row.open, row.resolved);
      if (count > 0) canvases.push({ ...base, kind: "countOnly", count, open: row.open, resolved: row.resolved, note: NEEDS_CANVAS_ID });
    } else if (read === undefined) {
      const count = lsCount(row.open, row.resolved);
      if (count > 0) canvases.push({ ...base, kind: "pending", count });
    } else if ("error" in read) canvases.push({ ...base, kind: "error", error: read.error });
    else {
      const all = read.comments;
      tally(all);
      const shown = all.filter((comment) => comment.status === status);
      const toReview = read.toReview ?? 0;
      if (shown.length > 0 || (status === "open" && toReview > 0)) canvases.push({ ...base, kind: "comments", count: shown.length, toReview, frames: frameGroups(row, ordered(shown, status)) });
    }
  }

  const shownOrphans = orphanGroups.reduce((sum, group) => sum + (group.kind === "error" ? 0 : group.count), 0);
  return {
    counts,
    orphans: orphanGroups.length === 0 ? null : { readOnly: orphans.some((orphan) => orphan.uncertain), count: shownOrphans, files: orphanGroups },
    canvases,
  };
}

// Open keeps the file order, as the Comments panel does; Resolved runs by
// resolution time, newest first (revision-recheck).
function ordered(comments: readonly Comment[], status: Comment["status"]): Comment[] {
  return status === "resolved" ? sortResolved(comments) : [...comments];
}

// Frames are matched by id to the first listed frame with it; groups follow
// the listed (document) order, and stored frames ls does not list follow in
// the order their first comment appears.
function frameGroups(row: CanvasRow, comments: readonly Comment[]): FrameGroup[] {
  const frames = row.frames ?? [];
  const whole: FeedbackRow[] = [];
  const listed = new Map<number, FeedbackRow[]>();
  const saved = new Map<string, FeedbackRow[]>();
  for (const comment of comments) {
    const frame = comment.target.frame;
    if (frame === undefined) {
      whole.push(feedbackRow(comment, frames, false));
      continue;
    }
    const index = frames.findIndex((candidate) => candidate.id === frame);
    const entry = feedbackRow(comment, frames, true);
    if (index === -1) saved.set(frame, [...(saved.get(frame) ?? []), entry]);
    else listed.set(index, [...(listed.get(index) ?? []), entry]);
  }
  const groups: FrameGroup[] = [];
  if (whole.length > 0) groups.push({ key: `${row.path}#whole`, kind: "whole", label: "Whole canvas", rows: whole });
  // Keyed by id and occurrence, not position: collapse and focus state follow
  // the key, and a frame inserted before must not hand it to a neighbour.
  const seen = new Map<string, number>();
  frames.forEach((frame, index) => {
    const occurrence = seen.get(frame.id) ?? 0;
    seen.set(frame.id, occurrence + 1);
    const list = listed.get(index);
    if (list) groups.push({ key: `${row.path}#frame:${frame.id}:${occurrence}`, kind: "frame", label: frameLabel(frame, index).name, rows: list });
  });
  for (const [id, list] of saved) {
    groups.push(row.framesTruncated
      ? { key: `${row.path}#saved:${id}`, kind: "frame", label: id, rows: list }
      : { key: `${row.path}#saved:${id}`, kind: "missing", label: `${id} (not in canvas)`, rows: list });
  }
  return groups;
}

// Inside a frame group an element's label drops " · in <frame>": the group
// head already says it.
function feedbackRow(comment: Comment, frames: ReadonlyArray<{ id: string; title?: string }>, inFrame: boolean): FeedbackRow {
  const target = inFrame && comment.target.element ? { element: comment.target.element } : comment.target;
  const label = targetLabel(target, frames);
  return { comment: comment.comment, status: comment.status, label: label.text, title: label.title, line: comment.body.trim().split(/\r\n|\r|\n/, 1)[0] ?? "" };
}

// When the focused row or group head leaves the tree (`previous` and `current`
// are the shown keys in tree order): the next one still shown, else the
// previous one, else the panel title. `null` while the focused key is shown.
export function feedbackFocusAfterRemoval(previous: readonly string[], current: readonly string[], focused: string): { kind: "row"; key: string } | { kind: "title" } | null {
  if (current.includes(focused)) return null;
  const key = focusAfterRemoval(previous, current, focused);
  return key === null ? { kind: "title" } : { kind: "row", key };
}

// One row of the Feedback tree (`role="tree"`): a group head or a comment.
// `expanded` is absent on rows that hold nothing to show (comment rows and
// count-only groups). Notes, cards and messages render under their head and
// are not rows, so the keyboard skips them; their buttons are Tab stops.
export type FeedbackTreeRow = { key: string; level: 1 | 2 | 3; parent?: string; expanded?: boolean } & (
  | { kind: "orphans"; section: OrphanSection }
  | { kind: "orphanFile"; group: OrphanGroup }
  | { kind: "canvas"; group: CanvasGroup }
  | { kind: "frame"; group: FrameGroup; canvas: CanvasGroup & { kind: "comments" } }
  | { kind: "item"; row: FeedbackRow; canvas: CanvasGroup & { kind: "comments" } }
);

export const ORPHANS_KEY = "orphans";

export function feedbackTree(view: FeedbackView, collapsed: ReadonlySet<string>): FeedbackTreeRow[] {
  const rows: FeedbackTreeRow[] = [];
  const open = (key: string) => !collapsed.has(key);
  if (view.orphans) {
    rows.push({ key: ORPHANS_KEY, level: 1, expanded: open(ORPHANS_KEY), kind: "orphans", section: view.orphans });
    if (open(ORPHANS_KEY)) for (const group of view.orphans.files) {
      rows.push({ key: group.key, level: 2, parent: ORPHANS_KEY, ...(group.kind === "countOnly" ? {} : { expanded: open(group.key) }), kind: "orphanFile", group });
    }
  }
  for (const group of view.canvases) {
    // A head shown only for its review entry has nothing under it: collapsed.
    const empty = group.kind === "comments" && group.frames.length === 0;
    rows.push({ key: group.key, level: 1, ...(group.kind === "countOnly" ? {} : { expanded: !empty && open(group.key) }), kind: "canvas", group });
    if (group.kind !== "comments" || !open(group.key)) continue;
    for (const frame of group.frames) {
      rows.push({ key: frame.key, level: 2, parent: group.key, expanded: open(frame.key), kind: "frame", group: frame, canvas: group });
      if (open(frame.key)) for (const item of frame.rows) rows.push({ key: `item:${group.row.path}:${item.comment}`, level: 3, parent: frame.key, kind: "item", row: item, canvas: group });
    }
  }
  return rows;
}

// The Sidebar tree's keys on these rows. `undefined`: not a tree key, so the
// event goes on; `null`: a tree key with nothing to do here.
export function feedbackKey(rows: ReadonlyArray<{ key: string; parent?: string; expanded?: boolean }>, index: number, key: string): { focus: number } | { toggle: string } | { act: true } | null | undefined {
  const row = rows[index];
  if (!row) return undefined;
  switch (key) {
    case "ArrowDown": return { focus: Math.min(index + 1, rows.length - 1) };
    case "ArrowUp": return { focus: Math.max(index - 1, 0) };
    case "Home": return { focus: 0 };
    case "End": return { focus: rows.length - 1 };
    case "ArrowRight":
      if (row.expanded === false) return { toggle: row.key };
      return row.expanded && rows[index + 1]?.parent === row.key ? { focus: index + 1 } : null;
    case "ArrowLeft": {
      if (row.expanded) return { toggle: row.key };
      const parent = row.parent === undefined ? -1 : rows.findIndex(item => item.key === row.parent);
      return parent === -1 ? null : { focus: parent };
    }
    case "Enter": return { act: true };
    default: return undefined;
  }
}
