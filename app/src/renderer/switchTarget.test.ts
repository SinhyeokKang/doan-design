import { describe, expect, test } from "vitest";
import type { CanvasRow } from "../main/view";
import { switchTarget } from "./switchTarget";

const row = (path: string, id?: string): CanvasRow => ({ path, ...(id === undefined ? {} : { id }), url: path, open: 0, resolved: 0 });

describe("switchTarget", () => {
  const rows = [row("doan/a.html", "a"), row("doan/b.html", "b"), row("doan/c.html")];

  test("opens the canvas with the same id first", () => {
    expect(switchTarget("b", rows, "doan/c.html")).toBe(rows[1]);
  });

  test("falls back to the canvas remembered for the target root", () => {
    expect(switchTarget("zzz", rows, "doan/c.html")).toBe(rows[2]);
    expect(switchTarget(undefined, rows, "doan/a.html")).toBe(rows[0]);
  });

  test("is null when neither is in the list", () => {
    expect(switchTarget("zzz", rows, "doan/gone.html")).toBeNull();
    expect(switchTarget(undefined, rows, undefined)).toBeNull();
    expect(switchTarget("a", [], undefined)).toBeNull();
  });
});
