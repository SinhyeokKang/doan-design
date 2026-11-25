import { posix } from "node:path";
import { sameCanvas } from "./sessions";
import type { Canvas, HandoffResolution } from "./types";
// The renderer imports this module's notice types with `import type` only: its value imports reach Node modules
// (POSTMORTEM 2026-10-30).

// The v5 schema's text maxLength, in code points (handoff.test.ts reads the schema to keep them equal).
export const HANDOFF_TEXT_LIMIT = 10_000;
// After the socket's own checks (schema, token, registered root) and the key. not_canvas_conversation stays in the v5
// enum for an earlier app; this one never refuses with it, since a project conversation hands off too.
export type HandoffRefusal = "root_mismatch" | "not_running" | "not_canvas_conversation" | "plan_mode" | "handoff_turn" | "already_requested" | "same_canvas";
// Why a judged handoff did not start; a refused start adds its own code instead (resolved.reason).
// An earlier build also wrote has_conversation; the renderer still words that line (handoffView.ts).
export type HandoffReason = "not_listed" | "not_new" | "same_canvas";
// running: its turn is accepted and not over. startedBy: that turn was a handoff's first. requested: paths of that turn's
// handoffs taken. canvas: absent for a project conversation. permissionMode: now, after any plan approval in the turn.
export interface HandoffAsker { root: string; canvas?: Canvas; permissionMode?: string; running: boolean; startedBy?: "handoff"; requested: readonly string[] }
// The root is compared as a string, as every app-socket request's is (POSTMORTEM 2026-10-22).
export function handoffEligibility(ask: { root: string; path: string }, asker: HandoffAsker): HandoffRefusal | null {
  if (ask.root !== asker.root) return "root_mismatch";
  if (!asker.running) return "not_running";
  if (asker.permissionMode === "plan") return "plan_mode";
  if (asker.startedBy === "handoff") return "handoff_turn";
  if (asker.requested.includes(ask.path)) return "already_requested";
  if (asker.canvas && ask.path === asker.canvas.path) return "same_canvas";
  return null;
}
// done: the asking turn ended done. listed, snapshot: the root's canvas rows now and at turn acceptance. settled: a folder
// refresh or the settle deadline passed since the turn's end. A canvas's own conversations do not count.
export interface HandoffJudgement { done: boolean; path: string; listed: readonly Canvas[]; snapshot: readonly Canvas[]; source?: Canvas; settled: boolean }
export type HandoffDecision = { kind: "start"; canvas: Canvas } | { kind: "refused"; reason: HandoffReason } | { kind: "cancelled" } | { kind: "wait" };
export function handoffDecision(input: HandoffJudgement): HandoffDecision {
  if (!input.done) return { kind: "cancelled" };
  const rows = input.listed.filter(row => row.path === input.path);
  if (!rows.length) return input.settled ? { kind: "refused", reason: "not_listed" } : { kind: "wait" };
  const row = rows[0]!;
  if (rows.length > 1 || (row.id !== undefined && input.listed.filter(other => other.id === row.id).length > 1)) return { kind: "refused", reason: "not_listed" };
  if (input.source && sameCanvas(input.source, row)) return { kind: "refused", reason: "same_canvas" };
  // A path that held a canvas at the start counts as existing too: a handoff goes only to a new canvas (ARCHITECTURE §7 'Handoff').
  if (input.snapshot.some(old => sameCanvas(old, row) || old.path === row.path)) return { kind: "refused", reason: "not_new" };
  return { kind: "start", canvas: row.id === undefined ? { path: row.path } : { path: row.path, id: row.id } };
}
// The condition the key is given on (a Doan-connected runner, service.ts openRunner), plus a turn not in Plan and not
// started by a handoff: only such a turn can use what the guidance teaches. turn.permissionMode: this turn's mode.
export function handoffGuidanceFor(metadata: { owner: { kind: string }; canvas?: Canvas }, turn: { permissionMode?: string; startedBy?: "handoff" }): boolean {
  return metadata.owner.kind === "doan" && turn.permissionMode !== "plan" && turn.startedBy !== "handoff";
}
// edits: the paths of the turn's own edit activities, as the provider reported them. requested: the paths the turn
// asked handoffs for, whatever their outcome. The rest as in HandoffJudgement.
export interface MissedInput { root: string; edits: readonly string[]; listed: readonly Canvas[]; snapshot: readonly Canvas[]; requested: readonly string[]; source?: Canvas }
// The new canvases a guided turn edited and asked no handoff for, in edit order: each is one the turn could have handed
// off to by handoffDecision's rules. A file made by a shell command has no edit path, so it is never named.
export function missedHandoffs(input: MissedInput): Canvas[] {
  return canvasesAt(input.root, input.edits, listedOnce(input.listed), input.snapshot).filter(row => !(input.source && sameCanvas(input.source, row)) &&
    !input.snapshot.some(old => sameCanvas(old, row) || old.path === row.path) && !input.requested.includes(row.path));
}
// The rows listed exactly once: a path listed twice, or an ID two files share (duplicate_canvas_id), names neither.
export function listedOnce(listed: readonly Canvas[]): Canvas[] {
  return listed.filter(row => listed.filter(other => other.path === row.path || (row.id !== undefined && other.id === row.id)).length === 1);
}
// The listed rows these paths name, once each; a path at a canvas's turn-start location follows its stable ID. A path
// that held another canvas at the turn's start names neither; paths outside the root name nothing.
export function canvasesAt(root: string, paths: readonly string[], rows: readonly Canvas[], snapshot: readonly Canvas[]): Canvas[] {
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
// Where a handoff turn's queue goes once every request resolved: to the one started conversation, else to the source,
// or back to the draft when a cancel (a Stop, a sign-out) means it must not be sent now.
export function handoffQueueOutcome(outcomes: readonly HandoffResolution["outcome"][]): "move" | "source" | "draft" {
  if (outcomes.length === 1) return outcomes[0] === "started" ? "move" : outcomes[0] === "refused" ? "source" : "draft";
  return outcomes.includes("cancelled") ? "draft" : "source";
}
// conversation:handoff, sent to the main window once per turn whose handoffs started a conversation. source.canvas:
// absent for a project conversation, which the root's Overview shows.
export interface HandoffNotice { root: string; source: { conversationId: string; canvas?: Canvas }; target: { conversationId: string; canvas: Canvas } }
// targets: every started conversation and its canvas, in request order, two or more. The renderer neither moves nor
// follows any of them: it shows a summary toast whose Open goes to the source, unless the source is shown.
export interface HandoffMultiNotice { root: string; source: { conversationId: string; canvas?: Canvas }; targets: readonly { conversationId: string; canvas: Canvas }[] }
export type ConversationHandoffNotice = HandoffNotice | HandoffMultiNotice;
// The one notice a turn's started handoffs send, or null when none started.
export function handoffNoticeKind(input: { root: string; source: HandoffNotice["source"]; started: readonly HandoffNotice["target"][] }): ConversationHandoffNotice | null {
  const [first, second] = input.started;
  if (!first) return null;
  return second ? { root: input.root, source: input.source, targets: [...input.started] } : { root: input.root, source: input.source, target: first };
}
