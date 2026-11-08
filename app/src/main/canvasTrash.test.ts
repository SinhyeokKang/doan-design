import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test, vi } from "vitest";
import type { ConversationSummary } from "./conversation/summary";
import { checkCanvasFile, createCanvasTrash, trashBusy, trashTarget, type TrashTarget } from "./canvasTrash";
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
    expect(trashTarget(entries, { root: "/repo", path: a.path })).toEqual({ root: "/repo", path: a.path, id: "a" });
    expect(trashTarget(entries, { root: "/repo", path: ".doan/ds/tokens.html" })).toMatchObject({ path: ".doan/ds/tokens.html" });
    expect(trashTarget(entries, { root: "/repo", path: ".doan/canvases/sub/deep.html" })).toEqual({ root: "/repo", path: ".doan/canvases/sub/deep.html", id: "deep" });
  });

  test("refuses a listed row that is not a canvas file", () => {
    const odd = [list("/repo", [row(".doan/canvases/a.htm"), row(".doan/config.json")])];
    expect(trashTarget(odd, { root: "/repo", path: ".doan/canvases/a.htm" })).toEqual({ kind: "refused", reason: "notListed" });
    expect(trashTarget(odd, { root: "/repo", path: ".doan/config.json" })).toEqual({ kind: "refused", reason: "notListed" });
  });

  test("carries the listed row's id as is, with nothing about comment files", () => {
    const take = (rows: CanvasRow[], path = a.path) => trashTarget([list("/repo", rows)], { root: "/repo", path });
    expect(take([row(a.path)])).toEqual({ root: "/repo", path: a.path });
    expect(take([row(a.path, { id: "" })])).toEqual({ root: "/repo", path: a.path });
    expect(take([row(a.path, { id: "Bad_Id" })])).toEqual({ root: "/repo", path: a.path, id: "Bad_Id" });
    expect(take([a, row(".doan/canvases/twin.html", { id: "a" })])).toEqual({ root: "/repo", path: a.path, id: "a" });
    expect(take([a, row(".doan/canvases/broken.html", { error: { code: "read_failed", message: "x" } })])).toEqual({ root: "/repo", path: a.path, id: "a" });
  });
});

describe("trashBusy", () => {
  const target = { root: "/repo", path: ".doan/canvases/a.html", id: "a" };
  const summary = (patch: Partial<ConversationSummary>): ConversationSummary => ({
    conversationId: "c1", title: "t", state: "current", owner: "doan", provider: "claude", fromHome: false, phase: "ended", unseen: false,
    queued: 0, working: false, lastActivityAt: "", preview: "", canvas: { path: target.path, id: "a" }, ...patch,
  });
  const work = (root: string, path = target.path): WorkItem => ({ root, path, session: null, provider: null, touched: 0, turn: "none:t" });

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

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-trash-test-")));
let count = 0;
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// A repo with `.doan/canvases/a.html` and a leftover `.doan/comments/a.jsonl` from before comments were removed, named
// after the canvas id: Move to Trash must leave it byte for byte.
const LEFTOVER = '{"v":1,"comment":"c1"}\n';
function repo(): string {
  const root = join(tmp, `r${count++}`);
  mkdirSync(join(root, ".doan/canvases/sub"), { recursive: true });
  mkdirSync(join(root, ".doan/comments"), { recursive: true });
  writeFileSync(join(root, ".doan/config.json"), '{"v":1}');
  writeFileSync(join(root, ".doan/canvases/a.html"), "<!doctype html>");
  writeFileSync(join(root, ".doan/canvases/sub/deep.html"), "<!doctype html>");
  writeFileSync(join(root, ".doan/comments/a.jsonl"), LEFTOVER);
  return root;
}

describe("checkCanvasFile", () => {
  test("passes a plain canvas file, subdirectories included", async () => {
    const root = repo();
    expect(await checkCanvasFile(root, ".doan/canvases/a.html")).toBe("ok");
    expect(await checkCanvasFile(root, ".doan/canvases/sub/deep.html")).toBe("ok");
  });

  test("refuses a symbolic link at any segment from .doan down", async () => {
    const outside = repo();
    const linkedFile = repo();
    rmSync(join(linkedFile, ".doan/canvases/a.html"));
    symlinkSync(join(outside, ".doan/canvases/a.html"), join(linkedFile, ".doan/canvases/a.html"));
    expect(await checkCanvasFile(linkedFile, ".doan/canvases/a.html")).toBe("notFile");
    const linkedDir = repo();
    rmSync(join(linkedDir, ".doan/canvases/sub"), { recursive: true });
    symlinkSync(join(outside, ".doan/canvases/sub"), join(linkedDir, ".doan/canvases/sub"));
    expect(await checkCanvasFile(linkedDir, ".doan/canvases/sub/deep.html")).toBe("notFile");
    const linkedDoan = join(tmp, `r${count++}`);
    mkdirSync(linkedDoan);
    symlinkSync(join(outside, ".doan"), join(linkedDoan, ".doan"));
    expect(await checkCanvasFile(linkedDoan, ".doan/canvases/a.html")).toBe("notFile");
  });

  test("refuses a canvas path that is a directory, and reports a vanished one as not listed", async () => {
    const root = repo();
    mkdirSync(join(root, ".doan/canvases/dir.html"));
    expect(await checkCanvasFile(root, ".doan/canvases/dir.html")).toBe("notFile");
    expect(await checkCanvasFile(root, ".doan/canvases/gone.html")).toBe("notListed");
  });
});

describe("createCanvasTrash", () => {
  function harness(root: string, rows: CanvasRow[] = [row(".doan/canvases/a.html", { id: "a" }), row(".doan/canvases/sub/deep.html", { id: "deep" })]) {
    const entries = vi.fn(() => [list(root, rows)]);
    const busy = vi.fn<(target: TrashTarget) => boolean>(() => false);
    const trashItem = vi.fn(async (_path: string) => {});
    return { entries, busy, trashItem, trash: createCanvasTrash({ entries, busy, trashItem }) };
  }
  const canvas = ".doan/canvases/a.html";

  test("plans ready whether or not a file of the canvas id sits in .doan/comments", async () => {
    const root = repo();
    expect(await harness(root).trash.plan({ root, path: canvas })).toEqual({ kind: "ready" });
    const bare = repo();
    rmSync(join(bare, ".doan/comments"), { recursive: true });
    expect(await harness(bare).trash.plan({ root: bare, path: canvas })).toEqual({ kind: "ready" });
  });

  test.each(["plan", "trash"] as const)("%s refuses an unregistered root, an unlisted path and a malformed request without touching files", async method => {
    const root = repo();
    const h = harness(root);
    for (const value of [{ root: "/elsewhere", path: canvas }, { root, path: ".doan/canvases/gone.html" }, { root, path: "../../etc/passwd" }, null, "x", { root }]) {
      expect(await h.trash[method](value)).toEqual({ kind: "refused", reason: "notListed" });
    }
    expect(h.trashItem).not.toHaveBeenCalled();
    expect(h.busy).not.toHaveBeenCalled();
  });

  test.each(["plan", "trash"] as const)("%s refuses a canvas behind a linked middle segment", async method => {
    const outside = repo();
    const root = repo();
    rmSync(join(root, ".doan/canvases/sub"), { recursive: true });
    symlinkSync(join(outside, ".doan/canvases/sub"), join(root, ".doan/canvases/sub"));
    const h = harness(root);
    expect(await h.trash[method]({ root, path: ".doan/canvases/sub/deep.html" })).toEqual({ kind: "refused", reason: "notFile" });
    expect(h.trashItem).not.toHaveBeenCalled();
  });

  test.each(["plan", "trash"] as const)("%s refuses while main judges the canvas busy, asking with the listed row", async method => {
    const root = repo();
    const h = harness(root);
    h.busy.mockReturnValue(true);
    expect(await h.trash[method]({ root, path: canvas })).toEqual({ kind: "refused", reason: "busy" });
    expect(h.busy).toHaveBeenCalledWith({ root, path: canvas, id: "a" });
    expect(h.trashItem).not.toHaveBeenCalled();
    h.busy.mockImplementation(() => { throw new Error("index unreadable"); });
    expect(await h.trash[method]({ root, path: canvas })).toEqual({ kind: "refused", reason: "failed" });
  });

  test("moves only the canvas, by main's own path, and leaves a same-id comment file byte for byte", async () => {
    const root = repo();
    const h = harness(root);
    expect(await h.trash.trash({ root, path: canvas })).toEqual({ kind: "trashed" });
    expect(h.trashItem.mock.calls).toEqual([[join(root, canvas)]]);
    expect(readFileSync(join(root, ".doan/comments/a.jsonl"), "utf8")).toBe(LEFTOVER);
  });

  test("a failed canvas move refuses as failed", async () => {
    const root = repo();
    const h = harness(root);
    h.trashItem.mockRejectedValueOnce(new Error("trash failed"));
    expect(await h.trash.trash({ root, path: canvas })).toEqual({ kind: "refused", reason: "failed" });
    expect(h.trashItem).toHaveBeenCalledOnce();
  });

  test("moves a canvas without an id or with a shared id the same way", async () => {
    const noId = repo();
    const bare = harness(noId, [row(canvas)]);
    expect(await bare.trash.trash({ root: noId, path: canvas })).toEqual({ kind: "trashed" });
    expect(bare.trashItem).toHaveBeenCalledExactlyOnceWith(join(noId, canvas));
    const shared = repo();
    const h = harness(shared, [row(canvas, { id: "a" }), row(".doan/canvases/twin.html", { id: "a" })]);
    expect(await h.trash.trash({ root: shared, path: canvas })).toEqual({ kind: "trashed" });
    expect(h.trashItem).toHaveBeenCalledExactlyOnceWith(join(shared, canvas));
  });

  test("refuses a second request for a row still being moved, and takes it again once settled", async () => {
    const root = repo();
    const h = harness(root);
    let release!: () => void;
    h.trashItem.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const first = h.trash.trash({ root, path: canvas });
    expect(await h.trash.trash({ root, path: canvas })).toEqual({ kind: "refused", reason: "failed" });
    await vi.waitFor(() => expect(release).toBeDefined());
    release();
    expect(await first).toEqual({ kind: "trashed" });
    h.trashItem.mockClear();
    await h.trash.trash({ root, path: canvas });
    expect(h.trashItem).toHaveBeenCalled();
  });
});
