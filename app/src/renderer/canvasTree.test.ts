import { expect, test } from "vitest";
import type { CanvasRow } from "../main/view";
import { canvasLabel, frameLabel, frameName, frameTitle, moveExpanded, rowProblem, typeaheadNext } from "./canvasTree";

const row = (path: string, extra: Partial<CanvasRow> = {}): CanvasRow => ({ path, url: `http://127.0.0.1/${path}`, ...extra });

test("canvasLabel is the file name without .html, whatever the page's <title> says", () => {
  expect(canvasLabel(row(".doan/canvases/login.html"))).toBe("login");
  expect(canvasLabel({ ...row(".doan/canvases/login.html"), title: "  Login  " } as CanvasRow)).toBe("login");
  expect(canvasLabel(row(".doan/canvases/a/b/step-2.html"))).toBe("step-2");
  expect(canvasLabel(row(".doan/canvases/a.b.html"))).toBe("a.b");
  expect(canvasLabel(row(".doan/canvases/.html"))).toBe(".html");
});

test("frameLabel numbers from 1 and prefers a trimmed title over the id", () => {
  expect(frameLabel({ id: "card-declined", title: "Card declined" }, 3)).toEqual({ number: 4, name: "Card declined" });
  expect(frameLabel({ id: "card-declined", title: "  Card declined  " }, 0)).toEqual({ number: 1, name: "Card declined" });
  expect(frameLabel({ id: "card-declined" }, 0).name).toBe("card-declined");
  expect(frameLabel({ id: "card-declined", title: "   " }, 0).name).toBe("card-declined");
});

// PRODUCT §5 item 2 'Play': a frame is named by its title, else its id; every screen uses this rule.
test("frameName is the trimmed title, else the id; frameTitle is the trimmed title or nothing", () => {
  expect(frameName({ id: "pay", title: " Pay " })).toBe("Pay");
  for (const title of [undefined, "", "   "]) {
    expect(frameName({ id: "pay", title })).toBe("pay");
    expect(frameTitle(title)).toBeUndefined();
  }
  expect(frameTitle("\tPay\n")).toBe("Pay");
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
  expect(rowProblem(row(".doan/canvases/a.html", { error }))).toEqual({ sentence: "Can’t read this canvas. Run doan check in a terminal.", detail: "canvas_unreadable: EACCES" });
});
