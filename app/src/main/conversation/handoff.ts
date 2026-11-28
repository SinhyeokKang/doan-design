import { posix } from "node:path";
import { sameCanvas } from "./sessions";
import type { Provider } from "../agentAuth/types";
import type { Canvas, HandoffOrigin, HandoffResolution, HandoffVia } from "./types";
// The renderer imports this module's notice types with `import type` only: its value imports reach Node modules
// (POSTMORTEM 2026-10-30).

// The v5 schema's text maxLength, in code points (handoff.test.ts reads the schema to keep them equal).
export const HANDOFF_TEXT_LIMIT = 10_000;
// A turn at this step sends nothing: a chain ends at five links.
export const CHAIN_STEPS = 5;
// After the socket's own checks (schema, token, registered root) and the key. not_canvas_conversation and handoff_turn
// stay in the v5 enum for an earlier app; this one refuses with neither.
export type HandoffRefusal = "root_mismatch" | "not_running" | "not_canvas_conversation" | "plan_mode" | "already_requested" | "same_canvas" | "chain_limit" | "chain_one";
// Why a judged request did not start or send; a refused start or send adds its own code instead (resolved.reason).
// Earlier builds also wrote has_conversation and not_new; the renderer still words those lines (handoffView.ts).
export type HandoffReason = "not_listed" | "same_canvas" | "chain_return";
// running: its turn is accepted and not over. step: that turn's (0 for the person's message, else its origin's chain
// length). requested: paths of that turn's taken requests, handoffs and sends alike, whatever their judgement did.
// canvas: absent for a project conversation. permissionMode: now, after any plan approval in the turn.
export interface HandoffAsker { root: string; canvas?: Canvas; permissionMode?: string; running: boolean; step: number; requested: readonly string[] }
// The root is compared as a string, as every app-socket request's is (POSTMORTEM 2026-10-22).
export function handoffEligibility(ask: { root: string; path: string }, asker: HandoffAsker): HandoffRefusal | null {
  if (ask.root !== asker.root) return "root_mismatch";
  if (!asker.running) return "not_running";
  if (asker.permissionMode === "plan") return "plan_mode";
  if (asker.requested.includes(ask.path)) return "already_requested";
  if (asker.canvas && ask.path === asker.canvas.path) return "same_canvas";
  if (asker.step >= CHAIN_STEPS) return "chain_limit";
  if (asker.step > 0 && asker.requested.length > 0) return "chain_one";
  return null;
}
// A conversation a send may go to, as main reads it at the judgement. signedIn: its provider's connection is signed in.
export interface SendCandidate { conversationId: string; root: string; canvas?: Canvas; owner: "doan" | "legacy-external"; signedIn: boolean; lastActivityAt: string; readError?: true }
// The canvas's Doan-connected, signed-in, readable conversation with the latest activity, the first by conversationId
// on a tie; null when it has none. It may differ from the one the canvas panel shows.
export function latestConversation(root: string, canvas: Canvas, rows: readonly SendCandidate[]): string | null {
  let best: SendCandidate | undefined;
  for (const row of rows) {
    if (row.root !== root || !row.canvas || !sameCanvas(row.canvas, canvas) || row.owner !== "doan" || !row.signedIn || row.readError) continue;
    if (!best || row.lastActivityAt > best.lastActivityAt || (row.lastActivityAt === best.lastActivityAt && row.conversationId < best.conversationId)) best = row;
  }
  return best?.conversationId ?? null;
}
// done: the asking turn ended done. listed: the root's canvas rows now. settled: a folder refresh or the settle deadline
// passed since the turn's end. via: absent, a handoff. conversations: the root's conversations a send may reach. chain:
// the next link's (the asking turn's chain and the asker), which a send may not reach back into.
export interface HandoffJudgement { done: boolean; root: string; path: string; listed: readonly Canvas[]; source?: Canvas; settled: boolean; via?: HandoffVia; conversations?: readonly SendCandidate[]; chain?: readonly string[] }
// start: a new conversation on canvas (a handoff, or a send to a canvas with none it can reach); send: to that one.
export type HandoffDecision = { kind: "start"; canvas: Canvas } | { kind: "send"; canvas: Canvas; conversationId: string } | { kind: "refused"; reason: HandoffReason } | { kind: "cancelled" } | { kind: "wait" };
export function handoffDecision(input: HandoffJudgement): HandoffDecision {
  if (!input.done) return { kind: "cancelled" };
  const rows = input.listed.filter(row => row.path === input.path);
  if (!rows.length) return input.settled ? { kind: "refused", reason: "not_listed" } : { kind: "wait" };
  const row = rows[0]!;
  if (rows.length > 1 || (row.id !== undefined && input.listed.filter(other => other.id === row.id).length > 1)) return { kind: "refused", reason: "not_listed" };
  if (input.source && sameCanvas(input.source, row)) return { kind: "refused", reason: "same_canvas" };
  const canvas = row.id === undefined ? { path: row.path } : { path: row.path, id: row.id };
  if (input.via !== "send") return { kind: "start", canvas };
  const conversationId = latestConversation(input.root, canvas, input.conversations ?? []);
  if (conversationId === null) return { kind: "start", canvas };
  return input.chain?.includes(conversationId) ? { kind: "refused", reason: "chain_return" } : { kind: "send", canvas, conversationId };
}
// The person's guidance for a step-0 turn, the received turn's for steps 1 to 4, none at step 5, in Plan or for a
// conversation without the key (a Doan-connected runner gets it, service.ts openRunner).
export type HandoffGuidance = "person" | "received";
export function handoffGuidanceFor(metadata: { owner: { kind: string }; canvas?: Canvas }, turn: { permissionMode?: string; step: number }): HandoffGuidance | null {
  if (metadata.owner.kind !== "doan" || turn.permissionMode === "plan" || turn.step >= CHAIN_STEPS) return null;
  return turn.step === 0 ? "person" : "received";
}
// An origin as written, an earlier build's read as a handoff whose chain is its sender alone.
export function originLink(origin: HandoffOrigin): { via: HandoffVia; chain: string[]; provider?: Provider } {
  return { via: origin.via ?? "handoff", chain: origin.chain ? [...origin.chain] : [origin.conversationId], ...(origin.provider ? { provider: origin.provider } : {}) };
}
// The origin a request of the sender's turn carries: that turn's chain (empty at step 0) and the sender.
export function nextOrigin(sender: { conversationId: string; canvas?: Canvas; provider: Provider }, chain: readonly string[], via: HandoffVia): HandoffOrigin {
  return { kind: "handoff", conversationId: sender.conversationId, ...(sender.canvas ? { canvas: sender.canvas } : {}), via, chain: [...chain, sender.conversationId], provider: sender.provider };
}
// edits: the paths of the turn's own edit activities, as the provider reported them. requested: the paths the turn
// asked handoffs for, whatever their outcome. snapshot: the root's canvas rows at the turn's acceptance. step: the turn's.
export interface MissedInput { root: string; step: number; edits: readonly string[]; listed: readonly Canvas[]; snapshot: readonly Canvas[]; requested: readonly string[]; source?: Canvas }
// The new canvases a step-0 turn edited and asked no handoff for, in edit order. A file made by a shell command has no
// edit path, so it is never named.
export function missedHandoffs(input: MissedInput): Canvas[] {
  if (input.step > 0) return [];
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
// Where a handoff turn's queue goes once every request resolved: to the conversation one handoff started, else to the
// source, or back to the draft when a cancel (a Stop, a sign-out) means it must not be sent now. A send never takes it.
export function handoffQueueOutcome(requests: readonly { outcome: HandoffResolution["outcome"]; via: HandoffVia }[]): "move" | "source" | "draft" {
  if (requests.some(request => request.outcome === "cancelled")) return "draft";
  return requests.length === 1 && requests[0]!.outcome === "started" && requests[0]!.via === "handoff" ? "move" : "source";
}
// conversation:handoff, sent to the main window once per turn whose handoffs started a conversation. source.canvas:
// absent for a project conversation, which the root's Overview shows.
export interface HandoffNotice { root: string; source: { conversationId: string; canvas?: Canvas }; target: { conversationId: string; canvas: Canvas } }
// targets: every started conversation and its canvas, in request order, two or more. The renderer neither moves nor
// follows any of them: it shows a summary toast whose Open goes to the source, unless the source is shown.
export interface HandoffMultiNotice { root: string; source: { conversationId: string; canvas?: Canvas }; targets: readonly { conversationId: string; canvas: Canvas }[] }
// A turn's notice when any request was a send or the turn was at step 1 or later: the renderer never moves the screen
// for it. targets: each conversation a request started or reached, in request order, one or more.
export interface HandoffMessageNotice { kind: "message"; root: string; source: { conversationId: string; canvas?: Canvas }; targets: readonly { conversationId: string; canvas: Canvas; via: HandoffVia }[] }
export type ConversationHandoffNotice = HandoffNotice | HandoffMultiNotice | HandoffMessageNotice;
// The one notice a turn's started or sent requests send, or null when none did. step: the asking turn's.
export function handoffNoticeKind(input: { root: string; source: HandoffNotice["source"]; step: number; started: readonly HandoffMessageNotice["targets"][number][] }): ConversationHandoffNotice | null {
  if (!input.started.length) return null;
  if (input.step > 0 || input.started.some(target => target.via === "send")) return { kind: "message", root: input.root, source: input.source, targets: [...input.started] };
  const [first, ...rest] = input.started.map(({ via: _via, ...target }) => target);
  return rest.length ? { root: input.root, source: input.source, targets: [first!, ...rest] } : { root: input.root, source: input.source, target: first! };
}
