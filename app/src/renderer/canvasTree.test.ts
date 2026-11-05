import { expect, test } from "vitest";
import type { CanvasRow } from "../main/view";
import { buildCanvasTree, canvasLabel, frameLabel, moveExpanded, rowProblem, typeaheadNext, type CanvasNode, type FolderNode, type TreeNode } from "./canvasTree";

const row = (path: string, extra: Partial<CanvasRow> = {}): CanvasRow => ({ path, url: `http://127.0.0.1/${path}`, ...extra });

const at = <T>(list: readonly T[], index: number): T => {
  const item = list[index];
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
};
const names = (nodes: readonly TreeNode[]) => nodes.map((node) => node.name);
const folder = (node: TreeNode): FolderNode => {
  if (node.kind !== "folder") throw new Error(`expected folder, got ${node.kind}`);
  return node;
};

test("canvasLabel is the file name without .html, whatever the page's <title> says", () => {
  expect(canvasLabel(row(".doan/canvases/login.html"))).toBe("login");
  expect(canvasLabel({ ...row(".doan/canvases/login.html"), title: "  Login  " } as CanvasRow)).toBe("login");
  expect(canvasLabel(row(".doan/canvases/a/b/step-2.html"))).toBe("step-2");
  expect(canvasLabel(row(".doan/canvases/a.b.html"))).toBe("a.b");
  expect(canvasLabel(row(".doan/canvases/.html"))).toBe(".html");
});

test("buildCanvasTree is empty for no rows", () => {
  expect(buildCanvasTree([])).toEqual([]);
});

test("buildCanvasTree nests folders by path with .doan/canvases/ as the root node", () => {
  const tree = buildCanvasTree([row(".doan/canvases/a.html"), row(".doan/canvases/billing/plans.html"), row(".doan/canvases/billing/deep/x.html")]);
  expect(tree).toHaveLength(1);
  const design = folder(at(tree, 0));
  expect(design).toMatchObject({ key: ".doan/canvases", name: ".doan/canvases" });
  expect(names(design.children)).toEqual(["billing", "a"]);
  const billing = folder(at(design.children, 0));
  expect(billing.key).toBe(".doan/canvases/billing");
  expect(names(billing.children)).toEqual(["deep", "plans"]);
  expect(folder(at(billing.children, 0)).key).toBe(".doan/canvases/billing/deep");
  const plans = at(billing.children, 1) as CanvasNode;
  expect(plans).toMatchObject({ kind: "canvas", key: ".doan/canvases/billing/plans.html", fileName: "plans.html" });
  expect(plans.row.path).toBe(".doan/canvases/billing/plans.html");
});

test("buildCanvasTree puts folders before canvases and sorts each by display name", () => {
  const tree = buildCanvasTree([
    row(".doan/canvases/zeta/a.html"),
    row(".doan/canvases/Zulu.html"),
    row(".doan/canvases/apple.html"),
    row(".doan/canvases/Aardvark/a.html"),
  ]);
  expect(names(folder(at(tree, 0)).children)).toEqual(["Aardvark", "zeta", "apple", "Zulu"]);
});

test("buildCanvasTree sorts by display name, not by path", () => {
  // `foo-bar.html` < `foo.html` in byte order ('-' < '.'), but `foo` < `foo-bar`.
  const byFile = buildCanvasTree([row(".doan/canvases/foo-bar.html"), row(".doan/canvases/foo.html")]);
  expect(names(folder(at(byFile, 0)).children)).toEqual(["foo", "foo-bar"]);
});

test("buildCanvasTree orders numbers naturally", () => {
  const files = buildCanvasTree([row(".doan/canvases/step-10.html"), row(".doan/canvases/step-2.html"), row(".doan/canvases/step-1.html")]);
  expect(names(folder(at(files, 0)).children)).toEqual(["step-1", "step-2", "step-10"]);
  const folders = buildCanvasTree([row(".doan/canvases/v10/a.html"), row(".doan/canvases/v9/a.html")]);
  expect(names(folder(at(folders, 0)).children)).toEqual(["v9", "v10"]);
});

test("buildCanvasTree breaks collator ties by path so the order is stable", () => {
  const forward = buildCanvasTree([row(".doan/canvases/Same.html"), row(".doan/canvases/same.html")]);
  const reverse = buildCanvasTree([row(".doan/canvases/same.html"), row(".doan/canvases/Same.html")]);
  const keys = (tree: TreeNode[]) => folder(at(tree, 0)).children.map((node) => node.key);
  expect(keys(forward)).toEqual([".doan/canvases/Same.html", ".doan/canvases/same.html"]);
  expect(keys(reverse)).toEqual(keys(forward));
});

test("buildCanvasTree labels canvas nodes with the display name and keeps the file name", () => {
  const tree = buildCanvasTree([row(".doan/canvases/login.html"), row(".doan/canvases/plain.html")]);
  const [login, plain] = folder(at(tree, 0)).children as [CanvasNode, CanvasNode];
  expect([login.name, login.fileName]).toEqual(["login", "login.html"]);
  expect([plain.name, plain.fileName]).toEqual(["plain", "plain.html"]);
});

test("buildCanvasTree keeps a canvas row with an unreadable id", () => {
  const tree = buildCanvasTree([row(".doan/canvases/broken.html")]);
  expect(folder(at(tree, 0)).children).toHaveLength(1);
});

test("buildCanvasTree does not mutate or reorder the input rows", () => {
  const rows = [row(".doan/canvases/b.html"), row(".doan/canvases/a.html")];
  buildCanvasTree(rows);
  expect(rows.map((r) => r.path)).toEqual([".doan/canvases/b.html", ".doan/canvases/a.html"]);
});

test("frameLabel numbers from 1 and prefers a trimmed title over the id", () => {
  expect(frameLabel({ id: "card-declined", title: "Card declined" }, 3)).toEqual({ number: 4, name: "Card declined" });
  expect(frameLabel({ id: "card-declined", title: "  Card declined  " }, 0)).toEqual({ number: 1, name: "Card declined" });
  expect(frameLabel({ id: "card-declined" }, 0).name).toBe("card-declined");
  expect(frameLabel({ id: "card-declined", title: "   " }, 0).name).toBe("card-declined");
});

test("frameLabel names a frame with neither id nor title", () => {
  expect(frameLabel({ id: "" }, 1)).toEqual({ number: 2, name: "(no id)" });
});

test("frameLabel does not shorten a long id or title; the cap is applied where frames enter", () => {
  const long = "x".repeat(250);
  expect(frameLabel({ id: long }, 0).name).toBe(long);
});

test("typeaheadNext finds the first matching row after the current one", () => {
  const keys = ["Overview", "doan", "login", "logout", "billing"];
  expect(typeaheadNext(keys, 0, "l")).toBe(2);
  expect(typeaheadNext(keys, 2, "l")).toBe(3);
});

test("typeaheadNext cycles past the end and back to the current row", () => {
  const keys = ["Overview", "doan", "login", "logout", "billing"];
  expect(typeaheadNext(keys, 3, "l")).toBe(2);
  expect(typeaheadNext(keys, 2, "b")).toBe(4);
  expect(typeaheadNext(keys, 4, "b")).toBe(4);
  expect(typeaheadNext(keys, 4, "o")).toBe(0);
});

test("typeaheadNext matches case-insensitively", () => {
  expect(typeaheadNext(["Overview", "Billing"], 0, "b")).toBe(1);
  expect(typeaheadNext(["Overview", "billing"], 0, "BI")).toBe(1);
});

test("typeaheadNext returns null for an empty buffer, no match, or no rows", () => {
  expect(typeaheadNext(["a", "b"], 0, "")).toBeNull();
  expect(typeaheadNext(["a", "b"], 0, "z")).toBeNull();
  expect(typeaheadNext([], -1, "a")).toBeNull();
});

test("typeaheadNext starts at the top when no row has focus", () => {
  expect(typeaheadNext(["alpha", "beta"], -1, "a")).toBe(0);
});

test("typeaheadNext keeps a row that still matches a longer buffer", () => {
  const keys = ["abacus", "abbey", "other"];
  expect(typeaheadNext(keys, 0, "a")).toBe(1);
  expect(typeaheadNext(keys, 0, "ab")).toBe(0);
  expect(typeaheadNext(keys, 1, "ab")).toBe(1);
  expect(typeaheadNext(keys, 0, "abb")).toBe(1);
});

test("typeaheadNext cycles through one letter when it is repeated", () => {
  const keys = ["alpha", "avocado", "beta", "apricot"];
  expect(typeaheadNext(keys, 0, "aa")).toBe(1);
  expect(typeaheadNext(keys, 1, "aaa")).toBe(3);
  expect(typeaheadNext(keys, 3, "aa")).toBe(0);
});

test("typeaheadNext treats a supplementary-plane character as one character", () => {
  const keys = ["😀 alpha", "😀 beta", "other"];
  expect(typeaheadNext(keys, 0, "😀")).toBe(1);
  expect(typeaheadNext(keys, 1, "😀")).toBe(0);
  expect(typeaheadNext(keys, 0, "😀😀")).toBe(1);
  expect(typeaheadNext(keys, 0, "😀 b")).toBe(1);
});

test("typeaheadNext matches a prefix, not a substring", () => {
  expect(typeaheadNext(["alpha", "beta"], 0, "lp")).toBeNull();
});

test("canvas labels strip HTML extensions case-insensitively ", () => {
  for (const path of [".doan/canvases/A.HTML", ".doan/canvases/A.HtMl"]) {
    expect(canvasLabel(row(path))).toBe("A");
  }
  expect(canvasLabel(row(".doan/canvases/.HTML"))).toBe(".HTML");
});

test("a move into another folder expands the new ancestors and moves the canvas row's expansion", () => {
  expect(moveExpanded([".doan/canvases/old", ".doan/canvases/old/a.html"], ".doan/canvases/old/a.html", ".doan/canvases/flows/sub/a.html"))
    .toEqual([".doan/canvases/old", ".doan/canvases", ".doan/canvases/flows", ".doan/canvases/flows/sub", ".doan/canvases/flows/sub/a.html"]);
  expect(moveExpanded([".doan/canvases/old"], ".doan/canvases/old/a.html", ".doan/canvases/flows/a.html")).toEqual([".doan/canvases/old", ".doan/canvases", ".doan/canvases/flows"]);
});

test("rowProblem names an unreadable canvas with the raw error as detail", () => {
  const error = { code: "canvas_unreadable", message: "EACCES" };
  expect(rowProblem(row(".doan/canvases/a.html"))).toBeNull();
  expect(rowProblem(row(".doan/canvases/a.html", { error }))).toEqual({ sentence: "Can't read this canvas — run doan check", detail: "canvas_unreadable: EACCES" });
});
