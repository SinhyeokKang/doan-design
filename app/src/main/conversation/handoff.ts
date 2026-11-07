import type { Canvas } from "./types";
// Type-only imports: the renderer may import the notice type (POSTMORTEM 2026-10-30).

// The v5 schema's text maxLength, in code points (handoff.test.ts reads the schema to keep them equal).
export const HANDOFF_TEXT_LIMIT = 10_000;
// After the socket's own checks (schema, token, registered root) and the key: in the order the design gives (§3).
export type HandoffRefusal = "root_mismatch" | "not_running" | "not_canvas_conversation" | "plan_mode" | "handoff_turn" | "already_requested" | "same_canvas";
// Why a judged handoff did not start; a refused start adds its own code instead (resolved.reason).
export type HandoffReason = "not_listed" | "not_new" | "has_conversation" | "same_canvas";
// The conversation whose key asked, as main holds it now. permissionMode: the conversation's mode now, which a plan
// approval may have changed during the turn. running: its current turn is accepted and not over.
// startedBy: that turn was a handoff's first. requested: that turn's handoff was taken already.
export interface HandoffAsker { root: string; canvas?: Canvas; permissionMode?: string; running: boolean; startedBy?: "handoff"; requested: boolean }
// The root is compared as a string, as every app-socket request's is (POSTMORTEM 2026-10-22).
export function handoffEligibility(ask: { root: string; path: string }, asker: HandoffAsker): HandoffRefusal | null {
  if (ask.root !== asker.root) return "root_mismatch";
  if (!asker.running) return "not_running";
  if (!asker.canvas) return "not_canvas_conversation";
  if (asker.permissionMode === "plan") return "plan_mode";
  if (asker.startedBy === "handoff") return "handoff_turn";
  if (asker.requested) return "already_requested";
  if (ask.path === asker.canvas.path) return "same_canvas";
  return null;
}
// done: the asking turn ended done. listed: the root's canvas rows now. snapshot: the rows when the turn was accepted.
// source: the asking conversation's canvas. settled: a folder refresh or the binding window passed since the turn's end.
// current: whether a canvas has a current conversation now.
export interface HandoffJudgement { done: boolean; path: string; listed: readonly Canvas[]; snapshot: readonly Canvas[]; source?: Canvas; settled: boolean; current(canvas: Canvas): boolean }
export type HandoffDecision = { kind: "start"; canvas: Canvas } | { kind: "refused"; reason: HandoffReason } | { kind: "cancelled" } | { kind: "wait" };
export function handoffDecision(input: HandoffJudgement): HandoffDecision {
  if (!input.done) return { kind: "cancelled" };
  const rows = input.listed.filter(row => row.path === input.path);
  if (!rows.length) return input.settled ? { kind: "refused", reason: "not_listed" } : { kind: "wait" };
  const row = rows[0]!;
  if (rows.length > 1 || (row.id !== undefined && input.listed.filter(other => other.id === row.id).length > 1)) return { kind: "refused", reason: "not_listed" };
  if (input.source && same(input.source, row)) return { kind: "refused", reason: "same_canvas" };
  // A path that held a canvas at the start counts as existing too: a handoff goes only to a new canvas (ARCHITECTURE §7 'Handoff').
  if (input.snapshot.some(old => same(old, row) || old.path === row.path)) return { kind: "refused", reason: "not_new" };
  if (input.current(row)) return { kind: "refused", reason: "has_conversation" };
  return { kind: "start", canvas: row.id === undefined ? { path: row.path } : { path: row.path, id: row.id } };
}
// The same condition the key is given on (a Doan-connected runner, service.ts openRunner), plus a canvas conversation's
// turn that is not Plan and was not started by a handoff: only such a turn can use what the guidance teaches.
// turn.permissionMode: the mode this turn is sent with.
export function handoffGuidanceFor(metadata: { owner: { kind: string }; canvas?: Canvas }, turn: { permissionMode?: string; startedBy?: "handoff" }): boolean {
  return metadata.owner.kind === "doan" && !!metadata.canvas && turn.permissionMode !== "plan" && turn.startedBy !== "handoff";
}
// conversation:handoff, sent to the main window once a handoff started the target conversation.
export interface HandoffNotice { root: string; source: { conversationId: string; canvas: Canvas }; target: { conversationId: string; canvas: Canvas } }
// sessions.ts sameCanvas, repeated so this module imports no code.
function same(a: Canvas, b: Canvas): boolean {
  return a.id !== undefined || b.id !== undefined ? a.id !== undefined && a.id === b.id : a.path === b.path;
}
