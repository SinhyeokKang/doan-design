import { expect, test } from "vitest";
import { authorizeCanvas } from "./identity";
const identity = { root: "/repo", path: ".doan/canvases/a.html", canvas: "a" };
const listing = { kind: "list", root: "/repo", scope: [".doan/canvases"], canvases: [{ path: ".doan/canvases/a.html", id: "a", width: 100 }] };
test("exact Go listing identity is required; width-only invalidity permits existing management", () => {
  expect(authorizeCanvas(identity, listing)).toEqual({ width: 100 });
  expect(authorizeCanvas(identity, { ...listing, canvases: [{ path: identity.path, id: "a" }] })).toEqual({ width: null });
  for (const bad of [
    { ...listing, root: "/other" },
    { ...listing, canvases: [{ path: ".doan/canvases/A.html", id: "a" }] },
    { ...listing, canvases: [{ path: identity.path }] },
    { ...listing, canvases: [...listing.canvases, { path: ".doan/canvases/b.html", id: "a" }] },
  ]) expect(() => authorizeCanvas(identity, bad)).toThrow();
});

const refusals = [
  { cause: "invalid", requested: { ...identity, canvas: "Invalid" }, canvases: [{ path: identity.path, id: "Invalid" }] },
  { cause: "invalid", requested: { ...identity, canvas: "Invalid" }, canvases: [{ path: identity.path, id: "Invalid" }, { path: ".doan/canvases/b.html", id: "Invalid" }] },
  { cause: "duplicate", requested: identity, canvases: [...listing.canvases, { path: ".doan/canvases/b.html", id: "a" }] },
  { cause: "missing", requested: identity, canvases: [] },
  { cause: "missing", requested: identity, canvases: [{ path: ".doan/canvases/b.html", id: "a" }] },
];
test.each(refusals)("reports $cause from the requested id and listing rows", ({ cause, requested, canvases }) => {
  expect(() => authorizeCanvas(requested, { ...listing, canvases })).toThrow(expect.objectContaining({
    message: "Canvas identity is missing, changed or duplicated.", cause,
  }));
});
test("unavailable projects have no canvas identity cause", () => {
  try { authorizeCanvas(identity, { ...listing, root: "/other" }); }
  catch (error) { expect(error).not.toHaveProperty("cause"); return; }
  throw new Error("Expected project rejection.");
});
