import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry, GitInfo, OrphanFile } from "../main/view";
import type { ProjectCanvasComments, ProjectComments } from "../main/projectComments";
import { cardRow, groupProjects, homeSummary, measureNarrow, ProjectCommentReads, reviewTotal } from "./homeCards";
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

  test("a list row has no chip and summarizes branch and change; the counts are homeSummary's", () => {
    const entry = listRow("/code/acme", acme("", "main"), { canvases: [canvas(2), canvas(0), canvas(1)], changedAt: 1234 });
    const row = cardRow(entry, null, null);
    expect(row.chip).toBeUndefined();
    expect(row.summary).toEqual({ branch: "main", changedAt: 1234 });
  });

  test("a detached head shows the first 7 digits; no git shows no branch", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    expect(cardRow(listRow("/p", { common: "/c", detached: sha, worktrees: [] }), null, null).summary?.branch).toBe("detached 0123456");
    expect(cardRow(listRow("/p"), null, null).summary).toEqual({});
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
    expect(cardRow(entry, "/p", null)).toEqual({ current: true, actions: [], summary: {} });
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
    expect(cardRow(entry, null, null, [counts(1)]).summary).toEqual({ branch: "main", toReview: 1, changedAt: 1 });
    expect(cardRow(entry, null, null, [{ id: "x", error: "bad" }]).summary).not.toHaveProperty("toReview");
    expect(cardRow(entry, null, null).summary).not.toHaveProperty("toReview");
  });
});

describe("ProjectCommentReads", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10_000); });
  afterEach(() => { vi.useRealTimers(); });
  function reads() {
    const asks: { root: string; revision: number; at: number; reply: (value: ProjectComments | null) => Promise<void> }[] = [];
    let shown: ReadonlyMap<string, readonly ProjectCanvasComments[]> = new Map();
    const publish = vi.fn((items: ReadonlyMap<string, readonly ProjectCanvasComments[]>) => { shown = items; });
    const project = new ProjectCommentReads((root, revision) => new Promise(resolve => {
      asks.push({ root, revision, at: Date.now(), reply: async value => { resolve(value); await Promise.resolve(); } });
    }), publish);
    const list = (root: string, revision: number, canvases: ProjectCanvasComments[]): ProjectComments => ({ root, revision, kind: "list", canvases });
    return { project, asks, publish, list, shown: () => shown };
  }
  const a: ProjectCanvasComments = { id: "a", open: 1, resolved: 2, toReview: 2 };

  test("reads each tracked root once and again only when its ls row changes", async () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"], ["/r2", "s1"]]));
    h.project.track(new Map([["/r1", "s1"], ["/r2", "s2"]]));
    vi.advanceTimersByTime(1000);
    expect(h.asks.map(ask => ask.root)).toEqual(["/r1", "/r2", "/r2"]);
    await h.asks[0]!.reply(h.list("/r1", h.asks[0]!.revision, [a]));
    expect(h.shown().get("/r1")).toEqual([a]);
  });

  test("a root that comes back on screen is read again, with its last counts kept meanwhile", async () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"]]));
    await h.asks[0]!.reply(h.list("/r1", h.asks[0]!.revision, [a]));
    h.project.track(new Map());
    h.project.track(new Map([["/r1", "s1"]]));
    expect(h.asks).toHaveLength(2);
    expect(h.shown().get("/r1")).toEqual([a]);
  });

  test("an invalidation or a refresh reads a tracked root again; an untracked root is ignored", () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"]]));
    vi.advanceTimersByTime(1000);
    h.project.invalidated("/r1");
    vi.advanceTimersByTime(1000);
    h.project.refresh("/r1");
    h.project.invalidated("/other");
    h.project.refresh("/other");
    vi.advanceTimersByTime(5000);
    expect(h.asks.map(ask => ask.root)).toEqual(["/r1", "/r1", "/r1"]);
  });

  // tasks 1 stage 1: main sends `comments:invalidated` before its `doan ls`,
  // and the ls row it then sends changes too. One refresh, one read.
  test("the ls row change that follows an invalidation does not read again", () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"]]));
    vi.advanceTimersByTime(5000);
    h.project.invalidated("/r1");
    vi.advanceTimersByTime(250);
    h.project.track(new Map([["/r1", "s2"]]));
    vi.advanceTimersByTime(5000);
    expect(h.asks).toHaveLength(2);
    // A later row change on its own reads again.
    h.project.track(new Map([["/r1", "s3"]]));
    expect(h.asks).toHaveLength(3);
  });

  test("while invalidations keep coming, a root is read at most once a second and once after the last", () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s0"]]));
    let last = 0;
    // Saves 250 ms apart; each ls row lands 200 ms after its invalidation.
    for (let save = 1; save <= 20; save++) {
      vi.advanceTimersByTime(50);
      h.project.invalidated("/r1");
      last = Date.now();
      vi.advanceTimersByTime(200);
      h.project.track(new Map([["/r1", `s${save}`]]));
    }
    vi.advanceTimersByTime(5000);
    const times = h.asks.map(ask => ask.at);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(1000);
    expect(times.at(-1)!).toBeGreaterThanOrEqual(last);
    expect(h.asks.length).toBeGreaterThan(2);
  });

  test("other roots are not held back by one root's reads", () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"], ["/r2", "s1"]]));
    h.project.invalidated("/r1");
    h.project.invalidated("/r2");
    expect(h.asks.map(ask => ask.root)).toEqual(["/r1", "/r2"]);
    vi.advanceTimersByTime(1000);
    expect(h.asks.map(ask => ask.root)).toEqual(["/r1", "/r2", "/r1", "/r2"]);
  });

  test("a pending read is dropped when its root leaves the screen or on dispose", () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"], ["/r2", "s1"]]));
    h.project.invalidated("/r1");
    h.project.invalidated("/r2");
    h.project.track(new Map([["/r2", "s1"]]));
    h.project.dispose();
    vi.advanceTimersByTime(5000);
    expect(h.asks).toHaveLength(2);
  });

  test("a late answer overtaken by a newer request is dropped", async () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"]]));
    h.project.refresh("/r1");
    vi.advanceTimersByTime(1000);
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
    vi.advanceTimersByTime(1000);
    await h.asks[1]!.reply({ root: "/r1", revision: h.asks[1]!.revision, kind: "unavailable" });
    expect(h.shown().has("/r1")).toBe(false);
    h.project.refresh("/r1");
    vi.advanceTimersByTime(1000);
    await h.asks[2]!.reply(h.list("/r1", h.asks[2]!.revision, [a]));
    h.project.refresh("/r1");
    vi.advanceTimersByTime(1000);
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

// project-feedback spec 'doan ls와 수', draft `home-summary`: items in this
// order, each only above 0 except the canvas count; a narrow row wraps between
// the same items. The changed time stays last and is the view's.
describe("homeSummary", () => {
  const orphan = (id: string, open: number, resolved = 0, extra: Partial<OrphanFile> = {}): OrphanFile => ({ id, file: `.doan/comments/${id}.jsonl`, comments: { open, resolved }, uncertain: false, ...extra });
  const entry = (canvases: CanvasRow[], orphans?: OrphanFile[]): Extract<FolderEntry, { kind: "list" }> => ({ path: "/code/acme", kind: "list", servedRev: 0, canvases, ...(orphans ? { orphans } : {}) });
  const four = [canvas(2), canvas(0), canvas(0), canvas(0)];

  test("puts open, resolved to review and without a canvas after the canvas count", () => {
    expect(homeSummary(entry(four, [orphan("checkout-v1", 2, 1), orphan("promo-banner", 1)]), 1)).toEqual({
      items: [
        { kind: "canvases", text: "4 canvases" },
        { kind: "open", text: "2 open" },
        { kind: "review", text: "1 resolved to review" },
        { kind: "orphans", text: "3 without a canvas" },
      ],
      label: "4 canvases · 2 open comments · 1 resolved to review · 3 without a canvas",
    });
  });

  test("keeps the shipped summary when nothing is without a canvas", () => {
    expect(homeSummary(entry([canvas(1)], []), undefined)).toEqual({
      items: [{ kind: "canvases", text: "1 canvas" }, { kind: "open", text: "1 open" }],
      label: "1 canvas · 1 open comment",
    });
    expect(homeSummary(entry([]), 0)).toEqual({ items: [{ kind: "canvases", text: "0 canvases" }], label: "0 canvases · 0 open comments" });
  });

  test("starts after the canvas count with the orphan item when no canvas has an open comment", () => {
    expect(homeSummary(entry([], [orphan("old", 2)]), undefined).items).toEqual([{ kind: "canvases", text: "0 canvases" }, { kind: "orphans", text: "2 without a canvas" }]);
  });

  // Conductor decision 2026-10-26: open orphan comments, like "2 open" on the
  // same line and the Feedback Open view; a file ls could not read has no count.
  test("counts open orphan comments only, non-kebab files included, unreadable files left out", () => {
    const unreadable = orphan("gone", 0, 0, { error: { code: "unreadable_comments", message: "m" } });
    delete unreadable.comments;
    const summary = homeSummary(entry([], [orphan("old", 1, 4), orphan("Foo", 2), unreadable, orphan("done", 0, 3)]), undefined);
    expect(summary.items.at(-1)).toEqual({ kind: "orphans", text: "3 without a canvas" });
    expect(homeSummary(entry([], [orphan("done", 0, 3)]), undefined).items).toEqual([{ kind: "canvases", text: "0 canvases" }]);
  });

  // A canvas whose comment file failed hides the open count, as `reviewTotal`
  // hides the review count: a sum without it would be wrong, not partial.
  test("hides the open count when a canvas's comments could not be read", () => {
    const failed: CanvasRow = { ...canvas(0), path: "design/b.html", commentsError: { code: "unreadable_comments", message: "m" } };
    expect(homeSummary(entry([canvas(2), failed]), undefined)).toEqual({ items: [{ kind: "canvases", text: "2 canvases" }], label: "2 canvases" });
  });
});
