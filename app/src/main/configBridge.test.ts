import { beforeEach, describe, expect, test, vi } from "vitest";
import { createConfigBridge } from "./configBridge";
import type { CliRun } from "./folderState";

const ROOT = "/repo";
const ok = (result: unknown): CliRun => ({ exitCode: 0, timedOut: false, stderr: "", stdout: JSON.stringify({ v: 1, ok: true, result }) });
const failed = (code: string, message: string): CliRun => ({ exitCode: 2, timedOut: false, stderr: "", stdout: JSON.stringify({ v: 1, ok: false, error: { code, message, nextSteps: ["Run doan config"] } }) });
const config = (serve: string[], tokenCss?: string, changed = false) => ok({ repo: ROOT, serve, changed, ...(tokenCss ? { tokenCss } : {}) });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

const run = vi.fn<(root: string, args: string[]) => Promise<CliRun>>();
const pick = vi.fn<(root: string, kind: "tokenCss" | "serve") => Promise<string | null>>();
let epochs: Map<string, number>;
let bridge: ReturnType<typeof createConfigBridge>;
beforeEach(() => {
  vi.clearAllMocks();
  epochs = new Map([[ROOT, 1]]);
  run.mockResolvedValue(config(["styles"], "tokens.css"));
  pick.mockResolvedValue("/repo/tokens/new.css");
  bridge = createConfigBridge({ run, pick, epoch: root => epochs.get(root) ?? null });
});

test("reads config for a stored, set-up root through the CLI", async () => {
  expect(await bridge.read({ root: ROOT })).toEqual({ kind: "config", root: ROOT, tokenCss: "tokens.css", serve: ["styles"], changed: false });
  expect(run).toHaveBeenCalledExactlyOnceWith(ROOT, []);
});

test("refuses roots that are not stored set-up projects and malformed requests", async () => {
  for (const request of [{ root: "/other" }, { root: ROOT, extra: 1 }, { root: 1 }, null, ROOT]) {
    expect(await bridge.read(request), JSON.stringify(request)).toEqual({ kind: "unavailable" });
  }
  expect(run).not.toHaveBeenCalled();
});

test("CLI failures surface the message and change nothing", async () => {
  run.mockResolvedValueOnce({ exitCode: null, timedOut: false, stdout: "", stderr: "", spawnError: "spawn doan ENOENT" });
  expect(await bridge.read({ root: ROOT })).toEqual({ kind: "error", message: "Couldn’t run doan: spawn doan ENOENT" });
  run.mockResolvedValueOnce({ exitCode: null, timedOut: true, stdout: "", stderr: "" });
  expect(await bridge.read({ root: ROOT })).toEqual({ kind: "error", message: "doan config timed out after 10 s." });
  run.mockResolvedValueOnce(failed("invalid_config", "Config at .doan/config.json is not valid JSON."));
  expect(await bridge.read({ root: ROOT })).toEqual({ kind: "error", message: "Config at .doan/config.json is not valid JSON." });
  run.mockResolvedValueOnce(failed("usage_error", "Config path is outside the repository"));
  expect(await bridge.write({ root: ROOT, op: "clearTokenCss" })).toEqual({ kind: "error", message: "Config path is outside the repository" });
  run.mockResolvedValueOnce({ exitCode: 1, timedOut: false, stdout: "not json", stderr: "panic: boom\nmore" });
  expect(await bridge.read({ root: ROOT })).toEqual({ kind: "error", message: "panic: boom" });
});

test("a chosen file goes to the CLI by an id bound to its root and epoch, once", async () => {
  const chosen = await bridge.choose({ root: ROOT, kind: "tokenCss" });
  expect(chosen).toEqual({ kind: "selected", choiceId: expect.any(String), path: "/repo/tokens/new.css" });
  if (chosen.kind !== "selected") throw new Error("not selected");
  expect(pick).toHaveBeenCalledExactlyOnceWith(ROOT, "tokenCss");
  run.mockResolvedValueOnce(config([], "tokens/new.css", true));
  expect(await bridge.write({ root: ROOT, op: "setTokenCss", choiceId: chosen.choiceId })).toEqual({ kind: "config", root: ROOT, tokenCss: "tokens/new.css", serve: [], changed: true });
  expect(run).toHaveBeenLastCalledWith(ROOT, ["--token-css", "/repo/tokens/new.css"]);
  expect(await bridge.write({ root: ROOT, op: "setTokenCss", choiceId: chosen.choiceId })).toEqual({ kind: "unavailable" });
});

test("forged, mismatched or outdated choices are refused", async () => {
  const token = await bridge.choose({ root: ROOT, kind: "tokenCss" });
  const serve = await bridge.choose({ root: ROOT, kind: "serve" });
  if (token.kind !== "selected" || serve.kind !== "selected") throw new Error("not selected");
  epochs.set("/b", 1);
  expect(await bridge.write({ root: ROOT, op: "setTokenCss", choiceId: "forged" })).toEqual({ kind: "unavailable" });
  expect(await bridge.write({ root: ROOT, op: "addServe", choiceId: token.choiceId })).toEqual({ kind: "unavailable" });
  expect(await bridge.write({ root: "/b", op: "addServe", choiceId: serve.choiceId })).toEqual({ kind: "unavailable" });
  epochs.set(ROOT, 2);
  expect(await bridge.write({ root: ROOT, op: "addServe", choiceId: serve.choiceId })).toEqual({ kind: "unavailable" });
  expect(run).not.toHaveBeenCalled();
});

test("a picker that finishes after the project changed keeps no choice", async () => {
  const later = deferred<string | null>();
  pick.mockReturnValueOnce(later.promise);
  const choosing = bridge.choose({ root: ROOT, kind: "serve" });
  epochs.set(ROOT, 2);
  later.resolve("/repo/styles");
  expect(await choosing).toEqual({ kind: "unavailable" });
  pick.mockResolvedValueOnce(null);
  expect(await bridge.choose({ root: ROOT, kind: "serve" })).toEqual({ kind: "cancelled" });
  for (const request of [{ root: ROOT, kind: "other" }, { root: "/other", kind: "serve" }, { root: ROOT }]) {
    expect(await bridge.choose(request)).toEqual({ kind: "unavailable" });
  }
});

test("adds a serve entry and clears token CSS", async () => {
  pick.mockResolvedValueOnce("/repo/assets");
  const chosen = await bridge.choose({ root: ROOT, kind: "serve" });
  if (chosen.kind !== "selected") throw new Error("not selected");
  await bridge.write({ root: ROOT, op: "addServe", choiceId: chosen.choiceId });
  expect(run).toHaveBeenLastCalledWith(ROOT, ["--add-serve", "/repo/assets"]);
  await bridge.write({ root: ROOT, op: "clearTokenCss" });
  expect(run).toHaveBeenLastCalledWith(ROOT, ["--clear-token-css"]);
  expect(await bridge.write({ root: ROOT, op: "clearTokenCss", more: 1 })).toEqual({ kind: "unavailable" });
});

test("removes only a serve path the last read returned, as an absolute path", async () => {
  expect(await bridge.write({ root: ROOT, op: "removeServe", path: "styles" })).toEqual({ kind: "unavailable" });
  await bridge.read({ root: ROOT });
  expect(await bridge.write({ root: ROOT, op: "removeServe", path: "elsewhere" })).toEqual({ kind: "unavailable" });
  run.mockResolvedValueOnce(config([], "tokens.css", true));
  expect(await bridge.write({ root: ROOT, op: "removeServe", path: "styles" })).toMatchObject({ kind: "config", serve: [] });
  expect(run).toHaveBeenLastCalledWith(ROOT, ["--remove-serve", "/repo/styles"]);
  expect(await bridge.write({ root: ROOT, op: "removeServe", path: "styles" })).toEqual({ kind: "unavailable" });
});

test("the last read stays usable while a new read runs or fails", async () => {
  await bridge.read({ root: ROOT });
  const later = deferred<CliRun>();
  run.mockReturnValueOnce(later.promise);
  const reading = bridge.read({ root: ROOT });
  later.resolve(failed("invalid_config", "broken"));
  await reading;
  run.mockResolvedValueOnce(config([], undefined, true));
  expect(await bridge.write({ root: ROOT, op: "removeServe", path: "styles" })).toMatchObject({ kind: "config" });
});

test("writes to one root run one after another", async () => {
  const first = deferred<CliRun>();
  run.mockReturnValueOnce(first.promise);
  const a = bridge.write({ root: ROOT, op: "clearTokenCss" });
  const b = bridge.write({ root: ROOT, op: "clearTokenCss" });
  await Promise.resolve(); await Promise.resolve();
  expect(run).toHaveBeenCalledOnce();
  first.resolve(config([], undefined, true));
  await Promise.all([a, b]);
  expect(run).toHaveBeenCalledTimes(2);
});

test("clear forgets choices and reads (the Project Settings dialog closed)", async () => {
  await bridge.read({ root: ROOT });
  const chosen = await bridge.choose({ root: ROOT, kind: "serve" });
  if (chosen.kind !== "selected") throw new Error("not selected");
  bridge.clear();
  expect(await bridge.write({ root: ROOT, op: "addServe", choiceId: chosen.choiceId })).toEqual({ kind: "unavailable" });
  expect(await bridge.write({ root: ROOT, op: "removeServe", path: "styles" })).toEqual({ kind: "unavailable" });
});

test("a queued write rechecks the root epoch right before it runs", async () => {
  const slow = deferred<CliRun>();
  run.mockReturnValueOnce(slow.promise);
  const reading = bridge.read({ root: ROOT });
  const chosen = await bridge.choose({ root: ROOT, kind: "serve" });
  if (chosen.kind !== "selected") throw new Error("not selected");
  const writing = bridge.write({ root: ROOT, op: "addServe", choiceId: chosen.choiceId });
  epochs.set(ROOT, 2);
  slow.resolve(config([]));
  await reading;
  expect(await writing).toEqual({ kind: "unavailable" });
  expect(run).toHaveBeenCalledOnce();
});

test("a read that finished after its project was re-added does not fill the serve list", async () => {
  const slow = deferred<CliRun>();
  run.mockReturnValueOnce(slow.promise);
  const reading = bridge.read({ root: ROOT });
  await Promise.resolve();
  epochs.set(ROOT, 2);
  slow.resolve(config(["styles"]));
  await reading;
  expect(await bridge.write({ root: ROOT, op: "removeServe", path: "styles" })).toEqual({ kind: "unavailable" });
  expect(run).toHaveBeenCalledOnce();
});

test("a read still running when Settings closes does not refill the serve list", async () => {
  const slow = deferred<CliRun>();
  run.mockReturnValueOnce(slow.promise);
  const reading = bridge.read({ root: ROOT });
  // Let the queued read start its run before Settings closes.
  await Promise.resolve();
  expect(run).toHaveBeenCalledOnce();
  bridge.clear();
  slow.resolve(config(["styles"]));
  await reading;
  expect(await bridge.write({ root: ROOT, op: "removeServe", path: "styles" })).toEqual({ kind: "unavailable" });
  expect(run).toHaveBeenCalledOnce();
});

test("a picker sheet that finishes after Settings closes returns no choice", async () => {
  const sheet = deferred<string | null>();
  pick.mockReturnValueOnce(sheet.promise);
  const choosing = bridge.choose({ root: ROOT, kind: "serve" });
  bridge.clear();
  sheet.resolve("/repo/tokens/new.css");
  expect(await choosing).toEqual({ kind: "unavailable" });
});

test("a request queued before Settings closed does not run after it", async () => {
  const slow = deferred<CliRun>();
  run.mockReturnValueOnce(slow.promise);
  const reading = bridge.read({ root: ROOT });
  await Promise.resolve();
  const writing = bridge.write({ root: ROOT, op: "clearTokenCss" });
  bridge.clear();
  slow.resolve(config(["styles"]));
  await reading;
  expect(await writing).toEqual({ kind: "unavailable" });
  expect(run).toHaveBeenCalledOnce();
});

// buzz-settings design 'Project Settings 다이얼로그': `config:session-start`/`config:session-end` (and a replaced main
// renderer) call clear(); whatever an earlier dialog asked for answers unavailable.
describe("dialog session", () => {
  test("다이얼로그를 닫은 뒤 늦게 온 읽기·선택 답은 버려진다", async () => {
    bridge.clear();
    const reading = deferred<CliRun>();
    run.mockReturnValueOnce(reading.promise);
    const picking = deferred<string | null>();
    pick.mockReturnValueOnce(picking.promise);
    const read = bridge.read({ root: ROOT });
    const choice = bridge.choose({ root: ROOT, kind: "tokenCss" });
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    bridge.clear();
    reading.resolve(config(["late"], "late.css"));
    picking.resolve("/repo/late.css");
    expect(await read).toEqual({ kind: "unavailable" });
    expect(await choice).toEqual({ kind: "unavailable" });
    expect(await bridge.write({ root: ROOT, op: "removeServe", path: "late" })).toEqual({ kind: "unavailable" });
  });

  test("a new dialog cannot use the previous dialog's choices or serve list", async () => {
    await bridge.read({ root: ROOT });
    const chosen = await bridge.choose({ root: ROOT, kind: "serve" });
    if (chosen.kind !== "selected") throw new Error("not selected");
    bridge.clear();
    expect(await bridge.write({ root: ROOT, op: "addServe", choiceId: chosen.choiceId })).toEqual({ kind: "unavailable" });
    expect(await bridge.write({ root: ROOT, op: "removeServe", path: "styles" })).toEqual({ kind: "unavailable" });
    expect(await bridge.read({ root: ROOT })).toMatchObject({ kind: "config", serve: ["styles"] });
  });
});
