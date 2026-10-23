import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
vi.mock("./mkdir", () => ({ createCommentDirectory: vi.fn(async (parent: string, name: string) => { try { await fs.mkdir(join(parent, name)); } catch (e) { if (!(e instanceof Error && "code" in e && e.code === "EEXIST")) throw e; } }) }));
import { readCommentBytes, withCommentAppend, AppendUncertainError } from "./files";
let root: string;
const file = () => join(root, ".doan/comments/canvas.jsonl");
beforeEach(async () => { root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "doan-files-"))); });
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });
async function seed(text = "old") { await fs.mkdir(join(root, ".doan/comments"), { recursive: true }); await fs.writeFile(file(), text); }
describe("comment file descriptors", () => {
  it("reads absent storage without creating state", async () => { expect(await readCommentBytes(root, "canvas")).toEqual(Buffer.alloc(0)); expect(await fs.readdir(root)).toEqual([]); });
  it("reads latest bytes and appends with exactly one write on the same descriptor", async () => {
    await seed(); const original = await fs.stat(file());
    await withCommentAppend(root, "canvas", async latest => { expect(latest.toString()).toBe("old"); return Buffer.from("new\n"); });
    expect(await fs.readFile(file(), "utf8")).toBe("old\nnew\n"); expect((await fs.stat(file())).ino).toBe(original.ino);
  });
  it.each(["", "old\n"])("does not add an unnecessary LF after %j", async text => { await seed(text); await withCommentAppend(root, "canvas", async () => Buffer.from("new\n")); expect(await fs.readFile(file(), "utf8")).toBe(text + "new\n"); });
  it("does not append when preparation skips", async () => { await seed(); await withCommentAppend(root, "canvas", async () => null); expect(await fs.readFile(file(), "utf8")).toBe("old"); });
  it.each(["../x", "Canvas", "a/b", "a\0b", "", "a.jsonl"])("rejects invalid canvas %j", async id => { await expect(withCommentAppend(root, id, async () => Buffer.from("x\n"))).rejects.toThrow(); expect(await fs.readdir(root)).toEqual([]); });
  it("rejects a case-only filename", async () => { await seed(); await fs.rename(file(), join(root, ".doan/comments/Canvas.jsonl")); await expect(readCommentBytes(root, "canvas")).rejects.toThrow(); await expect(withCommentAppend(root, "canvas", async () => Buffer.from("x\n"))).rejects.toThrow(); });
  it.each(["live", "dangling", "directory", "fifo"])("rejects a %s leaf without blocking", async kind => {
    await seed(); await fs.unlink(file()); const outside = join(root, "outside"); await fs.writeFile(outside, "safe");
    if (kind === "directory") await fs.mkdir(file()); else if (kind === "fifo") execFileSync("mkfifo", [file()]); else await fs.symlink(kind === "live" ? outside : outside + "-missing", file());
    await expect(withCommentAppend(root, "canvas", async () => Buffer.from("x\n"))).rejects.toThrow(); expect(await fs.readFile(outside, "utf8")).toBe("safe");
  });
  it("writes the opened inode after its pathname is replaced", async () => { await seed(); await withCommentAppend(root, "canvas", async () => { await fs.rename(file(), file() + ".old"); await fs.writeFile(file(), "replacement"); return Buffer.from("new\n"); }); expect(await fs.readFile(file(), "utf8")).toBe("replacement"); expect(await fs.readFile(file() + ".old", "utf8")).toBe("old\nnew\n"); });
  it.each(["short", "close", "write"])("marks %s failure uncertain", async kind => {
    await seed(); const open = fs.open; vi.spyOn(fs, "open").mockImplementation(async (...args) => { const h = await open(...args); if (args[0] === file()) {
      if (kind === "short") vi.spyOn(h, "write").mockResolvedValue({ bytesWritten: 1, buffer: Buffer.alloc(1) });
      if (kind === "write") vi.spyOn(h, "write").mockRejectedValue(new Error("write failure"));
      if (kind === "close") { const close = h.close.bind(h); vi.spyOn(h, "close").mockImplementation(async () => { await close(); throw new Error("close failure"); }); }
    } return h; });
    await expect(withCommentAppend(root, "canvas", async () => Buffer.from("x\n"))).rejects.toBeInstanceOf(AppendUncertainError);
  });
});
