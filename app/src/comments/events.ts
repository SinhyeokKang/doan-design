import { fold, parseLines } from "../formats/fold";
import type { Author, Comment, CommentEvent, LocatedEvent, Target } from "../formats/types";
import { validateCommentEvent } from "../formats/validate";

export interface ExpectedComment {
  body: string;
  status: Comment["status"];
  updatedAt: string;
  resolvedAt?: string;
}

export type MutationIntent =
  | { type: "create"; body: string }
  | { type: "edit"; comment: string; body: string; expected: ExpectedComment }
  | { type: "delete" | "resolve" | "reopen"; comment: string; expected: ExpectedComment };

// Main supplies these only after project/canvas, document, hash and sender checks.
// This is not an IPC payload, nor a replacement for I/O revalidation before append.
export interface EventAuthority {
  id: string;
  comment: string;
  by: Author;
  now: number;
  create?: { target: Target; canvasHash: string; documentValid: boolean };
}

const timePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function nextEventTime(events: readonly LocatedEvent[], now: number): string {
  if (!Number.isFinite(now)) throw new Error("Invalid current time.");
  let maximum: string | undefined;
  for (const { event } of events) if (maximum === undefined || event.at > maximum) maximum = event.at;
  let next = Math.trunc(now);
  if (maximum !== undefined) {
    const ms = Date.parse(maximum);
    if (!Number.isFinite(ms) || new Date(ms).toISOString() !== maximum) throw new Error("Invalid maximal event time.");
    next = Math.max(next, ms + 1);
  }
  const date = new Date(next);
  if (!Number.isFinite(date.getTime())) throw new Error("Event time overflow.");
  const result = date.toISOString();
  if (!timePattern.test(result)) throw new Error("Event time exceeds the v1 year range.");
  return result;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  return required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}

function validExpected(value: unknown): value is ExpectedComment {
  return record(value) && exactKeys(value, ["body", "status", "updatedAt"], ["resolvedAt"]) &&
    typeof value.body === "string" && (value.status === "open" || value.status === "resolved") &&
    typeof value.updatedAt === "string" && (value.resolvedAt === undefined || typeof value.resolvedAt === "string");
}

function validIntent(value: unknown): value is MutationIntent {
  if (!record(value)) return false;
  if (value.type === "create") return exactKeys(value, ["type", "body"]) && typeof value.body === "string";
  if (value.type !== "edit" && value.type !== "delete" && value.type !== "resolve" && value.type !== "reopen") return false;
  return exactKeys(value, value.type === "edit" ? ["type", "comment", "body", "expected"] : ["type", "comment", "expected"]) &&
    typeof value.comment === "string" && validExpected(value.expected) && (value.type !== "edit" || typeof value.body === "string");
}

export function prepareEvent(text: string, intent: unknown, authority: EventAuthority): CommentEvent {
  if (!validIntent(intent)) throw new Error("Invalid comment mutation.");
  if (authority.by.kind !== "human" || !authority.by.name.trim()) throw new Error("Configure a Git user name before saving.");
  if ((intent.type === "create" || intent.type === "edit") && !intent.body.trim()) throw new Error("Enter a comment body.");
  const parsed = parseLines(text);
  if (parsed.events.some(({ event }) => event.id === authority.id)) throw new Error("Event id already exists; check saved status.");
  const at = nextEventTime(parsed.events, authority.now);
  const base = { v: 1, id: authority.id, at, by: structuredClone(authority.by) };
  let candidate: unknown;
  if (intent.type === "create") {
    if (!authority.create?.documentValid) throw new Error("The original document or target is no longer valid.");
    if (parsed.events.some(({ event }) => event.comment === authority.comment)) throw new Error("Comment id already exists.");
    candidate = { ...base, type: "create", comment: authority.comment, body: intent.body,
      target: structuredClone(authority.create.target), canvasHash: authority.create.canvasHash };
  } else {
    const current = fold(parsed.events).comments.find(comment => comment.comment === intent.comment);
    if (!current) throw new Error("Comment no longer exists.");
    const expected = intent.expected;
    if (current.body !== expected.body || current.status !== expected.status || current.updatedAt !== expected.updatedAt || current.resolvedAt !== expected.resolvedAt) {
      throw new Error("Comment changed; read the latest state before saving.");
    }
    if ((intent.type === "resolve" && current.status !== "open") || (intent.type === "reopen" && current.status !== "resolved")) throw new Error("Comment status changed.");
    candidate = intent.type === "edit" ? { ...base, type: "edit", comment: intent.comment, body: intent.body } :
      { ...base, type: intent.type, comment: intent.comment };
  }
  if (!validateCommentEvent(candidate)) throw new Error("Prepared comment event violates v1.");
  return candidate;
}
