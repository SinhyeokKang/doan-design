import { expect, test } from "vitest";
import { authorizeCanvas } from "./identity";
const identity = { root: "/repo", path: "design/a.html", canvas: "a" };
const listing = { kind: "list", root: "/repo", scope: ["design"], canvases: [{ path: "design/a.html", id: "a", width: 100 }] };
test("exact Go listing identity is required; width-only invalidity permits existing management", () => {
  expect(authorizeCanvas(identity, listing)).toEqual({ width: 100 });
  expect(authorizeCanvas(identity, { ...listing, canvases: [{ path: identity.path, id: "a" }] })).toEqual({ width: null });
  for (const bad of [
    { ...listing, root: "/other" },
    { ...listing, canvases: [{ path: "design/A.html", id: "a" }] },
    { ...listing, canvases: [{ path: identity.path }] },
    { ...listing, canvases: [...listing.canvases, { path: "design/b.html", id: "a" }] },
  ]) expect(() => authorizeCanvas(identity, bad)).toThrow();
});
