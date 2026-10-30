import { mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
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
    writeFileSync(path, JSON.stringify(workspace(".doan/canvases/a.html")));
    expect(await createUiStateStore(path, saved).read()).toMatchObject({ screen: "workspace", root: "/repo", canvas: ".doan/canvases/a.html" });
    expect(await createUiStateStore(path, () => []).read()).toEqual({ screen: "home", expanded: {}, lastByRoot: {} });
  });
});

describe("save", () => {
  test("debounces and writes only the last value", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    const store = createUiStateStore(path, saved);
    expect(store.save(workspace(".doan/canvases/a.html"))).toBe(true);
    vi.advanceTimersByTime(UI_STATE_DELAY_MS - 1);
    expect(store.save(workspace(".doan/canvases/b.html"))).toBe(true);
    vi.advanceTimersByTime(UI_STATE_DELAY_MS - 1);
    await store.idle();
    expect(readdirSync(join(path, ".."))).toEqual([]);
    vi.advanceTimersByTime(1);
    await store.idle();
    expect(onDisk(path).canvas).toBe(".doan/canvases/b.html");
    expect(readdirSync(join(path, ".."))).toEqual(["ui-state.json"]);
  });

  test("writes a temp file beside the target and renames it over", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    const calls: string[][] = [];
    const fs: UiStateFs = {
      async writeFile(temp, text) { calls.push(["write", temp]); await writeFile(temp, text, { flag: "wx" }); },
      renameSync(from, to) { calls.push(["rename", from, to]); renameSync(from, to); },
    };
    const store = createUiStateStore(path, saved, UI_STATE_DELAY_MS, fs);
    store.save(workspace(".doan/canvases/a.html"));
    vi.advanceTimersByTime(UI_STATE_DELAY_MS);
    await store.idle();
    const temp = calls[0]?.[1] ?? "";
    expect(temp.startsWith(`${path}.`) && temp.endsWith(".tmp")).toBe(true);
    expect(calls).toEqual([["write", temp], ["rename", temp, path]]);
  });

  test("a failed write leaves the previous file and no temp file", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    writeFileSync(path, JSON.stringify(workspace(".doan/canvases/old.html")));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const fs: UiStateFs = { writeFile: (temp, text) => writeFile(temp, text, { flag: "wx" }), renameSync: () => { throw new Error("disk full"); } };
    const store = createUiStateStore(path, saved, UI_STATE_DELAY_MS, fs);
    store.save(workspace(".doan/canvases/new.html"));
    vi.advanceTimersByTime(UI_STATE_DELAY_MS);
    await store.idle();
    expect(onDisk(path).canvas).toBe(".doan/canvases/old.html");
    expect(readdirSync(join(path, ".."))).toEqual(["ui-state.json"]);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  test("refuses a broken shape or a value over 64 KiB and keeps the pending one", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    const store = createUiStateStore(path, saved);
    store.save(workspace(".doan/canvases/a.html"));
    const cyclic: Record<string, unknown> = { screen: "home" };
    cyclic["self"] = cyclic;
    const huge = { screen: "home", expanded: { "/repo": ["x".repeat(UI_STATE_MAX_BYTES)] }, lastByRoot: {} };
    for (const bad of [null, undefined, "home", [], { screen: "settings" }, cyclic, huge]) expect(store.save(bad)).toBe(false);
    vi.advanceTimersByTime(UI_STATE_DELAY_MS);
    await store.idle();
    expect(onDisk(path).canvas).toBe(".doan/canvases/a.html");
  });

  test("drops roots that are not saved and unknown fields before writing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    const store = createUiStateStore(path, saved);
    store.save({ ...workspace(".doan/canvases/a.html"), extra: 1, expanded: { "/repo": ["doan"], "/gone": ["x"] }, lastByRoot: { "/gone": { canvas: "a", view } } });
    vi.advanceTimersByTime(UI_STATE_DELAY_MS);
    await store.idle();
    expect(onDisk(path)).toEqual({ screen: "workspace", root: "/repo", canvas: ".doan/canvases/a.html", view, expanded: { "/repo": ["doan"] }, lastByRoot: {} });
  });

  test("flushSync writes a pending value now and the timer writes nothing after it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    const store = createUiStateStore(path, saved);
    store.flushSync();
    expect(readdirSync(join(path, ".."))).toEqual([]);
    store.save(workspace(".doan/canvases/a.html"));
    store.flushSync();
    expect(onDisk(path).canvas).toBe(".doan/canvases/a.html");
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
      renameSync,
    };
    const store = createUiStateStore(path, saved, UI_STATE_DELAY_MS, fs);
    store.save(workspace(".doan/canvases/a.html"));
    vi.advanceTimersByTime(UI_STATE_DELAY_MS);
    await vi.waitFor(() => expect(readdirSync(join(path, ".."))).toHaveLength(1));
    store.save(workspace(".doan/canvases/b.html"));
    store.flushSync();
    release();
    await store.idle();
    expect(onDisk(path).canvas).toBe(".doan/canvases/b.html");
    expect(readdirSync(join(path, ".."))).toEqual(["ui-state.json"]);
  });

  test("flushSync also writes a value whose debounced write has started but not finished", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    let release = () => {};
    let started = false;
    const fs: UiStateFs = {
      async writeFile(temp, text) { started = true; await new Promise<void>((resolve) => { release = resolve; }); await writeFile(temp, text, { flag: "wx" }); },
      renameSync,
    };
    const store = createUiStateStore(path, saved, UI_STATE_DELAY_MS, fs);
    store.save(workspace(".doan/canvases/a.html"));
    vi.advanceTimersByTime(UI_STATE_DELAY_MS);
    await vi.waitFor(() => expect(started).toBe(true));
    store.flushSync();
    expect(onDisk(path).canvas).toBe(".doan/canvases/a.html");
    release();
    await store.idle();
    expect(onDisk(path).canvas).toBe(".doan/canvases/a.html");
    expect(readdirSync(join(path, ".."))).toEqual(["ui-state.json"]);
  });

  // Before the fix the rename was async, and a quit flush that came while it
  // ran was overwritten by it. The commit is now one synchronous step after
  // the superseded check, so the flush comes either before it (and wins) or,
  // as here, right after it.
  test("a rename the debounced write already issued does not land over a later flushSync", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    let renames = 0;
    const fs: UiStateFs = {
      writeFile: (temp, text) => writeFile(temp, text, { flag: "wx" }),
      renameSync(from, to) {
        renames++;
        renameSync(from, to);
        store.save(workspace(".doan/canvases/b.html"));
        store.flushSync();
      },
    };
    const store = createUiStateStore(path, saved, UI_STATE_DELAY_MS, fs);
    store.save(workspace(".doan/canvases/a.html"));
    vi.advanceTimersByTime(UI_STATE_DELAY_MS);
    await store.idle();
    expect(renames).toBe(1);
    expect(onDisk(path).canvas).toBe(".doan/canvases/b.html");
    expect(readdirSync(join(path, ".."))).toEqual(["ui-state.json"]);
  });
});

describe("Settings tab", () => {
  test("is kept beside the main window's state: neither save drops the other", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    writeFileSync(path, JSON.stringify(workspace(".doan/canvases/a.html")));
    const store = createUiStateStore(path, saved);
    expect(store.readSettingsTab()).toBeNull();
    expect(store.saveSettingsTab("projects")).toBe(true);
    vi.advanceTimersByTime(UI_STATE_DELAY_MS);
    await store.idle();
    expect(onDisk(path)).toMatchObject({ canvas: ".doan/canvases/a.html", settingsTab: "projects" });
    store.save(workspace(".doan/canvases/b.html"));
    vi.advanceTimersByTime(UI_STATE_DELAY_MS);
    await store.idle();
    expect(onDisk(path)).toMatchObject({ canvas: ".doan/canvases/b.html", settingsTab: "projects" });
    expect(await store.read()).toMatchObject({ canvas: ".doan/canvases/b.html" });
    expect(createUiStateStore(path, saved).readSettingsTab()).toBe("projects");
  });

  test("a saved tab survives the main window's first save in a new run", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const path = file();
    writeFileSync(path, JSON.stringify({ ...workspace(".doan/canvases/a.html"), settingsTab: "projects" }));
    const store = createUiStateStore(path, saved);
    store.save(workspace(".doan/canvases/b.html"));
    store.flushSync();
    expect(onDisk(path)).toMatchObject({ canvas: ".doan/canvases/b.html", settingsTab: "projects" });
  });

  test("refuses anything but a tab name, and reads a broken value as none", async () => {
    const path = file();
    writeFileSync(path, JSON.stringify({ ...workspace(".doan/canvases/a.html"), settingsTab: "general" }));
    const store = createUiStateStore(path, saved);
    expect(store.readSettingsTab()).toBeNull();
    for (const bad of ["general", "", null, 1, {}]) expect(store.saveSettingsTab(bad)).toBe(false);
    store.flushSync();
    expect(onDisk(path).settingsTab).toBe("general");
  });
});

test("round-trips shell memory beside Settings and prunes removed roots on read and save", async () => {
  const path = file();
  let roots = ["/repo", "/other"];
  const store = createUiStateStore(path, () => roots);
  const shellProjects = { common: { roots, selectedRoot: "/other", selectedAt: 8.64e15, expanded: true } };
  expect(store.save({ ...workspace(".doan/canvases/a.html"), shellProjects })).toBe(true);
  expect(store.saveSettingsTab("projects")).toBe(true);
  store.flushSync();
  expect((await store.read())?.shellProjects).toEqual(shellProjects);
  expect(createUiStateStore(path, () => roots).readSettingsTab()).toBe("projects");
  roots = ["/repo"];
  expect((await store.read())?.shellProjects).toEqual({ common: { roots, expanded: true } });
  expect(store.save({ ...workspace(".doan/canvases/a.html"), shellProjects })).toBe(true);
  store.flushSync();
  expect(onDisk(path).shellProjects).toEqual({ common: { roots, expanded: true } });
});

test("keeps home memory beside Settings across saves and drops it with its root", async () => {
  const path = file();
  let roots = ["/repo", "/other"];
  const store = createUiStateStore(path, () => roots);
  const home = { lastRoot: "/other", lastProvider: "claude", models: { claude: { model: "opus", effort: "max" } } };
  expect(store.save({ screen: "home", expanded: {}, lastByRoot: {}, home })).toBe(true);
  expect(store.saveSettingsTab("projects")).toBe(true);
  store.flushSync();
  expect(onDisk(path)).toMatchObject({ home, settingsTab: "projects" });
  expect((await createUiStateStore(path, () => roots).read())?.home).toEqual(home);
  roots = ["/repo"];
  expect((await store.read())?.home).toEqual({ lastProvider: "claude", models: { claude: { model: "opus", effort: "max" } } });
});

// Only the renderer parser migrates the old window tab; the next save writes the page section alone.
test("migrates a legacy tab on read and drops it when saving the page section", async () => {
  const path = file();
  writeFileSync(path, JSON.stringify({ ...workspace(".doan/canvases/a.html"), settingsTab: "projects" }));
  const store = createUiStateStore(path, saved);
  const state = await store.read();
  expect(state?.settingsSection).toBe("agents");
  expect(store.save(state)).toBe(true);
  store.flushSync();
  expect(onDisk(path).settingsSection).toBe("agents");
  expect(onDisk(path)).not.toHaveProperty("settingsTab");
});
