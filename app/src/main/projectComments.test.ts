import { describe, expect, test, vi } from "vitest";
import type { Author } from "../formats/types";
import type { FolderView } from "./cli";
import { parseProjectCommentsRequest, readProjectComments, type ProjectCommentsDependencies } from "./projectComments";

const ROOT = "/repo";
const SINCE = "2026-10-26T09:00:00.000Z";
const kim: Author = { kind: "human", name: "Kim Doe", email: "kim@example.com" };
const codex: Author = { kind: "agent", name: "codex" };

let serial = 0;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (minute: number) => `2026-10-26T10:${String(minute).padStart(2, "0")}:00.000Z`;
function event(type: string, comment: number, minute: number, by: Author, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ v: 1, id: `evt_${uuid(++serial)}`, at: at(minute), type, comment: `cmt_${uuid(comment)}`, by, ...extra });
}
const create = (comment: number, minute = 0) => event("create", comment, minute, kim, { body: `Body ${comment}`, target: {}, canvasHash: `sha256:${"a".repeat(64)}` });
const resolve = (comment: number, minute: number, by: Author = codex) => event("resolve", comment, minute, by);
const file = (...lines: string[]) => Buffer.from(lines.map(line => `${line}\n`).join(""));

function listing(canvases: unknown[], root = ROOT): FolderView {
  return { kind: "list", root, scope: ["design"], canvases };
}

function deps(over: Partial<ProjectCommentsDependencies> = {}): ProjectCommentsDependencies {
  return {
    list: vi.fn(async () => listing([])),
    read: vi.fn(async () => Buffer.alloc(0)),
    author: vi.fn(async () => kim),
    marker: vi.fn(() => ({ since: SINCE })),
    ...over,
  };
}

describe("readProjectComments", () => {
  test("counts open, resolved and to-review comments per canvas id in ls order, with the request revision", async () => {
    const files: Record<string, Buffer> = {
      home: file(create(1), create(2), create(3), resolve(2, 5), resolve(3, 6, kim)),
      settings: file(create(4), resolve(4, 7)),
    };
    const d = deps({
      list: vi.fn(async () => listing([{ path: "design/settings.html", id: "settings" }, { path: "design/home.html", id: "home" }])),
      read: vi.fn(async (_root: string, id: string) => files[id] ?? Buffer.alloc(0)),
      marker: vi.fn((_root: string, id: string) => id === "settings" ? { since: SINCE, lastReviewedAt: at(7) } : { since: SINCE }),
    });
    expect(await readProjectComments(d, { root: ROOT, revision: 7 })).toEqual({
      root: ROOT, revision: 7, kind: "list",
      canvases: [
        { id: "settings", open: 0, resolved: 1, toReview: 0 },
        // cmt 3 was resolved by the human with the current Git name.
        { id: "home", open: 1, resolved: 2, toReview: 1 },
      ],
    });
    expect(d.list).toHaveBeenCalledExactlyOnceWith(ROOT);
    expect(d.author).toHaveBeenCalledExactlyOnceWith(ROOT);
  });

  test("reads only the comment files of the listed ids, once each, and leaves out rows without an id", async () => {
    const d = deps({ list: vi.fn(async () => listing([
      { path: "design/a.html", id: "a" }, { path: "design/no-id.html" }, { path: "design/empty.html", id: "" }, { path: "design/b.html", id: "b" }, "junk", { id: "c" },
    ])) });
    const reply = await readProjectComments(d, { root: ROOT, revision: 0 });
    expect(reply.kind === "list" && reply.canvases.map(canvas => canvas.id)).toEqual(["a", "b"]);
    expect(vi.mocked(d.read).mock.calls).toEqual([[ROOT, "a"], [ROOT, "b"]]);
  });

  test("an id on several rows is one error entry, and its file is not read", async () => {
    const d = deps({ list: vi.fn(async () => listing([{ path: "design/a.html", id: "dup" }, { path: "design/b.html", id: "ok" }, { path: "design/c.html", id: "dup" }])) });
    expect(await readProjectComments(d, { root: ROOT, revision: 1 })).toEqual({
      root: ROOT, revision: 1, kind: "list",
      canvases: [{ id: "dup", error: "This canvas ID is used by more than one canvas." }, { id: "ok", open: 0, resolved: 0, toReview: 0 }],
    });
    expect(vi.mocked(d.read).mock.calls).toEqual([[ROOT, "ok"]]);
  });

  test("a file that cannot be read marks only its canvas as an error", async () => {
    const d = deps({
      list: vi.fn(async () => listing([{ path: "design/a.html", id: "a" }, { path: "design/b.html", id: "b" }])),
      read: vi.fn(async (_root: string, id: string) => { if (id === "a") throw new Error("Comment path case conflict"); return file(create(1)); }),
    });
    expect(await readProjectComments(d, { root: ROOT, revision: 2 })).toMatchObject({
      kind: "list", canvases: [{ id: "a", error: "Comment path case conflict" }, { id: "b", open: 1, resolved: 0, toReview: 0 }],
    });
  });

  test("invalid lines are skipped and the valid ones still count", async () => {
    const bytes = Buffer.concat([file(create(1), "{not json", create(2)), Buffer.from([0xff, 0x0a]), file(resolve(2, 4), "{\"v\":1}")]);
    const d = deps({ list: vi.fn(async () => listing([{ path: "design/a.html", id: "a" }])), read: vi.fn(async () => bytes) });
    expect(await readProjectComments(d, { root: ROOT, revision: 3 })).toMatchObject({ kind: "list", canvases: [{ id: "a", open: 1, resolved: 1, toReview: 1 }] });
  });

  test("without a Git name nothing is left out by name", async () => {
    const d = deps({
      list: vi.fn(async () => listing([{ path: "design/a.html", id: "a" }])),
      read: vi.fn(async () => file(create(1), resolve(1, 3, kim))),
      author: vi.fn(async () => { throw new Error("Configure a Git user name before saving comments."); }),
    });
    expect(await readProjectComments(d, { root: ROOT, revision: 4 })).toMatchObject({ canvases: [{ id: "a", toReview: 1 }] });
  });

  test.each<[string, FolderView]>([
    ["not set up", { kind: "uninitialized" }],
    ["a config error", { kind: "error", message: "bad config" }],
    ["a CLI error", { kind: "cliError", reason: "timed out after 10 s" }],
    ["a missing folder", { kind: "notFound" }],
    ["another root", listing([{ path: "design/a.html", id: "a" }], "/elsewhere")],
  ])("a project that does not list (%s) is unavailable and reads no file", async (_name, view) => {
    const d = deps({ list: vi.fn(async () => view) });
    expect(await readProjectComments(d, { root: ROOT, revision: 5 })).toEqual({ root: ROOT, revision: 5, kind: "unavailable" });
    expect(d.read).not.toHaveBeenCalled();
  });
});

describe("parseProjectCommentsRequest", () => {
  test("takes one absolute root and a revision", () => {
    expect(parseProjectCommentsRequest({ root: ROOT, revision: 0 })).toEqual({ root: ROOT, revision: 0 });
    expect(parseProjectCommentsRequest({ root: ROOT, revision: 42 })).toEqual({ root: ROOT, revision: 42 });
    for (const bad of [null, ROOT, { root: ROOT }, { revision: 1 }, { root: "repo", revision: 1 }, { root: ROOT, revision: -1 }, { root: ROOT, revision: 1.5 },
      { root: ROOT, revision: "1" }, { root: ROOT, revision: Number.MAX_SAFE_INTEGER + 1 }, { root: ROOT, revision: 1, more: 1 }, { root: "/re\u0000po", revision: 1 }]) {
      expect(parseProjectCommentsRequest(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
