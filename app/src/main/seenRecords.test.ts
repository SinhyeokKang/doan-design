import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { MARKER, parseMarker, parseRecord, readSeen, recordText, SEEN_DIR, writeSeen } from "./seenRecords";

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-seen-records-")));
let count = 0;
afterAll(() => { chmodAll(tmp); rmSync(tmp, { recursive: true, force: true }); });
function chmodAll(dir: string): void {
  try {
    chmodSync(dir, 0o755);
    for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory()) chmodAll(join(dir, entry.name));
  } catch { /* gone */ }
}
const isRoot = process.getuid?.() === 0;
const repo = () => { const root = join(tmp, `r${count++}`); mkdirSync(join(root, ".doan/canvases"), { recursive: true }); return root; };
const H = (c: string) => `sha256:${c.repeat(64)}`;
const bytes = (text: string) => Buffer.from(text);
const seenFiles = (root: string) => readdirSync(join(root, SEEN_DIR)).sort();

describe("format", () => {
  test("a record is one line with v:1 and exactly one of html or unseen; the marker is {v:1}", () => {
    expect(recordText({ html: H("a") })).toBe(`{"v":1,"html":"${H("a")}"}\n`);
    expect(recordText({ unseen: "migrated" })).toBe(`{"v":1,"unseen":"migrated"}\n`);
    expect(recordText(null)).toBe(`{"v":1}\n`);
    expect(parseRecord(bytes(recordText({ html: H("a") })))).toEqual({ kind: "seen", html: H("a") });
    expect(parseRecord(bytes(recordText({ unseen: "migrated" })))).toEqual({ kind: "migrated" });
    expect(parseMarker(bytes(recordText(null)))).toEqual({ kind: "present" });
  });

  test("absent, corrupt, Git conflict, unsupported version and wrong shapes are told apart", () => {
    expect(parseRecord(null)).toEqual({ kind: "absent" });
    expect(parseMarker(null)).toEqual({ kind: "absent" });
    const cases: [string, string][] = [
      ["{", "corrupt"],
      ["[]", "corrupt"],
      [`{"html":"${H("a")}"}`, "corrupt"],
      [`{"v":0,"html":"${H("a")}"}`, "corrupt"],
      [`{"v":1.5,"html":"${H("a")}"}`, "corrupt"],
      [`{"v":1,"html":"sha256:ABC"}`, "corrupt"],
      [`{"v":1,"html":"${H("a")}","unseen":"migrated"}`, "corrupt"],
      [`{"v":1,"unseen":"new"}`, "corrupt"],
      [`{"v":1,"html":"${H("a")}","by":"x"}`, "corrupt"],
      [`{"v":1}`, "corrupt"],
      [`{"v":2,"html":"anything"}`, "unsupported"],
      [`<<<<<<< HEAD\n{"v":1,"html":"${H("a")}"}\n=======\n{"v":1,"html":"${H("b")}"}\n>>>>>>> other\n`, "conflict"],
    ];
    for (const [text, kind] of cases) expect(parseRecord(bytes(text)).kind, text).toBe(kind);
    expect(parseMarker(bytes(`{"v":1,"x":1}`)).kind).toBe("corrupt");
    expect(parseMarker(bytes(`{"v":3}`)).kind).toBe("unsupported");
    expect(parseMarker(bytes("<<<<<<< ours\n")).kind).toBe("conflict");
  });
});

describe("reading", () => {
  test("a project without .doan/seen reads as absent; a symlinked .doan or .doan/seen is refused", async () => {
    const root = repo();
    expect(await readSeen(root, ["a"])).toMatchObject({ dir: "absent", marker: { read: { kind: "absent" }, bytes: null } });
    const outside = join(tmp, `out${count++}`); mkdirSync(outside);
    const linked = repo(); symlinkSync(outside, join(linked, SEEN_DIR));
    expect(await readSeen(linked, ["a"])).toMatchObject({ dir: "refused", marker: { read: { kind: "unreadable" } } });
  });

  test("a symlinked record or one larger than any record reads as corrupt and is never offered for a write", async () => {
    const root = repo(); mkdirSync(join(root, SEEN_DIR));
    writeFileSync(join(tmp, `x${count}.json`), recordText({ html: H("a") }));
    symlinkSync(join(tmp, `x${count}.json`), join(root, SEEN_DIR, "a.json"));
    writeFileSync(join(root, SEEN_DIR, "b.json"), " ".repeat(5000));
    const read = await readSeen(root, ["a", "b"]);
    expect(read.records.get("a")).toEqual({ read: { kind: "corrupt" }, bytes: undefined });
    expect(read.records.get("b")).toEqual({ read: { kind: "corrupt" }, bytes: undefined });
  });

  test.skipIf(isRoot)("permission denied on a record is unreadable", async () => {
    const root = repo();
    await writeSeen(root, "a.json", recordText({ html: H("a") }), null);
    chmodSync(join(root, SEEN_DIR, "a.json"), 0o000);
    expect((await readSeen(root, ["a"])).records.get("a")).toEqual({ read: { kind: "unreadable" }, bytes: undefined });
    chmodSync(join(root, SEEN_DIR, "a.json"), 0o644);
  });
});

describe("writing", () => {
  test("atomic write, then a write refused when the target changed after it was read", async () => {
    const root = repo();
    await writeSeen(root, "a.json", recordText({ html: H("a") }), null);
    const read = (await readSeen(root, ["a"])).records.get("a")!;
    expect(read.read).toEqual({ kind: "seen", html: H("a") });
    // Another writer (a pull) replaced it.
    writeFileSync(join(root, SEEN_DIR, "a.json"), recordText({ html: H("b") }));
    await expect(writeSeen(root, "a.json", recordText({ html: H("c") }), read.bytes!)).rejects.toMatchObject({ code: "changed" });
    expect(readFileSync(join(root, SEEN_DIR, "a.json"), "utf8")).toBe(recordText({ html: H("b") }));
    // A writer that read "absent" cannot replace a record that appeared meanwhile.
    await expect(writeSeen(root, "a.json", recordText({ html: H("c") }), null)).rejects.toMatchObject({ code: "changed" });
    expect(seenFiles(root)).toEqual(["a.json"]);
  });

  test("a corrupt or conflicted record is never replaced by a write that read something else", async () => {
    const root = repo(); mkdirSync(join(root, SEEN_DIR));
    writeFileSync(join(root, SEEN_DIR, "a.json"), "<<<<<<< HEAD\n");
    await expect(writeSeen(root, "a.json", recordText({ html: H("c") }), null)).rejects.toMatchObject({ code: "changed" });
    await expect(writeSeen(root, "a.json", recordText({ html: H("c") }), bytes(recordText({ html: H("a") })))).rejects.toMatchObject({ code: "changed" });
    expect(readFileSync(join(root, SEEN_DIR, "a.json"), "utf8")).toBe("<<<<<<< HEAD\n");
  });

  test("a symlinked .doan, .doan/seen or target and a name that is not a canvas ID are refused; nothing is written outside", async () => {
    const outside = join(tmp, `out${count++}`); mkdirSync(join(outside, "seen"), { recursive: true });
    const a = join(tmp, `r${count++}`); mkdirSync(a); symlinkSync(outside, join(a, ".doan"));
    await expect(writeSeen(a, "a.json", recordText({ html: H("a") }), null)).rejects.toMatchObject({ code: "refused" });
    const b = repo(); symlinkSync(join(outside, "seen"), join(b, SEEN_DIR));
    await expect(writeSeen(b, "a.json", recordText({ html: H("a") }), null)).rejects.toMatchObject({ code: "refused" });
    const c = repo(); mkdirSync(join(c, SEEN_DIR)); symlinkSync(join(outside, "x.json"), join(c, SEEN_DIR, "a.json"));
    await expect(writeSeen(c, "a.json", recordText({ html: H("a") }), null)).rejects.toBeDefined();
    for (const name of ["../escape.json", "A.json", "a", "_x.json", ".a.json"]) await expect(writeSeen(repo(), name, "{}", null), name).rejects.toMatchObject({ code: "bad-name" });
    expect(readdirSync(join(outside, "seen"))).toEqual([]);
    expect(readdirSync(outside).sort()).toEqual(["seen"]);
    expect(readdirSync(join(c, SEEN_DIR)).filter(name => name.endsWith(".tmp"))).toEqual([]);
  });

  test.skipIf(isRoot)("a read-only .doan/seen refuses the write with EACCES and leaves no temp file", async () => {
    const root = repo();
    await writeSeen(root, MARKER, recordText(null), null);
    chmodSync(join(root, SEEN_DIR), 0o555);
    await expect(writeSeen(root, "b.json", recordText({ html: H("b") }), null)).rejects.toMatchObject({ code: "EACCES" });
    chmodSync(join(root, SEEN_DIR), 0o755);
    expect(seenFiles(root)).toEqual([MARKER]);
  });

  test("an interrupted write's temp file is ignored by readers and removed by the next successful write once stale", async () => {
    const root = repo();
    await writeSeen(root, "a.json", recordText({ html: H("a") }), null);
    const stale = join(root, SEEN_DIR, ".a.json.0123456789ab.tmp"), fresh = join(root, SEEN_DIR, ".b.json.ba9876543210.tmp");
    const foreign = join(root, SEEN_DIR, ".notes.tmp");
    for (const file of [stale, fresh, foreign]) writeFileSync(file, "{");
    const old = new Date(Date.now() - 120_000);
    utimesSync(stale, old, old); utimesSync(foreign, old, old);
    expect((await readSeen(root, ["a"])).records.get("a")?.read).toEqual({ kind: "seen", html: H("a") });
    await writeSeen(root, "c.json", recordText({ html: H("c") }), null);
    // A temp still being written (recent) and a file that is not ours stay.
    expect(seenFiles(root)).toEqual([".b.json.ba9876543210.tmp", ".notes.tmp", "a.json", "c.json"]);
  });
});
