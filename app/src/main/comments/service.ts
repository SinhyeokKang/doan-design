import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { prepareEvent, type MutationIntent } from "../../comments/events";
import { copyText, type CopyScope } from "../../comments/projection";
import { parseLines } from "../../formats/fold";
import { foldText } from "../../formats/foldText";
import type { Author, Comment, CommentEvent, Target, Warning } from "../../formats/types";
import { AppendUncertainError } from "./files";
import { CanvasIdentityError, object, type CanvasIdentityCause } from "./identity";
import { MkdirTerminationUnconfirmedError } from "./mkdir";

export interface CommentIdentity { root: string; path: string; canvas: string }
export interface CommentRequest extends CommentIdentity { requestID: string }
export interface BeginRequest extends CommentRequest { scope: "canvas" | "selection" }
export interface MutationRequest extends CommentRequest { project: number; intent: MutationIntent; origin?: string }
export interface CopyRequest extends CommentRequest { scope: CopyScope }
export interface DocumentOrigin { generation: string; hash: string; target: Target }
export type CommentReply<T> = { ok: true; identity: CommentRequest; value: T } | { ok: false; identity: CommentRequest | null; error: string; cause?: CanvasIdentityCause };
export interface CommentList { project: number; canvasHash: string | null; comments: Comment[]; warnings: Warning[] }
export interface SavedStatus { state: "saved" | "absent" | "unknown"; recovery?: "child-exit-required"; event?: string; comment?: string; error?: string }
export interface BeginResult extends DocumentOrigin { origin: string; project: number }
export interface ServiceDependencies {
  authorize(identity: CommentIdentity): Promise<{ width: number | null; url: string }>;
  epoch(root: string): number | null;
  currentHash(identity: CommentIdentity): Promise<string>;
  author(root: string): Promise<Author>;
  read(root: string, canvas: string): Promise<Buffer>;
  append(root: string, canvas: string, prepare: (latest: Buffer) => Promise<Buffer | null>): Promise<void>;
  document(identity: CommentIdentity, scope: "canvas" | "selection", url: string): Promise<DocumentOrigin>;
  validateDocument(identity: CommentIdentity, origin: DocumentOrigin, url: string): Promise<boolean>;
  clipboard(text: string): void | Promise<void>;
  invalidated(root: string): void;
}
interface Origin { requester: string; identity: CommentIdentity; epoch: number; document: DocumentOrigin }
interface Attempt { payload: unknown; event: CommentEvent; before: { length: number; digest: string; warnings: number } }
const baseKeys = ["root", "path", "canvas", "requestID"];
function request(value: unknown, extras: string[] = []): CommentRequest {
  if (!object(value) || !baseKeys.every(key => typeof value[key] === "string" && value[key].length > 0 && value[key].length <= 4096 && !value[key].includes("\0")) || Object.keys(value).some(key => ![...baseKeys, ...extras].includes(key))) throw new Error("Invalid comments request.");
  if (typeof value.root !== "string" || typeof value.path !== "string" || typeof value.canvas !== "string" || typeof value.requestID !== "string") throw new Error("Invalid comments request.");
  return { root: value.root, path: value.path, canvas: value.canvas, requestID: value.requestID };
}
function identityEqual(a: CommentIdentity, b: CommentIdentity) { return a.root === b.root && a.path === b.path && a.canvas === b.canvas; }
function message(error: unknown): string { return error instanceof Error ? error.message : "Comments operation failed."; }
function text(bytes: Buffer): string {
  // Go's JSON reader advances one byte per invalid rune; TextDecoder consumes
  // truncated prefixes together. Decode only valid spans and preserve the BOM
  // for parseLines to strip exactly once.
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < bytes.length;) {
    const lead = bytes.readUInt8(i);
    if (lead < 0x80) { i++; continue; }
    const size = lead >= 0xc2 && lead <= 0xdf ? 2 : lead >= 0xe0 && lead <= 0xef ? 3 : lead >= 0xf0 && lead <= 0xf4 ? 4 : 0;
    // Shortest encodings only, excluding surrogates and scalars above U+10FFFF.
    const low = lead === 0xe0 ? 0xa0 : lead === 0xf0 ? 0x90 : 0x80;
    const high = lead === 0xed ? 0x9f : lead === 0xf4 ? 0x8f : 0xbf;
    let valid = size > 0 && i + size <= bytes.length && bytes.readUInt8(i + 1) >= low && bytes.readUInt8(i + 1) <= high;
    for (let j = 2; valid && j < size; j++) valid = bytes.readUInt8(i + j) >= 0x80 && bytes.readUInt8(i + j) <= 0xbf;
    if (valid) { i += size; continue; }
    parts.push(bytes.toString("utf8", start, i), "\uFFFD");
    start = ++i;
  }
  parts.push(bytes.toString("utf8", start));
  return parts.join("");
}
function digest(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }
function readList(bytes: Buffer): Omit<CommentList, "project" | "canvasHash"> {
  return foldText(text(bytes));
}
function inspectAttempt(bytes: Buffer, attempt: Attempt): SavedStatus {
  try {
    const parsed = parseLines(text(bytes));
    const matches = parsed.events.filter(({ event }) => event.id === attempt.event.id);
    if (matches.some(({ event }) => !isDeepStrictEqual(event, attempt.event))) return { state: "unknown", error: "Conflicting event content; no retry was written." };
    // New malformed bytes may be a partial write, even if a complete copy exists elsewhere.
    const samePrefix = bytes.length >= attempt.before.length && digest(bytes.subarray(0, attempt.before.length)) === attempt.before.digest;
    // Only an unchanged baseline may contain pre-existing malformed UTF-8.
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(samePrefix ? bytes.subarray(attempt.before.length) : bytes);
    if (parsed.warnings.length > attempt.before.warnings || (!samePrefix && parsed.warnings.length)) return { state: "unknown", error: "Partial or unreadable event data; no retry was written." };
    if (matches.length) return { state: "saved", event: attempt.event.id, comment: attempt.event.comment };
    return { state: "absent", event: attempt.event.id, comment: attempt.event.comment };
  } catch (error) { return { state: "unknown", error: message(error) }; }
}

function validIntent(value: unknown): value is MutationIntent {
  if (!object(value)) return false;
  const exact = (keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  if (value.type === "create") return exact(["type", "body"]) && typeof value.body === "string" && value.body.trim().length > 0;
  if (!["edit", "delete", "resolve", "reopen"].includes(String(value.type)) || typeof value.comment !== "string" || !object(value.expected)) return false;
  if (!exact(value.type === "edit" ? ["type", "comment", "body", "expected"] : ["type", "comment", "expected"])) return false;
  const expected = value.expected;
  return typeof expected.body === "string" && (expected.status === "open" || expected.status === "resolved") && typeof expected.updatedAt === "string" &&
    (expected.resolvedAt === undefined || typeof expected.resolvedAt === "string") && Object.keys(expected).every(key => ["body", "status", "updatedAt", "resolvedAt"].includes(key)) &&
    (value.type !== "edit" || (typeof value.body === "string" && value.body.trim().length > 0));
}

export function createCommentsService(deps: ServiceDependencies) {
  // Directory creation is shared by every canvas in the root. Neither disk
  // absence nor reopening a project proves that an unconfirmed child exited.
  const blockedRoots = new Set<string>();
  const blocked = (): SavedStatus => ({ state: "unknown", recovery: "child-exit-required", error: "Directory worker exit is unconfirmed. Saving is blocked for this project. Confirm the child has exited before restarting the app; do not retry automatically." });
  const queues = new Map<string, Promise<unknown>>();
  const origins = new Map<string, Origin>();
  const attempts = new Map<string, Attempt>();
  const key = (who: string, r: CommentRequest) => JSON.stringify([who, r.root, r.canvas, r.requestID]);
  const serialized = async <T>(r: CommentIdentity, run: () => Promise<T>): Promise<T> => {
    const file = r.root;
    const next = (queues.get(file) ?? Promise.resolve()).catch(() => undefined).then(run);
    queues.set(file, next);
    try { return await next; } finally { if (queues.get(file) === next) queues.delete(file); }
  };
  const authorized = async (r: CommentIdentity, epoch: number | null) => {
    if (epoch === null || deps.epoch(r.root) !== epoch) throw new Error("Project was closed or reopened.");
    const result = await deps.authorize(r);
    if (deps.epoch(r.root) !== epoch) throw new Error("Project was closed or reopened.");
    return result;
  };
  const reply = async <T>(value: unknown, extras: string[], run: (r: CommentRequest) => Promise<T>): Promise<CommentReply<T>> => {
    let r: CommentRequest | null = null;
    try { r = request(value, extras); return { ok: true, identity: r, value: await run(r) }; }
    catch (error) { return { ok: false, identity: r, error: message(error), ...(error instanceof CanvasIdentityError ? { cause: error.cause } : {}) }; }
  };
  const check = async (r: CommentRequest, attempt: Attempt): Promise<SavedStatus> => {
    try { return inspectAttempt(await deps.read(r.root, r.canvas), attempt); }
    catch (error) { return { state: "unknown", error: message(error) }; }
  };
  return {
    list(_who: string, value: unknown): Promise<CommentReply<CommentList>> {
      return reply(value, [], async r => { const epoch = deps.epoch(r.root); await authorized(r, epoch); const result = readList(await deps.read(r.root, r.canvas)); const canvasHash = await deps.currentHash(r).catch(() => null); await authorized(r, epoch); return { ...result, canvasHash, project: epoch ?? -1 }; });
    },
    author(_who: string, value: unknown): Promise<CommentReply<Author>> {
      return reply(value, [], async r => { const epoch = deps.epoch(r.root); await authorized(r, epoch); const result = await deps.author(r.root); await authorized(r, epoch); return result; });
    },
    begin(who: string, value: unknown): Promise<CommentReply<BeginResult>> {
      return reply(value, ["scope"], async r => {
        if (!object(value) || (value.scope !== "canvas" && value.scope !== "selection")) throw new Error("Invalid create scope.");
        const epoch = deps.epoch(r.root);
        const canvas = await authorized(r, epoch);
        if (canvas.width === null || epoch === null) throw new Error("Canvas width is invalid.");
        const document = await deps.document(r, value.scope, canvas.url);
        await authorized(r, epoch);
        const origin = randomUUID();
        origins.set(origin, { requester: who, identity: r, epoch, document: structuredClone(document) });
        if (origins.size > 256) { const first = origins.keys().next().value; if (first) origins.delete(first); }
        return { origin, project: epoch, ...document };
      });
    },
    status(who: string, value: unknown): Promise<CommentReply<SavedStatus>> {
      return reply(value, [], r => serialized(r, async () => {
        await authorized(r, deps.epoch(r.root));
        if (blockedRoots.has(r.root)) return blocked();
        const attempt = attempts.get(key(who, r));
        if (!attempt || !object(attempt.payload) || attempt.payload.path !== r.path) return { state: "unknown", error: "This process has no matching save request." };
        return check(r, attempt);
      }));
    },
    mutate(who: string, value: unknown): Promise<CommentReply<SavedStatus>> {
      return reply(value, ["intent", "origin", "project"], r => serialized(r, async () => {
        if (!object(value) || !validIntent(value.intent)) throw new Error("Invalid mutation.");
        const epoch = deps.epoch(r.root);
        if (value.project !== epoch || epoch === null) throw new Error("Project was closed or reopened; read the current list.");
        if (blockedRoots.has(r.root)) return blocked();
        let canvas = await authorized(r, epoch);
        const attemptKey = key(who, r);
        let attempt = attempts.get(attemptKey);
        if (attempt && !isDeepStrictEqual(attempt.payload, value)) throw new Error("Request id was reused with different content.");
        if (attempt) {
          const state = await check(r, attempt);
          if (state.state !== "absent") return state;
        }
        const by = await deps.author(r.root);
        if (by.kind !== "human" || !by.name.trim()) throw new Error("Configure a Git user name before saving comments.");
        canvas = await authorized(r, epoch);
        let origin: Origin | undefined;
        if (value.intent.type === "create") {
          origin = typeof value.origin === "string" ? origins.get(value.origin) : undefined;
          if (!origin || origin.requester !== who || !identityEqual(origin.identity, r) || origin.epoch !== epoch || canvas.width === null) throw new Error("Original create context is no longer valid.");
        } else if (Object.hasOwn(value, "origin")) throw new Error("Existing comments do not accept a create origin.");
        try {
          await deps.append(r.root, r.canvas, async latest => {
            const current = await authorized(r, epoch);
            if (attempt) {
              const state = inspectAttempt(latest, attempt);
              if (state.state === "saved") return null;
              if (state.state === "unknown") throw new AppendUncertainError(new Error(state.error));
            }
            if (origin && (current.width === null || !await deps.validateDocument(r, origin.document, current.url))) throw new Error("Original document or target changed; the draft was not saved.");
            if (deps.epoch(r.root) !== epoch) throw new Error("Project was closed or reopened.");
            if (attempt) {
              prepareEvent(text(latest), value.intent, { id: attempt.event.id, comment: attempt.event.comment, by: attempt.event.by, now: Date.parse(attempt.event.at), ...(origin ? { create: { target: origin.document.target, canvasHash: origin.document.hash, documentValid: true } } : {}) });
            }
            if (!attempt) {
              const event = prepareEvent(text(latest), value.intent, { id: `evt_${randomUUID()}`, comment: `cmt_${randomUUID()}`, by, now: Date.now(), ...(origin ? { create: { target: origin.document.target, canvasHash: origin.document.hash, documentValid: true } } : {}) });
              attempt = { payload: structuredClone(value), event, before: { length: latest.length, digest: digest(latest), warnings: parseLines(text(latest)).warnings.length } };
              attempts.set(attemptKey, attempt);
            }
            return Buffer.from(JSON.stringify(attempt.event) + "\n");
          });
        } catch (error) {
          if (error instanceof MkdirTerminationUnconfirmedError) { blockedRoots.add(r.root); return blocked(); }
          if (error instanceof AppendUncertainError) return { state: "unknown", error: message(error), ...(attempt ? { event: attempt.event.id, comment: attempt.event.comment } : {}) };
          throw error;
        }
        deps.invalidated(r.root);
        if (!attempt) return { state: "unknown", error: "No prepared event." };
        const confirmed = await check(r, attempt);
        return confirmed.state === "absent" ? { state: "unknown", event: attempt.event.id, comment: attempt.event.comment, error: "The append completed, but the current file no longer contains it. Check saved status." } : confirmed;
      }));
    },
    copy(_who: string, value: unknown): Promise<CommentReply<{ copied: true }>> {
      return reply(value, ["scope"], async r => {
        if (!object(value) || !object(value.scope)) throw new Error("Invalid copy scope.");
        const scope = value.scope;
        let parsed: CopyScope;
        if (scope.kind === "all" && Object.keys(scope).length === 1) parsed = { kind: "all" };
        else if (scope.kind === "one" && typeof scope.comment === "string" && Object.keys(scope).length === 2) parsed = { kind: "one", comment: scope.comment };
        else throw new Error("Invalid copy scope.");
        const epoch = deps.epoch(r.root); await authorized(r, epoch);
        const result = readList(await deps.read(r.root, r.canvas));
        await authorized(r, epoch);
        await deps.clipboard(copyText(r.root, r.canvas, result.comments, parsed));
        return { copied: true };
      });
    },
  };
}
