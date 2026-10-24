import { expect, test } from "vitest";
import { ThumbnailRequests } from "./ProjectOverview";
import { initialThumbnailQueue, thumbnailQueue } from "../main/thumbnailQueue";

test("the next capture follows current visibility after scrolling", async () => {
  let queue = initialThumbnailQueue;
  const requests = new ThumbnailRequests("/repo", async (_root, path, visible) => {
    queue = thumbnailQueue(queue, { type: "request", key: path, visible });
    return { kind: "pending" };
  }, () => {}, (_root, path, visible) => {
    queue = thumbnailQueue(queue, { type: "visible", key: path, visible });
  });
  requests.setRows(["a", "b", "c"].map(path => ({ path, id: path, width: 800, open: 0, resolved: 0, url: path })));
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
  requests.setRows(["a", "b"].map(path => ({ path, id: path, width: 800, open: 0, resolved: 0, url: path })));
  requests.onVisible(["a", "b"]);
  requests.onVisible([]);
  expect(queue.pending).toEqual([{ key: "b", visible: false }]);
  requests.onVisible(["b"]);
  expect(queue.pending).toEqual([{ key: "b", visible: true }]);
  requests.dispose();
  expect(queue.pending).toEqual([{ key: "b", visible: false }]);
});
