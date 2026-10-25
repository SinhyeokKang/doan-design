import { describe, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry, GitInfo } from "../main/view";
import type { ProjectCanvasComments, ProjectComments } from "../main/projectComments";
import { cardRow, groupProjects, measureNarrow, ProjectCommentReads, reviewTotal } from "./homeCards";
import type { SelectionView } from "./selection";

const canvas = (open: number): CanvasRow => ({ path: "design/a.html", url: "u", open, resolved: 0 });
const listRow = (path: string, git?: GitInfo, extra: { canvases?: CanvasRow[]; changedAt?: number } = {}): FolderEntry => ({
  path, kind: "list", servedRev: 0, canvases: extra.canvases ?? [], ...(git ? { git } : {}), ...(extra.changedAt === undefined ? {} : { changedAt: extra.changedAt }),
});
const common = "/code/acme/.git";
const acme = (path: string, branch: string): GitInfo => ({ common, main: "/code/acme", branch, worktrees: ["/code/acme", "/code/acme-feat"] });

describe("groupProjects", () => {
  test("puts worktrees of one common dir in one card, at the first row's place", () => {
    const entries = [listRow("/code/acme", acme("", "main")), listRow("/code/solo", { common: "/code/solo/.git", worktrees: ["/code/solo"] }), listRow("/code/acme-feat", acme("", "feat"))];
    const cards = groupProjects(entries, new Map());
    expect(cards.map((card) => [card.name, card.rows.map((row) => row.path)])).toEqual([
      ["acme", ["/code/acme", "/code/acme-feat"]],
      ["solo", ["/code/solo"]],
    ]);
  });

  test("keeps the saved order of cards and rows", () => {
    const entries = [listRow("/w/b", { common: "/b/.git", worktrees: [] }), listRow("/w/a", { common: "/a/.git", worktrees: [] }), listRow("/w/b2", { common: "/b/.git", worktrees: [] })];
    expect(groupProjects(entries, new Map()).map((card) => card.rows.map((row) => row.path))).toEqual([["/w/b", "/w/b2"], ["/w/a"]]);
  });

  test("a row that is not a list stays in the card it was last seen in", () => {
    const entries: FolderEntry[] = [listRow("/code/acme", acme("", "main")), { path: "/code/acme-feat", kind: "notFound" }, { path: "/x/bad", kind: "error", message: "bad" }];
    const cards = groupProjects(entries, new Map([["/code/acme-feat", common]]));
    expect(cards.map((card) => card.rows.map((row) => row.path))).toEqual([["/code/acme", "/code/acme-feat"], ["/x/bad"]]);
  });

  test("a list row that lost its git leaves the card it was last seen in", () => {
    const entries = [listRow("/code/acme", acme("", "main")), listRow("/code/acme-feat")];
    const cards = groupProjects(entries, new Map([["/code/acme-feat", common]]));
    expect(cards.map((card) => card.rows.map((row) => row.path))).toEqual([["/code/acme"], ["/code/acme-feat"]]);
  });

  test("every problem state stays in the card it was last seen in", () => {
    const problems: FolderEntry[] = [
      { path: "/w/missing", kind: "notFound" },
      { path: "/w/bad", kind: "error", message: "bad" },
      { path: "/w/cli", kind: "cliError", reason: "x" },
    ];
    const memory = new Map(problems.map((entry) => [entry.path, common]));
    const cards = groupProjects([listRow("/code/acme", acme("", "main")), ...problems], memory);
    expect(cards.map((card) => card.rows.map((row) => row.path))).toEqual([["/code/acme", "/w/missing", "/w/bad", "/w/cli"]]);
  });

  test("a project outside git is a card of its own", () => {
    const cards = groupProjects([listRow("/p/one"), listRow("/p/two")], new Map());
    expect(cards.map((card) => card.name)).toEqual(["one", "two"]);
  });

  test("the name is the main worktree's basename, else the first row's", () => {
    const linkedOnly: GitInfo = { common: "/bare.git", worktrees: ["/w/feat"] };
    expect(groupProjects([listRow("/w/feat", linkedOnly)], new Map())[0]?.name).toBe("feat");
    expect(groupProjects([listRow("/w/feat", acme("", "feat"))], new Map())[0]?.name).toBe("acme");
    expect(groupProjects([{ path: "/w/gone", kind: "notFound" }], new Map())[0]?.name).toBe("gone");
  });

  test("a card of problem rows only is named by its first row", () => {
    const cards = groupProjects([{ path: "/a/x", kind: "loading" }, { path: "/b/y", kind: "loading" }], new Map([["/a/x", "c"], ["/b/y", "c"]]));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ name: "x" });
  });
});

describe("cardRow", () => {
  test("maps each problem state to its chip and actions", () => {
    const row = (entry: FolderEntry) => cardRow(entry, null, null);
    expect(row({ path: "/p", kind: "uninitialized" })).toMatchObject({ chip: "Not set up", actions: ["setUp", "remove"] });
    expect(row({ path: "/p", kind: "notFound" })).toMatchObject({ chip: "Missing", actions: ["locate", "remove"] });
    expect(row({ path: "/p", kind: "error", message: "bad config" })).toMatchObject({ chip: "Config error", actions: ["showInFinder", "retry", "details"], detail: "bad config" });
    expect(row({ path: "/p", kind: "cliError", reason: "x" })).toMatchObject({ chip: "CLI error", actions: ["retry", "remove"] });
    expect(row({ path: "/p", kind: "loading" })).toMatchObject({ chip: "Reading…", actions: [] });
  });

  test("a list row has no chip and summarizes branch, canvases, open comments and change", () => {
    const entry = listRow("/code/acme", acme("", "main"), { canvases: [canvas(2), canvas(0), canvas(1)], changedAt: 1234 });
    const row = cardRow(entry, null, null);
    expect(row.chip).toBeUndefined();
    expect(row.summary).toEqual({ branch: "main", canvases: 3, openComments: 3, changedAt: 1234 });
  });

  test("a detached head shows the first 7 digits; no git shows no branch", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    expect(cardRow(listRow("/p", { common: "/c", detached: sha, worktrees: [] }), null, null).summary?.branch).toBe("detached 0123456");
    expect(cardRow(listRow("/p"), null, null).summary).toEqual({ canvases: 0, openComments: 0 });
  });

  test("marks the loaded workspace as current, with its selection", () => {
    const frame: SelectionView = { tag: "section", frame: { id: "home", title: "Home screen" }, path: [] };
    const element: SelectionView = { tag: "button", frame: { id: "home" }, element: { doanId: "save", selector: "#x", html: "<button>" }, path: [] };
    const entry = listRow("/p");
    expect(cardRow(entry, "/p", frame)).toMatchObject({ current: true, selected: "Home screen" });
    expect(cardRow(entry, "/p", { ...frame, frame: { id: "home" } }).selected).toBe("home");
    expect(cardRow(entry, "/p", { ...frame, frame: { id: "", title: "  " } }).selected).toBe("(no id)");
    expect(cardRow(entry, "/p", { ...frame, frame: { id: "home", title: "  Home  " } }).selected).toBe("Home");
    expect(cardRow(entry, "/p", element).selected).toBe("button · save");
    expect(cardRow(entry, "/p", null)).toEqual({ current: true, actions: [], summary: { canvases: 0, openComments: 0 } });
  });

  test("a row that is not loaded shows neither Open nor Selected", () => {
    const frame: SelectionView = { tag: "section", frame: { id: "home" }, path: [] };
    expect(cardRow(listRow("/other"), "/p", frame)).toMatchObject({ current: false });
    expect(cardRow(listRow("/other"), "/p", frame).selected).toBeUndefined();
  });

  test("a loaded workspace in a problem state is still current", () => {
    expect(cardRow({ path: "/p", kind: "notFound" }, "/p", null)).toMatchObject({ current: true, chip: "Missing" });
  });
});

describe("review counts", () => {
  const counts = (toReview: number): ProjectCanvasComments => ({ id: `c${toReview}`, open: 0, resolved: toReview, toReview });

  test("a row sums the canvases' counts to review; zero stays a number for the view to hide", () => {
    expect(reviewTotal([counts(2), counts(1)])).toBe(3);
    expect(reviewTotal([counts(0)])).toBe(0);
    expect(reviewTotal(undefined)).toBeUndefined();
  });

  test("a canvas whose comment file failed hides the row's count instead of a partial sum", () => {
    expect(reviewTotal([counts(2), { id: "broken", error: "EACCES" }])).toBeUndefined();
  });

  test("the row summary carries the count from the project read", () => {
    const entry = listRow("/code/acme", acme("", "main"), { canvases: [canvas(2)], changedAt: 1 });
    expect(cardRow(entry, null, null, [counts(1)]).summary).toEqual({ branch: "main", canvases: 1, openComments: 2, toReview: 1, changedAt: 1 });
    expect(cardRow(entry, null, null, [{ id: "x", error: "bad" }]).summary).not.toHaveProperty("toReview");
    expect(cardRow(entry, null, null).summary).not.toHaveProperty("toReview");
  });
});

describe("ProjectCommentReads", () => {
  function reads() {
    const asks: { root: string; revision: number; reply: (value: ProjectComments | null) => Promise<void> }[] = [];
    let shown: ReadonlyMap<string, readonly ProjectCanvasComments[]> = new Map();
    const publish = vi.fn((items: ReadonlyMap<string, readonly ProjectCanvasComments[]>) => { shown = items; });
    const project = new ProjectCommentReads((root, revision) => new Promise(resolve => {
      asks.push({ root, revision, reply: async value => { resolve(value); await Promise.resolve(); } });
    }), publish);
    const list = (root: string, revision: number, canvases: ProjectCanvasComments[]): ProjectComments => ({ root, revision, kind: "list", canvases });
    return { project, asks, publish, list, shown: () => shown };
  }
  const a: ProjectCanvasComments = { id: "a", open: 1, resolved: 2, toReview: 2 };

  test("reads each tracked root once and again only when its ls row changes", async () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"], ["/r2", "s1"]]));
    h.project.track(new Map([["/r1", "s1"], ["/r2", "s2"]]));
    expect(h.asks.map(ask => ask.root)).toEqual(["/r1", "/r2", "/r2"]);
    await h.asks[0]!.reply(h.list("/r1", h.asks[0]!.revision, [a]));
    expect(h.shown().get("/r1")).toEqual([a]);
  });

  test("an invalidation reads a tracked root again; an untracked root is ignored", () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"]]));
    h.project.refresh("/r1");
    h.project.refresh("/other");
    expect(h.asks.map(ask => ask.root)).toEqual(["/r1", "/r1"]);
  });

  test("a late answer overtaken by a newer request is dropped", async () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"]]));
    h.project.refresh("/r1");
    const [old, fresh] = h.asks;
    await fresh!.reply(h.list("/r1", fresh!.revision, [a]));
    await old!.reply(h.list("/r1", old!.revision, [{ ...a, toReview: 9 }]));
    expect(h.shown().get("/r1")).toEqual([a]);
    expect(h.publish).toHaveBeenCalledTimes(1);
  });

  test("a reply for a root no longer tracked, or after dispose, is dropped", async () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"], ["/r2", "s1"]]));
    h.project.track(new Map([["/r2", "s1"]]));
    await h.asks[0]!.reply(h.list("/r1", h.asks[0]!.revision, [a]));
    h.project.dispose();
    await h.asks[1]!.reply(h.list("/r2", h.asks[1]!.revision, [a]));
    expect(h.publish).not.toHaveBeenCalled();
  });

  test("a refused or unavailable read clears the root's counts", async () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"]]));
    await h.asks[0]!.reply(h.list("/r1", h.asks[0]!.revision, [a]));
    h.project.refresh("/r1");
    await h.asks[1]!.reply({ root: "/r1", revision: h.asks[1]!.revision, kind: "unavailable" });
    expect(h.shown().has("/r1")).toBe(false);
    h.project.refresh("/r1");
    await h.asks[2]!.reply(h.list("/r1", h.asks[2]!.revision, [a]));
    h.project.refresh("/r1");
    await h.asks[3]!.reply(null);
    expect(h.shown().has("/r1")).toBe(false);
  });
});

describe("measureNarrow", () => {
  // Just enough of a row element: the class list, the branch name's widths and whether a summary is shown.
  function row(path: string, name: { wide: [number, number]; narrow?: [number, number] } | null, summary = true, narrow = false) {
    const classes = new Set(narrow ? ["wt", "narrow"] : ["wt"]);
    const widths = () => (classes.has("narrow") ? name?.narrow ?? name?.wide : name?.wide) ?? [0, 0];
    const element = {
      dataset: { path },
      classList: { contains: (name: string) => classes.has(name), remove: (name: string) => classes.delete(name), toggle: (name: string, on: boolean) => { if (on) classes.add(name); else classes.delete(name); } },
      querySelector: (selector: string) => selector === ".wt-sum" ? (summary ? {} : null) : name && { get scrollWidth() { return widths()[0]; }, get clientWidth() { return widths()[1]; } },
    };
    return { element, classes };
  }
  const card = (rows: ReturnType<typeof row>[]) => ({ querySelectorAll: () => rows.map(item => item.element) }) as unknown as HTMLElement;

  test("a row whose branch is cut off beside its summary is narrow", () => {
    const fits = row("/a", { wide: [80, 80] });
    const cut = row("/b", { wide: [300, 120] });
    expect([...measureNarrow(card([fits, cut]))]).toEqual(["/b"]);
  });

  test("measures in the wide layout and leaves each row's class as it was", () => {
    // Already narrow and the branch fits on its own line, but would be cut off beside the summary.
    const stays = row("/a", { wide: [300, 120], narrow: [300, 300] }, true, true);
    const widened = row("/b", { wide: [80, 80], narrow: [80, 80] }, true, true);
    expect([...measureNarrow(card([stays, widened]))]).toEqual(["/a"]);
    expect(stays.classes.has("narrow")).toBe(true);
    expect(widened.classes.has("narrow")).toBe(true);
  });

  test("a row without a summary (a problem row) is never narrow", () => {
    expect(measureNarrow(card([row("/a", { wide: [300, 120] }, false)])).size).toBe(0);
  });
});
