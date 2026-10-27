import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CanvasRow, FolderEntry, GitInfo, OrphanFile } from "../main/view";
import type { ProjectCanvasComments, ProjectComments } from "../main/projectComments";
import { cardRow, groupProjects, homeSummary, measureNarrow, ProjectCommentReads, reviewTotal, type ProjectRead } from "./homeCards";
import type { SelectionView } from "./selection";

const canvas = (open: number): CanvasRow => ({ path: "doan/a.html", url: "u", open, resolved: 0 });
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
    const asks: { root: string; revision: number; at: number; reply: (value: ProjectComments | null) => Promise<void>; fail: (error: Error) => Promise<void> }[] = [];
    let items: ReadonlyMap<string, ProjectRead> = new Map();
    const publish = vi.fn((next: ReadonlyMap<string, ProjectRead>) => { items = next; });
    const project = new ProjectCommentReads((root, revision) => new Promise((resolve, reject) => {
      asks.push({ root, revision, at: Date.now(), reply: async value => { resolve(value); await Promise.resolve(); }, fail: async error => { reject(error); await Promise.resolve(); await Promise.resolve(); } });
    }), publish);
    const list = (root: string, revision: number, canvases: ProjectCanvasComments[]): ProjectComments => ({ root, revision, kind: "list", canvases });
    // The counts Home and the Overview cards read: a list reply's canvases.
    const shown = () => new Map([...items].flatMap(([root, read]) => read.kind === "list" ? [[root, read.canvases] as const] : []));
    return { project, asks, publish, list, shown, items: () => items };
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
  // and the ls row it then sends changes too. The row change only re-arms the
  // one trailing read; the interval keeps the pair to one read a second.
  test("the ls row change that follows an invalidation waits for the interval", () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"]]));
    vi.advanceTimersByTime(5000);
    h.project.invalidated("/r1");
    vi.advanceTimersByTime(250);
    h.project.track(new Map([["/r1", "s2"]]));
    vi.advanceTimersByTime(5000);
    expect(h.asks.map(ask => ask.at)).toEqual([10_000, 15_000, 16_000]);
  });

  // R-V2 ⚪1: an invalidation answered by an unchanged ls row must not swallow
  // a later, unrelated row change.
  test("unchanged, delayed and mixed ls rows after an invalidation", () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s0"]]));
    vi.advanceTimersByTime(5000);
    h.project.invalidated("/r1");
    h.project.track(new Map([["/r1", "s0"]]));
    vi.advanceTimersByTime(5000);
    expect(h.asks).toHaveLength(2);
    // Unchanged above; a distinct row much later is read.
    h.project.track(new Map([["/r1", "s1"]]));
    expect(h.asks).toHaveLength(3);
    // Delayed: the row lands after the invalidation's read and its interval.
    vi.advanceTimersByTime(5000);
    h.project.invalidated("/r1");
    vi.advanceTimersByTime(3000);
    h.project.track(new Map([["/r1", "s2"]]));
    expect(h.asks).toHaveLength(5);
    // Mixed: an invalidation, an unrelated root's row, then this root's row.
    vi.advanceTimersByTime(5000);
    h.project.invalidated("/r1");
    h.project.track(new Map([["/r1", "s2"], ["/r2", "t0"]]));
    h.project.track(new Map([["/r1", "s3"], ["/r2", "t0"]]));
    vi.advanceTimersByTime(5000);
    expect(h.asks.map(ask => ask.root)).toEqual(["/r1", "/r1", "/r1", "/r1", "/r1", "/r1", "/r2", "/r1"]);
  });

  // R-V2 🟡1: the trigger, not the next read's start, ends a reply's validity.
  test.each([
    ["invalidated", "a late list"],
    ["invalidated", "a late unavailable"],
    ["refresh", "a late list"],
    ["refresh", "a late unavailable"],
  ] as const)("after %s, %s reply started before it is dropped while the next read waits", async (trigger, kind) => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"]]));
    await h.asks[0]!.reply(h.list("/r1", h.asks[0]!.revision, [a]));
    vi.advanceTimersByTime(5000);
    h.project.refresh("/r1");
    const old = h.asks[1]!;
    vi.advanceTimersByTime(100);
    h.project[trigger]("/r1");
    expect(h.asks).toHaveLength(2);
    await old.reply(kind === "a late list" ? h.list("/r1", old.revision, [{ ...a, toReview: 9 }]) : { root: "/r1", revision: old.revision, kind: "unavailable" });
    expect(h.publish).toHaveBeenCalledTimes(1);
    expect(h.shown().get("/r1")).toEqual([a]);
    vi.advanceTimersByTime(900);
    expect(h.asks).toHaveLength(3);
    await h.asks[2]!.reply(h.list("/r1", h.asks[2]!.revision, [{ ...a, toReview: 3 }]));
    expect(h.shown().get("/r1")).toEqual([{ ...a, toReview: 3 }]);
  });

  test("a row change alone does not drop the reply in flight", async () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"]]));
    vi.advanceTimersByTime(100);
    h.project.track(new Map([["/r1", "s2"]]));
    await h.asks[0]!.reply(h.list("/r1", h.asks[0]!.revision, [a]));
    expect(h.shown().get("/r1")).toEqual([a]);
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

  // project-feedback: the Feedback panel reads through this same scheduler
  // and needs the whole reply, and to tell a failed read from one not done yet.
  test("keeps the whole list reply: orphans, their comments and the project epoch", async () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"]]));
    expect(h.items().has("/r1")).toBe(false);
    const orphans = [{ id: "old", file: ".doan/comments/old.jsonl", comments: { open: 1, resolved: 0 }, uncertain: false }];
    const reply: ProjectComments = { root: "/r1", revision: h.asks[0]!.revision, kind: "list", project: 7, canvases: [a], orphans, orphanComments: [{ id: "old", comments: [] }] };
    await h.asks[0]!.reply(reply);
    expect(h.items().get("/r1")).toEqual(reply);
  });

  test("an unavailable reply, no reply and a failed call mark the root failed", async () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"]]));
    await h.asks[0]!.reply({ root: "/r1", revision: h.asks[0]!.revision, kind: "unavailable" });
    expect(h.items().get("/r1")).toEqual({ kind: "failed" });
    h.project.refresh("/r1");
    vi.advanceTimersByTime(1000);
    await h.asks[1]!.reply(h.list("/r1", h.asks[1]!.revision, [a]));
    expect(h.items().get("/r1")?.kind).toBe("list");
    h.project.refresh("/r1");
    vi.advanceTimersByTime(1000);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await h.asks[2]!.fail(new Error("ipc"));
    expect(h.items().get("/r1")).toEqual({ kind: "failed" });
    error.mockRestore();
  });

  test("a failed call overtaken by a newer read is dropped", async () => {
    const h = reads();
    h.project.track(new Map([["/r1", "s1"]]));
    h.project.refresh("/r1");
    vi.advanceTimersByTime(1000);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await h.asks[0]!.fail(new Error("old"));
    expect(h.publish).not.toHaveBeenCalled();
    error.mockRestore();
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
    const failed: CanvasRow = { ...canvas(0), path: "doan/b.html", commentsError: { code: "unreadable_comments", message: "m" } };
    expect(homeSummary(entry([canvas(2), failed]), undefined)).toEqual({ items: [{ kind: "canvases", text: "2 canvases" }], label: "2 canvases" });
  });
});
