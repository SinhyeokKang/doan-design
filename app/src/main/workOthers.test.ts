import { describe, expect, test } from "vitest";
import appSocketV3Schema from "../../../schema/app-socket.v3.schema.json";
import { othersOnCanvas, WORK_OTHERS_MAX, type OthersInput } from "./workOthers";
import { WORK_EXPIRY_MS, type WorkItem } from "./workState";
import type { ConversationWork, LiveTurn } from "./conversationWork";

const root = "/repo", path = ".doan/canvases/a.html", now = 10 * WORK_EXPIRY_MS;
type Request = OthersInput["request"];
const named = (extra: Partial<{ session: string; provider: "claude" | "codex"; path: string; root: string }> = {}): Request =>
  ({ v: 3, token: "t", action: "start", root, path, session: "me", provider: "claude", ...extra });
const anonymous: Request = { v: 3, token: "t", action: "start", root, path };
const fromConversation = (conversation: string): Request => ({ v: 3, token: "t", action: "update", root, path, conversation });
const item = (extra: Partial<WorkItem> = {}): WorkItem => ({ session: "s1", provider: "codex", root, path, touched: now - 1000, turn: "codex:x", ...extra });
const turn = (extra: Partial<LiveTurn> = {}): LiveTurn => ({ root, turnId: "t1", running: true, provider: "claude", ...extra });
const work = (extra: Partial<ConversationWork> = {}): ConversationWork => ({ conversationId: "c1", root, path, touched: now - 1000, turnId: "t1", ...extra });
const others = (input: Partial<OthersInput>) =>
  othersOnCanvas({ request: named(), now, work: [], conversationWork: [], liveTurns: new Map(), ...input });

describe("othersOnCanvas", () => {
  test("a terminal on the same file is listed with its provider, frame and note", () => {
    expect(others({ work: [item({ frame: "hero", note: "Tightening spacing" })] }))
      .toEqual([{ kind: "terminal", provider: "codex", frame: "hero", note: "Tightening spacing" }]);
  });
  test("an anonymous terminal is listed without a provider", () => {
    expect(others({ work: [item({ session: null, provider: null })] })).toEqual([{ kind: "terminal" }]);
  });
  test("only the same file counts: another path, or the same path on another root, is not listed", () => {
    expect(others({ work: [item({ path: ".doan/canvases/b.html" }), item({ session: "s2", root: "/repo-w1" })] })).toEqual([]);
    // Two worktrees share the canvas path: each sees only its own root.
    const listed = others({ request: named({ root: "/repo-w1" }), work: [item(), item({ session: "s2", root: "/repo-w1" })] });
    expect(listed).toEqual([{ kind: "terminal", provider: "codex" }]);
    expect(others({ liveTurns: new Map([["c1", turn({ root: "/repo-w1", canvas: { path } })]]) })).toEqual([]);
    expect(others({ liveTurns: new Map([["c1", turn({ root: "/repo-w1" })]]), conversationWork: [work({ root: "/repo-w1" })] })).toEqual([]);
  });
  test("a root or path that only matches after normalization is not the same file", () => {
    expect(others({ work: [item({ root: "/repo/" }), item({ session: "s2", path: "./.doan/canvases/a.html" })] })).toEqual([]);
  });

  describe("the caller is left out", () => {
    test("a named terminal by its session and provider", () => {
      const listed = others({ request: named({ session: "s1", provider: "codex" }), work: [item(), item({ session: "s1", provider: "claude" }), item({ session: "s2" })] });
      expect(listed).toEqual([{ kind: "terminal", provider: "claude" }, { kind: "terminal", provider: "codex" }]);
    });
    test("an anonymous terminal by being the anonymous session of its root", () => {
      expect(others({ request: anonymous, work: [item({ session: null, provider: null }), item()] })).toEqual([{ kind: "terminal", provider: "codex" }]);
    });
    // Both send no session, so the app holds them as one anonymous session of the root (a known limit).
    test("two anonymous terminals of one root do not see each other", () => {
      expect(others({ request: anonymous, work: [item({ session: null, provider: null, frame: "hero" })] })).toEqual([]);
    });
    test("a conversation by its id", () => {
      const listed = others({ request: fromConversation("c1"), conversationWork: [work(), work({ conversationId: "c2", turnId: "u1" })],
        liveTurns: new Map([["c1", turn()], ["c2", turn({ turnId: "u1", provider: "codex" })]]) });
      expect(listed).toEqual([{ kind: "conversation", provider: "codex" }]);
    });
    test("a conversation caller still sees every terminal on the file", () => {
      expect(others({ request: fromConversation("c1"), work: [item({ session: null, provider: null })] })).toEqual([{ kind: "terminal" }]);
    });
  });

  describe("app conversations", () => {
    test("a running turn whose update points at this file is listed with that update's frame and note", () => {
      expect(others({ conversationWork: [work({ frame: "pricing", note: "Rewriting copy" })], liveTurns: new Map([["c1", turn({ provider: "copilot" })]]) }))
        .toEqual([{ kind: "conversation", provider: "copilot", frame: "pricing", note: "Rewriting copy" }]);
    });
    test("only running turns count", () => {
      expect(others({ conversationWork: [work()], liveTurns: new Map([["c1", turn({ running: false })]]) })).toEqual([]);
      expect(others({ liveTurns: new Map([["c1", turn({ running: false, canvas: { path } })]]) })).toEqual([]);
      expect(others({ conversationWork: [work()] })).toEqual([]);
    });
    test("a conversation bound here without an update this turn is listed without frame or note", () => {
      expect(others({ liveTurns: new Map([["c1", turn({ provider: "cursor", canvas: { path, id: "home" } })]]) })).toEqual([{ kind: "conversation", provider: "cursor" }]);
    });
    test("a conversation bound to another canvas without an update is not listed", () => {
      expect(others({ liveTurns: new Map([["c1", turn({ canvas: { path: ".doan/canvases/b.html" } })]]) })).toEqual([]);
      expect(others({ liveTurns: new Map([["c1", turn()]]) })).toEqual([]);
    });
    test("a conversation whose last update this turn points at another file is not listed, even when bound here", () => {
      expect(others({ conversationWork: [work({ path: ".doan/canvases/b.html", frame: "x" })], liveTurns: new Map([["c1", turn({ canvas: { path } })]]) })).toEqual([]);
    });
    // Another turn's update is stale: it neither counts here nor carries its frame or note onto this file.
    test("another turn's update counts as absent", () => {
      expect(others({ conversationWork: [work({ turnId: "old", frame: "hero", note: "old note" })], liveTurns: new Map([["c1", turn({ turnId: "t2", canvas: { path } })]]) }))
        .toEqual([{ kind: "conversation", provider: "claude" }]);
      expect(others({ conversationWork: [work({ turnId: "old" })], liveTurns: new Map([["c1", turn({ turnId: "t2" })]]) })).toEqual([]);
      expect(others({ conversationWork: [work({ turnId: "old", path: ".doan/canvases/b.html", frame: "b" })], liveTurns: new Map([["c1", turn({ turnId: "t2", canvas: { path } })]]) }))
        .toEqual([{ kind: "conversation", provider: "claude" }]);
    });
  });

  // Per file: a session's other paths keep the session alive in the app, but not this file in the list.
  test("a terminal drops out once its own touch of this file is five minutes old", () => {
    const at = (touched: number) => others({ work: [item({ touched }), item({ session: "s1", path: ".doan/canvases/b.html", touched: now })] });
    expect(at(now - WORK_EXPIRY_MS + 1)).toEqual([{ kind: "terminal", provider: "codex" }]);
    expect(at(now - WORK_EXPIRY_MS)).toEqual([]);
  });

  test("most recently touched first, bound conversations without an update last", () => {
    const listed = others({
      work: [item({ session: "a", touched: now - 300, frame: "a" }), item({ session: "b", touched: now - 100, frame: "b" })],
      conversationWork: [work({ conversationId: "c1", touched: now - 200, frame: "c1" })],
      liveTurns: new Map([["c0", turn({ turnId: "u0", canvas: { path } })], ["c1", turn()]]),
    });
    expect(listed.map(other => other.frame ?? other.kind)).toEqual(["b", "c1", "a", "conversation"]);
  });

  test("the list keeps the eight most recent", () => {
    const work = Array.from({ length: WORK_OTHERS_MAX + 2 }, (_, i) => item({ session: `s${i}`, touched: now - 1000 + i, frame: `f${i}` }));
    const listed = others({ work, liveTurns: new Map([["c1", turn({ canvas: { path } })]]) });
    expect(listed).toHaveLength(WORK_OTHERS_MAX);
    expect(listed.map(other => other.frame)).toEqual(["f9", "f8", "f7", "f6", "f5", "f4", "f3", "f2"]);
  });

  test("no element carries an id of any kind", () => {
    const listed = others({
      work: [item({ frame: "a", note: "n" }), item({ session: null, provider: null })],
      conversationWork: [work({ frame: "b", note: "m" })],
      liveTurns: new Map([["c1", turn()], ["c2", turn({ turnId: "u2", canvas: { path, id: "x" } })]]),
    });
    expect(listed).toHaveLength(4);
    for (const other of listed) for (const key of Object.keys(other)) expect(["kind", "provider", "frame", "note"]).toContain(key);
  });

  test("the cap is the v3 schema's maxItems", () => {
    expect(WORK_OTHERS_MAX).toBe(appSocketV3Schema.$defs.response.oneOf[0]!.properties.others!.maxItems);
  });
});
