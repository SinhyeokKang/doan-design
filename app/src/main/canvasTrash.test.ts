import { describe, expect, test } from "vitest";
import type { ConversationSummary } from "./conversation/summary";
import { trashBusy, trashTarget } from "./canvasTrash";
import type { CanvasRow, FolderEntry } from "./view";
import type { WorkItem } from "./workState";

const row = (path: string, extra: Partial<CanvasRow> = {}): CanvasRow => ({ path, url: `http://127.0.0.1:1/t/tok/k/${path}`, ...extra });
const list = (path: string, canvases: CanvasRow[]): FolderEntry => ({ path, kind: "list", servedRev: 1, canvases });

describe("trashTarget", () => {
  const a = row(".doan/canvases/a.html", { id: "a" });
  const entries = [list("/repo", [a, row(".doan/ds/tokens.html", { id: "tokens" }), row(".doan/canvases/sub/deep.html", { id: "deep" })])];

  test("refuses a root that is not registered or not a list", () => {
    expect(trashTarget(entries, { root: "/other", path: a.path })).toEqual({ kind: "refused", reason: "notListed" });
    expect(trashTarget(entries, { root: "/repo/", path: a.path })).toEqual({ kind: "refused", reason: "notListed" });
    expect(trashTarget([{ path: "/repo", kind: "error", message: "x" }], { root: "/repo", path: a.path })).toEqual({ kind: "refused", reason: "notListed" });
    expect(trashTarget([{ path: "/repo", kind: "loading" }], { root: "/repo", path: a.path })).toEqual({ kind: "refused", reason: "notListed" });
  });

  test("refuses a path the list does not hold letter for letter", () => {
    for (const path of [".doan/canvases/b.html", ".doan/canvases/A.html", "./.doan/canvases/a.html", ".doan/canvases/../canvases/a.html", "/repo/.doan/canvases/a.html"]) {
      expect(trashTarget(entries, { root: "/repo", path })).toEqual({ kind: "refused", reason: "notListed" });
    }
  });

  test("allows both canvas kinds and subdirectories", () => {
    expect(trashTarget(entries, { root: "/repo", path: a.path })).toEqual({ root: "/repo", path: a.path, id: "a", commentsId: "a" });
    expect(trashTarget(entries, { root: "/repo", path: ".doan/ds/tokens.html" })).toMatchObject({ path: ".doan/ds/tokens.html" });
    expect(trashTarget(entries, { root: "/repo", path: ".doan/canvases/sub/deep.html" })).toMatchObject({ path: ".doan/canvases/sub/deep.html", commentsId: "deep" });
  });

  test("refuses a listed row that is not a canvas file", () => {
    const odd = [list("/repo", [row(".doan/canvases/a.htm"), row(".doan/config.json")])];
    expect(trashTarget(odd, { root: "/repo", path: ".doan/canvases/a.htm" })).toEqual({ kind: "refused", reason: "notListed" });
    expect(trashTarget(odd, { root: "/repo", path: ".doan/config.json" })).toEqual({ kind: "refused", reason: "notListed" });
  });

  test("takes the comment file only for a valid id no other row uses, with every row readable", () => {
    const take = (rows: CanvasRow[], path = a.path) => trashTarget([list("/repo", rows)], { root: "/repo", path });
    expect(take([row(a.path)])).toEqual({ root: "/repo", path: a.path });
    expect(take([row(a.path, { id: "" })])).toEqual({ root: "/repo", path: a.path });
    expect(take([row(a.path, { id: "Bad_Id" })])).toEqual({ root: "/repo", path: a.path, id: "Bad_Id" });
    expect(take([row(a.path, { id: "a-" })])).not.toHaveProperty("commentsId");
    expect(take([a, row(".doan/canvases/twin.html", { id: "a" })])).not.toHaveProperty("commentsId");
    expect(take([a, row(".doan/canvases/broken.html", { error: { code: "read_failed", message: "x" } })])).not.toHaveProperty("commentsId");
    // The target itself unreadable: no id to trust either.
    expect(take([row(a.path, { id: "a", error: { code: "read_failed", message: "x" } })])).not.toHaveProperty("commentsId");
    expect(take([a, row(".doan/canvases/b.html", { id: "b" })])).toMatchObject({ commentsId: "a" });
  });
});

describe("trashBusy", () => {
  const target = { root: "/repo", path: ".doan/canvases/a.html", id: "a" };
  const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
    conversationId: "c1", title: "t", state: "current", owner: "doan", provider: "claude", fromHome: false, phase: "ended", unseen: false,
    queued: 0, working: false, lastActivityAt: "", preview: "", canvas: { path: target.path, id: "a" }, ...patch,
  });
  const work = (root: string, path = target.path): WorkItem => ({ root, path, session: null, provider: null });

  test("a canvas conversation running, waiting or still working blocks; an ended or archived one does not", () => {
    expect(trashBusy(target, [summary({ phase: "running" })], [], [])).toBe(true);
    expect(trashBusy(target, [summary({ phase: "waiting" })], [], [])).toBe(true);
    expect(trashBusy(target, [summary({ working: true })], [], [])).toBe(true);
    expect(trashBusy(target, [summary({ unseen: true })], [], [])).toBe(false);
    expect(trashBusy(target, [summary({ phase: "running", state: "archived" })], [], [])).toBe(false);
  });

  test("conversations match by id when either side has one, else by path", () => {
    expect(trashBusy(target, [summary({ phase: "running", canvas: { path: ".doan/canvases/old.html", id: "a" } })], [], [])).toBe(true);
    expect(trashBusy(target, [summary({ phase: "running", canvas: { path: target.path } })], [], [])).toBe(false);
    expect(trashBusy({ root: "/repo", path: target.path }, [summary({ phase: "running", canvas: { path: target.path } })], [], [])).toBe(true);
  });

  test("an unjudged project turn blocks only when its edits or observed changes name this path", () => {
    expect(trashBusy(target, [], [{ edits: [], changed: [] }], [])).toBe(false);
    expect(trashBusy(target, [], [{ edits: [], changed: [target.path] }], [])).toBe(true);
    expect(trashBusy(target, [], [{ edits: ["/repo/.doan/canvases/a.html"], changed: [] }], [])).toBe(true);
    expect(trashBusy(target, [], [{ edits: [".doan/canvases/a.html"], changed: [] }], [])).toBe(true);
    expect(trashBusy(target, [], [{ edits: ["/repo/.doan/canvases/b.html"], changed: [".doan/canvases/b.html"] }], [])).toBe(false);
    // Another worktree's file is outside this root.
    expect(trashBusy(target, [], [{ edits: ["/repo-wt/.doan/canvases/a.html"], changed: [] }], [])).toBe(false);
    // macOS /tmp is /private/tmp: an agent may report either spelling.
    expect(trashBusy({ ...target, root: "/private/tmp/repo" }, [], [{ edits: ["/tmp/repo/.doan/canvases/a.html"], changed: [] }], [])).toBe(true);
  });

  test("terminal work blocks on the same root and path only", () => {
    expect(trashBusy(target, [], [], [work("/repo")])).toBe(true);
    expect(trashBusy(target, [], [], [work("/repo-wt")])).toBe(false);
    expect(trashBusy(target, [], [], [work("/repo", ".doan/canvases/b.html")])).toBe(false);
  });
});
