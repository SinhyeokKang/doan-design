import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import {
  absorbFirst, createLocalSeen, judge, localSeenText, markShown, mergeRoots, migrateRoot, parseLocalSeen,
  type RootMemory, type RootRecord, type SeenReads, type SeenRow, type Verdict,
} from "./canvasSeen";
import type { RecordRead } from "./seenRecords";

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-canvas-seen-")));
let count = 0;
afterAll(() => { chmodSync(tmp, 0o755); rmSync(tmp, { recursive: true, force: true }); });
const isRoot = process.getuid?.() === 0;
const file = () => { const dir = join(tmp, `d${count++}`); mkdirSync(dir); return join(dir, "canvas-seen.json"); };
const H = (c: string) => `sha256:${c.repeat(64)}`;
const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const aside = (path: string) => readdirSync(dirname(path)).filter(name => name.startsWith("canvas-seen.corrupt-"));
const MIGRATED = (canvases: RootRecord["canvases"]): RootRecord => ({ migrated: true, canvases });

describe("canvas-seen.json", () => {
  test("an older Doan's v1 or v2 file becomes roots still to migrate, and is written back as v3", () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ v: 1, roots: { "/r": { "a.html": 10, "b.html": "x" }, "/s": "bad" } }));
    const local = createLocalSeen(path);
    expect(local.problem).toBeUndefined();
    expect(local.root("/r")).toEqual({ canvases: {}, v2: { legacy: { "a.html": 10 }, known: {} } });
    expect(local.root("/s")).toBeUndefined();
    local.set("/t", MIGRATED({ a: { unseen: "new" } }));
    expect(json(path)).toEqual({ v: 3, roots: { "/r": { canvases: {}, v2: { legacy: { "a.html": 10 }, known: {} } }, "/t": { migrated: true, canvases: { a: { unseen: "new" } } } } });
    expect(createLocalSeen(path).root("/t")).toEqual(MIGRATED({ a: { unseen: "new" } }));
  });

  test("a damaged file is moved aside and the run starts empty, telling it once", () => {
    const path = file();
    writeFileSync(path, "{");
    const local = createLocalSeen(path);
    expect(local.problem).toBe("corrupt");
    expect(local.root("/r")).toBeUndefined();
    expect(aside(path).map(name => readFileSync(join(dirname(path), name), "utf8"))).toEqual(["{"]);
    local.set("/r", MIGRATED({}));
    expect(json(path)).toEqual({ v: 3, roots: { "/r": { migrated: true, canvases: {} } } });
    expect(createLocalSeen(path).problem).toBeUndefined();
  });

  test.skipIf(isRoot)("a damaged file that cannot be moved aside is never overwritten: the run is memory only", () => {
    const path = file();
    writeFileSync(path, "{");
    chmodSync(dirname(path), 0o555);
    try {
      const local = createLocalSeen(path);
      expect(local.problem).toBe("corrupt");
      expect(local.commit("/r", MIGRATED({}))).toBe(true);
      expect(local.root("/r")).toEqual(MIGRATED({}));
    } finally { chmodSync(dirname(path), 0o755); }
    expect(readFileSync(path, "utf8")).toBe("{");
  });

  test("a later Doan's file is never overwritten: verdicts live in memory and aliases are not moved", () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ v: 4, roots: {} }));
    const local = createLocalSeen(path);
    expect(local.problem).toBe("newer");
    local.set("/r", MIGRATED({}));
    expect(local.commit("/r", MIGRATED({ a: { html: H("a") } }))).toBe(true);
    expect(local.root("/r")).toEqual(MIGRATED({ a: { html: H("a") } }));
    local.flushSync();
    expect(json(path)).toEqual({ v: 4, roots: {} });
    expect(local.copyRoots(new Map([["/r", "/real"]]))).toBe(false);
    expect(aside(path)).toEqual([]);
  });

  test("set keeps a record whose write failed and writes it again later; commit keeps nothing the file does not hold", () => {
    const path = file();
    let fail = true;
    const writes: string[] = [];
    const local = createLocalSeen(path, (_file, text) => { if (fail) throw new Error("injected"); writes.push(text); });
    local.set("/r", MIGRATED({ a: { html: H("a") } }));
    expect(local.root("/r")).toEqual(MIGRATED({ a: { html: H("a") } }));
    expect(local.commit("/r", MIGRATED({ a: { html: H("b") } }))).toBe(false);
    expect(local.root("/r")).toEqual(MIGRATED({ a: { html: H("a") } }));
    expect(local.commit("/s", MIGRATED({}))).toBe(false);
    expect(local.root("/s")).toBeUndefined();
    expect(writes).toEqual([]);
    fail = false;
    local.flushSync();
    expect(writes.map(text => JSON.parse(text))).toEqual([{ v: 3, roots: { "/r": { migrated: true, canvases: { a: { html: H("a") } } } } }]);
    local.flushSync();
    expect(writes).toHaveLength(1);
    expect(local.commit("/r", MIGRATED({ a: { html: H("b") } }))).toBe(true);
    expect(writes).toHaveLength(2);
  });

  test("copyRoots moves an alias's record to its real path; the real path's wins per canvas", () => {
    const path = file();
    writeFileSync(path, localSeenText(new Map<string, RootRecord>([
      ["/alias", MIGRATED({ a: { unseen: "new" }, b: { unseen: "migrated" } })],
      ["/real", MIGRATED({ a: { html: H("a") } })],
      ["/other", { canvases: {}, v2: { known: { x: "seen" } } }],
    ])));
    const local = createLocalSeen(path);
    expect(local.copyRoots(new Map([["/alias", "/real"], ["/other", "/other2"]]))).toBe(true);
    expect(local.root("/real")).toEqual(MIGRATED({ a: { html: H("a") }, b: { unseen: "migrated" } }));
    expect(local.root("/other2")).toEqual({ canvases: {}, v2: { known: { x: "seen" } } });
    expect(local.root("/alias")).toBeDefined();
    expect(createLocalSeen(path).root("/real")).toEqual(local.root("/real"));
    const failing = createLocalSeen(path, () => { throw new Error("injected"); });
    expect(failing.copyRoots(new Map([["/alias", "/third"]]))).toBe(false);
    expect(failing.root("/third")).toBeUndefined();
  });
});

const reads = (marker: SeenReads["marker"]["kind"], records: Record<string, RecordRead> = {}, dir: SeenReads["dir"] = "ok"): SeenReads =>
  ({ dir, marker: { kind: marker }, records: new Map(Object.entries(records)) });
const row = (path: string, id: string | undefined, fingerprint: string | null, mtimeMs?: number): SeenRow => ({ path, id, fingerprint, ...(mtimeMs === undefined ? {} : { mtimeMs }) });
const none = () => undefined;
const READY: RootMemory = { known: {} };

// Old local record: a seen at mtime 10 (unchanged), b seen at 10 but now 11 (changed), c never seen (new), d without
// an ID, e/f sharing one.
const ROWS = [
  row("a.html", "a", H("a"), 10), row("b.html", "b", H("b"), 11), row("c.html", "c", H("c"), 12),
  row("d.html", undefined, H("d"), 13), row("e.html", "dup", H("e"), 14), row("f.html", "dup", H("f"), 15),
];
const LEGACY: RootMemory = { legacy: { "a.html": 10, "b.html": 10 }, known: {} };

const roots = (text: string) => {
  const read = parseLocalSeen(text);
  return read.kind === "ok" ? Object.fromEntries(read.roots) : read.kind;
};

describe("parseLocalSeen / localSeenText", () => {
  test("v3 keeps each root's canvases and migration flag, and writes them back as the same bytes", () => {
    const text = `{"v":3,"roots":{"/r":{"migrated":true,"canvases":{"a":{"html":"${H("a")}"},"b":{"unseen":"new"},"c":{"unseen":"migrated"}}}}}\n`;
    expect(roots(text)).toEqual({ "/r": { migrated: true, canvases: { a: { html: H("a") }, b: { unseen: "new" }, c: { unseen: "migrated" } } } });
    const read = parseLocalSeen(text);
    expect(read.kind === "ok" && localSeenText(read.roots)).toBe(text);
  });

  test("an older Doan's v1 mtimes and v2 memory become roots still to migrate, carried through v3", () => {
    const v1 = roots(JSON.stringify({ v: 1, roots: { "/r": { "a.html": 10, "b.html": "x" }, "/s": "bad" } }));
    expect(v1).toEqual({ "/r": { canvases: {}, v2: { legacy: { "a.html": 10 }, known: {} } } });
    const v2 = parseLocalSeen(JSON.stringify({ v: 2, roots: {
      "/r": { baseline: { a: H("a"), b: "sha256:x" }, known: { a: "seen", b: "new" }, legacy: 3 }, "/s": [],
    } }));
    expect(v2.kind === "ok" && Object.fromEntries(v2.roots)).toEqual({ "/r": { canvases: {}, v2: { baseline: { a: H("a") }, known: { a: "seen" } } } });
    if (v2.kind !== "ok") return;
    const text = localSeenText(v2.roots);
    expect(JSON.parse(text)).toEqual({ v: 3, roots: { "/r": { canvases: {}, v2: { baseline: { a: H("a") }, known: { a: "seen" } } } } });
    expect(roots(text)).toEqual(Object.fromEntries(v2.roots));
  });

  test("wrong-typed roots, fields and canvas entries are dropped on their own", () => {
    expect(roots(JSON.stringify({ v: 3, roots: {
      "/r": { migrated: "yes", canvases: { a: { html: "sha256:x" }, b: { unseen: "seen" }, c: { html: H("c"), unseen: "new" }, d: { unseen: "new" }, E: { html: H("e") } } },
      "/s": [], "/t": { migrated: true, canvases: 3 },
    } }))).toEqual({ "/r": { canvases: { d: { unseen: "new" } } }, "/t": { migrated: true, canvases: {} } });
  });

  test("broken JSON or a file without a version or roots is corrupt; a version above 3 is a later Doan's", () => {
    for (const text of ["{", "[]", "null", JSON.stringify({ roots: {} }), JSON.stringify({ v: "3", roots: {} }), JSON.stringify({ v: 0, roots: {} }), JSON.stringify({ v: 2.5, roots: {} }), JSON.stringify({ v: 3 }), JSON.stringify({ v: 3, roots: [] })]) {
      expect(parseLocalSeen(text).kind, text).toBe("corrupt");
    }
    expect(parseLocalSeen(JSON.stringify({ v: 4, roots: {} })).kind).toBe("newer");
    expect(parseLocalSeen(JSON.stringify({ v: 4 })).kind).toBe("newer");
    expect(roots(JSON.stringify({ v: 3, roots: {} }))).toEqual({});
  });
});

const LOCAL = MIGRATED;
const local = (record: RootRecord, rows: SeenRow[], last: (row: SeenRow) => Verdict | undefined = none) => Object.fromEntries(judge(record, rows, last));

describe("migrateRoot", () => {
  test("valid shared records under a present marker are copied as they are", () => {
    const rows = [row("a.html", "a", H("a")), row("b.html", "b", H("b")), row("c.html", "c", H("c"))];
    const r = reads("present", { a: { kind: "seen", html: H("a") }, b: { kind: "seen", html: H("x") }, c: { kind: "migrated" } });
    const expected = LOCAL({ a: { html: H("a") }, b: { html: H("x") }, c: { unseen: "migrated" } });
    expect(migrateRoot(READY, r, rows, none)).toEqual(expected);
    // Without this device's own memory of the root (a new worktree, another machine), they are not copied.
    expect(migrateRoot(undefined, r, rows, none)).toEqual(LOCAL({ a: { html: H("a") }, b: { html: H("b") }, c: { html: H("c") } }));
  });

  test("damaged, conflicted, unreadable and later-version records carry this device's last verdict, else the baseline", () => {
    const rows = [row("a.html", "a", H("a")), row("b.html", "b", H("b")), row("c.html", "c", H("c")), row("d.html", "d", H("d"))];
    const r = reads("present", { a: { kind: "corrupt" }, b: { kind: "conflict" }, c: { kind: "unreadable" }, d: { kind: "unsupported" } });
    const memory: RootMemory = { known: { a: "changed", b: "seen" } };
    const last = (item: SeenRow) => item.id === undefined ? undefined : memory.known[item.id];
    expect(migrateRoot(memory, r, rows, last)).toEqual(LOCAL({ a: { unseen: "migrated" }, b: { html: H("b") }, c: { html: H("c") }, d: { html: H("d") } }));
  });

  test("a missing, damaged or later-version marker, or a refused folder, carries the last verdict even over a valid record", () => {
    const rows = [row("a.html", "a", H("a")), row("b.html", "b", H("b"))];
    const records = { a: { kind: "seen", html: H("a") }, b: { kind: "seen", html: H("x") } } as const;
    const memory: RootMemory = { known: { a: "changed", b: "seen" } };
    const last = (item: SeenRow) => item.id === undefined ? undefined : memory.known[item.id];
    for (const r of [reads("absent", records), reads("corrupt", records), reads("conflict", records), reads("unsupported", records), reads("unreadable", {}, "refused"), reads("absent", {}, "absent")]) {
      expect(migrateRoot(memory, r, rows, last)).toEqual(LOCAL({ a: { unseen: "migrated" }, b: { html: H("b") } }));
    }
  });

  test("a canvas this device judged new, without a shared record, stays new", () => {
    const rows = [row("a.html", "a", H("a")), row("b.html", "b", H("b"))];
    const r = reads("present", { a: { kind: "seen", html: H("a") } });
    expect(migrateRoot(READY, r, rows, none)).toEqual(LOCAL({ a: { html: H("a") }, b: { unseen: "new" } }));
    // A baseline still being written: a canvas added since it was frozen was new.
    const baseline: RootMemory = { baseline: { a: H("a"), b: H("b") }, known: {} };
    const later = [row("a.html", "a", H("a")), row("b.html", "b", H("b2")), row("c.html", "c", H("c"))];
    expect(migrateRoot(baseline, reads("absent"), later, none)).toEqual(LOCAL({ a: { html: H("a") }, b: { unseen: "migrated" }, c: { unseen: "new" } }));
  });

  test("an older Doan's mtimes convert as before: unchanged is seen, anything else is migrated-unseen", () => {
    expect(migrateRoot(LEGACY, reads("absent", {}, "absent"), ROWS, none)).toEqual(LOCAL({ a: { html: H("a") }, b: { unseen: "migrated" }, c: { unseen: "migrated" } }));
    // A valid shared record under a marker still wins; an unreadable unchanged canvas has nothing to record.
    const rows = [row("a.html", "a", null, 10), row("b.html", "b", H("b"), 11)];
    expect(migrateRoot(LEGACY, reads("present", { b: { kind: "seen", html: H("b") } }), rows, none)).toEqual(LOCAL({ b: { html: H("b") } }));
  });

  test("a first registration starts every canvas seen, whatever records it finds, valid ones included", () => {
    const rows = [row("a.html", "a", H("a")), row("b.html", "b", H("b")), row("c.html", "c", null)];
    expect(migrateRoot(undefined, reads("present", { a: { kind: "seen", html: H("x") }, b: { kind: "migrated" } }), rows, none)).toEqual(LOCAL({ a: { html: H("a") }, b: { html: H("b") } }));
    expect(migrateRoot(undefined, reads("absent", {}, "absent"), rows, none)).toEqual(LOCAL({ a: { html: H("a") }, b: { html: H("b") } }));
    expect(migrateRoot(undefined, reads("present", { b: { kind: "corrupt" } }), rows, none)).toEqual(LOCAL({ a: { html: H("a") }, b: { html: H("b") } }));
    expect(migrateRoot(undefined, reads("corrupt"), rows, none)).toEqual(LOCAL({ a: { html: H("a") }, b: { html: H("b") } }));
  });

  test("a missing or duplicated canvas ID gets no record", () => {
    const rows = [row("a.html", undefined, H("a")), row("b.html", "dup", H("b")), row("c.html", "dup", H("c")), row("d.html", "Bad", H("d"))];
    expect(migrateRoot(READY, reads("present", { dup: { kind: "seen", html: H("b") } }), rows, none)).toEqual(LOCAL({}));
  });
});

describe("absorbFirst", () => {
  test("the first listing records every unrecorded unique ID as seen and keeps every record already there", () => {
    const record = LOCAL({ a: { html: H("x") }, b: { unseen: "new" }, c: { unseen: "migrated" }, gone: { html: H("g") } });
    const rows = [
      row("a.html", "a", H("a")), row("b.html", "b", H("b")), row("c.html", "c", H("c")), row("d.html", "d", H("d")),
      row("e.html", "e", null), row("f.html", undefined, H("f")), row("g.html", "dup", H("g")), row("h.html", "dup", H("h")),
    ];
    const absorbed = absorbFirst(record, rows);
    expect(absorbed).toEqual(LOCAL({ a: { html: H("x") }, b: { unseen: "new" }, c: { unseen: "migrated" }, gone: { html: H("g") }, d: { html: H("d") } }));
    expect(record.canvases.d).toBeUndefined();
    expect(local(absorbed, rows)).toMatchObject({ "a.html": "changed", "b.html": "new", "c.html": "changed", "d.html": "seen" });
  });

  test("a root registered again keeps its records, so a canvas changed meanwhile is changed", () => {
    const record = LOCAL({ a: { html: H("a") } });
    const rows = [row("a.html", "a", H("a2")), row("n.html", "n", H("n"))];
    expect(local(absorbFirst(record, rows), rows)).toEqual({ "a.html": "changed", "n.html": "seen" });
  });

  test("a canvas ID that names an Object.prototype member is an ordinary ID", () => {
    const rows = [row("c.html", "constructor", H("c")), row("t.html", "tostring", H("t"))];
    const absorbed = absorbFirst(LOCAL({}), rows);
    expect(absorbed).toEqual(LOCAL({ constructor: { html: H("c") }, tostring: { html: H("t") } }));
    expect(local(LOCAL({}), rows)).toEqual({ "c.html": undefined, "t.html": undefined });
    expect(markShown(LOCAL({}), rows[0]!, H("c"), rows)).toEqual(LOCAL({ constructor: { html: H("c") } }));
  });

  test("nothing to add returns the same record", () => {
    const record = LOCAL({ a: { html: H("a") } });
    expect(absorbFirst(record, [row("a.html", "a", H("b")), row("x.html", "x", null)])).toBe(record);
  });
});

describe("judge", () => {
  test("the same HTML is seen, other content changed, new and migrated-unseen records lit, no record shows nothing", () => {
    const record = LOCAL({ a: { html: H("a") }, b: { html: H("x") }, c: { unseen: "new" }, d: { unseen: "migrated" } });
    const rows = [row("moved/a.html", "a", H("a")), row("b.html", "b", H("b")), row("c.html", "c", H("c")), row("d.html", "d", H("d")), row("e.html", "e", H("e"))];
    expect(local(record, rows, () => "changed")).toEqual({ "moved/a.html": "seen", "b.html": "changed", "c.html": "new", "d.html": "changed", "e.html": undefined });
  });

  test("an unreadable HTML file keeps the last verdict instead of comparing", () => {
    expect(local(LOCAL({ a: { html: H("a") } }), [row("a.html", "a", null)], () => "changed")).toEqual({ "a.html": "changed" });
  });

  test("a missing or duplicated ID keeps the last verdict; once the duplicate is resolved the kept record compares again", () => {
    const record = LOCAL({ dup: { html: H("b") } });
    const rows = [row("a.html", undefined, H("a")), row("b.html", "dup", H("b")), row("c.html", "dup", H("c")), row("d.html", "Bad", H("d"))];
    const last = (item: SeenRow): Verdict | undefined => item.path === "b.html" ? "changed" : undefined;
    expect(local(record, rows, last)).toEqual({ "a.html": undefined, "b.html": "changed", "c.html": undefined, "d.html": undefined });
    expect(markShown(record, rows[1]!, H("z"), rows)).toBe(record);
    expect(absorbFirst(record, rows)).toBe(record);
    expect(local(record, [row("c.html", "dup", H("c"))])).toEqual({ "c.html": "changed" });
  });
});

describe("markShown", () => {
  test("records the shown hash for a unique ID, replacing a new, migrated or older record, and pending IDs too", () => {
    const record = LOCAL({ a: { unseen: "new" }, b: { unseen: "migrated" }, c: { html: H("x") } });
    const rows = [row("a.html", "a", H("a")), row("b.html", "b", H("b")), row("c.html", "c", H("c")), row("d.html", "d", H("d"))];
    let next = record;
    for (const item of rows) next = markShown(next, item, item.fingerprint!, rows);
    expect(next).toEqual(LOCAL({ a: { html: H("a") }, b: { html: H("b") }, c: { html: H("c") }, d: { html: H("d") } }));
    expect(record.canvases.a).toEqual({ unseen: "new" });
    expect(local(next, rows)).toEqual({ "a.html": "seen", "b.html": "seen", "c.html": "seen", "d.html": "seen" });
  });

  test("the same hash again, or a row without a unique ID, returns the same record", () => {
    const record = LOCAL({ a: { html: H("a") } });
    const rows = [row("a.html", "a", H("a")), row("n.html", undefined, H("n")), row("x.html", "Bad", H("x"))];
    expect(markShown(record, rows[0]!, H("a"), rows)).toBe(record);
    expect(markShown(record, rows[1]!, H("n"), rows)).toBe(record);
    expect(markShown(record, rows[2]!, H("x"), rows)).toBe(record);
  });
});

describe("mergeRoots", () => {
  test("the real path's record wins per canvas and the alias fills what it lacks; migrated if either is", () => {
    const real = LOCAL({ a: { html: H("a") } });
    const alias: RootRecord = { canvases: { a: { unseen: "new" }, b: { unseen: "migrated" } }, v2: { known: { a: "seen" } } };
    expect(mergeRoots(real, alias)).toEqual(LOCAL({ a: { html: H("a") }, b: { unseen: "migrated" } }));
    expect(mergeRoots({ canvases: {}, v2: { known: {} } }, LOCAL({ c: { unseen: "new" } }))).toEqual(LOCAL({ c: { unseen: "new" } }));
    expect(mergeRoots(undefined, alias)).toEqual(alias);
  });

  test("two roots still to migrate merge their older memory field by field, the real path's first", () => {
    const real: RootRecord = { canvases: {}, v2: { legacy: { "a.html": 9 }, known: { a: "seen" } } };
    const alias: RootRecord = { canvases: {}, v2: { legacy: { "a.html": 1, "b.html": 2 }, baseline: { c: H("c") }, known: { a: "changed", c: "seen" } } };
    expect(mergeRoots(real, alias)).toEqual({ canvases: {}, v2: { legacy: { "a.html": 9, "b.html": 2 }, baseline: { c: H("c") }, known: { a: "seen", c: "seen" } } });
  });
});
