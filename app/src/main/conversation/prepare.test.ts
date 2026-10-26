import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const mocks = vi.hoisted(() => ({ probe: vi.fn(), run: vi.fn() }));
vi.mock("../onboarding/machine", () => ({ probeShell: mocks.probe, runProcess: mocks.run }));
import { createPrepare } from "./prepare";
const paths: string[] = []; afterEach(() => { vi.clearAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
function temp() { const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-prepare-"))); paths.push(root); return root; }
it("fails closed with a missing installed CLI despite the SDK platform dependency", async () => {
  const root = temp(); mocks.probe.mockResolvedValue({ ok: true, path: root });
  const prepare = createPrepare(root, join(root, "runtime.json"), { HOME: root });
  await expect(prepare({ root, mode: "new", runtime: "claude", canvas: { path: "design/a.html" }, text: "hello", anchors: [] })).rejects.toThrow("cli_missing");
  expect(mocks.run).not.toHaveBeenCalled();
});
it("uses selected canonical profile and fails unknown versions before opening", async () => {
  const root = temp(); const config = join(root, "profile"); mkdirSync(config); writeFileSync(join(root, "codex"), "fake", { mode: 0o700 });
  mocks.probe.mockResolvedValue({ ok: true, path: root, codexHome: config }); mocks.run.mockResolvedValue({ exitCode: 0, stdout: "codex-cli 0.163.0" });
  const prepare = createPrepare(root, join(root, "runtime.json"), { HOME: root, CLAUDE_CODE_SESSION_ID: "stale", CODEX_THREAD_ID: "stale", CODEX_SESSION_ID: "stale" });
  const request = { root, mode: "new" as const, runtime: "codex" as const, text: "hello", anchors: [] };
  const ready = await prepare(request); expect(ready.command).toBe(join(root, "codex")); expect(ready.env.CODEX_HOME).toBe(config); expect(ready.env.CLAUDE_CODE_SESSION_ID).toBeUndefined();
  mocks.run.mockResolvedValue({ exitCode: 0, stdout: "codex-cli 0.164.0" }); await expect(prepare(request)).rejects.toThrow("runtime_unsupported");
});
