import { describe, expect, test } from "vitest";
import type { CanvasRow, FolderEntry, GitInfo } from "../main/view";
import { cardRow, groupProjects } from "./homeCards";
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
