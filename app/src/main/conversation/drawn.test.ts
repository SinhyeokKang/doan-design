import { describe, expect, it } from "vitest";
import { drawnCanvases, type DrawnInput } from "./drawn";

// The new canvases a turn drew: its own edit paths matched to the listing, minus what existed at its start and what
// was announced already (ARCHITECTURE §7 'Handoff' shares the listing rules).
describe("drawnCanvases", () => {
  const old = { path: ".doan/canvases/a.html", id: "a" };
  const made = { path: ".doan/canvases/b.html", id: "b" }, other = { path: ".doan/canvases/c.html", id: "c" };
  const base: DrawnInput = { root: "/repo", snapshot: [old], edits: ["/repo/.doan/canvases/b.html"], listed: [old, made], announced: [] };
  it("names a new listed canvas the turn edited", () => {
    expect(drawnCanvases(base)).toEqual([made]);
  });
  it("takes absolute, relative and differently spelled paths, naming each canvas once in edit order", () => {
    const edits = [".doan/canvases/c.html", "/repo/.doan/canvases/b.html", "/repo/.doan/canvases/c.html", "/repo/./.doan/canvases/b.html"];
    expect(drawnCanvases({ ...base, edits, listed: [old, made, other] })).toEqual([other, made]);
  });
  it("follows the /private spelling of a root under /private", () => {
    expect(drawnCanvases({ ...base, root: "/private/var/repo", edits: ["/var/repo/.doan/canvases/b.html"] })).toEqual([made]);
    expect(drawnCanvases({ ...base, root: "/private/var/repo", edits: ["/private/var/repo/.doan/canvases/b.html"] })).toEqual([made]);
  });
  it("names two new canvases as two", () => {
    expect(drawnCanvases({ ...base, edits: [...base.edits, "/repo/.doan/canvases/c.html"], listed: [old, made, other] })).toEqual([made, other]);
  });
  it("names a new canvas without an ID by its path", () => {
    const bare = { path: ".doan/canvases/bare.html" };
    expect(drawnCanvases({ ...base, edits: ["/repo/.doan/canvases/bare.html"], listed: [old, bare] })).toEqual([bare]);
  });
  it("leaves out a canvas that existed at the turn's start, by path or by ID", () => {
    expect(drawnCanvases({ ...base, edits: ["/repo/.doan/canvases/a.html"] })).toEqual([]);
    expect(drawnCanvases({ ...base, snapshot: [old, made] })).toEqual([]);
    // Renamed during the turn: the edit of its new path still names the canvas the snapshot held.
    expect(drawnCanvases({ ...base, snapshot: [old, { path: ".doan/canvases/before.html", id: "b" }] })).toEqual([]);
  });
  it("leaves out a path the snapshot held without an ID that has one now", () => {
    expect(drawnCanvases({ ...base, snapshot: [old, { path: made.path }] })).toEqual([]);
  });
  it("names nothing for a path that is not listed, or not a canvas", () => {
    expect(drawnCanvases({ ...base, listed: [old] })).toEqual([]);
    expect(drawnCanvases({ ...base, edits: ["/repo/notes.md", "/elsewhere/.doan/canvases/b.html"] })).toEqual([]);
    expect(drawnCanvases({ ...base, edits: [] })).toEqual([]);
  });
  it("names nothing for a path listed twice", () => {
    expect(drawnCanvases({ ...base, listed: [old, made, { path: made.path, id: "b2" }] })).toEqual([]);
  });
  it("names neither file when one ID is listed in two (duplicate_canvas_id)", () => {
    const copy = { path: ".doan/canvases/copy.html", id: "b" };
    expect(drawnCanvases({ ...base, edits: [...base.edits, "/repo/.doan/canvases/copy.html"], listed: [old, made, copy] })).toEqual([]);
  });
  it("leaves out what was announced already, by ID or by the path it was announced at", () => {
    expect(drawnCanvases({ ...base, announced: [made] })).toEqual([]);
    expect(drawnCanvases({ ...base, announced: [{ path: made.path }] })).toEqual([]);
    expect(drawnCanvases({ ...base, edits: [...base.edits, "/repo/.doan/canvases/c.html"], listed: [old, made, other], announced: [made] })).toEqual([other]);
  });
});
