import { describe, expect, test } from "vitest";
import type { CanvasRow, FolderEntry } from "../view";
import { MAX_REPORT_FRAMES, MAX_REPORT_STRING, parseChooseRequest, parseFramesReport, parseReloadRequest, parseRunReport, validatePlay, windowRequest } from "./requests";

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
