import { describe, expect, test } from "vitest";
import { conversationCanvasKey, parseUiState } from "../../restore/uiState";
import type { ConversationEvent, StageSignal } from "../conversation/types";
import type { CanvasRow, FolderEntry } from "../view";
import {
  PROTOTYPE_CONVERSATION_METHODS, prototypeAuthSnapshot, prototypeConversationListed, prototypeRememberedConversation, prototypeComposerSettings, prototypeEntry, prototypeConversationScope, prototypeListElsewhere, prototypeListRows, prototypeReceives, prototypeRevealRequest, prototypeWorkItems,
  type PlayingCanvas, type ScopedConversation,
} from "./conversationScope";
import type { WorkItem } from "../workState";
import type { AuthStatusDto } from "../agentAuth/types";
import { DEFAULT_PREFERENCES } from "../preferences";

const base = "http://127.0.0.1:5123/t/tok/";
function row(path: string, patch: Partial<CanvasRow> = {}): CanvasRow {
  return { path, url: `${base}k1/${path}`, ...patch };
}
const PROTO = ".doan/canvases/proto.html";
const LOOSE = ".doan/canvases/loose.html";
const OTHER = ".doan/canvases/other.html";
const list = (path: string, canvases: CanvasRow[]): FolderEntry => ({ path, kind: "list", canvases, servedRev: 0 });
// Two worktrees of one repository: the same canvas ids and paths in both.
const ENTRIES: FolderEntry[] = [
  list("/r", [row(PROTO, { id: "proto" }), row(LOOSE), row(OTHER, { id: "other" })]),
  list("/r-wt", [row(PROTO, { id: "proto" }), row(LOOSE)]),
];
const PLAYING: PlayingCanvas = { root: "/r", canvas: { id: "proto" }, path: PROTO };
const PLAYING_WT: PlayingCanvas = { root: "/r-wt", canvas: { id: "proto" }, path: PROTO };
const PLAYING_LOOSE: PlayingCanvas = { root: "/r", canvas: { path: LOOSE }, path: LOOSE };

const CONVERSATIONS: ScopedConversation[] = [
  { conversationId: "c-proto", root: "/r", canvas: { id: "proto", path: PROTO } },
  { conversationId: "c-proto-wt", root: "/r-wt", canvas: { id: "proto", path: PROTO } },
  { conversationId: "c-loose", root: "/r", canvas: { path: LOOSE } },
  { conversationId: "c-loose-wt", root: "/r-wt", canvas: { path: LOOSE } },
  { conversationId: "c-other", root: "/r", canvas: { id: "other", path: OTHER } },
  { conversationId: "c-project", root: "/r" },
];

const BY_ID = ["read", "send", "queue", "removeQueued", "sendQueuedNow", "takeDraft", "interrupt", "answerPermission", "answerQuestion", "markSeen", "setPermissionMode", "scheduled"] as const;
const ROOT_ONLY = ["models", "skills"] as const;

describe("prototypeConversationScope", () => {
  const allowed = (method: string, payload: unknown, playing: PlayingCanvas | null = PLAYING, entries = ENTRIES) =>
    prototypeConversationScope(method, payload, playing, CONVERSATIONS, entries);

  test("the allowed methods are the panel's, delete included; newDesign and forCanvas are not among them", () => {
    expect([...PROTOTYPE_CONVERSATION_METHODS].sort()).toEqual([...BY_ID, ...ROOT_ONLY, "list", "resumeTarget", "start", "delete"].sort());
    expect(allowed("start", { root: "/r", mode: "newDesign", text: "x", runtime: "claude" })).toBe(false);
    expect(allowed("forCanvas", { root: "/r", canvas: { id: "proto", path: PROTO } })).toBe(false);
    for (const method of ["", "toString", "__proto__", "deleteAll"]) expect(allowed(method, { conversationId: "c-proto" }), method).toBe(false);
  });

  test("a method naming a conversation is allowed only for one of the playing canvas", () => {
    for (const method of BY_ID) {
      expect(allowed(method, { conversationId: "c-proto" }), method).toBe(true);
      for (const id of ["c-other", "c-project", "c-loose", "missing"]) expect(allowed(method, { conversationId: id }), `${method} ${id}`).toBe(false);
    }
  });

  test("a method that takes only a root needs the playing root", () => {
    for (const method of ROOT_ONLY) {
      expect(allowed(method, { root: "/r", runtime: "claude", provider: "claude" }), method).toBe(true);
      expect(allowed(method, { root: "/r-wt", runtime: "claude", provider: "claude" }), method).toBe(false);
      expect(allowed(method, { root: "/elsewhere" }), method).toBe(false);
      expect(allowed(method, {}), method).toBe(false);
    }
  });

  // An ACP conversation's commands name the conversation: only one of the playing canvas.
  test("a skills request that names a conversation needs one of the playing canvas", () => {
    expect(allowed("skills", { root: "/r", provider: "copilot", conversationId: "c-proto" })).toBe(true);
    for (const id of ["c-other", "c-project", "c-proto-wt", "missing"]) expect(allowed("skills", { root: "/r", provider: "copilot", conversationId: id }), id).toBe(false);
  });

  // The window's head menu deletes a conversation of the canvas it plays, never another canvas's or a project one.
  test("delete reaches only a conversation of the playing canvas in the playing root", () => {
    expect(allowed("delete", { conversationId: "c-proto" })).toBe(true);
    for (const id of ["c-other", "c-project", "c-proto-wt", "missing"]) expect(allowed("delete", { conversationId: id }), id).toBe(false);
    expect(allowed("delete", { conversationId: "c-proto" }, null)).toBe(false);
  });

  test("list and resumeTarget name the playing canvas in the playing root only", () => {
    for (const method of ["list", "resumeTarget"]) {
      expect(allowed(method, { root: "/r", canvas: { id: "proto", path: PROTO } }), method).toBe(true);
      expect(allowed(method, { root: "/r", canvas: { id: "other", path: OTHER } }), method).toBe(false);
      expect(allowed(method, { root: "/r-wt", canvas: { id: "proto", path: PROTO } }), method).toBe(false);
      expect(allowed(method, { root: "/r" }), method).toBe(false);
      expect(allowed(method, { root: "/r", canvas: "proto" }), method).toBe(false);
    }
  });

  test("start may begin the playing canvas's new conversation or resume its association, nothing else", () => {
    const start = (over: Record<string, unknown>) => allowed("start", { root: "/r", canvas: { id: "proto", path: PROTO }, text: "x", runtime: "claude", ...over });
    expect(start({ mode: "new" })).toBe(true);
    expect(start({ mode: "resume" })).toBe(true);
    expect(start({ mode: "newDesign" })).toBe(false);
    expect(start({ mode: "new", canvas: { id: "other", path: OTHER } })).toBe(false);
    expect(start({ mode: "new", root: "/r-wt" })).toBe(false);
    expect(start({ mode: "new", canvas: undefined })).toBe(false);
  });

  test("nothing is allowed without a playing target or with a payload that is not an object", () => {
    expect(allowed("read", { conversationId: "c-proto" }, null)).toBe(false);
    expect(allowed("list", { root: "/r", canvas: { id: "proto", path: PROTO } }, null)).toBe(false);
    for (const payload of [null, undefined, "c-proto", ["c-proto"]]) expect(allowed("read", payload)).toBe(false);
  });

  test("the target's canvas row loading, gone or with a shared ID refuses every request", () => {
    const loading: FolderEntry[] = [{ path: "/r", kind: "loading" }, ENTRIES[1]!];
    const gone: FolderEntry[] = [list("/r", [row(LOOSE)]), ENTRIES[1]!];
    const shared: FolderEntry[] = [list("/r", [row(PROTO, { id: "proto" }), row(".doan/canvases/copy.html", { id: "proto" })]), ENTRIES[1]!];
    const unregistered: FolderEntry[] = [ENTRIES[1]!];
    for (const entries of [loading, gone, shared, unregistered]) {
      expect(allowed("read", { conversationId: "c-proto" }, PLAYING, entries)).toBe(false);
      expect(allowed("list", { root: "/r", canvas: { id: "proto", path: PROTO } }, PLAYING, entries)).toBe(false);
      expect(allowed("start", { root: "/r", mode: "new", canvas: { id: "proto", path: PROTO }, text: "x", runtime: "claude" }, PLAYING, entries)).toBe(false);
    }
  });

  test("the run's phase is not looked at: a listed canvas whose frame is unavailable or whose load failed is still in scope", () => {
    // The scope sees only the list; a row with no frames left (the frame went) is still the playing canvas.
    const noFrames: FolderEntry[] = [list("/r", [row(PROTO, { id: "proto", frames: [] }), row(LOOSE)]), ENTRIES[1]!];
    expect(allowed("send", { conversationId: "c-proto" }, PLAYING, noFrames)).toBe(true);
  });

  // POSTMORTEM 2026-11-01: worktrees of one repository share canvas ids and paths, so the root is in every comparison.
  describe("two worktrees with the same canvas id and path", () => {
    test("switching between them moves the scope with the root", () => {
      expect(allowed("read", { conversationId: "c-proto" }, PLAYING)).toBe(true);
      expect(allowed("read", { conversationId: "c-proto-wt" }, PLAYING)).toBe(false);
      expect(allowed("read", { conversationId: "c-proto" }, PLAYING_WT)).toBe(false);
      expect(allowed("read", { conversationId: "c-proto-wt" }, PLAYING_WT)).toBe(true);
      expect(allowed("list", { root: "/r", canvas: { id: "proto", path: PROTO } }, PLAYING_WT)).toBe(false);
    });

    test("an ID-less canvas is matched by its path within the playing root", () => {
      expect(allowed("read", { conversationId: "c-loose" }, PLAYING_LOOSE)).toBe(true);
      expect(allowed("read", { conversationId: "c-loose-wt" }, PLAYING_LOOSE)).toBe(false);
      expect(allowed("read", { conversationId: "c-proto" }, PLAYING_LOOSE)).toBe(false);
      expect(allowed("list", { root: "/r", canvas: { path: LOOSE } }, PLAYING_LOOSE)).toBe(true);
      expect(allowed("list", { root: "/r-wt", canvas: { path: LOOSE } }, PLAYING_LOOSE)).toBe(false);
    });

    test("a row doan ls could not read is no match for an ID-keyed conversation, in either worktree", () => {
      // The file of the ID-keyed canvas became unreadable: listed as an errored, ID-less row at its last path.
      const unreadable: FolderEntry[] = [list("/r", [row(PROTO, { error: { code: "read_failed", message: "x" } }), row(LOOSE)]), ENTRIES[1]!];
      expect(allowed("read", { conversationId: "c-proto" }, PLAYING, unreadable)).toBe(false);
      expect(allowed("read", { conversationId: "c-proto-wt" }, PLAYING, unreadable)).toBe(false);
      expect(allowed("read", { conversationId: "c-proto-wt" }, PLAYING_WT, unreadable)).toBe(true);
    });
  });
});

// The window's view trails main's play (it waits behind the still capture): a list it asks for the canvas it still
// shows is no failure, and no answer for that canvas either.
describe("prototypeListElsewhere", () => {
  test("a list for another canvas, or in another root, than the one playing", () => {
    expect(prototypeListElsewhere({ root: "/r", canvas: { id: "other", path: OTHER } }, PLAYING)).toBe(true);
    expect(prototypeListElsewhere({ root: "/r-wt", canvas: { id: "proto", path: PROTO } }, PLAYING)).toBe(true);
    expect(prototypeListElsewhere({ root: "/r", canvas: { path: LOOSE } }, PLAYING)).toBe(true);
    expect(prototypeListElsewhere({ root: "/r", canvas: { id: "proto", path: PROTO } }, null)).toBe(true);
  });
  test("not the playing canvas's own list, even one refused while its row cannot be judged, nor a malformed request", () => {
    expect(prototypeListElsewhere({ root: "/r", canvas: { id: "proto", path: PROTO } }, PLAYING)).toBe(false);
    expect(prototypeListElsewhere({ root: "/r", canvas: { id: "proto", path: ".doan/canvases/moved.html" } }, PLAYING)).toBe(false);
    expect(prototypeListElsewhere({ root: "/r", canvas: { path: LOOSE } }, PLAYING_LOOSE)).toBe(false);
    for (const payload of [{ root: "/r" }, { canvas: { id: "other", path: OTHER } }, null, "x"]) expect(prototypeListElsewhere(payload, PLAYING), JSON.stringify(payload)).toBe(false);
  });
});

describe("prototypeListRows", () => {
  const rows = CONVERSATIONS.filter(c => c.root === "/r").map(c => ({ conversationId: c.conversationId, ...(c.canvas ? { canvas: c.canvas } : {}) }));
  test("keeps only the playing canvas's conversations", () => {
    expect(prototypeListRows(rows, PLAYING, ENTRIES).map(r => r.conversationId)).toEqual(["c-proto"]);
    expect(prototypeListRows(rows, PLAYING_LOOSE, ENTRIES).map(r => r.conversationId)).toEqual(["c-loose"]);
  });
  test("keeps nothing while the canvas row cannot be judged", () => {
    expect(prototypeListRows(rows, PLAYING, [{ path: "/r", kind: "loading" }])).toEqual([]);
    expect(prototypeListRows(rows, null, ENTRIES)).toEqual([]);
  });
});

describe("prototypeReceives", () => {
  const ev = (conversationId: string): ConversationEvent => ({ v: 1, conversationId, seq: 1, turnId: "t", at: "2026-11-14T00:00:00.000Z", type: "turn.started" });
  const stage = (conversationId: string): StageSignal => ({ conversationId, turnId: "t", seq: 1, rev: 1, stage: { kind: "thinking" } });
  const receives = (message: Parameters<typeof prototypeReceives>[0], playing: PlayingCanvas | null = PLAYING) => prototypeReceives(message, playing, CONVERSATIONS);

  test("events and stages go only for the playing canvas's conversations", () => {
    expect(receives({ channel: "conversation:event", value: ev("c-proto") })).toBe(true);
    expect(receives({ channel: "conversation:stage", value: stage("c-proto") })).toBe(true);
    for (const id of ["c-proto-wt", "c-other", "c-project", "missing"]) {
      expect(receives({ channel: "conversation:event", value: ev(id) }), id).toBe(false);
      expect(receives({ channel: "conversation:stage", value: stage(id) }), id).toBe(false);
    }
    expect(receives({ channel: "conversation:event", value: ev("c-loose") }, PLAYING_LOOSE)).toBe(true);
    expect(receives({ channel: "conversation:event", value: ev("c-loose-wt") }, PLAYING_LOOSE)).toBe(false);
  });

  test("a command turn's boundary goes as its events do", () => {
    const boundary = (conversationId: string) => ({ channel: "conversation:boundary" as const, value: { conversationId, turnId: "t", kind: "compacted" as const } });
    expect(receives(boundary("c-proto"))).toBe(true);
    for (const id of ["c-proto-wt", "c-other", "c-project", "missing"]) expect(receives(boundary(id)), id).toBe(false);
  });

  test("a list change goes for the playing root only", () => {
    expect(receives({ channel: "conversation:listChanged", value: { root: "/r" } })).toBe(true);
    expect(receives({ channel: "conversation:listChanged", value: { root: "/r-wt" } })).toBe(false);
  });

  test("a handoff goes when it starts from or lands on the playing canvas in the playing root", () => {
    const notice = (root: string, from: string, to: string) => ({ root, source: { conversationId: "s", canvas: { id: from, path: `.doan/canvases/${from}.html` } }, target: { conversationId: "t", canvas: { id: to, path: `.doan/canvases/${to}.html` } } });
    expect(receives({ channel: "conversation:handoff", value: notice("/r", "proto", "other") })).toBe(true);
    expect(receives({ channel: "conversation:handoff", value: notice("/r", "other", "proto") })).toBe(true);
    expect(receives({ channel: "conversation:handoff", value: notice("/r", "other", "x") })).toBe(false);
    expect(receives({ channel: "conversation:handoff", value: notice("/r-wt", "proto", "other") })).toBe(false);
    const multi = { root: "/r", source: { conversationId: "s", canvas: { id: "other", path: OTHER } }, targets: [{ conversationId: "a", canvas: { id: "x", path: ".doan/canvases/x.html" } }, { conversationId: "b", canvas: { id: "proto", path: PROTO } }] };
    expect(receives({ channel: "conversation:handoff", value: multi })).toBe(true);
  });

  // A project conversation's handoff has no source canvas: it goes only when it lands on the playing canvas.
  test("a project conversation's handoff goes when it lands on the playing canvas, and never by its source", () => {
    const project = (root: string, to: string) => ({ root, source: { conversationId: "c-project" }, target: { conversationId: "t", canvas: { id: to, path: `.doan/canvases/${to}.html` } } });
    expect(receives({ channel: "conversation:handoff", value: project("/r", "proto") })).toBe(true);
    expect(receives({ channel: "conversation:handoff", value: project("/r", "other") })).toBe(false);
    expect(receives({ channel: "conversation:handoff", value: project("/r-wt", "proto") })).toBe(false);
    const multi = { root: "/r", source: { conversationId: "c-project" }, targets: [{ conversationId: "a", canvas: { id: "x", path: ".doan/canvases/x.html" } }, { conversationId: "b", canvas: { id: "proto", path: PROTO } }] };
    expect(receives({ channel: "conversation:handoff", value: multi })).toBe(true);
    expect(receives({ channel: "conversation:handoff", value: { ...multi, targets: [multi.targets[0]!] } })).toBe(false);
  });

  test("nothing goes while nothing plays", () => {
    expect(receives({ channel: "conversation:event", value: ev("c-proto") }, null)).toBe(false);
    expect(receives({ channel: "conversation:listChanged", value: { root: "/r" } }, null)).toBe(false);
  });
});

// A handoff card from the Overview names a project conversation the window cannot list: the window asks whether it is
// still a conversation of the playing root, to draw it as deleted otherwise.
describe("prototypeConversationListed", () => {
  const listed = (payload: unknown, playing: PlayingCanvas | null = PLAYING, conversations: readonly ScopedConversation[] | null = CONVERSATIONS) =>
    prototypeConversationListed(payload, playing, conversations);

  test("answers whether a conversation of the playing root is indexed, a project one included", () => {
    expect(listed({ root: "/r", conversationId: "c-project" })).toBe(true);
    expect(listed({ root: "/r", conversationId: "c-other" })).toBe(true);
    expect(listed({ root: "/r", conversationId: "gone" })).toBe(false);
  });

  // Worktrees share nothing here: a conversation of another root is not this root's.
  test("answers false for another root's conversation and nothing about a root that is not playing", () => {
    expect(listed({ root: "/r", conversationId: "c-proto-wt" })).toBe(false);
    expect(listed({ root: "/r-wt", conversationId: "c-proto-wt" })).toBeNull();
    expect(listed({ root: "/r", conversationId: "c-project" }, null)).toBeNull();
  });

  test("answers nothing while main's index cannot be read", () => {
    expect(listed({ root: "/r", conversationId: "c-project" }, PLAYING, null)).toBeNull();
  });

  test("refuses a malformed request", () => {
    for (const payload of [undefined, null, "c-project", { root: "/r" }, { conversationId: "c-project" }, { root: "/r", conversationId: 1 }, { root: "/r", conversationId: "" }, { root: "/r", conversationId: "x".repeat(513) }, { root: "/r", conversationId: "c-project", extra: true }])
      expect(listed(payload), JSON.stringify(payload)).toBeNull();
  });
});

describe("prototypeRevealRequest", () => {
  const reveal = (payload: Parameters<typeof prototypeRevealRequest>[0], playing: PlayingCanvas | null = PLAYING, entries = ENTRIES) =>
    prototypeRevealRequest(payload, playing, CONVERSATIONS, entries);

  test("a person's chip goes to its conversation's canvas", () => {
    expect(reveal({ kind: "chip", conversationId: "c-proto", anchor: { frame: { id: "checkout", title: "Checkout" } } }))
      .toEqual({ kind: "chip", root: "/r", canvas: { id: "proto", path: PROTO }, conversationId: "c-proto", anchor: { frame: { id: "checkout", title: "Checkout" } } });
  });

  test("an answer's chip keeps its link", () => {
    expect(reveal({ kind: "reply", conversationId: "c-proto", link: { canvas: "other", kind: "frame", id: "card" } }))
      .toEqual({ kind: "reply", root: "/r", conversationId: "c-proto", link: { canvas: "other", kind: "frame", id: "card" } });
  });

  test("Sign in opens the provider's Settings", () => {
    expect(reveal({ kind: "settings", provider: "codex" })).toEqual({ kind: "settings", provider: "codex" });
    expect(reveal({ kind: "settings" })).toEqual({ kind: "settings" });
    expect(reveal({ kind: "settings" }, null)).toEqual({ kind: "settings" });
  });

  test("an Open names a conversation of the playing root: a handoff's project source or a canvas's", () => {
    expect(reveal({ kind: "conversation", conversationId: "c-project" })).toEqual({ kind: "conversation", root: "/r", conversationId: "c-project" });
    expect(reveal({ kind: "conversation", conversationId: "c-other" })).toEqual({ kind: "conversation", root: "/r", conversationId: "c-other", canvas: { id: "other", path: OTHER } });
    expect(reveal({ kind: "conversation", conversationId: "c-proto-wt" })).toBeNull();
  });

  test("a handoff's Open names a listed canvas of the playing root, with or without its conversation", () => {
    expect(reveal({ kind: "handoff", canvas: { id: "other", path: OTHER }, conversationId: "c-other" })).toEqual({ kind: "handoff", root: "/r", canvas: { id: "other", path: OTHER }, conversationId: "c-other" });
    expect(reveal({ kind: "handoff", canvas: { path: LOOSE } })).toEqual({ kind: "handoff", root: "/r", canvas: { path: LOOSE } });
    expect(reveal({ kind: "handoff", canvas: { id: "gone", path: ".doan/canvases/gone.html" } })).toBeNull();
    expect(reveal({ kind: "handoff", canvas: { id: "other", path: OTHER }, conversationId: "c-proto-wt" })).toBeNull();
  });

  test("a chip or answer of a conversation outside the playing canvas is refused", () => {
    for (const id of ["c-other", "c-project", "c-proto-wt", "missing"]) {
      expect(reveal({ kind: "chip", conversationId: id, anchor: { frame: { id: "a" } } }), id).toBeNull();
      expect(reveal({ kind: "reply", conversationId: id, link: { canvas: "proto", kind: "frame", id: "a" } }), id).toBeNull();
    }
    expect(reveal({ kind: "chip", conversationId: "c-proto", anchor: { frame: { id: "a" } } }, PLAYING_WT)).toBeNull();
  });

  test("nothing but Settings goes while nothing plays or the canvas row is gone", () => {
    expect(reveal({ kind: "chip", conversationId: "c-proto", anchor: { frame: { id: "a" } } }, null)).toBeNull();
    expect(reveal({ kind: "conversation", conversationId: "c-project" }, null)).toBeNull();
    expect(reveal({ kind: "chip", conversationId: "c-proto", anchor: { frame: { id: "a" } } }, PLAYING, [list("/r", [row(LOOSE)])])).toBeNull();
    expect(reveal({ kind: "settings", provider: "claude" }, null)).toEqual({ kind: "settings", provider: "claude" });
  });
});

// The window reads the raw saved file; these keep it to the id and key rules ui-state is written and parsed with.
describe("prototypeRememberedConversation against ui-state", () => {
  const ID = "0a1b2c3d-0000-4000-8000-000000000001";
  const savedWith = (key: string, id: string) => ({ screen: "home", expanded: {}, lastByRoot: {}, conversationByCanvas: { "/r": { [key]: id } } });

  test.each([
    ID, "ffffffff-ffff-ffff-ffff-ffffffffffff", ID.toUpperCase(), ID.slice(1), `${ID}0`, `0${ID}`, `${ID}\n`, ID.replaceAll("-", ""), ID.replace("0a", "0g"), "not-an-id", "",
  ])("accepts the id %j exactly when ui-state keeps it", (id) => {
    const kept = parseUiState(JSON.stringify(savedWith("proto", id)), ["/r"])?.conversationByCanvas?.["/r"]?.["proto"] ?? null;
    expect(prototypeRememberedConversation(savedWith("proto", id), PLAYING, ENTRIES)).toBe(kept);
  });

  test("looks a canvas up under ui-state's key, by id and by path", () => {
    expect(prototypeRememberedConversation(savedWith(conversationCanvasKey({ path: PROTO, id: "proto" }), ID), PLAYING, ENTRIES)).toBe(ID);
    expect(prototypeRememberedConversation(savedWith(conversationCanvasKey({ path: LOOSE }), ID), PLAYING_LOOSE, ENTRIES)).toBe(ID);
  });
});

describe("prototypeWorkItems", () => {
  const item = (session: string | null, provider: WorkItem["provider"], root = "/elsewhere"): WorkItem => ({ session, provider, root, path: ".doan/canvases/x.html", touched: 1, turn: "t" });
  test("keeps only the terminal work of the session the playing canvas would resume, whatever its root", () => {
    const items = [item("s1", "claude"), item("s1", "codex"), item("s2", "claude", "/r"), item(null, null, "/r")];
    expect(prototypeWorkItems(items, { session: "s1", runtime: "claude" })).toEqual([item("s1", "claude")]);
    expect(prototypeWorkItems(items, null)).toEqual([]);
  });
});

describe("prototypeAuthSnapshot", () => {
  test("keeps readiness and drops every account's identity", () => {
    const status = (provider: AuthStatusDto["provider"], account: AuthStatusDto["account"]): AuthStatusDto => ({
      provider, revision: 3, generation: 2, phase: account ? "connected" : "disconnected", account, attempt: null,
      readiness: { ready: account !== null, cause: account ? "ready" : "not_connected", action: account ? null : "signIn" } as AuthStatusDto["readiness"], error: null, actions: [],
    });
    const snapshot = { revision: 7, providers: [status("claude", { email: "me@example.com", displayName: "Me" }), status("codex", null)] };
    const narrow = prototypeAuthSnapshot(snapshot);
    expect(narrow).toEqual({ revision: 7, providers: [{ ...snapshot.providers[0], account: {} }, snapshot.providers[1]] });
    expect(JSON.stringify(narrow)).not.toContain("example.com");
    expect(JSON.stringify(narrow)).not.toContain("Me");
  });
});

describe("prototypeComposerSettings", () => {
  test("the New conversations default, Last used without the last project, and the buddy", () => {
    const preferences = { ...DEFAULT_PREFERENCES, newConversation: { provider: "codex" as const, model: "gpt" }, buddy: "puri" as const };
    const ui = { v: 1, home: { lastRoot: "/r", lastProvider: "claude" as const, models: { claude: { model: "sonnet" } } } } as const;
    expect(prototypeComposerSettings(ui as never, preferences)).toEqual({ home: { lastProvider: "claude", models: { claude: { model: "sonnet" } } }, newConversation: { provider: "codex", model: "gpt" }, buddy: "puri" });
  });
  test("nothing remembered and no buddy chosen", () => {
    expect(prototypeComposerSettings(null, DEFAULT_PREFERENCES)).toEqual({ home: null, newConversation: null, buddy: "doany" });
  });
});

describe("prototypeEntry", () => {
  test("the playing root's folder entry only, with its canvas rows", () => {
    expect(prototypeEntry(ENTRIES, PLAYING)).toBe(ENTRIES[0]);
    expect(prototypeEntry(ENTRIES, PLAYING_WT)).toBe(ENTRIES[1]);
    expect(prototypeEntry([{ path: "/r", kind: "loading" }], PLAYING)).toEqual({ path: "/r", kind: "loading" });
  });
  test("nothing while nothing plays or the root is not registered", () => {
    expect(prototypeEntry(ENTRIES, null)).toBeNull();
    expect(prototypeEntry([ENTRIES[1]!], PLAYING)).toBeNull();
  });
});

// The conversation the main window last showed on the playing canvas (ui-state conversationByCanvas, keyed by root and
// by the canvas's id, else its path). The window only reads it, and reads nothing else of ui-state.
describe("prototypeRememberedConversation", () => {
  const A = "0a1b2c3d-0000-4000-8000-000000000001", B = "0a1b2c3d-0000-4000-8000-000000000002";
  const saved = { expanded: ["/r"], conversationByRoot: { "/r": B }, conversationByCanvas: { "/r": { proto: A, [LOOSE]: B, other: B }, "/r-wt": { proto: B } } };
  test("names the remembered conversation of the playing canvas, by id or by path, in the playing root only", () => {
    expect(prototypeRememberedConversation(saved, PLAYING, ENTRIES)).toBe(A);
    expect(prototypeRememberedConversation(saved, PLAYING_LOOSE, ENTRIES)).toBe(B);
    expect(prototypeRememberedConversation(saved, PLAYING_WT, ENTRIES)).toBe(B);
  });
  test("is null when nothing plays, nothing is remembered or the value is not a conversation id", () => {
    expect(prototypeRememberedConversation(saved, null, ENTRIES)).toBeNull();
    for (const value of [null, undefined, "x", [], {}, { conversationByCanvas: [] }, { conversationByCanvas: { "/r": "x" } }, { conversationByCanvas: { "/r": { proto: "not-an-id" } } },
      { conversationByCanvas: { "/r": { proto: A.toUpperCase() } } }, { conversationByCanvas: { "/r": { proto: 7 } } }, { conversationByCanvas: { "/other": { proto: A } } }])
      expect(prototypeRememberedConversation(value, PLAYING, ENTRIES), JSON.stringify(value)).toBeNull();
  });
  test("is null for a canvas whose id is listed twice, a canvas not listed and a root not listed", () => {
    const twice: FolderEntry[] = [list("/r", [row(PROTO, { id: "proto" }), row(".doan/canvases/copy.html", { id: "proto" })])];
    expect(prototypeRememberedConversation(saved, PLAYING, twice)).toBeNull();
    expect(prototypeRememberedConversation(saved, PLAYING, [list("/r", [row(OTHER, { id: "other" })])])).toBeNull();
    expect(prototypeRememberedConversation(saved, PLAYING, [])).toBeNull();
  });
});
