import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, test, vi } from "vitest";
import { UI_STATE_MAX_BYTES } from "../restore/uiState";
import { createUiStateStore, UI_STATE_DELAY_MS, type UiStateFs } from "./uiState";

const tmp = mkdtempSync(join(tmpdir(), "doan-ui-state-"));
let count = 0;
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
afterEach(() => vi.useRealTimers());

function file(): string {
  const dir = join(tmp, `d${count++}`);
  mkdirSync(dir);
  return join(dir, "ui-state.json");
}
const saved = () => ["/repo"];
const view = { scale: 1, x: 0, y: 0 };
const workspace = (canvas: string) => ({ screen: "workspace", root: "/repo", canvas, view, expanded: {}, lastByRoot: {} });
const onDisk = (path: string) => JSON.parse(readFileSync(path, "utf8"));

describe("read", () => {
  test("a missing, unreadable or broken file is null", async () => {
    const path = file();
    expect(await createUiStateStore(path, saved).read()).toBeNull();
    writeFileSync(path, "{broken");
    expect(await createUiStateStore(path, saved).read()).toBeNull();
    const dir = file();
    mkdirSync(dir);
    expect(await createUiStateStore(dir, saved).read()).toBeNull();
  });

  test("validates against the roots saved now", async () => {
    const path = file();
    writeFileSync(path, JSON.stringify(workspace("design/a.html")));
    expect(await createUiStateStore(path, saved).read()).toMatchObject({ screen: "workspace", root: "/repo", canvas: "design/a.html" });
    expect(await createUiStateStore(path, () => []).read()).toEqual({ screen: "home", expanded: {}, lastByRoot: {} });
  });
});

describe("save", () => {
  test("debounces and writes only the last value", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    const store = createUiStateStore(path, saved);
    expect(store.save(workspace("design/a.html"))).toBe(true);
    vi.advanceTimersByTime(UI_STATE_DELAY_MS - 1);
    expect(store.save(workspace("design/b.html"))).toBe(true);
    vi.advanceTimersByTime(UI_STATE_DELAY_MS - 1);
    await store.idle();
    expect(readdirSync(join(path, ".."))).toEqual([]);
    vi.advanceTimersByTime(1);
    await store.idle();
    expect(onDisk(path).canvas).toBe("design/b.html");
    expect(readdirSync(join(path, ".."))).toEqual(["ui-state.json"]);
  });

  test("writes a temp file beside the target and renames it over", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    const calls: string[][] = [];
    const fs: UiStateFs = {
      async writeFile(temp, text) { calls.push(["write", temp]); await writeFile(temp, text, { flag: "wx" }); },
      async rename(from, to) { calls.push(["rename", from, to]); await rename(from, to); },
    };
    const store = createUiStateStore(path, saved, UI_STATE_DELAY_MS, fs);
    store.save(workspace("design/a.html"));
    vi.advanceTimersByTime(UI_STATE_DELAY_MS);
    await store.idle();
    const temp = calls[0]?.[1] ?? "";
    expect(temp.startsWith(`${path}.`) && temp.endsWith(".tmp")).toBe(true);
    expect(calls).toEqual([["write", temp], ["rename", temp, path]]);
  });

  test("a failed write leaves the previous file and no temp file", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    writeFileSync(path, JSON.stringify(workspace("design/old.html")));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fs: UiStateFs = { writeFile: (temp, text) => writeFile(temp, text, { flag: "wx" }), rename: () => Promise.reject(new Error("disk full")) };
    const store = createUiStateStore(path, saved, UI_STATE_DELAY_MS, fs);
    store.save(workspace("design/new.html"));
    vi.advanceTimersByTime(UI_STATE_DELAY_MS);
    await store.idle();
    expect(onDisk(path).canvas).toBe("design/old.html");
    expect(readdirSync(join(path, ".."))).toEqual(["ui-state.json"]);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  test("refuses a broken shape or a value over 64 KiB and keeps the pending one", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    const store = createUiStateStore(path, saved);
    store.save(workspace("design/a.html"));
    const cyclic: Record<string, unknown> = { screen: "home" };
    cyclic["self"] = cyclic;
    const huge = { screen: "home", expanded: { "/repo": ["x".repeat(UI_STATE_MAX_BYTES)] }, lastByRoot: {} };
    for (const bad of [null, undefined, "home", [], { screen: "settings" }, cyclic, huge]) expect(store.save(bad)).toBe(false);
    vi.advanceTimersByTime(UI_STATE_DELAY_MS);
    await store.idle();
    expect(onDisk(path).canvas).toBe("design/a.html");
  });

  test("drops roots that are not saved and unknown fields before writing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    const store = createUiStateStore(path, saved);
    store.save({ ...workspace("design/a.html"), extra: 1, expanded: { "/repo": ["design"], "/gone": ["x"] }, lastByRoot: { "/gone": { canvas: "a", view } } });
    vi.advanceTimersByTime(UI_STATE_DELAY_MS);
    await store.idle();
    expect(onDisk(path)).toEqual({ screen: "workspace", root: "/repo", canvas: "design/a.html", view, expanded: { "/repo": ["design"] }, lastByRoot: {} });
  });

  test("flushSync writes a pending value now and the timer writes nothing after it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    const store = createUiStateStore(path, saved);
    store.flushSync();
    expect(readdirSync(join(path, ".."))).toEqual([]);
    store.save(workspace("design/a.html"));
    store.flushSync();
    expect(onDisk(path).canvas).toBe("design/a.html");
    writeFileSync(path, "{}");
    vi.advanceTimersByTime(UI_STATE_DELAY_MS);
    await store.idle();
    expect(readFileSync(path, "utf8")).toBe("{}");
  });

  test("a write already started does not rename over a later flushSync", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    let release = () => {};
    const fs: UiStateFs = {
      async writeFile(temp, text) { await writeFile(temp, text, { flag: "wx" }); await new Promise<void>((resolve) => { release = resolve; }); },
      rename,
    };
    const store = createUiStateStore(path, saved, UI_STATE_DELAY_MS, fs);
    store.save(workspace("design/a.html"));
    vi.advanceTimersByTime(UI_STATE_DELAY_MS);
    await vi.waitFor(() => expect(readdirSync(join(path, ".."))).toHaveLength(1));
    store.save(workspace("design/b.html"));
    store.flushSync();
    release();
    await store.idle();
    expect(onDisk(path).canvas).toBe("design/b.html");
    expect(readdirSync(join(path, ".."))).toEqual(["ui-state.json"]);
  });
});
