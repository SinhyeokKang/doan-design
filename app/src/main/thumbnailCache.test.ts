import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { thumbnailGarbage, thumbnailKey, thumbnailStale, tokenSignature } from "./thumbnailCache";

const tokenFiles = [
  { path: "design/tokens.css", mtimeMs: 10, size: 5 },
  { path: "design/theme.css", mtimeMs: 20, size: 7 },
];
const tokens = tokenSignature(tokenFiles);
const meta = { mtimeMs: 1_000, size: 200, appVersion: "0.1.0", tokens };

test("the key is sha256 of root, a newline and the canvas path", () => {
  const expected = createHash("sha256").update("/repo/a\ndesign/x.html").digest("hex");
  expect(thumbnailKey("/repo/a", "design/x.html")).toBe(expected);
  expect(thumbnailKey("/repo/a", "design/x.html")).toMatch(/^[0-9a-f]{64}$/);
});

test("the newline keeps a root/path split from colliding with another", () => {
  expect(thumbnailKey("/repo/a", "b/c.html")).not.toBe(thumbnailKey("/repo/a/b", "c.html"));
  expect(thumbnailKey("/repo/ab", "c.html")).not.toBe(thumbnailKey("/repo/a", "bc.html"));
});

test("a cached thumbnail with the same mtime, size and version is fresh", () => {
  expect(thumbnailStale(meta, { mtimeMs: 1_000, size: 200 }, "0.1.0", tokens)).toBe(false);
});

test.each([
  ["mtime", { mtimeMs: 1_001, size: 200 }, "0.1.0"],
  ["size", { mtimeMs: 1_000, size: 201 }, "0.1.0"],
  ["app version", { mtimeMs: 1_000, size: 200 }, "0.2.0"],
])("a changed %s is stale", (_name, stat, version) => {
  expect(thumbnailStale(meta, stat, version, tokens)).toBe(true);
});

test("a canvas older than the cache is stale too: any mtime difference counts", () => {
  expect(thumbnailStale(meta, { mtimeMs: 999, size: 200 }, "0.1.0", tokens)).toBe(true);
});

test("no meta (never cached, or unreadable) is stale", () => {
  expect(thumbnailStale(null, { mtimeMs: 1_000, size: 200 }, "0.1.0", tokens)).toBe(true);
});

test("a changed token file signature makes the thumbnail stale, even from a previous run", () => {
  expect(thumbnailStale(meta, { mtimeMs: 1_000, size: 200 }, "0.1.0", tokenSignature([{ ...tokenFiles[0]!, mtimeMs: 11 }, tokenFiles[1]!]))).toBe(true);
});

test("the token signature ignores file order and tracks path, mtime and size", () => {
  expect(tokenSignature([...tokenFiles].reverse())).toBe(tokens);
  expect(tokenSignature(tokenFiles)).toMatch(/^[0-9a-f]{64}$/);
  const [a, b] = tokenFiles as [typeof tokenFiles[0], typeof tokenFiles[0]];
  for (const changed of [{ ...a, path: "design/other.css" }, { ...a, mtimeMs: 11 }, { ...a, size: 6 }]) {
    expect(tokenSignature([changed, b])).not.toBe(tokens);
  }
  expect(tokenSignature([a])).not.toBe(tokens);
  expect(tokenSignature([...tokenFiles, { path: "design/extra.css", mtimeMs: 1, size: 1 }])).not.toBe(tokens);
});

test("a folder without token files has a stable signature of its own", () => {
  expect(tokenSignature([])).toBe(tokenSignature([]));
  expect(tokenSignature([])).not.toBe(tokens);
});

const live = thumbnailKey("/repo/a", "x.html");
const other = thumbnailKey("/repo/a", "y.html");
const gone = thumbnailKey("/repo/gone", "z.html");

test("lists the png and json of keys that are not live", () => {
  const names = [`${live}.png`, `${live}.json`, `${other}.png`, `${other}.json`, `${gone}.png`, `${gone}.json`];
  expect(thumbnailGarbage(names, [live, other])).toEqual([`${gone}.png`, `${gone}.json`]);
});

test("a half-written pair of a dead key is garbage, of a live key is kept", () => {
  expect(thumbnailGarbage([`${gone}.png`, `${live}.json`], [live])).toEqual([`${gone}.png`]);
});

test("files that are not cache entries are never listed", () => {
  const names = ["README.txt", `${gone}.png.tmp`, "abc.png", `${gone.toUpperCase()}.png`, `${gone}`];
  expect(thumbnailGarbage(names, [])).toEqual([]);
});

test("nothing live means every cache entry is garbage", () => {
  expect(thumbnailGarbage([`${live}.png`, `${live}.json`], [])).toEqual([`${live}.png`, `${live}.json`]);
});

test("an empty cache has no garbage", () => {
  expect(thumbnailGarbage([], [live])).toEqual([]);
});
