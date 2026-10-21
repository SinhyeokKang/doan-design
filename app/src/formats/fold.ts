import type { Comment, FoldResult, LocatedEvent, ParseResult, Warning } from "./types";
import { validateCommentEvent } from "./validate";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function warning(code: Warning["code"], line: number, value: unknown): Warning {
  const result: Warning = { code, line };
  if (isObject(value)) {
    if (typeof value.id === "string") result.event = value.id;
    if (typeof value.comment === "string") result.comment = value.comment;
  }
  return result;
}

export function parseLines(text: string): ParseResult {
  const result: ParseResult = { events: [], warnings: [] };
  const source = text.startsWith("\uFEFF") ? text.slice(1) : text;
  for (const [index, textLine] of source.split("\n").entries()) {
    if (!/[^ \t\r]/.test(textLine)) continue;
    const line = index + 1;
    let value: unknown;
    try {
      value = JSON.parse(textLine);
    } catch {
      result.warnings.push({ code: "invalid_event", line });
      continue;
    }

    if (!isObject(value) || typeof value.v !== "number") {
      result.warnings.push(warning("invalid_event", line, value));
    } else if (value.v !== 1) {
      result.warnings.push(warning("unknown_version", line, value));
    } else if (!validateCommentEvent(value)) {
      result.warnings.push(warning("invalid_event", line, value));
    } else {
      result.events.push({ line, event: value });
    }
  }
  return result;
}

// Validated events contain only primitives and objects; key order is not content.
function equalEventValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!isObject(left) || !isObject(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) =>
    Object.hasOwn(right, key) && equalEventValue(left[key], right[key]));
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function fold(events: LocatedEvent[]): FoldResult {
  const warnings: Warning[] = [];
  const groups = new Map<string, LocatedEvent[]>();
  for (const located of events) {
    const group = groups.get(located.event.id);
    if (group) group.push(located);
    else groups.set(located.event.id, [located]);
  }

  const unique: LocatedEvent[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    if (group.some(({ event }) => !equalEventValue(first.event, event))) {
      for (const { line, event } of group) {
        warnings.push(warning("conflicting_duplicate", line, event));
      }
    } else {
      unique.push(group.reduce((earliest, located) =>
        located.line < earliest.line ? located : earliest, first));
    }
  }
  unique.sort((left, right) => compare(left.event.at, right.event.at) ||
    compare(left.event.id, right.event.id));

  const comments = new Map<string, Comment>();
  const deleted = new Set<string>();
  for (const { line, event } of unique) {
    if (event.by.kind === "agent" && event.type !== "resolve") {
      warnings.push(warning("agent_not_allowed", line, event));
      continue;
    }
    if (deleted.has(event.comment)) continue;

    const comment = comments.get(event.comment);
    if (event.type === "create") {
      if (comment) {
        warnings.push(warning("duplicate_create", line, event));
      } else {
        comments.set(event.comment, {
          comment: event.comment,
          status: "open",
          body: event.body,
          target: event.target,
          canvasHash: event.canvasHash,
          createdBy: event.by,
          createdAt: event.at,
          updatedAt: event.at,
        });
      }
      continue;
    }
    if (!comment) {
      warnings.push(warning("orphan_event", line, event));
      continue;
    }

    switch (event.type) {
      case "edit":
        comment.body = event.body;
        comment.updatedAt = event.at;
        break;
      case "resolve":
        if (comment.status === "open") {
          comment.status = "resolved";
          comment.resolvedBy = event.by;
          comment.resolvedAt = event.at;
        }
        break;
      case "reopen":
        if (comment.status === "resolved") {
          comment.status = "open";
          delete comment.resolvedBy;
          delete comment.resolvedAt;
        }
        break;
      case "delete":
        comments.delete(event.comment);
        deleted.add(event.comment);
        break;
    }
  }

  return {
    comments: [...comments.values()].sort((left, right) =>
      compare(left.createdAt, right.createdAt) || compare(left.comment, right.comment)),
    warnings: warnings.sort((left, right) =>
      left.line - right.line || compare(left.code, right.code)),
  };
}
