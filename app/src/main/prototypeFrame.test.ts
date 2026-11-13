import { describe, expect, test } from "vitest";
import type { FrameLike } from "./canvasFrame";
import { prototypeFrameNavigationAllowed } from "./prototypeFrame";

const run = "http://127.0.0.1:5123/t/tok/key1/.doan/canvases/proto.html";
const top: FrameLike = { url: "file:///app/prototype.html", parent: null };
const child: FrameLike = { url: run, parent: top };
const grandchild: FrameLike = { url: "http://127.0.0.1:5123/t/tok/key1/.doan/canvases/inner.html", parent: child };

describe("prototypeFrameNavigationAllowed", () => {
  test("the host loading the current run URL into its own iframe", () => {
    expect(prototypeFrameNavigationAllowed({ url: run, frame: child, initiator: top }, run)).toBe(true);
    expect(prototypeFrameNavigationAllowed({ url: "HTTP://127.0.0.1:5123/t/tok/key1/.doan/canvases/proto.html", frame: child, initiator: top }, run)).toBe(true);
  });

  test("refuses the canvas's own document moves: link, location, reload, form submit, download", () => {
    expect(prototypeFrameNavigationAllowed({ url: run, frame: child, initiator: child }, run)).toBe(false);
    expect(prototypeFrameNavigationAllowed({ url: "http://127.0.0.1:5123/t/tok/key1/.doan/canvases/other.html", frame: child, initiator: child }, run)).toBe(false);
    expect(prototypeFrameNavigationAllowed({ url: `${run}?q=1`, frame: child, initiator: child }, run)).toBe(false);
  });

  test("refuses a host-started move to anything but the current run URL", () => {
    expect(prototypeFrameNavigationAllowed({ url: "http://127.0.0.1:5123/t/tok/key1/.doan/canvases/other.html", frame: child, initiator: top }, run)).toBe(false);
    expect(prototypeFrameNavigationAllowed({ url: "http://127.0.0.1:5123/t/tok/key2/.doan/canvases/proto.html", frame: child, initiator: top }, run)).toBe(false);
    expect(prototypeFrameNavigationAllowed({ url: `${run}#phone`, frame: child, initiator: top }, run)).toBe(false);
  });

  test("refuses a missing initiator, which is not the app", () => {
    expect(prototypeFrameNavigationAllowed({ url: run, frame: child, initiator: null }, run)).toBe(false);
    expect(prototypeFrameNavigationAllowed({ url: run, frame: child }, run)).toBe(false);
  });

  test("refuses everything while there is no run", () => {
    expect(prototypeFrameNavigationAllowed({ url: run, frame: child, initiator: top }, null)).toBe(false);
  });

  test("refuses the window's own main frame and a missing frame", () => {
    expect(prototypeFrameNavigationAllowed({ url: run, frame: top, initiator: top }, run)).toBe(false);
    expect(prototypeFrameNavigationAllowed({ url: run, frame: null, initiator: top }, run)).toBe(false);
    expect(prototypeFrameNavigationAllowed({ url: run, frame: undefined, initiator: top }, run)).toBe(false);
  });

  test("a nested iframe's own navigation keeps the board rule", () => {
    expect(prototypeFrameNavigationAllowed({ url: "https://example.com/", frame: grandchild, initiator: grandchild }, run)).toBe(true);
  });

  test("refuses unparsable URLs", () => {
    expect(prototypeFrameNavigationAllowed({ url: "not a url", frame: child, initiator: top }, "not a url")).toBe(false);
    expect(prototypeFrameNavigationAllowed({ url: run, frame: child, initiator: top }, "::")).toBe(false);
  });

  test("fails closed when a disposed frame throws on access", () => {
    const disposed = { get url(): string { throw new Error("disposed"); }, get parent(): FrameLike | null { throw new Error("disposed"); } };
    expect(prototypeFrameNavigationAllowed({ url: run, frame: disposed, initiator: top }, run)).toBe(false);
    expect(prototypeFrameNavigationAllowed({ url: run, frame: child, initiator: disposed }, run)).toBe(false);
  });
});
