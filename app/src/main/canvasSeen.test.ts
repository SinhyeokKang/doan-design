import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import {
  absorbFirst, createLocalSeen, judge, judgeLocal, localSeenText, markShown, mergeRoots, migrateRoot, parseLocalSeen, plan,
  type RootMemory, type RootRecord, type SeenReads, type SeenRow, type Verdict,
} from "./canvasSeen";
import { MARKER, readSeen, recordName, recordText, SEEN_DIR, writeSeen, type RecordRead } from "./seenRecords";

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-canvas-seen-")));
let count = 0;
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const file = () => { const dir = join(tmp, `d${count++}`); mkdirSync(dir); return join(dir, "canvas-seen.json"); };
const repo = () => { const root = join(tmp, `r${count++}`); mkdirSync(join(root, ".doan/canvases"), { recursive: true }); return root; };
const H = (c: string) => `sha256:${c.repeat(64)}`;
const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

describe("canvas-seen.json", () => {
  test("an older Doan's v1 mtimes become each root's legacy memory, and the file is written as v2", () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ v: 1, roots: { "/r": { "a.html": 10, "b.html": "x" }, "/s": "bad" } }));
    const local = createLocalSeen(path);
    expect(local.root("/r")).toEqual({ legacy: { "a.html": 10 }, known: {} });
    expect(local.root("/s")).toBeUndefined();
    local.set("/r", { legacy: { "a.html": 10 }, known: { a: "seen" } });
    expect(json(path)).toEqual({ v: 2, roots: { "/r": { legacy: { "a.html": 10 }, known: { a: "seen" } } } });
    expect(createLocalSeen(path).root("/r")).toEqual({ legacy: { "a.html": 10 }, known: { a: "seen" } });
  });

  test("wrong-typed fields and entries are dropped on their own; a broken file is empty", () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ v: 2, roots: { "/r": { baseline: { a: H("a"), b: "sha256:x" }, known: { a: "seen", b: "new" }, legacy: 3 }, "/s": [] } }));
    expect(createLocalSeen(path).root("/r")).toEqual({ baseline: { a: H("a") }, known: { a: "seen" } });
    expect(createLocalSeen(path).roots()).toEqual(["/r"]);
    writeFileSync(path, "{");
    expect(createLocalSeen(path).roots()).toEqual([]);
  });

  test("a later Doan's file is never overwritten", () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ v: 3, roots: {} }));
    const local = createLocalSeen(path);
    local.set("/r", { known: {} });
    expect(local.root("/r")).toEqual({ known: {} });
    expect(json(path)).toEqual({ v: 3, roots: {} });
    expect(local.copyRoots(new Map([["/r", "/real"]]))).toBe(false);
  });

  test("a failed write is written again on the next change and at quit", () => {
    const path = file();
    let fail = true;
    const writes: string[] = [];
    const local = createLocalSeen(path, (_file, text) => { if (fail) throw new Error("injected"); writes.push(text); });
    local.set("/r", { known: {} });
    expect(writes).toEqual([]);
    fail = false;
    local.flushSync();
    expect(writes.map(text => JSON.parse(text))).toEqual([{ v: 2, roots: { "/r": { known: {} } } }]);
    local.flushSync();
    expect(writes).toHaveLength(1);
  });

  test("copyRoots moves an alias's memory to its real path; the real path's wins per field and canvas", () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ v: 2, roots: {
      "/alias": { legacy: { "a.html": 1, "b.html": 2 }, known: { a: "changed", c: "seen" } },
      "/real": { legacy: { "a.html": 9 }, known: { a: "seen" } },
      "/other": { known: { x: "seen" } },
    } }));
    const local = createLocalSeen(path);
    expect(local.copyRoots(new Map([["/alias", "/real"], ["/other", "/other2"]]))).toBe(true);
    expect(local.root("/real")).toEqual({ legacy: { "a.html": 9, "b.html": 2 }, known: { a: "seen", c: "seen" } });
    expect(local.root("/other2")).toEqual({ known: { x: "seen" } });
    expect(local.root("/alias")).toBeDefined();
    expect(createLocalSeen(path).root("/real")).toEqual(local.root("/real"));
    const failing = createLocalSeen(path, () => { throw new Error("injected"); });
    expect(failing.copyRoots(new Map([["/alias", "/third"]]))).toBe(false);
    expect(failing.root("/third")).toBeUndefined();
  });
});

// ---- verdicts ------------------------------------------------------------------------------------------------------

const reads = (marker: SeenReads["marker"]["kind"], records: Record<string, RecordRead> = {}, dir: SeenReads["dir"] = "ok"): SeenReads =>
  ({ dir, marker: { kind: marker }, records: new Map(Object.entries(records)) });
const row = (path: string, id: string | undefined, fingerprint: string | null, mtimeMs?: number): SeenRow => ({ path, id, fingerprint, ...(mtimeMs === undefined ? {} : { mtimeMs }) });
const none = () => undefined;
const verdicts = (memory: RootMemory | undefined, r: SeenReads, rows: SeenRow[], last: (row: SeenRow) => Verdict | undefined = none) => {
  const result = judge(memory, r, rows, last);
  return { verdicts: Object.fromEntries(result.verdicts), problem: result.problem };
};
const READY: RootMemory = { known: {} };

describe("judge", () => {
  test("the same HTML is seen whatever the path or mtime; other content is changed; a migrated record is changed", () => {
    const rows = [row("a.html", "a", H("a"), 1), row("b.html", "b", H("b"), 1), row("c.html", "c", H("c"), 1)];
    const r = reads("present", { a: { kind: "seen", html: H("a") }, b: { kind: "seen", html: H("x") }, c: { kind: "migrated" } });
    expect(verdicts(READY, r, rows)).toEqual({ verdicts: { "a.html": "seen", "b.html": "changed", "c.html": "changed" }, problem: undefined });
    // Moved to another path with another mtime: the record is keyed by ID.
    expect(verdicts(READY, r, [row("moved/a.html", "a", H("a"), 99)]).verdicts).toEqual({ "moved/a.html": "seen" });
  });

  test("no record is new only when this device never saw one for the ID; a vanished record keeps the last verdict", () => {
    const rows = [row("a.html", "a", H("a")), row("b.html", "b", H("b"))];
    const memory: RootMemory = { known: { a: "seen" } };
    const last = (item: SeenRow): Verdict | undefined => item.path === "a.html" ? "changed" : undefined;
    expect(verdicts(memory, reads("present"), rows, last)).toEqual({ verdicts: { "a.html": "changed", "b.html": "new" }, problem: "records" });
  });

  test("damaged, conflicted, unreadable and later-version records keep the last verdict and never guess a change", () => {
    const rows = [row("a.html", "a", H("a")), row("b.html", "b", H("b")), row("c.html", "c", H("c")), row("d.html", "d", H("d"))];
    const r = reads("present", { a: { kind: "corrupt" }, b: { kind: "conflict" }, c: { kind: "unreadable" }, d: { kind: "unsupported" } });
    const last = (item: SeenRow): Verdict | undefined => item.path === "a.html" ? "changed" : item.path === "b.html" ? "seen" : undefined;
    expect(verdicts(READY, r, rows, last)).toEqual({ verdicts: { "a.html": "changed", "b.html": "seen", "c.html": undefined, "d.html": undefined }, problem: "unsupported" });
  });

  test("a project this device knew without its marker, or with a damaged or later one, keeps every last verdict", () => {
    const rows = [row("a.html", "a", H("a"))];
    const r = { a: { kind: "seen", html: H("x") } } as const;
    const last = () => "seen" as const;
    expect(verdicts(READY, reads("absent", r), rows, last)).toEqual({ verdicts: { "a.html": "seen" }, problem: "records" });
    expect(verdicts(READY, reads("absent", {}, "absent"), rows, last)).toEqual({ verdicts: { "a.html": "seen" }, problem: "records" });
    expect(verdicts(READY, reads("unsupported", r), rows, last)).toEqual({ verdicts: { "a.html": "seen" }, problem: "unsupported" });
    expect(verdicts(READY, reads("conflict", r), rows, none)).toEqual({ verdicts: { "a.html": undefined }, problem: "records" });
    expect(verdicts(READY, reads("unreadable", {}, "refused"), rows, none)).toEqual({ verdicts: { "a.html": undefined }, problem: "records" });
  });

  test("first registration: with records it compares, without it starts every canvas seen, unreadable records show nothing", () => {
    const rows = [row("a.html", "a", H("a")), row("b.html", "b", H("b")), row("c.html", "c", null)];
    expect(verdicts(undefined, reads("present", { a: { kind: "seen", html: H("a") }, b: { kind: "migrated" } }), rows).verdicts).toEqual({ "a.html": "seen", "b.html": "changed", "c.html": "new" });
    expect(verdicts(undefined, reads("absent", {}, "absent"), rows)).toEqual({ verdicts: { "a.html": "seen", "b.html": "seen", "c.html": undefined }, problem: undefined });
    expect(verdicts(undefined, reads("corrupt"), rows)).toEqual({ verdicts: { "a.html": undefined, "b.html": undefined, "c.html": undefined }, problem: "records" });
  });

  test("a baseline still being written compares with the frozen set; a canvas added since is new", () => {
    const memory: RootMemory = { baseline: { a: H("a"), b: H("b") }, known: {} };
    const rows = [row("a.html", "a", H("a")), row("b.html", "b", H("b2")), row("c.html", "c", H("c"))];
    expect(verdicts(memory, reads("absent"), rows).verdicts).toEqual({ "a.html": "seen", "b.html": "changed", "c.html": "new" });
  });

  test("conversion: an older Doan's mtimes decide until records exist; a valid shared record wins", () => {
    const memory: RootMemory = { legacy: { "a.html": 10, "b.html": 10 }, known: {} };
    const rows = [row("a.html", "a", H("a"), 10), row("b.html", "b", H("b"), 11), row("c.html", "c", H("c"), 12), row("d.html", "d", H("d"), 10)];
    expect(verdicts(memory, reads("absent", { d: { kind: "seen", html: H("x") } }), rows).verdicts).toEqual({ "a.html": "seen", "b.html": "changed", "c.html": "new", "d.html": "changed" });
    // Records that cannot be read: the old verdicts still hold.
    expect(verdicts(memory, reads("corrupt"), rows)).toEqual({ verdicts: { "a.html": "seen", "b.html": "changed", "c.html": "new", "d.html": "new" }, problem: "records" });
  });

  test("a missing or duplicated canvas ID keys no record and keeps the row's last verdict", () => {
    const rows = [row("a.html", undefined, H("a")), row("b.html", "dup", H("b")), row("c.html", "dup", H("c")), row("d.html", "Bad", H("d"))];
    const r = reads("present", { dup: { kind: "seen", html: H("b") } });
    const last = (item: SeenRow): Verdict | undefined => item.path === "b.html" ? "changed" : undefined;
    expect(verdicts(READY, r, rows, last)).toEqual({ verdicts: { "a.html": undefined, "b.html": "changed", "c.html": undefined, "d.html": undefined }, problem: undefined });
  });

  test("an unreadable HTML file keeps the last verdict instead of comparing", () => {
    expect(verdicts(READY, reads("present", { a: { kind: "seen", html: H("a") } }), [row("a.html", "a", null)], () => "changed").verdicts).toEqual({ "a.html": "changed" });
  });
});

// ---- plans, run against real files with an interruption before every write -------------------------------------------

async function snapshot(root: string, rows: SeenRow[], memory: RootMemory | undefined): Promise<SeenReads> {
  const ids = new Set([...rows.flatMap(item => item.id ? [item.id] : []), ...Object.keys(memory?.baseline ?? {})]);
  const read = await readSeen(root, ids);
  return { dir: read.dir, marker: read.marker.read, records: new Map([...read.records].map(([id, item]) => [id, item.read])) };
}
// One evaluation's write step as readState.ts runs it, stopping with an error at write `crashAt`.
async function run(root: string, local: { memory: RootMemory | undefined }, rows: SeenRow[], crashAt = -1): Promise<number> {
  const steps = plan(local.memory, await snapshot(root, rows, local.memory), rows);
  if (!steps) return 0;
  local.memory = steps.before;
  let i = 0;
  for (const write of steps.writes) {
    if (i++ === crashAt) throw new Error("crash");
    await writeSeen(root, write.id === undefined ? MARKER : recordName(write.id), recordText(write.value), null);
  }
  local.memory = steps.after;
  return steps.writes.length;
}
const files = (root: string) => Object.fromEntries(readdirSync(join(root, SEEN_DIR)).filter(name => !name.startsWith(".")).sort().map(name => [name, readFileSync(join(root, SEEN_DIR, name), "utf8")]));

// Old local record: a seen at mtime 10 (unchanged), b seen at 10 but now 11 (changed), c never seen (new), d without
// an ID, e/f sharing one.
const ROWS = [
  row("a.html", "a", H("a"), 10), row("b.html", "b", H("b"), 11), row("c.html", "c", H("c"), 12),
  row("d.html", undefined, H("d"), 13), row("e.html", "dup", H("e"), 14), row("f.html", "dup", H("f"), 15),
];
const LEGACY: RootMemory = { legacy: { "a.html": 10, "b.html": 10 }, known: {} };

describe("plan", () => {
  test("conversion keeps unseen canvases unseen, records seen ones, holds ID problems, and restarts the same after a crash at every write", async () => {
    const clean = repo(), local = { memory: LEGACY as RootMemory | undefined };
    expect(await run(clean, local, ROWS)).toBe(4);
    const expected = files(clean);
    expect(expected).toEqual({
      [MARKER]: recordText(null), "a.json": recordText({ html: H("a") }), "b.json": recordText({ unseen: "migrated" }), "c.json": recordText({ unseen: "migrated" }),
    });
    // d, e and f cannot be recorded, so the old mtimes stay for their verdicts.
    expect(local.memory).toEqual({ legacy: LEGACY.legacy, known: { a: "seen", b: "changed", c: "changed" } });
    for (let crashAt = 0; crashAt < 4; crashAt++) {
      const root = repo(), state = { memory: LEGACY as RootMemory | undefined };
      await expect(run(root, state, ROWS, crashAt)).rejects.toThrow("crash");
      // The legacy memory is still there (dropped only after the marker), so the retry plans from it again.
      expect(state.memory).toEqual(LEGACY);
      await run(root, state, ROWS);
      expect(files(root), `crash at write ${crashAt}`).toEqual(expected);
      expect(verdicts(state.memory, await snapshot(root, ROWS, state.memory), ROWS).verdicts).toEqual({ "a.html": "seen", "b.html": "changed", "c.html": "changed", "d.html": "new", "e.html": "new", "f.html": "new" });
    }
    expect(await run(clean, local, ROWS)).toBe(0);
    // Once every row can be recorded, the old mtimes go.
    const fixed = ROWS.slice(0, 3);
    await run(clean, local, fixed);
    expect(local.memory).toEqual({ known: { a: "seen", b: "changed", c: "changed" } });
  });

  test("conversion with records already there: the shared ones win, only missing IDs are filled from the old mtimes", async () => {
    const root = repo(); mkdirSync(join(root, SEEN_DIR));
    writeFileSync(join(root, SEEN_DIR, "b.json"), recordText({ html: H("b") }));
    writeFileSync(join(root, SEEN_DIR, MARKER), recordText(null));
    const local = { memory: LEGACY as RootMemory | undefined };
    await run(root, local, ROWS);
    expect(files(root)).toEqual({ [MARKER]: recordText(null), "a.json": recordText({ html: H("a") }), "b.json": recordText({ html: H("b") }), "c.json": recordText({ unseen: "migrated" }) });
  });

  test("conversion waits for a canvas it cannot read, keeping the old mtimes", async () => {
    const root = repo(), local = { memory: LEGACY as RootMemory | undefined };
    const rows = [row("a.html", "a", H("a"), 10), row("b.html", "b", null, 11)];
    await run(root, local, rows);
    expect(local.memory?.legacy).toEqual(LEGACY.legacy);
    await run(root, local, [row("a.html", "a", H("a"), 10), row("b.html", "b", H("b"), 11)]);
    expect(local.memory).toEqual({ known: { a: "seen", b: "changed" } });
  });

  test("another device's first registration compares with the records that came along and never baselines migrated-unseen away", async () => {
    const root = repo(), first = { memory: LEGACY as RootMemory | undefined };
    await run(root, first, ROWS);
    const other = { memory: undefined as RootMemory | undefined };
    expect(await run(root, other, ROWS)).toBe(0);
    expect(other.memory).toEqual({ known: {} });
    expect(verdicts(other.memory, await snapshot(root, ROWS, other.memory), ROWS).verdicts).toMatchObject({ "a.html": "seen", "b.html": "changed", "c.html": "changed" });
  });

  test("first registration without records baselines every unique ID from a frozen set, marker last, and a crash retries that set", async () => {
    const clean = repo(), local = { memory: undefined as RootMemory | undefined };
    expect(await run(clean, local, ROWS)).toBe(4);
    const expected = files(clean);
    expect(Object.keys(expected)).toEqual([MARKER, "a.json", "b.json", "c.json"]);
    for (let crashAt = 0; crashAt < 4; crashAt++) {
      const root = repo(), state = { memory: undefined as RootMemory | undefined };
      await expect(run(root, state, ROWS, crashAt)).rejects.toThrow("crash");
      expect(state.memory?.baseline).toEqual({ a: H("a"), b: H("b"), c: H("c") });
      // Before the retry, b changed and g appeared: b is recorded as first seen (now changed), g is not baselined.
      const later = [...ROWS.map(item => item.path === "b.html" ? { ...item, fingerprint: H("9") } : item), row("g.html", "g", H("g"))];
      await run(root, state, later);
      expect(files(root), `crash at write ${crashAt}`).toEqual(expected);
      expect(verdicts(state.memory, await snapshot(root, later, state.memory), later).verdicts).toMatchObject({ "a.html": "seen", "b.html": "changed", "g.html": "new" });
    }
  });

  test("a project with no canvases gets the marker alone, and nothing is planned for records that cannot be read", async () => {
    const root = repo(), local = { memory: undefined as RootMemory | undefined };
    expect(await run(root, local, [])).toBe(1);
    expect(files(root)).toEqual({ [MARKER]: recordText(null) });
    expect(plan(undefined, reads("corrupt"), ROWS)).toBeNull();
    expect(plan(READY, reads("present"), ROWS)).toBeNull();
  });
});

// ---- device-local records (canvas-seen.json v3) ---------------------------------------------------------------------

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

const LOCAL = (canvases: RootRecord["canvases"]): RootRecord => ({ migrated: true, canvases });
const local = (record: RootRecord, rows: SeenRow[], last: (row: SeenRow) => Verdict | undefined = none) => Object.fromEntries(judgeLocal(record, rows, last));
// The dot a verdict shows: seen and no verdict both show none.
const dot = (verdict: Verdict | undefined) => verdict === "seen" ? undefined : verdict;
const dots = (result: Record<string, Verdict | undefined>) => Object.fromEntries(Object.entries(result).map(([path, verdict]) => [path, dot(verdict)]));
// Every row shows the same dot after the conversion as the v2 verdict showed before it.
const sameDots = (memory: RootMemory, r: SeenReads, rows: SeenRow[], last: (row: SeenRow) => Verdict | undefined = none) =>
  expect(dots(local(migrateRoot(memory, r, rows, last), rows, last))).toEqual(dots(verdicts(memory, r, rows, last).verdicts));

describe("migrateRoot", () => {
  test("valid shared records under a present marker are copied as they are", () => {
    const rows = [row("a.html", "a", H("a")), row("b.html", "b", H("b")), row("c.html", "c", H("c"))];
    const r = reads("present", { a: { kind: "seen", html: H("a") }, b: { kind: "seen", html: H("x") }, c: { kind: "migrated" } });
    const expected = LOCAL({ a: { html: H("a") }, b: { html: H("x") }, c: { unseen: "migrated" } });
    expect(migrateRoot(READY, r, rows, none)).toEqual(expected);
    // Another device's records that came with the project are copied the same on this device's first registration.
    expect(migrateRoot(undefined, r, rows, none)).toEqual(expected);
    sameDots(READY, r, rows);
  });

  test("damaged, conflicted, unreadable and later-version records carry this device's last verdict, else the baseline", () => {
    const rows = [row("a.html", "a", H("a")), row("b.html", "b", H("b")), row("c.html", "c", H("c")), row("d.html", "d", H("d"))];
    const r = reads("present", { a: { kind: "corrupt" }, b: { kind: "conflict" }, c: { kind: "unreadable" }, d: { kind: "unsupported" } });
    const memory: RootMemory = { known: { a: "changed", b: "seen" } };
    const last = (item: SeenRow) => item.id === undefined ? undefined : memory.known[item.id];
    expect(migrateRoot(memory, r, rows, last)).toEqual(LOCAL({ a: { unseen: "migrated" }, b: { html: H("b") }, c: { html: H("c") }, d: { html: H("d") } }));
    sameDots(memory, r, rows, last);
  });

  test("a missing, damaged or later-version marker, or a refused folder, carries the last verdict even over a valid record", () => {
    const rows = [row("a.html", "a", H("a")), row("b.html", "b", H("b"))];
    const records = { a: { kind: "seen", html: H("a") }, b: { kind: "seen", html: H("x") } } as const;
    const memory: RootMemory = { known: { a: "changed", b: "seen" } };
    const last = (item: SeenRow) => item.id === undefined ? undefined : memory.known[item.id];
    for (const r of [reads("absent", records), reads("corrupt", records), reads("conflict", records), reads("unsupported", records), reads("unreadable", {}, "refused"), reads("absent", {}, "absent")]) {
      expect(migrateRoot(memory, r, rows, last)).toEqual(LOCAL({ a: { unseen: "migrated" }, b: { html: H("b") } }));
      sameDots(memory, r, rows, last);
    }
  });

  test("a canvas this device judged new, without a shared record, stays new", () => {
    const rows = [row("a.html", "a", H("a")), row("b.html", "b", H("b"))];
    const r = reads("present", { a: { kind: "seen", html: H("a") } });
    expect(migrateRoot(READY, r, rows, none)).toEqual(LOCAL({ a: { html: H("a") }, b: { unseen: "new" } }));
    sameDots(READY, r, rows);
    // A baseline still being written: a canvas added since it was frozen was new.
    const baseline: RootMemory = { baseline: { a: H("a"), b: H("b") }, known: {} };
    const later = [row("a.html", "a", H("a")), row("b.html", "b", H("b2")), row("c.html", "c", H("c"))];
    expect(migrateRoot(baseline, reads("absent"), later, none)).toEqual(LOCAL({ a: { html: H("a") }, b: { unseen: "migrated" }, c: { unseen: "new" } }));
    sameDots(baseline, reads("absent"), later);
  });

  test("an older Doan's mtimes convert as before: unchanged is seen, anything else is migrated-unseen", () => {
    expect(migrateRoot(LEGACY, reads("absent", {}, "absent"), ROWS, none)).toEqual(LOCAL({ a: { html: H("a") }, b: { unseen: "migrated" }, c: { unseen: "migrated" } }));
    // A valid shared record under a marker still wins; an unreadable unchanged canvas has nothing to record.
    const rows = [row("a.html", "a", null, 10), row("b.html", "b", H("b"), 11)];
    expect(migrateRoot(LEGACY, reads("present", { b: { kind: "seen", html: H("b") } }), rows, none)).toEqual(LOCAL({ b: { html: H("b") } }));
  });

  test("a first registration starts every canvas seen, whatever records it finds besides valid ones", () => {
    const rows = [row("a.html", "a", H("a")), row("b.html", "b", H("b")), row("c.html", "c", null)];
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

describe("judgeLocal", () => {
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
