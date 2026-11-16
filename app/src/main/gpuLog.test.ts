import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { createGpuLog } from "./gpuLog";

const tmp = realpathSync(mkdtempSync(join(tmpdir(), "doan-gpu-log-")));
let count = 0;
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const file = () => join(tmp, `gpu-${count++}.log`);
const lines = (path: string) => { try { return readFileSync(path, "utf8").split("\n").filter(Boolean); } catch { return []; } };
const now = () => new Date("2026-11-16T01:02:03.000Z");

beforeEach(() => { vi.restoreAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); });

test("a lost GPU process appends its reason and exit code, and reports it on stderr", () => {
  const path = file();
  const log = createGpuLog(path, now);
  log.processGone({ type: "GPU", reason: "crashed", exitCode: 5 });
  log.processGone({ type: "GPU", reason: "killed", exitCode: 9 });
  expect(lines(path)).toEqual([
    "2026-11-16T01:02:03.000Z GPU process gone: reason=crashed exitCode=5",
    "2026-11-16T01:02:03.000Z GPU process gone: reason=killed exitCode=9",
  ]);
  expect(console.error).toHaveBeenCalledWith("doan: GPU process gone", { reason: "crashed", exitCode: 5 });
});

test("other child processes leave no record", () => {
  const path = file();
  createGpuLog(path, now).processGone({ type: "Utility", reason: "crashed", exitCode: 1 });
  expect(lines(path)).toEqual([]);
  expect(console.error).not.toHaveBeenCalled();
});

test("enabled GPU compositing leaves no record", () => {
  const path = file();
  const log = createGpuLog(path, now);
  log.compositing("enabled");
  log.compositing("enabled_on");
  log.compositing("enabled");
  expect(lines(path)).toEqual([]);
  expect(console.error).not.toHaveBeenCalled();
});

test("a compositing fallback is recorded once per change, including the return to enabled", () => {
  const path = file();
  const log = createGpuLog(path, now);
  log.compositing("enabled");
  log.compositing("disabled_software");
  log.compositing("disabled_software");
  log.compositing("unavailable_software");
  log.compositing("enabled");
  log.compositing("enabled");
  expect(lines(path)).toEqual([
    "2026-11-16T01:02:03.000Z GPU compositing: disabled_software",
    "2026-11-16T01:02:03.000Z GPU compositing: unavailable_software",
    "2026-11-16T01:02:03.000Z GPU compositing: enabled",
  ]);
  expect(console.error).toHaveBeenCalledWith("doan: GPU compositing is not enabled", "disabled_software");
});

test("an unwritable log file never throws into the event handler", () => {
  const log = createGpuLog(join(tmp, "missing-dir", "gpu.log"), now);
  expect(() => log.processGone({ type: "GPU", reason: "crashed", exitCode: 5 })).not.toThrow();
  expect(() => log.compositing("disabled_software")).not.toThrow();
});
