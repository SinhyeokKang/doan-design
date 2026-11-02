import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "../main/conversation/summary";
import type { CanvasRow, FolderEntry } from "../main/view";
import type { WorkItem } from "../main/workState";
import { slotsFromList, stripFromList, withTerminalSlots } from "./conversationList";
import { slotKey, type Slot } from "./homeConversations";
import { projectSlotEntry } from "./ShellSidebar";

const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
  conversationId: "c1", title: "Draw it", state: "current", owner: "doan", provider: "claude", fromHome: true,
  phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-01T00:00:00.000Z", preview: "", ...patch,
});
const rows = new Map([["/r/doan", [{ path: ".doan/canvases/a.html", id: "a" }, { path: ".doan/canvases/plain.html" }]]]);
const canvases = (root: string) => rows.get(root) ?? [];
const none = new Set<string>();

describe("slotsFromList", () => {
  test("running, waiting for an answer and unseen endings show; seen endings and read errors do not", () => {
    const lists = new Map([
      ["/r/doan", [summary({ conversationId: "w", phase: "running" })]],
      ["/r/b", [summary({ conversationId: "p", phase: "waiting", provider: "codex" })]],
      ["/r/c", [summary({ conversationId: "u", unseen: true }), summary({ conversationId: "s" })]],
      ["/r/d", [summary({ conversationId: "e", phase: "running", readError: true })]],
    ]);
    expect(slotsFromList(lists, none, canvases)).toEqual(new Map([
      ["/r/doan", { kind: "working", label: "Claude Code is working" }],
      ["/r/b", { kind: "permission", label: "Codex needs your answer" }],
      ["/r/c", { kind: "unseen", label: "New changes from Claude Code" }],
    ]));
  });

  test("the strongest state wins on a row", () => {
    const lists = new Map([["/r/doan", [summary({ conversationId: "u", unseen: true }), summary({ conversationId: "p", phase: "waiting" }), summary({ conversationId: "w", phase: "running" })]]]);
    expect(slotsFromList(lists, none, canvases).get("/r/doan")?.kind).toBe("permission");
  });

  test("a conversation marked seen whose list refresh has not arrived shows nothing", () => {
    const lists = new Map([["/r/doan", [summary({ conversationId: "u", unseen: true })]]]);
    expect(slotsFromList(lists, new Set(["u"]), canvases).size).toBe(0);
  });

  test("a bound canvas shows on its row, found by ID; a canvas no longer listed falls back to the project row", () => {
    const lists = new Map([["/r/doan", [
      summary({ conversationId: "moved", phase: "running", canvas: { path: ".doan/canvases/old-name.html", id: "a" } }),
      summary({ conversationId: "plain", unseen: true, canvas: { path: ".doan/canvases/plain.html" } }),
      summary({ conversationId: "gone", phase: "waiting", canvas: { path: ".doan/canvases/gone.html", id: "gone" } }),
    ]]]);
    expect(slotsFromList(lists, none, canvases)).toEqual(new Map([
      [slotKey("/r/doan", ".doan/canvases/a.html"), { kind: "working", label: "Claude Code is working" }],
      [slotKey("/r/doan", ".doan/canvases/plain.html"), { kind: "unseen", label: "New changes from Claude Code" }],
      ["/r/doan", { kind: "permission", label: "Claude Code needs your answer" }],
    ]));
  });

  test("only Home conversations count, as before the list existed", () => {
    const lists = new Map([["/r/doan", [summary({ phase: "running", fromHome: false })]]]);
    expect(slotsFromList(lists, none, canvases).size).toBe(0);
  });
});

describe("stripFromList", () => {
  test("the strongest state first, then the latest activity; nothing when no work is left", () => {
    const older = summary({ conversationId: "old", unseen: true, lastActivityAt: "2026-11-01T00:00:00.000Z" });
    const newer = summary({ conversationId: "new", unseen: true, lastActivityAt: "2026-11-01T00:05:00.000Z" });
    const running = summary({ conversationId: "run", phase: "running", lastActivityAt: "2026-10-31T00:00:00.000Z" });
    expect(stripFromList([older, newer], none)?.conversationId).toBe("new");
    expect(stripFromList([older, running, newer], none)?.conversationId).toBe("run");
    expect(stripFromList([summary({}), summary({ phase: "running", fromHome: false })], none)).toBeNull();
    expect(stripFromList([newer], new Set(["new"]))).toBeNull();
  });
});

// terminal-agent-activity design '표시' (sidebar): a terminal session's `doan work` puts the working spinner on the canvas
// row, with its own source and name. Identity is root + path (POSTMORTEM 2026-11-01).
describe("withTerminalSlots", () => {
  const A = ".doan/canvases/a.html", B = ".doan/canvases/b.html", C = ".doan/ds/c.html";
  const row = (path: string, mtimeMs?: number): CanvasRow => ({ path, url: path, ...(mtimeMs === undefined ? {} : { mtimeMs }) });
  const list = (path: string, canvases: CanvasRow[]): FolderEntry => ({ path, kind: "list", canvases, servedRev: 0 });
  const work = (root: string, path: string, provider: WorkItem["provider"] = "codex", session: string | null = provider ? `${provider}-1` : null): WorkItem => ({ root, path, provider, session });
  const entries = [list("/r", [row(A, 1), row(B, 9), row(C, 5)]), list("/s", [row(A, 3)])];

  test("a working terminal session puts the spinner on its canvas row, named for its provider or anonymous", () => {
    const slots = withTerminalSlots(new Map(), [work("/r", A, "codex"), work("/r", B, "claude"), work("/r", C, null)], entries);
    expect(slots.get(slotKey("/r", A))).toEqual({ kind: "working", label: "Codex is working in a terminal", source: "terminal" });
    expect(slots.get(slotKey("/r", B))).toEqual({ kind: "working", label: "Claude Code is working in a terminal", source: "terminal" });
    expect(slots.get(slotKey("/r", C))).toEqual({ kind: "working", label: "An agent is working in a terminal", source: "terminal" });
  });

  test("the row is root + path: a worktree sharing the path shows nothing, and back again shows it", () => {
    const inR = withTerminalSlots(new Map(), [work("/r", A)], entries);
    expect(inR.has(slotKey("/r", A))).toBe(true);
    expect(inR.has(slotKey("/s", A))).toBe(false);
    const inS = withTerminalSlots(new Map(), [work("/s", A)], entries);
    expect([...inS.keys()]).toEqual([slotKey("/s", A)]);
  });

  test("a path not listed yet, a root not in the list, and a root that is not a list show nothing until they are", () => {
    const later = ".doan/canvases/later.html";
    expect(withTerminalSlots(new Map(), [work("/r", later), work("/gone", A), work("/l", A)], [...entries, { path: "/l", kind: "loading" }]).size).toBe(0);
    expect(withTerminalSlots(new Map(), [work("/r", later)], [list("/r", [row(later, 1)])]).get(slotKey("/r", later))?.source).toBe("terminal");
  });

  test("a permission request and an app conversation working on the same row win; an unseen ending loses", () => {
    const permission: Slot = { kind: "permission", label: "Codex needs your answer" };
    const app: Slot = { kind: "working", label: "Codex is working" };
    const unseen: Slot = { kind: "unseen", label: "New changes from Codex" };
    const conversations = new Map([[slotKey("/r", A), permission], [slotKey("/r", B), app], [slotKey("/r", C), unseen]]);
    const slots = withTerminalSlots(conversations, [work("/r", A), work("/r", B), work("/r", C)], entries);
    expect(slots.get(slotKey("/r", A))).toBe(permission);
    expect(slots.get(slotKey("/r", B))).toBe(app);
    expect(slots.get(slotKey("/r", C))).toEqual({ kind: "working", label: "Codex is working in a terminal", source: "terminal" });
  });

  test("project slots and other rows' slots stay as they were", () => {
    const project: Slot = { kind: "unseen", label: "New changes from Codex" };
    const slots = withTerminalSlots(new Map([["/r", project]]), [work("/r", A)], entries);
    expect(slots.get("/r")).toBe(project);
    expect(slots.size).toBe(2);
  });

  test("several terminal rows come newest-changed first, so a project row opens the most recently changed canvas", () => {
    const slots = withTerminalSlots(new Map(), [work("/r", A), work("/r", C), work("/r", B)], entries);
    expect([...slots.keys()]).toEqual([slotKey("/r", B), slotKey("/r", C), slotKey("/r", A)]);
    expect(projectSlotEntry(slots, ["/r"], [])?.key).toBe(slotKey("/r", B));
    expect(projectSlotEntry(slots, ["/r"], [slotKey("/r", B)])?.key).toBe(slotKey("/r", C));
  });

  test("on a project row an app conversation working elsewhere comes before a terminal session", () => {
    const app: Slot = { kind: "working", label: "Codex is working" };
    const slots = withTerminalSlots(new Map([[slotKey("/r", A), app]]), [work("/r", B)], entries);
    expect(projectSlotEntry(slots, ["/r"], [])?.slot).toBe(app);
  });

  test("two sessions on one row show one slot", () => {
    const slots = withTerminalSlots(new Map(), [work("/r", A, "claude"), work("/r", A, "codex")], entries);
    expect(slots.size).toBe(1);
    expect(slots.get(slotKey("/r", A))?.label).toBe("Claude Code is working in a terminal");
  });

  test("no work leaves the conversation slots as they are", () => {
    const app: Slot = { kind: "working", label: "Codex is working" };
    expect([...withTerminalSlots(new Map([["/r", app]]), [], entries)]).toEqual([["/r", app]]);
  });
});
