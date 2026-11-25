import { describe, expect, test } from "vitest";
import type { ConversationEvent } from "../main/conversation/types";
import { anchorParts, fastUnusedText, pendingAsks, questionLines, rootRelative, sameItem, scrollFollow, threadItems, withSending, type ThreadItem } from "./threadItems";
import { splitRequest } from "./homeComposer";
import { FOLDER_ATTACHMENT, LEGACY_ATTACHMENTS } from "../main/conversation/attachmentRecords.fixture";
import { notReadyLine, waitingLine } from "../main/conversation/mcpStartup";
import { parseConnectorUrl } from "../main/mcpConnectors/names";
import { connectorLabel } from "../main/mcpConnectors/presets";

const ROOT = "/Users/ada/code/doan";
let seq = 0;
const ev = (turnId: string, payload: Record<string, unknown>): ConversationEvent => ({ v: 1, conversationId: "c1", seq: ++seq, turnId, at: "2026-11-01T00:00:00Z", ...payload } as ConversationEvent);
const turn = (id: string, text = "Draw it", extra: Record<string, unknown> = {}) => [ev(id, { type: "user.message", text, anchors: [], ...extra }), ev(id, { type: "turn.started" })];

describe("threadItems", () => {
  test("joins deltas by message id and takes message.done's text; keys stay the same as events arrive", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "message.delta", messageId: "m1", text: "Hel" })];
    const first = threadItems(events, ROOT, true);
    expect(first.map(i => i.key)).toEqual(["u1", "mt1:m1"]);
    expect(first[1]).toMatchObject({ kind: "agent", text: "Hel", streaming: true });
    events.push(ev("t1", { type: "message.delta", messageId: "m1", text: "lo" }));
    expect(threadItems(events, ROOT, true)[1]).toMatchObject({ key: "mt1:m1", text: "Hello", streaming: true });
    events.push(ev("t1", { type: "message.done", messageId: "m1", text: "Hello." }), ev("t1", { type: "turn.done" }));
    const done = threadItems(events, ROOT, true);
    expect(done.map(i => i.key)).toEqual(["u1", "mt1:m1"]);
    expect(done[1]).toMatchObject({ text: "Hello.", streaming: false });
  });

  test("a stopped or crash-folded turn keeps the text that arrived and drops the caret", () => {
    seq = 0;
    const stopped = [...turn("t1"), ev("t1", { type: "message.delta", messageId: "m1", text: "I’ll drop the border and" }), ev("t1", { type: "interrupted", reason: "user" })];
    expect(threadItems(stopped, ROOT, true).slice(1)).toEqual([
      { kind: "agent", key: "mt1:m1", messageId: "m1", text: "I’ll drop the border and", streaming: false },
      { kind: "end", key: "e4", seq: 4, end: { kind: "interrupted", reason: "user" } },
    ]);
  });

  test("a crash-folded last turn ends as stopped before it finished once main holds no live turn", () => {
    seq = 0;
    const options = [{ id: "a", label: "Allow once", kind: "allow" }];
    const events = [...turn("t1"), ev("t1", { type: "message.delta", messageId: "m1", text: "Half" }),
      ev("t1", { type: "activity", kind: "command", summary: "Running a command" }),
      ev("t1", { type: "permission.request", requestId: "r1", tool: "Bash", summary: "Run doan check", options })];
    // While main still holds the turn, it runs.
    const live = threadItems(events, ROOT, true);
    expect(live.map(i => i.kind === "agent" ? i.streaming : i.kind === "permission" ? i.status : i.kind)).toEqual(["user", true, "activity", "pending"]);
    const crashed = threadItems(events, ROOT, false);
    expect(crashed.slice(1)).toEqual([
      { kind: "agent", key: "mt1:m1", messageId: "m1", text: "Half", streaming: false },
      { kind: "activity", key: "a4", running: false, head: "1 step", steps: [{ key: "s4", kind: "command", verb: "Ran a command", path: null }] },
      { kind: "permission", key: "pr1", seq: 5, requestId: "r1", summary: "Run doan check", options, status: "expired", answer: null },
      { kind: "end", key: "xt1", seq: null, end: { kind: "interrupted", reason: "crashed" } },
    ]);
  });

  test("a turn folded by the next turn.started gets the same end, keyed by its turn so the key never moves", () => {
    seq = 0;
    const first = [...turn("t1"), ev("t1", { type: "message.delta", messageId: "m1", text: "Half" })];
    const lastCrashed = threadItems(first, ROOT, false);
    const folded = threadItems([...first, ...turn("t2")], ROOT, true);
    expect(folded[1]).toMatchObject({ streaming: false });
    expect(folded[2]).toEqual({ kind: "end", key: "xt1", seq: null, end: { kind: "interrupted", reason: "crashed" } });
    expect(lastCrashed.at(-1)?.key).toBe("xt1");
    // A finished turn adds nothing, live or not.
    seq = 0;
    expect(threadItems([...turn("t1"), ev("t1", { type: "message.done", messageId: "m1", text: "Done." }), ev("t1", { type: "turn.done" })], ROOT, false).map(i => i.kind)).toEqual(["user", "agent"]);
  });

  test("message keys include the turn, so a reused message id starts a new message; deltas after message.done are ignored", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "message.done", messageId: "assistant", text: "One." }), ev("t1", { type: "message.delta", messageId: "assistant", text: " late" }), ev("t1", { type: "turn.done" }),
      ...turn("t2"), ev("t2", { type: "message.delta", messageId: "assistant", text: "Two" })];
    const items = threadItems(events, ROOT, true);
    expect(items.filter(i => i.kind === "agent")).toEqual([
      { kind: "agent", key: "mt1:assistant", messageId: "assistant", text: "One.", streaming: false },
      { kind: "agent", key: "mt2:assistant", messageId: "assistant", text: "Two", streaming: true },
    ]);
  });

  test("the person's message keeps anchor positions, its anchors, the preset line and attachments", () => {
    seq = 0;
    const anchors = [{ frame: { id: "cart" } }, { element: { selector: "#pay", tag: "button" } }];
    const items = threadItems(turn("t1", "Use the Doan design preset `shape` (Shape).\n\nMake {{1}} match {{2}}.", {
      anchors, attachments: [{ name: "spec.md", size: 6144, kind: "file", path: "/Users/ada/spec.md" }],
    }), ROOT, true);
    expect(items[0]).toEqual({
      kind: "user", key: "u1", seq: 1, preset: { id: "shape", title: "Shape" }, anchors,
      parts: [{ text: "Make " }, { anchor: 1 }, { text: " match " }, { anchor: 2 }, { text: "." }],
      attachments: [{ name: "spec.md", size: 6144, kind: "file", path: "/Users/ada/spec.md" }],
    });
  });

  test("a sent folder stays a folder with its path and no size, beside earlier records", () => {
    seq = 0;
    const items = threadItems(turn("t1", "Look at the attached files.", { attachments: [...LEGACY_ATTACHMENTS, FOLDER_ATTACHMENT] }), ROOT, true);
    expect(items[0]).toMatchObject({ kind: "user", attachments: [
      { name: "shot.png", size: 2048, kind: "image", path: "/Users/me/Desktop/shot.png" },
      { name: "notes.md", size: 0, kind: "file", path: "/tmp/notes.md" },
      { name: "references", kind: "directory", path: "/Users/me/Projects/Atlas/references" },
    ] });
    expect((items[0] as { attachments: object[] }).attachments[2]).not.toHaveProperty("size");
  });

  test("an attachment-only request shows no text; the same words typed by the person stay", () => {
    expect(splitRequest("Look at the attached files.", 1)).toEqual({ preset: null, skills: [], body: "" });
    expect(splitRequest("Look at the attached files.", 0)).toEqual({ preset: null, skills: [], body: "Look at the attached files." });
    expect(splitRequest("Use the Doan design preset `polish` (Polish (final)).", 0)).toEqual({ preset: { id: "polish", title: "Polish (final)" }, skills: [], body: "" });
  });

  // Whether the last row runs, and with which words, is the indicator's (turnStatus activityRun); threadItems counts steps.
  test("a run of activities folds into one line of its step count, also while it is the turn's last item", () => {
    seq = 0;
    const events = [...turn("t1"),
      ev("t1", { type: "activity", kind: "read", path: `${ROOT}/docs/design.md`, summary: "docs/design.md" }),
      ev("t1", { type: "activity", kind: "edit", path: ".doan/canvases/a.html", summary: ".doan/canvases/a.html" })];
    expect(threadItems(events, ROOT, true)[1]).toEqual({
      kind: "activity", key: "a3", running: false, head: "2 steps",
      steps: [{ key: "s3", kind: "read", verb: "Read", path: "docs/design.md" }, { key: "s4", kind: "edit", verb: "Edited", path: ".doan/canvases/a.html" }],
    });
    events.push(ev("t1", { type: "message.done", messageId: "m1", text: "Done." }));
    expect(threadItems(events, ROOT, true)[1]).toMatchObject({ key: "a3", running: false, head: "2 steps" });
    events.push(ev("t1", { type: "activity", kind: "read", path: "x.md", summary: "x.md" }), ev("t1", { type: "turn.done" }));
    const items = threadItems(events, ROOT, true);
    expect(items.map(i => i.key)).toEqual(["u1", "a3", "mt1:m1", "a6"]);
    expect(items[3]).toMatchObject({ running: false, head: "1 step" });
  });

  test("a command never shows its text: its step is Ran a command", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "activity", kind: "command", summary: "Running a command" })];
    expect(threadItems(events, ROOT, true)[1]).toMatchObject({ head: "1 step", steps: [{ kind: "command", verb: "Ran a command", path: null }] });
    events.push(ev("t1", { type: "turn.done" }));
    expect(threadItems(events, ROOT, true)[1]).toMatchObject({ head: "1 step", steps: [{ kind: "command", verb: "Ran a command", path: null }] });
  });

  test("permission requests: pending, answered with the choice, expired when the turn ends unanswered", () => {
    seq = 0;
    const options = [{ id: "a", label: "Allow once", kind: "allow" }, { id: "d", label: "Deny", kind: "deny" }];
    const events = [...turn("t1"), ev("t1", { type: "permission.request", requestId: "r1", tool: "Bash", summary: "Run doan check", options }),
      ev("t1", { type: "permission.request", requestId: "r2", tool: "Write", summary: "Write a.html", options })];
    expect(threadItems(events, ROOT, true).slice(1).map(i => i.kind === "permission" && i.status)).toEqual(["pending", "pending"]);
    events.push(ev("t1", { type: "permission.resolved", requestId: "r1", optionId: "a" }), ev("t1", { type: "turn.failed", code: "process_exited" }));
    const items = threadItems(events, ROOT, true);
    expect(items[1]).toMatchObject({ key: "pr1", status: "answered", answer: { id: "a", label: "Allow once", kind: "allow" } });
    expect(items[2]).toMatchObject({ key: "pr2", status: "expired", answer: null });
    expect(items[3]).toEqual({ kind: "end", key: "e6", seq: 6, end: { kind: "failed", code: "process_exited" } });
  });

  // The end view reads a usage limit's reset time from the provider's wording; no other end needs the detail.
  test("a usage limit's end keeps the failure detail; other ends do not", () => {
    seq = 0;
    const limited = threadItems([...turn("t1"), ev("t1", { type: "turn.failed", code: "rate_limited", detail: "You've hit your weekly limit · resets Nov 11 at 2pm (Asia/Seoul)" })], ROOT, true);
    expect(limited.at(-1)).toMatchObject({ kind: "end", end: { kind: "failed", code: "rate_limited", detail: "You've hit your weekly limit · resets Nov 11 at 2pm (Asia/Seoul)" } });
    seq = 0;
    const exited = threadItems([...turn("t1"), ev("t1", { type: "turn.failed", code: "process_exited", detail: "boom" })], ROOT, true);
    expect(exited.at(-1)).toEqual({ kind: "end", key: "e3", seq: 3, end: { kind: "failed", code: "process_exited" } });
  });

  // A Stop's expiry is main's `optionId: "expired"` record, not an answer.
  test("a permission request carries the agent's reason and each choice's detail", () => {
    seq = 0;
    const options = [{ id: "always", label: "Allow with proposed command rule", kind: "allowAlways", detail: "Adds a rule that runs commands starting with “npm test” without asking." }];
    const items = threadItems([...turn("t1"), ev("t1", { type: "permission.request", requestId: "r1", tool: "commandExecution", summary: "npm test", reason: "Run the tests", options })], ROOT, true);
    expect(items[1]).toMatchObject({ kind: "permission", summary: "npm test", reason: "Run the tests", options });
    seq = 0;
    const plain = threadItems([...turn("t1"), ev("t1", { type: "permission.request", requestId: "r1", tool: "Bash", summary: "ls", options })], ROOT, true);
    expect(plain[1]).not.toHaveProperty("reason");
  });

  test("a permission request main expires folds as expired, not answered", () => {
    seq = 0;
    const options = [{ id: "a", label: "Allow once", kind: "allow" }, { id: "d", label: "Deny", kind: "deny" }];
    const events = [...turn("t1"), ev("t1", { type: "permission.request", requestId: "r1", tool: "mcp", summary: "Run search on Linear", options }),
      ev("t1", { type: "permission.resolved", requestId: "r1", optionId: "expired" }), ev("t1", { type: "interrupted", reason: "user" })];
    expect(threadItems(events, ROOT, true)[1]).toMatchObject({ key: "pr1", status: "expired", answer: null });
  });

  test("a finished turn without any reply says so; nothing after a turn's end counts", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "activity", kind: "command", summary: "Running a command" }), ev("t1", { type: "turn.done" }),
      ev("t1", { type: "message.delta", messageId: "late", text: "late" })];
    expect(threadItems(events, ROOT, true).map(i => i.kind)).toEqual(["user", "activity", "noReply"]);
  });

  // Conversations are not archived; an earlier build's archive and restore lines draw nothing.
  test("a promotion marker, and nothing for an earlier build's archive and restore lines", () => {
    seq = 0;
    const events: ConversationEvent[] = [...turn("t1"), ev("t1", { type: "turn.done" }),
      ev("t1", { type: "conversation.bound", canvas: { path: ".doan/canvases/s.html", id: "s" } }),
      ev("t1", { type: "conversation.archived" }), ev("t1", { type: "conversation.restored" })];
    const items = threadItems(events, ROOT, true);
    expect(items.filter(i => i.kind === "marker")).toEqual([
      { kind: "marker", key: "k4", seq: 4, marker: "bound", canvas: { path: ".doan/canvases/s.html", id: "s" } },
    ]);
    expect(items.map(i => i.kind)).toEqual(["user", "noReply", "marker"]);
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

describe("threadItems with a message pushed into a running turn", () => {
  test("shows both user messages in order inside the one turn, without a crash fold", () => {
    seq = 0;
    const events = [...turn("t1", "first"), ev("t1", { type: "message.delta", messageId: "m1", text: "Working" }), ev("t1", { type: "user.message", text: "pushed in", anchors: [] }), ev("t1", { type: "message.done", messageId: "m1", text: "Both." }), ev("t1", { type: "turn.done" })];
    const items = threadItems(events, ROOT, true);
    expect(items.map(i => i.kind)).toEqual(["user", "agent", "user"]);
    expect(items.filter(i => i.kind === "user")).toHaveLength(2);
    expect(items.some(i => i.kind === "end" && i.end.kind === "interrupted")).toBe(false);
    expect(items.filter(i => i.kind === "agent")).toHaveLength(1);
  });
  test("a reply after the pushed message has a new messageId and lands after it", () => {
    seq = 0;
    const events = [...turn("t1", "first"), ev("t1", { type: "message.done", messageId: "m1", text: "Working" }), ev("t1", { type: "user.message", text: "pushed in", anchors: [] }), ev("t1", { type: "message.done", messageId: "m2", text: "Adjusted." }), ev("t1", { type: "turn.done" })];
    expect(threadItems(events, ROOT, true).map(i => i.kind)).toEqual(["user", "agent", "user", "agent"]);
  });
});

// Main writes "Waiting for <X>" then "<X> wasn't ready…" as two activities (append-only history,
// mcpStartup.ts); the thread shows one step.
describe("threadItems with a Codex MCP server that was not ready", () => {
  const waiting = (text: string) => ev("t1", { type: "activity", kind: "other", summary: text });

  // activityRun gives a running turn's last row its Waiting line as the head.
  test("the Waiting line is a sentence step", () => {
    seq = 0;
    const items = threadItems([...turn("t1"), waiting("Waiting for Notion")], ROOT, true);
    expect(items[1]).toEqual({ kind: "activity", key: "a3", running: false, head: "1 step", steps: [{ key: "s3", kind: "other", verb: "Waiting for Notion", path: null, sentence: true }] });
  });

  test("the not-ready line replaces its Waiting line: one step with the second text", () => {
    seq = 0;
    const events = [...turn("t1"), waiting("Waiting for Notion"), waiting("Notion wasn’t ready, so this turn started without it."),
      ev("t1", { type: "message.done", messageId: "m1", text: "I couldn’t reach Notion." }), ev("t1", { type: "turn.done" })];
    const items = threadItems(events, ROOT, true);
    expect(items[1]).toEqual({ kind: "activity", key: "a3", running: false, head: "1 step",
      steps: [{ key: "s4", kind: "other", verb: "Notion wasn’t ready, so this turn started without it.", path: null, sentence: true }] });
  });

  test("the plural lines fold the same way, also when fewer servers were not ready than were waited for", () => {
    seq = 0;
    const plural = threadItems([...turn("t1"), waiting("Waiting for Notion and Figma"), waiting("Notion and Figma weren’t ready, so this turn started without them.")], ROOT, true);
    expect(plural[1]).toMatchObject({ head: "1 step", steps: [{ verb: "Notion and Figma weren’t ready, so this turn started without them.", sentence: true }] });
    seq = 0;
    const fewer = threadItems([...turn("t1"), waiting("Waiting for Notion, Atlassian and Figma"), waiting("Figma wasn’t ready, so this turn started without it.")], ROOT, true);
    expect((fewer[1] as { steps: unknown[] }).steps).toHaveLength(1);
  });

  test("a Waiting line whose servers became ready stays a step; an agent's own 'other' activity is not folded or wrapped", () => {
    seq = 0;
    const events = [...turn("t1"), waiting("Waiting for Notion"), ev("t1", { type: "activity", kind: "read", path: `${ROOT}/a.html`, summary: "Read" }),
      waiting("Waiting for the review"), waiting("Searching the web")];
    const items = threadItems(events, ROOT, true);
    expect((items[1] as { steps: { verb: string; sentence?: true }[] }).steps.map(step => [step.verb, step.sentence ?? false])).toEqual([
      ["Waiting for Notion", true], ["Read", false], ["Waiting for the review", false], ["Searching the web", false]]);
  });

  // Only the Waiting line for the same MCP servers is replaced.
  test("an unrelated Waiting line and a Waiting line for other servers stay beside the not-ready line", () => {
    const steps = (first: string) => { seq = 0; return (threadItems([...turn("t1"), waiting(first), waiting("Notion wasn’t ready, so this turn started without it.")], ROOT, true)[1] as { steps: { verb: string }[] }).steps.map(step => step.verb); };
    expect(steps("Waiting for review")).toEqual(["Waiting for review", "Notion wasn’t ready, so this turn started without it."]);
    expect(steps("Waiting for Figma")).toEqual(["Waiting for Figma", "Notion wasn’t ready, so this turn started without it."]);
    expect(steps("Waiting for mcp.example.com and Notion")).toEqual(["Notion wasn’t ready, so this turn started without it."]);
  });

  // Main bounds both lines at 512 characters, cutting the
  // server list; the cut item still matches the server it begins, every complete item must match exactly.
  const longHosts = (letters: string[]) => letters.map(c => `${c.repeat(60)}.${c.repeat(60)}.${c.repeat(60)}.example.com`);
  const bounded = (hosts: string[], offset = 0) => {
    const names = hosts.map((_, i) => `doan-${i + offset}`);
    const labels = Object.fromEntries(hosts.map((host, i) => { const url = `https://${host}/mcp`; expect(parseConnectorUrl(url).ok).toBe(true); return [names[i], connectorLabel({ name: names[i]!, url })]; }));
    return { names, labels };
  };
  test("long server lists that main cut at its bound still fold for the same servers", () => {
    const { names, labels } = bounded(longHosts(["a", "b", "c"]));
    const lines = [waitingLine(names, labels), notReadyLine(names, labels)];
    expect(lines.map(line => line.length)).toEqual([512, 512]);
    seq = 0;
    const steps = (threadItems([...turn("t1"), ...lines.map(waiting)], ROOT, true)[1] as { steps: { verb: string; sentence?: true }[] }).steps;
    expect(steps.map(step => [step.verb, step.sentence])).toEqual([[lines[1], true]]);
  });

  test("a cut list for other servers, or whose cut item begins no waited-for server, does not fold", () => {
    const waited = bounded(longHosts(["a", "b", "c"])), other = bounded(longHosts(["d", "e", "f"]), 3);
    const fold = (lines: string[]) => { seq = 0; return (threadItems([...turn("t1"), ...lines.map(waiting)], ROOT, true)[1] as { steps: unknown[] }).steps.length; };
    expect(fold([waitingLine(waited.names, waited.labels), notReadyLine(other.names, other.labels)])).toBe(2);
    // The same first two servers, then a different third that main cut: the cut item matches nothing waited for.
    const mixed = bounded([...longHosts(["a", "b"]), ...longHosts(["z"])], 0);
    expect(notReadyLine(mixed.names, mixed.labels).length).toBe(512);
    expect(fold([waitingLine(waited.names, waited.labels), notReadyLine(mixed.names, mixed.labels)])).toBe(2);
    // A short Waiting line is complete: a not-ready line cut inside a server it never named does not fold.
    expect(fold([waitingLine(waited.names.slice(0, 2), waited.labels), notReadyLine(waited.names, waited.labels)])).toBe(2);
    // An agent's own Waiting line of the same length is no startup line.
    seq = 0;
    const own = `Waiting for ${"the review of the checkout flow ".repeat(20)}`.slice(0, 512);
    expect((threadItems([...turn("t1"), waiting(own)], ROOT, true)[1] as { steps: { sentence?: true }[] }).steps[0]!.sentence).toBeUndefined();
  });

  // Servers are named by main's label contract, so every URL
  // Doan accepts folds its own startup lines, written by main's own functions.
  test.each(["https://localhost/mcp", "https://[2001:db8::1]/mcp", "https://mcp.example.com./mcp", "https://mcp.example.com:8443/mcp", "https://intranet/mcp"])("a server added as %s folds its own lines", url => {
    expect(parseConnectorUrl(url).ok).toBe(true);
    const labels = { "doan-x": connectorLabel({ name: "doan-x", url }), "doan-notion": "Notion" };
    seq = 0;
    const steps = (lines: string[]) => (threadItems([...turn("t1"), ...lines.map(waiting)], ROOT, true)[1] as { steps: { verb: string; sentence?: true }[] }).steps;
    const folded = steps([waitingLine(["doan-x"], labels), notReadyLine(["doan-x"], labels)]);
    expect(folded.map(step => [step.verb, step.sentence])).toEqual([[notReadyLine(["doan-x"], labels), true]]);
    seq = 0;
    expect(steps([waitingLine(["doan-x", "doan-notion"], labels), notReadyLine(["doan-x"], labels)])).toHaveLength(1);
    // Another server's not-ready line still leaves this Waiting line alone.
    seq = 0;
    expect(steps([waitingLine(["doan-x"], labels), notReadyLine(["doan-notion"], labels)])).toHaveLength(2);
  });
});

describe("withSending", () => {
  const CTA = { element: { doanId: "hero-cta", selector: "[data-doan-id=\"hero-cta\"]" } };
  const sending = [
    { id: "q1", text: "Use the Doan design preset `shape` (Shape a feature).\n\nUse the spacing from {{1}}", anchors: [CTA], attachments: [{ name: "notes.pdf", size: 86016, kind: "file" as const, path: "/Users/ada/notes.pdf" }] },
    { id: "q2", text: "Also this", anchors: [], attachments: [] },
  ];

  test("follow the history in press order, with their preset, chips and files, marked sending", () => {
    seq = 0;
    const items = withSending(threadItems(turn("t1"), ROOT, true), sending);
    expect(items.map(item => item.key)).toEqual(["u1", "qq1", "qq2"]);
    expect(items[1]).toEqual({ kind: "user", key: "qq1", seq: null, sending: true, parts: [{ text: "Use the spacing from " }, { anchor: 1 }], anchors: [CTA],
      preset: splitRequest(sending[0]!.text, 1).preset, attachments: [{ name: "notes.pdf", size: 86016, kind: "file", path: "/Users/ada/notes.pdf" }] });
    expect(items[2]).toMatchObject({ kind: "user", sending: true, parts: [{ text: "Also this" }], preset: null, attachments: [] });
  });

  test("sit right above an open permission request, which stays last; an answered one does not hold them", () => {
    seq = 0;
    const options = [{ id: "a", label: "Allow once", kind: "allow" }];
    const events = [...turn("t1"), ev("t1", { type: "activity", kind: "read", summary: "Read", path: "a.html" }),
      ev("t1", { type: "permission.request", requestId: "r1", tool: "Bash", summary: "Run doan check", options })];
    expect(withSending(threadItems(events, ROOT, true), sending).map(item => item.key)).toEqual(["u1", "a3", "qq1", "qq2", "pr1"]);
    events.push(ev("t1", { type: "permission.resolved", requestId: "r1", optionId: "a" }));
    expect(withSending(threadItems(events, ROOT, true), sending).map(item => item.key)).toEqual(["u1", "a3", "pr1", "qq1", "qq2"]);
  });

  test("nothing sending leaves the items as they are", () => {
    seq = 0;
    const items: ThreadItem[] = threadItems(turn("t1"), ROOT, true);
    expect(withSending(items, [])).toBe(items);
  });
});

describe("questions", () => {
  const layout = { id: "0", header: "Layout", question: "Which layout should the settings header use?", options: [{ label: "Compact", description: "One line" }, { label: "Two rows" }], multiSelect: false, other: true };
  const sections = { id: "1", header: "Sections", question: "Which sections should the Settings page keep?", options: [{ label: "Agents" }, { label: "Notifications" }], multiSelect: true, other: true };
  const token = { id: "t", header: "Staging token", question: "Paste the token", options: [], multiSelect: false, other: true, secret: true };
  // Antigravity's questions have no header.
  const bare = { id: "0", header: "", question: "Which colour?", options: [{ label: "Red" }, { label: "Blue" }], multiSelect: false, other: false };
  const sending = [{ id: "q1", text: "Also this", anchors: [], attachments: [] }, { id: "q2", text: "And this", anchors: [], attachments: [] }];

  test("pending, then answered or skipped with what came back; a turn's end expires the rest", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "question.request", requestId: "q1", questions: [layout, sections] }),
      ev("t1", { type: "question.request", requestId: "q2", questions: [layout] }), ev("t1", { type: "question.request", requestId: "q3", questions: [token] })];
    expect(threadItems(events, ROOT, true).slice(1)).toEqual([
      { kind: "question", key: "Qq1", seq: 3, requestId: "q1", questions: [layout, sections], status: "pending", answers: null },
      { kind: "question", key: "Qq2", seq: 4, requestId: "q2", questions: [layout], status: "pending", answers: null },
      { kind: "question", key: "Qq3", seq: 5, requestId: "q3", questions: [token], status: "pending", answers: null },
    ]);
    const answers = { "0": { selected: ["Two rows"] }, "1": { selected: ["Agents", "Notifications"], other: "Keyboard shortcuts" } };
    events.push(ev("t1", { type: "question.resolved", requestId: "q1", outcome: "answered", answers }), ev("t1", { type: "question.resolved", requestId: "q2", outcome: "skipped" }));
    // A permission.resolved never settles a question that shares its id (main's fold keys them apart).
    events.push(ev("t1", { type: "permission.resolved", requestId: "q3", optionId: "a" }));
    const items = threadItems(events, ROOT, true);
    expect(items.slice(1).map(item => item.kind === "question" && [item.status, item.answers])).toEqual([["answered", answers], ["skipped", null], ["pending", null]]);
    events.push(ev("t1", { type: "interrupted", reason: "user" }));
    expect(threadItems(events, ROOT, true)[3]).toMatchObject({ key: "Qq3", status: "expired", answers: null });
  });

  test("a reload while main holds the turn keeps the card; a crash-folded turn expires it", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "question.request", requestId: "q1", questions: [layout] })];
    expect(threadItems(events, ROOT, true)[1]).toMatchObject({ status: "pending" });
    const crashed = threadItems(events, ROOT, false);
    expect(crashed[1]).toMatchObject({ status: "expired" });
    expect(crashed[2]).toEqual({ kind: "end", key: "xt1", seq: null, end: { kind: "interrupted", reason: "crashed" } });
    // A folded turn followed by a new one: the old question expires too.
    expect(threadItems([...events, ...turn("t2")], ROOT, true)[1]).toMatchObject({ status: "expired" });
  });

  test("folded lines: one per answered question, one per skipped or expired request; a secret answer shows its header alone", () => {
    const item = (status: "answered" | "skipped" | "expired", questions: object[], answers: Record<string, { selected: string[]; other?: string }> | null = null) =>
      ({ kind: "question", key: "Qq", seq: 1, requestId: "q", questions, status, answers }) as Extract<ThreadItem, { kind: "question" }>;
    expect(questionLines(item("answered", [layout, sections, token], { "0": { selected: ["Two rows"] }, "1": { selected: ["Agents", "Notifications"], other: "Keyboard shortcuts" } }))).toEqual([
      "Answered · Layout: Two rows", "Answered · Sections: Agents, Notifications, Keyboard shortcuts", "Answered · Staging token",
    ]);
    expect(questionLines(item("skipped", [layout, sections]))).toEqual(["Skipped · Layout, Sections"]);
    expect(questionLines(item("expired", [layout]))).toEqual(["Expired without an answer · Layout"]);
  });

  test("a question without a header names itself by its sentence on the folded line", () => {
    const item = (status: "answered" | "skipped" | "expired", answers: Record<string, { selected: string[] }> | null = null) =>
      ({ kind: "question", key: "Qq", seq: 1, requestId: "q", questions: [bare], status, answers }) as Extract<ThreadItem, { kind: "question" }>;
    expect(questionLines(item("answered", { "0": { selected: ["Red"] } }))).toEqual(["Answered · Which colour?: Red"]);
    expect(questionLines(item("skipped"))).toEqual(["Skipped · Which colour?"]);
    expect(questionLines(item("expired"))).toEqual(["Expired without an answer · Which colour?"]);
  });

  test("messages Send now has in flight sit above the first open request, a question as a permission", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "question.request", requestId: "q1", questions: [layout] })];
    expect(withSending(threadItems(events, ROOT, true), sending).map(item => item.key)).toEqual(["u1", "qq1", "qq2", "Qq1"]);
  });

  test("pendingAsks lists the open permission requests and questions in arrival order", () => {
    seq = 0;
    const options = [{ id: "a", label: "Allow once", kind: "allow" }];
    const events = [...turn("t1"), ev("t1", { type: "permission.request", requestId: "p1", tool: "Bash", summary: "Run", options }),
      ev("t1", { type: "question.request", requestId: "q1", questions: [layout] }), ev("t1", { type: "permission.request", requestId: "p2", tool: "Bash", summary: "Run", options })];
    expect(pendingAsks(threadItems(events, ROOT, true))).toEqual([{ requestId: "p1", key: "pp1" }, { requestId: "q1", key: "Qq1" }, { requestId: "p2", key: "pp2" }]);
    events.push(ev("t1", { type: "permission.resolved", requestId: "p1", optionId: "a" }));
    expect(pendingAsks(threadItems(events, ROOT, true)).map(ask => ask.requestId)).toEqual(["q1", "p2"]);
  });

  // A new Codex app-server numbers its requests from 0 again, so a history can hold one id in two turns.
  test("two turns' permission requests that share an id draw as two cards, each settled by its own turn", () => {
    seq = 0;
    const options = [{ id: "a", label: "Allow once", kind: "allow" }];
    const request = (turnId: string, summary: string) => ev(turnId, { type: "permission.request", requestId: "number:0", tool: "commandExecution", summary, options });
    const events = [...turn("t1"), request("t1", "ls"), ev("t1", { type: "permission.resolved", requestId: "number:0", optionId: "a" }), ev("t1", { type: "turn.done" }),
      ...turn("t2", "Again"), request("t2", "npm test")];
    const items = threadItems(events, ROOT, true).filter(item => item.kind === "permission");
    expect(items).toMatchObject([{ key: "pt1:number:0", summary: "ls", status: "answered" }, { key: "pt2:number:0", summary: "npm test", status: "pending" }]);
    expect(pendingAsks(threadItems(events, ROOT, true))).toEqual([{ requestId: "number:0", key: "pt2:number:0" }]);
    events.push(ev("t2", { type: "permission.resolved", requestId: "number:0", optionId: "expired" }));
    expect(threadItems(events, ROOT, true).filter(item => item.kind === "permission")).toMatchObject([{ status: "answered" }, { status: "expired" }]);
  });
});

// One card per path at the turn's end, in first-appearance order. The receiving conversation's first
// message is the handoff card, never read for {{n}} markers.
describe("threadItems canvas cards", () => {
  const CHECKOUT = ".doan/canvases/checkout-flow.html", PAYMENT = ".doan/canvases/payment.html", RECEIPT = ".doan/canvases/receipt.html";
  const drew = (turnId: string, path: string, id?: string) => ev(turnId, { type: "canvas.drawn", canvas: id ? { path, id } : { path } });
  const ask = (turnId: string, path: string) => ev(turnId, { type: "handoff.requested", canvas: { path }, text: `Continue ${path}.` });
  const resolve = (turnId: string, payload: Record<string, unknown>) => ev(turnId, { type: "handoff.resolved", ...payload });
  const edit = (turnId: string, path: string) => ev(turnId, { type: "activity", kind: "edit", path, summary: "Edit" });
  const reply = (turnId: string) => ev(turnId, { type: "message.done", messageId: "m1", text: "I made it." });
  const cards = (items: ThreadItem[]) => items.filter(i => i.kind === "canvasCard");
  const options = [{ id: "a", label: "Allow once", kind: "allow" }];

  test("a drawn canvas is a card at the turn's end, Drawing while the turn runs and Drawn once it ended", () => {
    seq = 0;
    const events = [...turn("t1"), edit("t1", CHECKOUT), drew("t1", CHECKOUT, "checkout"), reply("t1")];
    const running = threadItems(events, ROOT, true);
    expect(running.map(i => i.kind)).toEqual(["user", "activity", "agent", "canvasCard"]);
    expect(running[3]).toEqual({ kind: "canvasCard", key: `ct1:${CHECKOUT}`, canvas: { path: CHECKOUT, id: "checkout" }, drawing: true, drawn: true });
    events.push(ev("t1", { type: "turn.done" }));
    expect(threadItems(events, ROOT, true)[3]).toEqual({ kind: "canvasCard", key: `ct1:${CHECKOUT}`, canvas: { path: CHECKOUT, id: "checkout" }, drawing: false, drawn: true });
  });

  test("N canvases are N cards in the order each first appeared, whichever event named it first", () => {
    seq = 0;
    const events = [...turn("t1"), drew("t1", PAYMENT, "payment"), ask("t1", CHECKOUT), drew("t1", CHECKOUT, "checkout"), drew("t1", RECEIPT, "receipt"), drew("t1", PAYMENT, "payment")];
    const items = threadItems(events, ROOT, true);
    expect(cards(items).map(card => card.key)).toEqual([`ct1:${PAYMENT}`, `ct1:${CHECKOUT}`, `ct1:${RECEIPT}`]);
    // The drawn event's ID joins the card the request made.
    expect(cards(items)[1]).toEqual({ kind: "canvasCard", key: `ct1:${CHECKOUT}`, canvas: { path: CHECKOUT, id: "checkout" }, drawing: true, drawn: true, handoff: { outcome: "pending" } });
  });

  test("a card never splits the running activity group: later activities join the same row", () => {
    seq = 0;
    const events = [...turn("t1"), edit("t1", CHECKOUT), drew("t1", CHECKOUT, "checkout"), edit("t1", PAYMENT), ask("t1", PAYMENT), edit("t1", RECEIPT)];
    const items = threadItems(events, ROOT, true);
    expect(items.map(i => i.kind)).toEqual(["user", "activity", "canvasCard", "canvasCard"]);
    expect(items[1]).toMatchObject({ kind: "activity", steps: [{ path: CHECKOUT }, { path: PAYMENT }, { path: RECEIPT }] });
  });

  test("while a request waits the order is cards, Send now's message, then the request; without one, cards end the thread", () => {
    seq = 0;
    const events = [...turn("t1"), edit("t1", CHECKOUT), drew("t1", CHECKOUT, "checkout"), ev("t1", { type: "permission.request", requestId: "p1", tool: "Write", summary: "Write", options })];
    const sending = [{ id: "s1", text: "Keep the payment step on one screen", anchors: [], attachments: [] }];
    const items = withSending(threadItems(events, ROOT, true), sending);
    expect(items.map(i => i.kind === "user" && i.sending ? "sending" : i.kind)).toEqual(["user", "activity", "canvasCard", "sending", "permission"]);
    events.push(ev("t1", { type: "permission.resolved", requestId: "p1", optionId: "a" }));
    expect(threadItems(events, ROOT, true).map(i => i.kind)).toEqual(["user", "activity", "permission", "canvasCard"]);
  });

  test("after the turn the cards follow its reply and its end notice, ahead of the next turn", () => {
    seq = 0;
    const events = [...turn("t1"), drew("t1", CHECKOUT, "checkout"), reply("t1"), ev("t1", { type: "interrupted", reason: "user" }), ...turn("t2", "Next")];
    expect(threadItems(events, ROOT, true).map(i => i.kind)).toEqual(["user", "agent", "end", "canvasCard", "user"]);
  });

  test("a canvas.drawn that arrives after the turn's end, even after the next turn started, joins its own turn's cards", () => {
    seq = 0;
    const events = [...turn("t1"), drew("t1", CHECKOUT, "checkout"), reply("t1"), ev("t1", { type: "turn.done" }), ...turn("t2", "Next"), edit("t2", RECEIPT),
      drew("t1", PAYMENT, "payment"), edit("t2", RECEIPT)];
    const items = threadItems(events, ROOT, true);
    expect(items.map(i => i.kind)).toEqual(["user", "agent", "canvasCard", "canvasCard", "user", "activity"]);
    expect(cards(items).map(card => [card.key, card.drawing])).toEqual([[`ct1:${CHECKOUT}`, false], [`ct1:${PAYMENT}`, false]]);
    // The next turn's open activity group stays one row.
    expect(items[5]).toMatchObject({ kind: "activity", steps: [{ path: RECEIPT }, { path: RECEIPT }] });
  });

  test("a handoff request alone makes a card that was never drawn", () => {
    seq = 0;
    const items = threadItems([...turn("t1"), ask("t1", CHECKOUT), reply("t1")], ROOT, true);
    expect(cards(items)).toEqual([{ kind: "canvasCard", key: `ct1:${CHECKOUT}`, canvas: { path: CHECKOUT }, drawing: true, drawn: false, handoff: { outcome: "pending" } }]);
  });

  test("drawing is false once Stop ended the turn, for a turn a restart folded, and when main holds nothing live", () => {
    seq = 0;
    const base = () => { seq = 0; return [...turn("t1"), drew("t1", CHECKOUT, "checkout")]; };
    expect(cards(threadItems([...base(), ev("t1", { type: "interrupted", reason: "user" })], ROOT, true))[0]).toMatchObject({ drawing: false });
    expect(cards(threadItems([...base(), ...turn("t2", "Next")], ROOT, true))[0]).toMatchObject({ drawing: false });
    expect(cards(threadItems(base(), ROOT, false))[0]).toMatchObject({ drawing: false });
    expect(cards(threadItems(base(), ROOT, true))[0]).toMatchObject({ drawing: true });
  });

  test("an earlier build's history of handoff events alone draws cards", () => {
    seq = 0;
    const target = { conversationId: "c2", canvas: { path: CHECKOUT, id: "checkout" } };
    const events = [...turn("t1"), edit("t1", CHECKOUT), ask("t1", CHECKOUT), reply("t1"), ev("t1", { type: "turn.done" }),
      resolve("t1", { outcome: "started", target }), ev("t1", { type: "handoff.missed", canvas: { path: RECEIPT, id: "receipt" } })];
    const items = threadItems(events, ROOT, false);
    expect(items.map(i => i.kind)).toEqual(["user", "activity", "agent", "canvasCard", "canvasCard"]);
    expect(cards(items)).toEqual([
      { kind: "canvasCard", key: `ct1:${CHECKOUT}`, canvas: { path: CHECKOUT }, drawing: false, drawn: false, handoff: { outcome: "started", target } },
      { kind: "canvasCard", key: `ct1:${RECEIPT}`, canvas: { path: RECEIPT, id: "receipt" }, drawing: false, drawn: false, handoff: { outcome: "missed" } },
    ]);
  });

  test("a card keeps its key from Drawing through a pending handoff to its result", () => {
    seq = 0;
    const events = [...turn("t1"), drew("t1", CHECKOUT, "checkout")];
    const keys = () => cards(threadItems(events, ROOT, true)).map(card => card.key);
    const first = keys();
    events.push(ask("t1", CHECKOUT));
    expect(keys()).toEqual(first);
    events.push(ev("t1", { type: "turn.done" }), resolve("t1", { canvas: { path: CHECKOUT }, outcome: "refused", reason: "not_new" }));
    expect(keys()).toEqual(first);
    expect(cards(threadItems(events, ROOT, true))[0]).toMatchObject({ drawing: false, drawn: true, handoff: { outcome: "refused", reason: "not_new" } });
  });

  test("each resolution settles the card of its own path, in any order, with mixed outcomes", () => {
    seq = 0;
    const target = { conversationId: "c2", canvas: { path: PAYMENT, id: "payment" } };
    const events = [...turn("t1"), ask("t1", CHECKOUT), ask("t1", PAYMENT), ask("t1", RECEIPT), reply("t1"), ev("t1", { type: "turn.done" }),
      resolve("t1", { canvas: { path: PAYMENT }, outcome: "started", target }),
      resolve("t1", { canvas: { path: CHECKOUT }, outcome: "refused", reason: "has_conversation" }),
      resolve("t1", { canvas: { path: RECEIPT }, outcome: "cancelled" })];
    expect(cards(threadItems(events, ROOT, false)).map(card => card.handoff)).toEqual([
      { outcome: "refused", reason: "has_conversation" }, { outcome: "started", target }, { outcome: "cancelled" },
    ]);
  });

  test("a resolution without a path settles the turn's only requested card, and none of a turn with several", () => {
    seq = 0;
    const single = threadItems([...turn("t1"), drew("t1", PAYMENT, "payment"), ask("t1", CHECKOUT), ev("t1", { type: "turn.done" }), resolve("t1", { outcome: "refused", reason: "not_new" })], ROOT, true);
    expect(cards(single).map(card => card.handoff)).toEqual([undefined, { outcome: "refused", reason: "not_new" }]);
    seq = 0;
    const several = threadItems([...turn("t1"), ask("t1", CHECKOUT), ask("t1", PAYMENT), ev("t1", { type: "turn.done" }), resolve("t1", { outcome: "refused", reason: "not_new" })], ROOT, true);
    expect(cards(several).map(card => card.handoff?.outcome)).toEqual(["pending", "pending"]);
  });

  test("a resolution for a path the turn did not request settles nothing", () => {
    seq = 0;
    const items = threadItems([...turn("t1"), ask("t1", CHECKOUT), drew("t1", PAYMENT), ev("t1", { type: "turn.done" }), resolve("t1", { canvas: { path: PAYMENT }, outcome: "cancelled" })], ROOT, true);
    expect(cards(items).map(card => card.handoff)).toEqual([{ outcome: "pending" }, undefined]);
  });

  test("a second request for the same path in one turn makes no second card", () => {
    seq = 0;
    expect(cards(threadItems([...turn("t1"), ask("t1", CHECKOUT), ask("t1", CHECKOUT)], ROOT, true))).toHaveLength(1);
  });

  test("a done turn waiting for its judgement stays pending while main holds it, and reads as cancelled once nothing does", () => {
    seq = 0;
    const events = [...turn("t1"), ask("t1", CHECKOUT), ev("t1", { type: "turn.done" })];
    expect(cards(threadItems(events, ROOT, true))[0]).toMatchObject({ drawing: false, handoff: { outcome: "pending" } });
    expect(cards(threadItems(events, ROOT, false))[0]).toMatchObject({ drawing: false, handoff: { outcome: "cancelled" } });
  });

  test("a missed canvas settles its drawn card, or is a card of its own; one after the next message stays in its turn", () => {
    seq = 0;
    const events = [...turn("t1"), drew("t1", PAYMENT, "payment"), ask("t1", CHECKOUT), reply("t1"), ev("t1", { type: "turn.done" }), ...turn("t2", "Next"),
      ev("t1", { type: "handoff.missed", canvas: { path: PAYMENT, id: "payment" } }), ev("t1", { type: "handoff.missed", canvas: { path: RECEIPT, id: "receipt" } }),
      ev("t2", { type: "message.done", messageId: "m1", text: "Sure." })];
    const items = threadItems(events, ROOT, true);
    expect(items.map(i => i.kind)).toEqual(["user", "agent", "canvasCard", "canvasCard", "canvasCard", "user", "agent"]);
    expect(cards(items).map(card => [card.key, card.drawn, card.handoff?.outcome])).toEqual([[`ct1:${PAYMENT}`, true, "missed"], [`ct1:${CHECKOUT}`, false, "pending"], [`ct1:${RECEIPT}`, false, "missed"]]);
  });

  test("a missed canvas or a resolution written after an earlier build's archive line still follows its turn", () => {
    seq = 0;
    const events = [...turn("t1"), ask("t1", CHECKOUT), reply("t1"), ev("t1", { type: "interrupted", reason: "user" }), ev("t1", { type: "conversation.archived" }),
      resolve("t1", { outcome: "cancelled" }), ev("t1", { type: "handoff.missed", canvas: { path: PAYMENT, id: "payment" } })];
    const items = threadItems(events, ROOT, false);
    expect(items.map(i => i.kind)).toEqual(["user", "agent", "end", "canvasCard", "canvasCard"]);
    expect(cards(items).map(card => card.handoff?.outcome)).toEqual(["cancelled", "missed"]);
  });

  test("the receiving conversation's first message is the handoff card with its text as written and its time", () => {
    seq = 0;
    const origin = { kind: "handoff", conversationId: "c0", canvas: { path: ".doan/canvases/drafts.html", id: "drafts" } };
    const text = "/Polish\nThe person wrote “{{1}}” as a placeholder.";
    const items = threadItems([...turn("t1", text, { origin }), ev("t1", { type: "turn.done" }), ...turn("t2", "Use {{1}}")], ROOT, true);
    expect(items[0]).toEqual({ kind: "handoffCard", key: "u1", seq: 1, origin, text, at: "2026-11-01T00:00:00Z" });
    expect(items.at(-1)).toMatchObject({ kind: "user" });
  });
});

// The line a Claude turn leaves when it did not run Fast, inside that turn, kept on reread.
describe("Fast not used", () => {
  const unused = (payload: Record<string, unknown> = {}) => ({ type: "fast.unused", ...payload }) as Extract<ConversationEvent, { type: "fast.unused" }>;
  test("a lasting reason says Fast was turned off, then why", () => {
    expect(fastUnusedText(unused({ reason: "plan", turnedOff: true }))).toBe("Fast was turned off. Your plan doesn’t include it.");
    expect(fastUnusedText(unused({ reason: "extra_usage", turnedOff: true }))).toBe("Fast was turned off. Extra usage is turned off for this account.");
    expect(fastUnusedText(unused({ reason: "model", turnedOff: true }))).toBe("Fast was turned off. It isn’t available for this model.");
    expect(fastUnusedText(unused({ reason: "policy", turnedOff: true }))).toBe("Fast was turned off. Your organization turned it off.");
  });
  test("otherwise Fast was not used for this turn, with the reason when there is one", () => {
    expect(fastUnusedText(unused({ reason: "cooldown" }))).toBe("Fast wasn’t used for this turn. It’s paused after a rate limit.");
    expect(fastUnusedText(unused())).toBe("Fast wasn’t used for this turn.");
  });
  test("the line sits in its turn under the reply, before a failed turn's end, and stays when the history is read again", () => {
    seq = 0;
    const done = [...turn("t1"), ev("t1", { type: "message.done", messageId: "m1", text: "Done." }), ev("t1", { type: "fast.unused", reason: "plan", turnedOff: true }), ev("t1", { type: "context.usage", used: 1, size: 2 }), ev("t1", { type: "turn.done" })];
    const items = threadItems(done, ROOT, false);
    expect(items.map(i => i.kind)).toEqual(["user", "agent", "fast"]);
    expect(items[2]).toEqual({ kind: "fast", key: "f4", seq: 4, text: "Fast was turned off. Your plan doesn’t include it.", turnedOff: true });
    expect(threadItems([...done], ROOT, false)).toEqual(items);
    seq = 0;
    const failed = [...turn("t1"), ev("t1", { type: "fast.unused" }), ev("t1", { type: "turn.failed", code: "process_exited" })];
    expect(threadItems(failed, ROOT, true).map(i => i.kind)).toEqual(["user", "fast", "end"]);
    expect(threadItems(failed, ROOT, true)[1]).toMatchObject({ text: "Fast wasn’t used for this turn.", turnedOff: false });
  });
});

test("history and optimistic messages pass sent skills to their bubble", () => {
  const text = "Use the project skill `deploy`.\n\n/deploy now\n\nUse the project skill `review`.";
  expect(threadItems(turn("skills", text), ROOT, false)[0]).toMatchObject({ skills: ["deploy", "review"], parts: [{ text: "/deploy now" }] });
  expect(withSending([], [{ id: "s", text, anchors: [], attachments: [] }])[0]).toMatchObject({ skills: ["deploy", "review"], parts: [{ text: "/deploy now" }] });
});

describe("sameItem", () => {
  test("compares items by value, as threadItems rebuilds them on every call", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "activity", kind: "read", path: `${ROOT}/a.md`, summary: "a.md" }), ev("t1", { type: "message.delta", messageId: "m1", text: "Hi" })];
    const [first, second] = [threadItems(events, ROOT, true), threadItems(events, ROOT, true)];
    expect(first.every((item, i) => item !== second[i] && sameItem(item, second[i]))).toBe(true);
    expect(sameItem({ steps: [{ key: "s1" }] }, { steps: [{ key: "s2" }] })).toBe(false);
    expect(sameItem({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameItem([1], { 0: 1 })).toBe(false);
    expect(sameItem(null, {})).toBe(false);
  });
});

describe("threadItems edit line counts", () => {
  const edit = (turnId: string, path: string | undefined, callId?: string) => ev(turnId, { type: "activity", kind: "edit", ...(path ? { path } : {}), summary: path ?? "Edited a file", ...(callId ? { callId } : {}) });
  // Main writes a result's path as exactly the path its activity stored, and none when the activity has none.
  const result = (turnId: string, callId: string, path: string | undefined, added: number, removed: number) => ev(turnId, { type: "activity.result", callId, ...(path ? { path } : {}), lines: { added, removed } });
  const rowOf = (events: ConversationEvent[], live = true) => threadItems(events, ROOT, live).find(item => item.kind === "activity") as Extract<ThreadItem, { kind: "activity" }>;

  test("a result joins the edit step with its callId and stored path; the folded head adds the total", () => {
    seq = 0;
    const events = [...turn("t1"), edit("t1", `${ROOT}/src/a.ts`, "toolu_1"), result("t1", "toolu_1", `${ROOT}/src/a.ts`, 12, 3), ev("t1", { type: "turn.done" })];
    expect(rowOf(events)).toEqual({ kind: "activity", key: "a3", running: false, head: "1 step", total: { added: 12, removed: 3 },
      steps: [{ key: "s3", kind: "edit", verb: "Edited", path: "src/a.ts", lines: { added: 12, removed: 3 } }] });
  });

  test("a result does not split the activity row: the next activity joins the same row", () => {
    seq = 0;
    const events = [...turn("t1"), edit("t1", "a.ts", "c1"), result("t1", "c1", "a.ts", 1, 1), ev("t1", { type: "activity", kind: "read", path: "b.ts", summary: "b.ts" })];
    const items = threadItems(events, ROOT, true);
    expect(items.map(i => i.kind)).toEqual(["user", "activity"]);
    expect(items[1]).toMatchObject({ head: "2 steps", total: { added: 1, removed: 1 } });
  });

  test("an edit step without a path takes a result without one; Copilot's path-less results on one call add up", () => {
    seq = 0;
    const events = [...turn("t1"), edit("t1", undefined, "c1"), result("t1", "c1", undefined, 1, 1), result("t1", "c1", undefined, 1, 1)];
    expect(rowOf(events)).toMatchObject({ total: { added: 2, removed: 2 }, steps: [{ verb: "Edited a file", path: null, lines: { added: 2, removed: 2 } }] });
  });

  test("Codex: one call edits several files, and each result goes to the step of its own stored path", () => {
    seq = 0;
    // The results name the path the activity stored, not the root-relative one the step shows.
    const events = [...turn("t1"), edit("t1", `${ROOT}/src/a.ts`, "fc_1"), edit("t1", `${ROOT}/src/b.ts`, "fc_1"),
      result("t1", "fc_1", `${ROOT}/src/b.ts`, 2, 0), result("t1", "fc_1", `${ROOT}/src/a.ts`, 1, 5)];
    expect(rowOf(events)).toMatchObject({ total: { added: 3, removed: 5 }, steps: [
      { path: "src/a.ts", lines: { added: 1, removed: 5 } }, { path: "src/b.ts", lines: { added: 2, removed: 0 } }] });
  });

  test("the key is the callId and the exact path: the display path, another path, or a path-less side never matches", () => {
    seq = 0;
    const events = [...turn("t1"), edit("t1", `${ROOT}/src/a.ts`, "c1"), edit("t1", undefined, "c2"),
      result("t1", "c1", "src/a.ts", 1, 1), result("t1", "c1", `${ROOT}/src/b.ts`, 1, 1), result("t1", "c1", undefined, 1, 1), result("t1", "c2", "a.ts", 1, 1)];
    const row = rowOf(events);
    expect(row).not.toHaveProperty("total");
    expect(row.steps.every(step => step.lines === undefined)).toBe(true);
  });

  test("results with the same key add up: a Copilot overwrite is a delete and an add of one path", () => {
    seq = 0;
    const overwrite = [...turn("t1"), edit("t1", "a.ts", "call_1"), result("t1", "call_1", "a.ts", 0, 4), result("t1", "call_1", "a.ts", 2, 0)];
    expect(rowOf(overwrite)).toMatchObject({ total: { added: 2, removed: 4 }, steps: [{ lines: { added: 2, removed: 4 } }] });
  });

  test("a result with no matching edit, one before its edit, or one of another turn is ignored", () => {
    seq = 0;
    const events = [...turn("t1"), result("t1", "c1", "a.ts", 9, 9), edit("t1", "a.ts", "c1"), ev("t1", { type: "activity", kind: "read", path: "c1", summary: "c1" }),
      result("t1", "other", "a.ts", 5, 5), ev("t1", { type: "turn.done" }),
      ...turn("t2"), edit("t2", "b.ts", "c2"), result("t2", "c1", "a.ts", 7, 7)];
    const rows = threadItems(events, ROOT, true).filter(item => item.kind === "activity");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).not.toHaveProperty("total");
      expect(row.steps.every(step => step.lines === undefined)).toBe(true);
    }
  });

  test("a result after its turn's end is ignored, as in main's fold", () => {
    seq = 0;
    const events = [...turn("t1"), edit("t1", "a.ts", "c1"), ev("t1", { type: "interrupted", reason: "user" }), result("t1", "c1", "a.ts", 3, 1)];
    expect(rowOf(events)).not.toHaveProperty("total");
  });

  test("an edit step without counts keeps its head; the total adds only the known counts; a zero is a known count", () => {
    seq = 0;
    const none = [...turn("t1"), edit("t1", "a.ts", "c1"), edit("t1", "b.ts"), ev("t1", { type: "activity", kind: "command", summary: "Running a command" })];
    expect(rowOf(none)).toEqual({ kind: "activity", key: "a3", running: false, head: "3 steps", steps: [
      { key: "s3", kind: "edit", verb: "Edited", path: "a.ts" }, { key: "s4", kind: "edit", verb: "Edited", path: "b.ts" }, { key: "s5", kind: "command", verb: "Ran a command", path: null }] });
    seq = 0;
    const partial = [...turn("t1"), edit("t1", "a.ts", "c1"), result("t1", "c1", "a.ts", 4, 4), edit("t1", "b.ts", "c2"), edit("t1", "c.ts", "c3"), result("t1", "c3", "c.ts", 0, 0)];
    const row = rowOf(partial);
    expect(row.total).toEqual({ added: 4, removed: 4 });
    expect(row.steps.map(step => step.lines ?? null)).toEqual([{ added: 4, removed: 4 }, null, { added: 0, removed: 0 }]);
  });

  test("a result never joins a read step that shares its id", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "activity", kind: "read", path: "a.ts", summary: "a.ts", callId: "c1" }), result("t1", "c1", "a.ts", 1, 1)];
    expect(rowOf(events)).not.toHaveProperty("total");
  });

  test("a row an earlier history wrote, without callIds, reads as before", () => {
    seq = 0;
    const events = [...turn("t1"), edit("t1", "a.ts"), ev("t1", { type: "turn.done" })];
    expect(rowOf(events)).toEqual({ kind: "activity", key: "a3", running: false, head: "1 step", steps: [{ key: "s3", kind: "edit", verb: "Edited", path: "a.ts" }] });
  });
});

// The reveal relies on these: a finished reply never grows again, and a turn's end finishes every reply of it.
describe("threadItems behavior the reveal relies on", () => {
  test("a delta after message.done is dropped", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "message.done", messageId: "m1", text: "Done." }), ev("t1", { type: "message.delta", messageId: "m1", text: " More" })];
    expect(threadItems(events, ROOT, true)[1]).toMatchObject({ kind: "agent", text: "Done.", streaming: false });
  });

  test("a turn's end finishes both replies of the turn", () => {
    seq = 0;
    const events = [...turn("t1"), ev("t1", { type: "message.delta", messageId: "m1", text: "First" }), ev("t1", { type: "activity", kind: "read", path: "a.md", summary: "a.md" }), ev("t1", { type: "message.delta", messageId: "m2", text: "Second" })];
    expect(threadItems(events, ROOT, true).filter(i => i.kind === "agent").map(i => i.kind === "agent" && i.streaming)).toEqual([true, true]);
    for (const end of [{ type: "turn.done" }, { type: "interrupted", reason: "user" }, { type: "turn.failed", code: "unknown" }]) {
      const ended = threadItems([...events, ev("t1", end)], ROOT, true).filter(i => i.kind === "agent");
      expect(ended.map(i => i.kind === "agent" && i.streaming)).toEqual([false, false]);
    }
  });
});
