import { describe, expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../view";
import { exportTargetMatches, MAX_REPORT_FRAMES, MAX_REPORT_STRING, parseChooseRequest, parseComposerChoice, parseExportRequest, parseFramesReport, parseModeRequest, parsePanelRequest, parseReloadRequest, parseRevealRequest, parseRunReport, parseShowingRequest, playTarget, validateCliPlay, validatePlay, windowRequest } from "./requests";

const base = "http://127.0.0.1:5123/t/tok/";
function row(path: string, patch: Partial<CanvasRow> = {}): CanvasRow {
  return { path, url: `${base}k1/${path}`, ...patch };
}
const proto = row(".doan/canvases/proto.html", { id: "proto" });
const loose = row(".doan/canvases/loose.html");
const twinA = row(".doan/canvases/a.html", { id: "twin" });
const twinB = row(".doan/canvases/b.html", { id: "twin" });
const entries: FolderEntry[] = [
  { path: "/r", kind: "list", canvases: [proto, loose, twinA, twinB], servedRev: 0 },
  { path: "/r-wt", kind: "list", canvases: [row(".doan/canvases/proto.html", { id: "proto" })], servedRev: 0 },
  { path: "/broken", kind: "cliError", reason: "x" },
];
const play = { root: "/r", path: ".doan/canvases/proto.html", frame: "phone", mark: "390x844" };

describe("validatePlay", () => {
  test("the main window's request names a target and the mark's size", () => {
    expect(validatePlay("main", play, entries)).toEqual({ target: { root: "/r", canvas: { id: "proto" }, frame: "phone" }, size: { width: 390, height: 844 } });
  });

  test("an ID-less canvas is targeted by its path", () => {
    expect(validatePlay("main", { ...play, path: loose.path }, entries)?.target).toEqual({ root: "/r", canvas: { path: loose.path }, frame: "phone" });
  });

  test("another worktree's same canvas and frame is another target", () => {
    const other = validatePlay("main", { ...play, root: "/r-wt" }, entries);
    expect(other?.target).toEqual({ root: "/r-wt", canvas: { id: "proto" }, frame: "phone" });
  });

  test("only the main window may ask", () => {
    for (const kind of ["prototype", "settings", undefined, null, ""]) expect(validatePlay(kind, play, entries)).toBeNull();
  });

  test("refuses unregistered roots, roots without a list, missing rows and shared ids", () => {
    expect(validatePlay("main", { ...play, root: "/elsewhere" }, entries)).toBeNull();
    expect(validatePlay("main", { ...play, root: "/broken" }, entries)).toBeNull();
    expect(validatePlay("main", { ...play, path: ".doan/canvases/gone.html" }, entries)).toBeNull();
    expect(validatePlay("main", { ...play, path: twinA.path }, entries)).toBeNull();
  });

  test("refuses an empty, over-long or non-string frame id", () => {
    expect(validatePlay("main", { ...play, frame: "" }, entries)).toBeNull();
    expect(validatePlay("main", { ...play, frame: "x".repeat(MAX_REPORT_STRING + 1) }, entries)).toBeNull();
    expect(validatePlay("main", { ...play, frame: "x".repeat(MAX_REPORT_STRING) }, entries)).not.toBeNull();
    expect(validatePlay("main", { ...play, frame: 1 }, entries)).toBeNull();
  });

  test("refuses a missing or invalid mark", () => {
    for (const mark of ["390", "", "0x1", undefined, 390]) expect(validatePlay("main", { ...play, mark }, entries)).toBeNull();
  });

  test("refuses a URL, extra or missing fields and non-objects", () => {
    expect(validatePlay("main", { ...play, url: `${base}k9/x.html` }, entries)).toBeNull();
    const { mark: _mark, ...noMark } = play;
    expect(validatePlay("main", noMark, entries)).toBeNull();
    for (const value of [null, undefined, "x", [play], 1]) expect(validatePlay("main", value, entries)).toBeNull();
  });
});

describe("prototype window requests", () => {
  test("the drawer names one frame", () => {
    expect(parseChooseRequest("prototype", { frame: "phone" })).toBe("phone");
    for (const value of [{ frame: "" }, { frame: 1 }, { frame: "a", root: "/r" }, null, "phone"]) expect(parseChooseRequest("prototype", value)).toBeNull();
    expect(parseChooseRequest("main", { frame: "phone" })).toBeNull();
  });

  test("Reload and Retry name the run they answer", () => {
    expect(parseReloadRequest("prototype", { gen: 3 })).toBe(3);
    for (const value of [{ gen: 0 }, { gen: -1 }, { gen: 1.5 }, { gen: "3" }, { gen: Number.MAX_SAFE_INTEGER + 1 }, {}, null]) expect(parseReloadRequest("prototype", value)).toBeNull();
    expect(parseReloadRequest("main", { gen: 3 })).toBeNull();
  });

  test("the viewport toggle names Fit or Responsive and nothing else", () => {
    expect(parseModeRequest("prototype", { mode: "fit" })).toBe("fit");
    expect(parseModeRequest("prototype", { mode: "responsive" })).toBe("responsive");
    for (const value of [{ mode: "Fit" }, { mode: "zoom" }, { mode: "" }, { mode: 1 }, { mode: null }, { mode: "fit", gen: 1 }, {}, { modes: "fit" }, null, undefined, "fit", ["fit"]]) {
      expect(parseModeRequest("prototype", value), JSON.stringify(value)).toBeNull();
    }
    for (const kind of ["main", "settings", undefined, null, ""]) expect(parseModeRequest(kind, { mode: "fit" })).toBeNull();
  });

  test("Back, Forward, Close and the state read come only from the prototype window", () => {
    expect(windowRequest("prototype")).toBe(true);
    for (const kind of ["main", "settings", undefined, null]) expect(windowRequest(kind)).toBe(false);
  });
});

describe("parseRunReport", () => {
  const frames = [{ id: "phone", title: "Phone", size: "390x844", number: 1 }, { id: "tablet", size: "820x1180", number: 3 }];

  test("a ready run reports its size and the canvas's marked frames", () => {
    expect(parseRunReport("prototype", { gen: 2, state: "ready", size: "390x844", frames })).toEqual({ gen: 2, state: "ready", size: { width: 390, height: 844 }, frames });
  });

  test("a lost frame still reports the marked frames for the drawer", () => {
    for (const state of ["missing", "duplicate", "unmarked", "invalid"]) {
      expect(parseRunReport("prototype", { gen: 2, state, frames })).toEqual({ gen: 2, state, frames });
    }
  });

  test("a timeout carries nothing else", () => {
    expect(parseRunReport("prototype", { gen: 2, state: "timeout" })).toEqual({ gen: 2, state: "timeout" });
    expect(parseRunReport("prototype", { gen: 2, state: "timeout", frames })).toBeNull();
  });

  test("refuses other senders, unknown states, bad generations and bad sizes", () => {
    expect(parseRunReport("main", { gen: 2, state: "ready", size: "390x844", frames })).toBeNull();
    expect(parseRunReport("prototype", { gen: 2, state: "loading", frames })).toBeNull();
    expect(parseRunReport("prototype", { gen: 0, state: "missing", frames })).toBeNull();
    expect(parseRunReport("prototype", { gen: 2, state: "ready", size: "390", frames })).toBeNull();
    expect(parseRunReport("prototype", { gen: 2, state: "ready", frames })).toBeNull();
    expect(parseRunReport("prototype", { gen: 2, state: "missing", size: "390x844", frames })).toBeNull();
  });

  test("refuses a frame list that is not unique, marked and within the caps", () => {
    const bad = [
      [{ id: "", size: "390x844", number: 1 }],
      [{ id: "a", size: "390", number: 1 }],
      [{ id: "a", size: "390x844", number: 1 }, { id: "a", size: "390x844", number: 2 }],
      [{ id: "a", title: 1, size: "390x844", number: 1 }],
      [{ id: "a", size: "390x844", number: 1, extra: true }],
      [{ id: "x".repeat(MAX_REPORT_STRING + 1), size: "390x844", number: 1 }],
      [{ id: "a", title: "x".repeat(MAX_REPORT_STRING + 1), size: "390x844", number: 1 }],
      Array.from({ length: MAX_REPORT_FRAMES + 1 }, (_, i) => ({ id: `f${i}`, size: "1x1", number: i + 1 })),
      [{ id: "a", size: "390x844" }],
      [{ id: "a", size: "390x844", number: 0 }],
      [{ id: "a", size: "390x844", number: 1.5 }],
      [{ id: "a", size: "390x844", number: "1" }],
      [{ id: "a", size: "390x844", number: 2 }, { id: "b", size: "390x844", number: 2 }],
      [{ id: "a", size: "390x844", number: 3 }, { id: "b", size: "390x844", number: 1 }],
      "phone",
    ];
    for (const list of bad) expect(parseRunReport("prototype", { gen: 2, state: "missing", frames: list })).toBeNull();
    expect(parseRunReport("prototype", { gen: 2, state: "missing", frames: [] })).toEqual({ gen: 2, state: "missing", frames: [] });
  });
});

describe("parseFramesReport", () => {
  test("the list the run sends after load", () => {
    expect(parseFramesReport("prototype", { gen: 4, frames: [{ id: "a", size: "1x1", number: 2 }] })).toEqual({ gen: 4, frames: [{ id: "a", size: "1x1", number: 2 }] });
    expect(parseFramesReport("main", { gen: 4, frames: [] })).toBeNull();
    expect(parseFramesReport("prototype", { gen: 4 })).toBeNull();
  });
});

// The row and canvas key a play names, shared by the main window's Play and `doan open --prototype` (app-socket v6).
describe("playTarget", () => {
  test("a listed row and a valid mark give the target and the mark's size", () => {
    expect(playTarget("/r", proto.path, "phone", "390x844", entries)).toEqual({ target: { root: "/r", canvas: { id: "proto" }, frame: "phone" }, size: { width: 390, height: 844 } });
    expect(playTarget("/r", loose.path, "phone", "390x844", entries)?.target).toEqual({ root: "/r", canvas: { path: loose.path }, frame: "phone" });
  });

  test("two rows sharing a canvas ID are no target", () => {
    expect(playTarget("/r", twinA.path, "phone", "390x844", entries)).toBeNull();
    expect(playTarget("/r", twinB.path, "phone", "390x844", entries)).toBeNull();
  });

  test("an unlisted root or row, a root without a list, a bad frame id or mark is no target", () => {
    expect(playTarget("/elsewhere", proto.path, "phone", "390x844", entries)).toBeNull();
    expect(playTarget("/broken", proto.path, "phone", "390x844", entries)).toBeNull();
    expect(playTarget("/r", ".doan/canvases/gone.html", "phone", "390x844", entries)).toBeNull();
    expect(playTarget("/r", proto.path, "", "390x844", entries)).toBeNull();
    expect(playTarget("/r", proto.path, "x".repeat(MAX_REPORT_STRING + 1), "390x844", entries)).toBeNull();
    for (const mark of ["390x844 ", "0x1", "", "390"]) expect(playTarget("/r", proto.path, "phone", mark, entries)).toBeNull();
  });

  test("the main window's Play gives the same answer", () => {
    for (const path of [proto.path, loose.path, twinA.path, ".doan/canvases/gone.html"]) {
      expect(validatePlay("main", { ...play, path }, entries)).toEqual(playTarget("/r", path, "phone", "390x844", entries));
    }
  });
});

describe("validateCliPlay", () => {
  const request = { v: 6, token: "a".repeat(64), root: "/r", path: proto.path, frame: "phone", mark: "390x844" };

  test("a v6 play request gives its root, path, frame and mark", () => {
    expect(validateCliPlay(request)).toEqual({ root: "/r", path: proto.path, frame: "phone", mark: "390x844" });
  });

  // The schema allows 200 code points; the board and this window can select only 200 UTF-16 units (MAX_REPORT_STRING).
  test("a frame id over 200 UTF-16 units is refused even within 200 code points", () => {
    expect(validateCliPlay({ ...request, frame: "x".repeat(200) })).not.toBeNull();
    expect(validateCliPlay({ ...request, frame: "😀".repeat(100) })).not.toBeNull();
    expect(validateCliPlay({ ...request, frame: "😀".repeat(101) })).toBeNull();
  });

  test("refuses another version, a missing or extra field, a bad mark and non-objects", () => {
    const { mark: _mark, ...noMark } = request;
    for (const value of [{ ...request, v: 4 }, { ...request, v: "6" }, noMark, { ...request, url: "x" }, { ...request, frame: "" }, { ...request, frame: 1 },
      { ...request, mark: "390x844 " }, { ...request, root: 1 }, { ...request, token: 1 }, null, [request], "x"]) {
      expect(validateCliPlay(value), JSON.stringify(value)).toBeNull();
    }
  });
});

describe("prototype window export", () => {
  const clicked = { root: "/r", path: proto.path, frame: "phone" };

  test("names the target at the click, from the prototype window only", () => {
    expect(parseExportRequest("prototype", clicked)).toEqual(clicked);
    for (const kind of ["main", "settings", undefined, null, ""]) expect(parseExportRequest(kind, clicked)).toBeNull();
  });

  test("refuses a malformed target", () => {
    for (const value of [{ ...clicked, frame: "" }, { ...clicked, frame: "x".repeat(MAX_REPORT_STRING + 1) }, { ...clicked, root: 1 }, { ...clicked, path: null },
      { root: "/r", path: proto.path }, { ...clicked, gen: 1 }, null, undefined, "phone", [clicked]]) {
      expect(parseExportRequest("prototype", value), JSON.stringify(value)).toBeNull();
    }
  });

  test("the clicked target must be the one playing: same root, canvas path and frame", () => {
    expect(exportTargetMatches(clicked, { ...clicked })).toBe(true);
    expect(exportTargetMatches(clicked, { ...clicked, frame: "tablet" })).toBe(false);
    expect(exportTargetMatches(clicked, { ...clicked, path: loose.path })).toBe(false);
    expect(exportTargetMatches(clicked, { ...clicked, root: "/r-wt" })).toBe(false);
  });

  // `null`: nothing plays that main can name, e.g. the playing canvas's ID is now shared by two rows.
  test("nothing playing never matches", () => {
    expect(exportTargetMatches(clicked, null)).toBe(false);
  });
});

// The prototype window's conversation panel: its open state and width, the conversation it shows, and what it asks the
// main window to show. Every parser refuses another window's role first.
describe("parsePanelRequest", () => {
  test("open and close, with a width in the panel's range", () => {
    expect(parsePanelRequest("prototype", { open: true })).toEqual({ open: true });
    expect(parsePanelRequest("prototype", { open: false })).toEqual({ open: false });
    expect(parsePanelRequest("prototype", { open: true, width: 280 })).toEqual({ open: true, width: 280 });
    expect(parsePanelRequest("prototype", { open: true, width: 333.6 })).toEqual({ open: true, width: 334 });
    expect(parsePanelRequest("prototype", { open: true, width: 4096 })).toEqual({ open: true, width: 4096 });
  });
  test("refuses a width below the panel's minimum, beyond any screen, or not a number", () => {
    for (const width of [279, 4097, -1, 0, Number.NaN, Number.POSITIVE_INFINITY, "300", null]) expect(parsePanelRequest("prototype", { open: true, width }), String(width)).toBeNull();
  });
  test("refuses another role and any other shape", () => {
    expect(parsePanelRequest("main", { open: true })).toBeNull();
    for (const value of [undefined, null, {}, { open: "yes" }, { open: true, extra: 1 }, [true]]) expect(parsePanelRequest("prototype", value), JSON.stringify(value)).toBeNull();
  });
});

describe("parseShowingRequest", () => {
  test("a conversation id or null", () => {
    expect(parseShowingRequest("prototype", { conversationId: "c-1" })).toEqual({ conversationId: "c-1" });
    expect(parseShowingRequest("prototype", { conversationId: null })).toEqual({ conversationId: null });
  });
  test("refuses another role and any other shape", () => {
    expect(parseShowingRequest("main", { conversationId: "c-1" })).toBeNull();
    for (const value of [undefined, {}, { conversationId: "" }, { conversationId: "../x" }, { conversationId: 1 }, { conversationId: "c", extra: 1 }]) expect(parseShowingRequest("prototype", value), JSON.stringify(value)).toBeNull();
  });
});

describe("parseRevealRequest", () => {
  test("a person's chip: its conversation and a valid anchor", () => {
    expect(parseRevealRequest("prototype", { kind: "chip", conversationId: "c-1", anchor: { frame: { id: "checkout", title: "Checkout" } } }))
      .toEqual({ kind: "chip", conversationId: "c-1", anchor: { frame: { id: "checkout", title: "Checkout" } } });
    expect(parseRevealRequest("prototype", { kind: "chip", conversationId: "c-1", anchor: { element: { selector: "#pay" }, point: { dx: 1, dy: 2 } } })).toBeNull();
    expect(parseRevealRequest("prototype", { kind: "chip", conversationId: "c-1", anchor: {} })).toBeNull();
    expect(parseRevealRequest("prototype", { kind: "chip", conversationId: "c-1" })).toBeNull();
  });
  test("an answer's chip: a reply link as the thread parsed it", () => {
    expect(parseRevealRequest("prototype", { kind: "reply", conversationId: "c-1", link: { canvas: "proto", kind: "element", id: "pay button" } }))
      .toEqual({ kind: "reply", conversationId: "c-1", link: { canvas: "proto", kind: "element", id: "pay button" } });
    for (const link of [{ canvas: "Proto", kind: "frame", id: "a" }, { canvas: "proto", kind: "point", id: "a" }, { canvas: "proto", kind: "frame", id: "" }, { canvas: "proto", kind: "frame", id: "x".repeat(201) }, { canvas: "proto", kind: "frame" }]) {
      expect(parseRevealRequest("prototype", { kind: "reply", conversationId: "c-1", link }), JSON.stringify(link)).toBeNull();
    }
  });
  test("Sign in names a provider", () => {
    expect(parseRevealRequest("prototype", { kind: "settings", provider: "claude" })).toEqual({ kind: "settings", provider: "claude" });
    expect(parseRevealRequest("prototype", { kind: "settings", provider: "gpt" })).toBeNull();
    // "Sign in to an agent…" and "Manage agents…" name no provider: Settings > Agents opens at its top.
    expect(parseRevealRequest("prototype", { kind: "settings" })).toEqual({ kind: "settings" });
    expect(parseRevealRequest("prototype", { kind: "settings", provider: undefined })).toBeNull();
    expect(parseRevealRequest("prototype", { kind: "settings", section: "agents" })).toBeNull();
  });
  test("an Open names a conversation, or a handoff's canvas with or without its conversation", () => {
    expect(parseRevealRequest("prototype", { kind: "conversation", conversationId: "c-1" })).toEqual({ kind: "conversation", conversationId: "c-1" });
    expect(parseRevealRequest("prototype", { kind: "handoff", canvas: { id: "proto", path: ".doan/canvases/proto.html" }, conversationId: "c-2" }))
      .toEqual({ kind: "handoff", canvas: { id: "proto", path: ".doan/canvases/proto.html" }, conversationId: "c-2" });
    expect(parseRevealRequest("prototype", { kind: "handoff", canvas: { path: ".doan/canvases/loose.html" } })).toEqual({ kind: "handoff", canvas: { path: ".doan/canvases/loose.html" } });
    for (const canvas of [{}, { path: "" }, { path: 1 }, { path: "a.html", id: 3 }, { path: "a.html", extra: 1 }, "a.html"]) {
      expect(parseRevealRequest("prototype", { kind: "handoff", canvas }), JSON.stringify(canvas)).toBeNull();
    }
  });
  test("refuses another role, an unknown kind and extra keys", () => {
    expect(parseRevealRequest("main", { kind: "conversation", conversationId: "c-1" })).toBeNull();
    for (const value of [undefined, null, {}, { kind: "delete", conversationId: "c-1" }, { kind: "conversation", conversationId: "c-1", extra: 1 }, { kind: "conversation", conversationId: "bad id" }]) {
      expect(parseRevealRequest("prototype", value), JSON.stringify(value)).toBeNull();
    }
  });
});

describe("parseComposerChoice", () => {
  test("a composer pick as the main window's composer remembers it", () => {
    expect(parseComposerChoice("prototype", { provider: "claude", model: "sonnet", effort: "high", modelPicked: true })).toEqual({ provider: "claude", model: "sonnet", effort: "high", modelPicked: true });
    expect(parseComposerChoice("prototype", { provider: "codex", model: null, effort: null, permissionMode: "plan", fast: true, effortPicked: true }))
      .toEqual({ provider: "codex", model: null, effort: null, permissionMode: "plan", fast: true, effortPicked: true });
  });
  test("refuses another role, an unknown provider or mode, and anything that is not a pick", () => {
    expect(parseComposerChoice("main", { provider: "claude", model: null, effort: null })).toBeNull();
    for (const value of [
      undefined, {}, { provider: "gpt", model: null, effort: null }, { provider: "claude", model: "", effort: null }, { provider: "claude", model: "x".repeat(257), effort: null },
      { provider: "claude", model: null }, { provider: "claude", model: null, effort: null, permissionMode: "yolo" }, { provider: "claude", model: null, effort: null, fast: "on" },
      { provider: "claude", model: null, effort: null, modelPicked: false }, { provider: "claude", model: null, effort: null, lastRoot: "/r" },
    ]) expect(parseComposerChoice("prototype", value), JSON.stringify(value)).toBeNull();
  });
});
