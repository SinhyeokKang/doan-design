import { afterEach, expect, it } from "vitest";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialAcp, normalizeAcp } from "./acp";
import { ConversationStore } from "./store";
import { initialTransport, normalizeClaude, normalizeCodex } from "./transport";
import type { EventPayload } from "./types";

// Agent-written tool input can hold any character; the store refuses a string with U+0000, and one refused event fails
// the turn's whole write.
const roots: string[] = [];
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
function stored(events: readonly EventPayload[]): EventPayload[] {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-activity-"))); roots.push(root);
  new ConversationStore(root).appendAll("c", "t", events);
  return [...events];
}
const assistant = (name: string, input: Record<string, unknown>) => ({ type: "assistant", message: { id: "m", content: [{ type: "tool_use", id: `call-${name}`, name, input }] } });

it("stores a Claude tool's activity whose summary or path holds U+0000", () => {
  const events = [assistant("Grep", { pattern: "a\0b" }), assistant("Read", { file_path: "/repo/a\0b.html" }), assistant("Edit", { file_path: "/repo/x\0.html" })]
    .flatMap(frame => normalizeClaude(initialTransport(), frame, "/repo").events);
  expect(stored(events)).toEqual([
    { type: "activity", kind: "read", summary: "a<U+0000>b" },
    { type: "activity", kind: "read", summary: "a<U+0000>b.html" },
    { type: "activity", kind: "edit", summary: "x<U+0000>.html", callId: "call-Edit" },
  ]);
});

it("stores a Codex file change's activity whose path holds U+0000", () => {
  const item = { type: "fileChange", id: "f", changes: [{ path: "/repo/a\0.html", kind: { type: "add" }, diff: "" }] };
  const { events } = normalizeCodex(initialTransport(), { method: "item/started", params: { threadId: "s", turnId: "t", item } }, { root: "/repo", sessionId: "s", turnId: "t" });
  expect(stored(events)).toEqual([{ type: "activity", kind: "edit", summary: "a<U+0000>.html", callId: "f" }]);
});

it("stores an ACP tool call's activity whose title or location holds U+0000", () => {
  const update = { sessionUpdate: "tool_call", toolCallId: "call", kind: "edit", status: "completed", title: "Edit a\0", locations: [{ path: "/repo/a\0.html" }] };
  const { events } = normalizeAcp(initialAcp("t", true), update, "/repo");
  expect(stored(events)).toEqual([{ type: "activity", kind: "edit", summary: "Edit a<U+0000>", callId: "call" }]);
});
