import { expect, test } from "vitest";
import { ThumbnailRequests } from "./thumbnails";
import { initialThumbnailQueue, thumbnailQueue } from "../main/thumbnailQueue";

test("the next capture follows current visibility after scrolling", async () => {
  let queue = initialThumbnailQueue;
  const requests = new ThumbnailRequests("/repo", async (_root, path, visible) => {
    queue = thumbnailQueue(queue, { type: "request", key: path, visible });
    return { kind: "pending" };
  }, () => {}, (_root, path, visible) => {
    queue = thumbnailQueue(queue, { type: "visible", key: path, visible });
  });
  requests.setRows(["a", "b", "c"].map(path => ({ path, id: path, width: 800, url: path })));
  requests.onVisible(["a", "b"]);
  await Promise.resolve();
  expect(queue.active).toBe("a");
  requests.onVisible(["c"]);
  await Promise.resolve();
  queue = thumbnailQueue(queue, { type: "done", key: "a" });
  expect(queue.active).toBe("c");
});


test("leaving the overview demotes pending cards even before replies arrive", () => {
  let queue = initialThumbnailQueue;
  const requests = new ThumbnailRequests("/repo", (_root, path, visible) => {
    queue = thumbnailQueue(queue, { type: "request", key: path, visible });
    return new Promise(() => {});
  }, () => {}, (_root, path, visible) => {
    queue = thumbnailQueue(queue, { type: "visible", key: path, visible });
  });
  requests.setRows(["a", "b"].map(path => ({ path, id: path, width: 800, url: path })));
  requests.onVisible(["a", "b"]);
  requests.onVisible([]);
  expect(queue.pending).toEqual([{ key: "b", visible: false }]);
  requests.onVisible(["b"]);
  expect(queue.pending).toEqual([{ key: "b", visible: true }]);
  requests.dispose();
  expect(queue.pending).toEqual([{ key: "b", visible: false }]);
});

// The Overview list and the canvas panel can show one root at once and share its requests: each viewer reports only
// its own visible set, and main hears a canvas leave the screen only when no viewer shows it.
test("two viewers sharing one root's requests do not overwrite each other's visibility", () => {
  const reports: [string, boolean][] = [];
  const requests = new ThumbnailRequests("/repo", () => new Promise(() => {}), () => {}, (_root, path, visible) => { reports.push([path, visible]); });
  const [a, b, c] = ["a", "b", "c"].map(path => ({ path, id: path, width: 800, url: path }));
  requests.setRows([a!, b!, c!], "overview");
  requests.setRows([c!], "panel");
  requests.onVisible(["a"], "overview");
  requests.onVisible(["c"], "panel");
  requests.onVisible([], "overview");
  expect(reports).toEqual([["c", true], ["a", false]]);
  requests.release("panel");
  expect(reports).toEqual([["c", true], ["a", false], ["c", false]]);
});

test("a viewer's visibility counts on main's queue until that viewer reports it gone", () => {
  let queue = initialThumbnailQueue;
  const requests = new ThumbnailRequests("/repo", (_root, path, visible) => {
    queue = thumbnailQueue(queue, { type: "request", key: path, visible });
    return new Promise(() => {});
  }, () => {}, (_root, path, visible) => {
    queue = thumbnailQueue(queue, { type: "visible", key: path, visible });
  });
  const rows = ["a", "b", "c"].map(path => ({ path, id: path, width: 800, url: path }));
  requests.setRows(rows, "overview");
  requests.setRows(rows, "panel");
  requests.onVisible(["a", "c"], "overview");
  requests.onVisible(["c"], "panel");
  requests.onVisible(["a"], "overview");
  expect(queue.pending).toEqual([{ key: "c", visible: true }, { key: "b", visible: false }]);
  requests.onVisible([], "panel");
  expect(queue.pending).toEqual([{ key: "c", visible: false }, { key: "b", visible: false }]);
});

// Main keeps a reported mark until it hears otherwise, and a canvas it still thinks visible jumps the capture queue.
test("a viewer that alone listed a visible path sends false to main on release", () => {
  const reports: [string, boolean][] = [];
  const requests = new ThumbnailRequests("/repo", () => new Promise(() => {}), () => {}, (_root, path, visible) => { reports.push([path, visible]); });
  const [a, c] = ["a", "c"].map(path => ({ path, id: path, width: 800, url: path }));
  requests.setRows([a!], "overview");
  requests.setRows([c!], "panel");
  requests.onVisible(["a"], "overview");
  requests.onVisible(["c"], "panel");
  requests.release("panel");
  expect(reports).toEqual([["c", true], ["c", false]]);
});

test("a visible path dropped from the rows sends false to main", () => {
  const reports: [string, boolean][] = [];
  const requests = new ThumbnailRequests("/repo", () => new Promise(() => {}), () => {}, (_root, path, visible) => { reports.push([path, visible]); });
  const [a, b] = ["a", "b"].map(path => ({ path, id: path, width: 800, url: path }));
  requests.setRows([a!, b!]);
  requests.onVisible(["a", "b"]);
  requests.setRows([a!]);
  expect(reports).toEqual([["b", false]]);
});
