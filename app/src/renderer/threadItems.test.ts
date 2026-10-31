import { describe, expect, test } from "vitest";
import { anchorParts, rootRelative, scrollFollow, threadItems, type ThreadEvent } from "./threadItems";
import { splitRequest } from "./homeComposer";

const ROOT = "/Users/ada/code/doan";
let seq = 0;
const ev = (turnId: string, payload: Record<string, unknown>): ThreadEvent => ({ v: 1, conversationId: "c1", seq: ++seq, turnId, at: "2026-11-01T00:00:00Z", ...payload } as ThreadEvent);
const turn = (id: string, text = "Draw it", extra: Record<string, unknown> = {}) => [ev(id, { type: "user.message", text, anchors: [], ...extra }), ev(id, { type: "turn.started" })];

describe("threadItems", () => {
  test("joins deltas by message id and takes message.done's text; keys stay the same as events arrive", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "message.delta", messageId: "m1", text: "Hel" })];
    const first = threadItems(events, ROOT);
    expect(first.map(i => i.key)).toEqual(["u1", "mm1"]);
    expect(first[1]).toMatchObject({ kind: "agent", text: "Hel", streaming: true });
    events.push(ev("t1", { type: "message.delta", messageId: "m1", text: "lo" }));
    expect(threadItems(events, ROOT)[1]).toMatchObject({ key: "mm1", text: "Hello", streaming: true });
    events.push(ev("t1", { type: "message.done", messageId: "m1", text: "Hello." }), ev("t1", { type: "turn.done" }));
    const done = threadItems(events, ROOT);
    expect(done.map(i => i.key)).toEqual(["u1", "mm1"]);
    expect(done[1]).toMatchObject({ text: "Hello.", streaming: false });
  });

  test("a stopped or crash-folded turn keeps the text that arrived and drops the caret", () => {
    seq = 0;
    const stopped = [...turn("t1"), ev("t1", { type: "message.delta", messageId: "m1", text: "I’ll drop the border and" }), ev("t1", { type: "interrupted", reason: "user" })];
    expect(threadItems(stopped, ROOT).slice(1)).toEqual([
      { kind: "agent", key: "mm1", messageId: "m1", text: "I’ll drop the border and", streaming: false },
      { kind: "end", key: "e4", seq: 4, end: { kind: "interrupted", reason: "user" } },
    ]);
    // No end event: the next turn.started folds the previous turn.
    const folded = [...turn("t1"), ev("t1", { type: "message.delta", messageId: "m1", text: "Half" }), ...turn("t2")];
    expect(threadItems(folded, ROOT)[1]).toMatchObject({ streaming: false });
  });

  test("the person's message keeps anchor positions, the preset line and attachments", () => {
    seq = 0;
    const items = threadItems(turn("t1", "Use the Doan design preset `shape` (Shape).\n\nMake {{1}} match {{2}}.", {
      anchors: [{}, {}], attachments: [{ name: "spec.md", size: 6144, kind: "file", path: "/Users/ada/spec.md" }],
    }), ROOT);
    expect(items[0]).toEqual({
      kind: "user", key: "u1", seq: 1, preset: { id: "shape", title: "Shape" },
      parts: [{ text: "Make " }, { anchor: 1 }, { text: " match " }, { anchor: 2 }, { text: "." }],
      attachments: [{ name: "spec.md", size: 6144, kind: "file" }],
    });
  });

  test("an attachment-only request shows no text; the same words typed by the person stay", () => {
    expect(splitRequest("Look at the attached files.", 1)).toEqual({ preset: null, body: "" });
    expect(splitRequest("Look at the attached files.", 0)).toEqual({ preset: null, body: "Look at the attached files." });
    expect(splitRequest("Use the Doan design preset `polish` (Polish (final)).", 0)).toEqual({ preset: { id: "polish", title: "Polish (final)" }, body: "" });
  });

  test("a run of activities folds into one line: the latest while running, N steps once the turn moved on", () => {
    seq = 0;
    const events = [...turn("t1"),
      ev("t1", { type: "activity", kind: "read", path: `${ROOT}/docs/design.md`, summary: "docs/design.md" }),
      ev("t1", { type: "activity", kind: "edit", path: ".doan/canvases/a.html", summary: ".doan/canvases/a.html" })];
    expect(threadItems(events, ROOT)[1]).toEqual({
      kind: "activity", key: "a3", running: true, head: "Editing .doan/canvases/a.html",
      steps: [{ key: "s3", kind: "read", verb: "Read", path: "docs/design.md" }, { key: "s4", kind: "edit", verb: "Edited", path: ".doan/canvases/a.html" }],
    });
    events.push(ev("t1", { type: "message.done", messageId: "m1", text: "Done." }));
    expect(threadItems(events, ROOT)[1]).toMatchObject({ key: "a3", running: false, head: "2 steps" });
    events.push(ev("t1", { type: "activity", kind: "read", path: "x.md", summary: "x.md" }), ev("t1", { type: "turn.done" }));
    const items = threadItems(events, ROOT);
    expect(items.map(i => i.key)).toEqual(["u1", "a3", "mm1", "a6"]);
    expect(items[3]).toMatchObject({ running: false, head: "1 step" });
  });

  test("a command never shows its text: Running a command while it runs, Ran a command after", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "activity", kind: "command", summary: "Running a command" })];
    expect(threadItems(events, ROOT)[1]).toMatchObject({ head: "Running a command", steps: [{ kind: "command", verb: "Running a command", path: null }] });
    events.push(ev("t1", { type: "turn.done" }));
    expect(threadItems(events, ROOT)[1]).toMatchObject({ head: "1 step", steps: [{ kind: "command", verb: "Ran a command", path: null }] });
  });

  test("permission requests: pending, answered with the choice, expired when the turn ends unanswered", () => {
    seq = 0;
    const options = [{ id: "a", label: "Allow once", kind: "allow" }, { id: "d", label: "Deny", kind: "deny" }];
    const events = [...turn("t1"), ev("t1", { type: "permission.request", requestId: "r1", tool: "Bash", summary: "Run doan check", options }),
      ev("t1", { type: "permission.request", requestId: "r2", tool: "Write", summary: "Write a.html", options })];
    expect(threadItems(events, ROOT).slice(1).map(i => i.kind === "permission" && i.status)).toEqual(["pending", "pending"]);
    events.push(ev("t1", { type: "permission.resolved", requestId: "r1", optionId: "a" }), ev("t1", { type: "turn.failed", code: "process_exited" }));
    const items = threadItems(events, ROOT);
    expect(items[1]).toMatchObject({ key: "pr1", status: "answered", answer: { id: "a", label: "Allow once", kind: "allow" } });
    expect(items[2]).toMatchObject({ key: "pr2", status: "expired", answer: null });
    expect(items[3]).toEqual({ kind: "end", key: "e6", seq: 6, end: { kind: "failed", code: "process_exited" } });
  });

  test("a finished turn without any reply says so; nothing after a turn's end counts", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "activity", kind: "command", summary: "Running a command" }), ev("t1", { type: "turn.done" }),
      ev("t1", { type: "message.delta", messageId: "late", text: "late" })];
    expect(threadItems(events, ROOT).map(i => i.kind)).toEqual(["user", "activity", "noReply"]);
  });

  test("promotion, archive and restore markers", () => {
    seq = 0;
    const events: ThreadEvent[] = [...turn("t1"), ev("t1", { type: "turn.done" }),
      ev("t1", { type: "conversation.bound", canvas: { path: ".doan/canvases/s.html", id: "s" } }),
      ev("t1", { type: "conversation.archived" }), ev("t1", { type: "conversation.restored" })];
    expect(threadItems(events, ROOT).filter(i => i.kind === "marker")).toEqual([
      { kind: "marker", key: "k4", seq: 4, marker: "bound", canvas: { path: ".doan/canvases/s.html", id: "s" } },
      { kind: "marker", key: "k5", seq: 5, marker: "archived", canvas: null },
      { kind: "marker", key: "k6", seq: 6, marker: "restored", canvas: null },
    ]);
  });
});

describe("anchorParts and rootRelative", () => {
  test("anchors split the text in place; plain braces stay text", () => {
    expect(anchorParts("{{1}}")).toEqual([{ anchor: 1 }]);
    expect(anchorParts("a {b} {{0}} c")).toEqual([{ text: "a {b} {{0}} c" }]);
    expect(anchorParts("")).toEqual([]);
  });
  test("paths read root-relative; ./ and .. resolve; /tmp is /private/tmp; outside paths stay absolute", () => {
    expect(rootRelative(`${ROOT}/a/b.html`, ROOT)).toBe("a/b.html");
    expect(rootRelative("./a/../b.html", ROOT)).toBe("b.html");
    expect(rootRelative("/tmp/x/a.html", "/private/tmp/x")).toBe("a.html");
    expect(rootRelative("/private/tmp/x/a.html", "/tmp/x")).toBe("a.html");
    expect(rootRelative("../other/a.html", ROOT)).toBe("/Users/ada/code/other/a.html");
    expect(rootRelative("/Users/ada/code/doan-worktree/a.html", ROOT)).toBe("/Users/ada/code/doan-worktree/a.html");
  });
});

describe("scrollFollow", () => {
  test("opens at the bottom, follows within 24px only", () => {
    expect(scrollFollow(true, 500)).toBe(true);
    expect(scrollFollow(false, 0)).toBe(true);
    expect(scrollFollow(false, 24)).toBe(true);
    expect(scrollFollow(false, 25)).toBe(false);
  });
});
