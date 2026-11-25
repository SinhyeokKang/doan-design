import { describe, expect, test } from "vitest";
import { projectNames } from "./projectRow";

describe("projectNames", () => {
  test("keeps unique basenames", () => {
    expect([...projectNames(["/code/a", "/code/b"]).values()]).toEqual(["a", "b"]);
    expect(projectNames([]).size).toBe(0);
  });
  test("adds the parent to two or more colliding basenames", () => {
    expect([...projectNames(["/app/doan", "/web/doan"]).values()]).toEqual(["app/doan", "web/doan"]);
    expect([...projectNames(["/app/doan", "/web/doan", "/cli/doan", "/code/other"]).values()]).toEqual(["app/doan", "web/doan", "cli/doan", "other"]);
  });
});
