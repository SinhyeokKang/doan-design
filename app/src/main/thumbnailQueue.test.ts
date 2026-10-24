import { expect, test } from "vitest";
import { initialThumbnailQueue, thumbnailQueue, type ThumbnailQueue, type ThumbnailQueueEvent } from "./thumbnailQueue";

function run(...events: ThumbnailQueueEvent[]): ThumbnailQueue {
  return events.reduce(thumbnailQueue, initialThumbnailQueue);
}

const request = (key: string, visible = false): ThumbnailQueueEvent => ({ type: "request", key, visible });

test("starts the first request at once", () => {
  expect(run(request("a")).active).toBe("a");
});

test("runs one at a time in request order", () => {
  let state = run(request("a"), request("b"), request("c"));
  expect(state.active).toBe("a");
  state = thumbnailQueue(state, { type: "done", key: "a" });
  expect(state.active).toBe("b");
  state = thumbnailQueue(state, { type: "done", key: "b" });
  expect(state.active).toBe("c");
  state = thumbnailQueue(state, { type: "done", key: "c" });
  expect(state.active).toBeNull();
  expect(state.pending).toEqual([]);
});

test("visible cards go before hidden ones, in request order within each group", () => {
  let state = run(request("busy"), request("h1"), request("v1", true), request("h2"), request("v2", true));
  const order: (string | null)[] = [];
  for (let i = 0; i < 5; i++) {
    order.push(state.active);
    state = thumbnailQueue(state, { type: "done", key: state.active! });
  }
  expect(order).toEqual(["busy", "v1", "v2", "h1", "h2"]);
});

test("a card that scrolls into view jumps the line; scrolling out sends it back", () => {
  let state = run(request("busy"), request("a"), request("b"), request("c"));
  state = thumbnailQueue(state, { type: "visible", key: "c", visible: true });
  state = thumbnailQueue(state, { type: "done", key: "busy" });
  expect(state.active).toBe("c");
  state = thumbnailQueue(state, { type: "visible", key: "b", visible: true });
  state = thumbnailQueue(state, { type: "visible", key: "b", visible: false });
  state = thumbnailQueue(state, { type: "done", key: "c" });
  expect(state.active).toBe("a");
});

test("visibility of an unknown, active or finished key changes nothing", () => {
  const state = run(request("a"), request("b"));
  expect(thumbnailQueue(state, { type: "visible", key: "zzz", visible: true })).toEqual(state);
  expect(thumbnailQueue(state, { type: "visible", key: "a", visible: true })).toEqual(state);
});

test("a repeated request keeps its place and can only raise the priority", () => {
  let state = run(request("busy"), request("a"), request("b"));
  state = thumbnailQueue(state, request("a"));
  expect(state.pending.map((job) => job.key)).toEqual(["a", "b"]);
  state = thumbnailQueue(state, request("b", true));
  state = thumbnailQueue(state, request("b", false));
  expect(state.pending.map((job) => job.visible)).toEqual([false, true]);
  state = thumbnailQueue(state, { type: "done", key: "busy" });
  expect(state.active).toBe("b");
});

test("requesting the active key does not queue it a second time", () => {
  const state = run(request("a"), request("a", true));
  expect(state.active).toBe("a");
  expect(state.pending).toEqual([]);
});

test("a failure moves on and remembers the key", () => {
  const state = run(request("a"), request("b"), { type: "fail", key: "a" });
  expect(state.active).toBe("b");
  expect(state.failed).toEqual(["a"]);
});

test("a failed key is not retried by another request", () => {
  const state = run(request("a"), { type: "fail", key: "a" }, request("a", true));
  expect(state.active).toBeNull();
  expect(state.pending).toEqual([]);
  expect(state.failed).toEqual(["a"]);
});

test("forgetting a failed key allows a new request", () => {
  const state = run(request("a"), { type: "fail", key: "a" }, { type: "forget", key: "a" }, request("a"));
  expect(state.active).toBe("a");
  expect(state.failed).toEqual([]);
});

test("forgetting a pending key drops it; the active job is left to finish", () => {
  let state = run(request("a"), request("b"), request("c"), { type: "forget", key: "b" });
  expect(state.pending.map((job) => job.key)).toEqual(["c"]);
  state = thumbnailQueue(state, { type: "forget", key: "a" });
  expect(state.active).toBe("a");
  state = thumbnailQueue(state, { type: "done", key: "a" });
  expect(state.active).toBe("c");
});

test("a result for a key that is not active is ignored", () => {
  const state = run(request("a"), request("b"));
  expect(thumbnailQueue(state, { type: "done", key: "b" })).toEqual(state);
  expect(thumbnailQueue(state, { type: "fail", key: "b" })).toEqual(state);
  expect(thumbnailQueue(initialThumbnailQueue, { type: "done", key: "a" })).toEqual(initialThumbnailQueue);
});

test("pause lets the active job finish, then starts nothing", () => {
  let state = run(request("a"), request("b"), { type: "pause" });
  expect(state.active).toBe("a");
  state = thumbnailQueue(state, { type: "done", key: "a" });
  expect(state.active).toBeNull();
  expect(state.pending.map((job) => job.key)).toEqual(["b"]);
});

test("requests made while paused wait, and resume starts the best one", () => {
  let state = run({ type: "pause" }, request("h"), request("v", true));
  expect(state.active).toBeNull();
  state = thumbnailQueue(state, { type: "resume" });
  expect(state.active).toBe("v");
  expect(state.paused).toBe(false);
});

test("pause and resume are idempotent", () => {
  const paused = run({ type: "pause" });
  expect(thumbnailQueue(paused, { type: "pause" })).toEqual(paused);
  expect(thumbnailQueue(initialThumbnailQueue, { type: "resume" })).toEqual(initialThumbnailQueue);
});

test("does not mutate the previous state", () => {
  const before = run(request("a"), request("b"));
  const snapshot = structuredClone(before);
  thumbnailQueue(before, { type: "done", key: "a" });
  thumbnailQueue(before, request("c", true));
  expect(before).toEqual(snapshot);
});

test("forget + request while the capture runs queues a fresh capture after its done", () => {
  let state = run(request("a"), { type: "forget", key: "a" }, request("a"));
  expect(state.active).toBe("a");
  expect(state.pending.map((job) => job.key)).toEqual(["a"]);
  state = thumbnailQueue(state, { type: "done", key: "a" });
  expect(state).toMatchObject({ active: "a", pending: [], failed: [], activeStale: false });
  state = thumbnailQueue(state, { type: "done", key: "a" });
  expect(state.active).toBeNull();
});

test("a stale fail of the old capture does not fail the re-requested key", () => {
  let state = run(request("a"), { type: "forget", key: "a" }, request("a"));
  state = thumbnailQueue(state, { type: "fail", key: "a" });
  expect(state).toMatchObject({ active: "a", pending: [], failed: [] });
  state = thumbnailQueue(state, { type: "fail", key: "a" });
  expect(state.failed).toEqual(["a"]);
});

test("forget alone makes the running capture's result count for nothing", () => {
  const forgotten = run(request("a"), { type: "forget", key: "a" });
  expect(thumbnailQueue(forgotten, { type: "fail", key: "a" })).toMatchObject({ active: null, failed: [] });
  expect(thumbnailQueue(forgotten, { type: "done", key: "a" })).toMatchObject({ active: null, failed: [] });
});

test("a re-request waits its turn behind other pending jobs", () => {
  let state = run(request("a"), request("b"), { type: "forget", key: "a" }, request("a"));
  state = thumbnailQueue(state, { type: "done", key: "a" });
  expect(state.active).toBe("b");
  expect(state.pending.map((job) => job.key)).toEqual(["a"]);
});
