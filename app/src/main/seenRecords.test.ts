import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { parseUiState } from "../restore/uiState";
import { PROMPT_MS, withFifo } from "./fifo.fixture";
import { CANVAS_ID, parseMarker, parseRecord, readSeen, SEEN_DIR, validCanvasId } from "./seenRecords";

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
// The record format an older Doan wrote, one line.
const recordText = (value: { html: string } | { unseen: "migrated" } | null) => value === null ? `{"v":1}\n` : "html" in value ? `{"v":1,"html":"${value.html}"}\n` : `{"v":1,"unseen":"migrated"}\n`;

test("the canvas id rule is the one the sessions schema and doan check use", () => {
  const schema = JSON.parse(readFileSync(join(__dirname, "../../../schema/sessions.v1.schema.json"), "utf8")) as { properties: { canvas: { properties: { id: { pattern: string } } } } };
  const pattern = schema.properties.canvas.properties.id.pattern;
  expect(CANVAS_ID.source).toBe(pattern);
  expect(readFileSync(join(__dirname, "../../../cli/internal/check/check.go"), "utf8")).toContain(`idPattern = regexp.MustCompile(\`${pattern}\`)`);
});

test.each(["a", "a1-b2", "-a", "a-", "a--b", "A", "a_b", "a.b", "a b", "a\n", ""])("ui-state keeps the canvas id %j exactly when it is a canvas id", (canvasId) => {
  const saved = { screen: "workspace", root: "/r", canvas: ".doan/canvases/a.html", canvasId, expanded: {}, lastByRoot: {} };
  const state = parseUiState(JSON.stringify(saved), ["/r"]);
  expect(state?.canvas).toBe(saved.canvas);
  expect(state?.canvasId !== undefined).toBe(validCanvasId(canvasId));
});

describe("format", () => {
  test("a record is v:1 with exactly one of html or unseen; the marker is {v:1}", () => {
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
    expect(await readSeen(root, ["a"])).toMatchObject({ dir: "absent", marker: { kind: "absent" } });
    const outside = join(tmp, `out${count++}`); mkdirSync(outside);
    const linked = repo(); symlinkSync(outside, join(linked, SEEN_DIR));
    expect(await readSeen(linked, ["a"])).toMatchObject({ dir: "refused", marker: { kind: "unreadable" } });
  });

  test("a symlinked record or one larger than any record reads as corrupt", async () => {
    const root = repo(); mkdirSync(join(root, SEEN_DIR));
    writeFileSync(join(tmp, `x${count}.json`), recordText({ html: H("a") }));
    symlinkSync(join(tmp, `x${count}.json`), join(root, SEEN_DIR, "a.json"));
    writeFileSync(join(root, SEEN_DIR, "b.json"), " ".repeat(5000));
    const read = await readSeen(root, ["a", "b"]);
    expect(read.records.get("a")).toEqual({ kind: "corrupt" });
    expect(read.records.get("b")).toEqual({ kind: "corrupt" });
  });

  // A FIFO record would otherwise hold a libuv thread in open(2) until a writer appears.
  test("a FIFO record reads as corrupt without blocking", async () => {
    const root = repo(); mkdirSync(join(root, SEEN_DIR));
    const read = await withFifo(join(root, SEEN_DIR, "a.json"), () => readSeen(root, ["a"]));
    expect(read.value.records.get("a")).toEqual({ kind: "corrupt" });
    expect(read.ms).toBeLessThan(PROMPT_MS);
  });

  test.skipIf(isRoot)("permission denied on a record is unreadable", async () => {
    const root = repo(); mkdirSync(join(root, SEEN_DIR));
    writeFileSync(join(root, SEEN_DIR, "a.json"), recordText({ html: H("a") }));
    chmodSync(join(root, SEEN_DIR, "a.json"), 0o000);
    expect((await readSeen(root, ["a"])).records.get("a")).toEqual({ kind: "unreadable" });
    chmodSync(join(root, SEEN_DIR, "a.json"), 0o644);
  });
});
