import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const mocks = vi.hoisted(() => ({ probe: vi.fn(), run: vi.fn() }));
vi.mock("../onboarding/machine", () => ({ probeShell: mocks.probe, runProcess: mocks.run }));
import { BUNDLED_CLAUDE_SDK, createPrepare, routePrepare } from "./prepare";
import { SUPPORTED_VERSIONS } from "./sessions";
import { conversationHandler } from "./ipc";
import { ConversationService } from "./service";
import { ConversationStore } from "./store";
const paths: string[] = []; afterEach(() => { vi.clearAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
function temp() { const root = realpathSync(mkdtempSync(join(tmpdir(), "doan-prepare-"))); paths.push(root); return root; }
it("fails closed with a missing installed CLI despite the SDK platform dependency", async () => {
  const root = temp(); mocks.probe.mockResolvedValue({ ok: true, path: root });
  const prepare = createPrepare(root, join(root, "runtime.json"), { HOME: root });
  await expect(prepare({ root, mode: "new", runtime: "claude", canvas: { path: ".doan/canvases/a.html" }, text: "hello", anchors: [] })).rejects.toThrow("cli_missing");
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

it("refuses a Codex resume preview with a record but no verifiable stored session", async () => {
  const root = temp(); writeFileSync(join(root, "codex"), "fake", { mode: 0o700 });
  mocks.probe.mockResolvedValue({ ok: true, path: root, codexHome: root }); mocks.run.mockResolvedValue({ exitCode: 0, stdout: "codex-cli 0.163.0" });
  const canvas = { id: "a", path: ".doan/canvases/a.html" };
  writeFileSync(join(root, "sessions.jsonl"), JSON.stringify({ v: 1, at: "2026-10-27T00:00:00.000Z", root, canvas, hash: "sha256:" + "a".repeat(64), runtime: "codex", sessionId: "01a178ba-f9dc-7161-9544-f20f656064a1", configDir: root, cwd: root }) + "\n");
  const prepare = createPrepare(root, join(root, "runtime.json"), { HOME: root });
  await expect(prepare({ root, mode: "resume", canvas, text: "", anchors: [] })).rejects.toThrow("session_unavailable");
  const routed = routePrepare(prepare, () => Promise.reject(new Error("not_logged_in")));
  const service = new ConversationService(new ConversationStore(root), routed, vi.fn(), () => {});
  const handler = conversationHandler(service, routed, () => [{ path: root, kind: "list", canvases: [canvas] }]);
  expect(await handler(true, "resumeTarget", { root, canvas })).toEqual({ available: false, reason: "session_unavailable" });
});

it.each(["valid", "wrong-id", "wrong-cwd", "wrong-version", "malformed", "linked", "linked-directory", "oversized-header", "duplicate"])("checks Codex stored session evidence: %s", async kind => {
  const root = temp(); writeFileSync(join(root, "codex"), "fake", { mode: 0o700 });
  mocks.probe.mockResolvedValue({ ok: true, path: root, codexHome: root }); mocks.run.mockResolvedValue({ exitCode: 0, stdout: "codex-cli 0.163.0" });
  const sessionId = "01a178ba-f9dc-7161-9544-f20f656064a1";
  const directory = join(root, "sessions", "2026", "10", "27"); mkdirSync(directory, { recursive: true });
  const path = join(directory, `rollout-2026-10-27T00-01-23-${sessionId}.jsonl`);
  const header = JSON.stringify({ type: "session_meta", payload: { id: kind === "wrong-id" ? "other" : sessionId, cwd: kind === "wrong-cwd" ? temp() : root, cli_version: kind === "wrong-version" ? "0.164.0" : "0.163.0" } }) + "\n";
  writeFileSync(path, kind === "malformed" ? "broken\n" : kind === "oversized-header" ? " ".repeat(65536) + header : header);
  if (kind === "linked-directory") { const target = temp(); writeFileSync(join(target, path.split("/").at(-1)!), header); rmSync(directory, { recursive: true }); symlinkSync(target, directory); }
  if (kind === "linked") { rmSync(path); const target = join(temp(), "header"); writeFileSync(target, header); symlinkSync(target, path); }
  if (kind === "duplicate") writeFileSync(join(directory, `rollout-duplicate-${sessionId}.jsonl`), header);
  const prepare = createPrepare(root, join(root, "runtime.json"), { HOME: root });
  const ready = prepare({ root, mode: "resume", text: "", anchors: [] }, { runtime: "codex", origin: "new", sessionId, configDir: root, cwd: root });
  if (kind === "valid") expect((await ready).sessionId).toBe(sessionId); else await expect(ready).rejects.toThrow("session_unavailable");
  expect(mocks.run).toHaveBeenCalledTimes(1); expect(mocks.run.mock.calls[0]?.[1]).toEqual(["--version"]);
});

it("pins the installed Claude Agent SDK to the supported version", () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, "../../../package.json"), "utf8"));
  expect(manifest.dependencies["@anthropic-ai/claude-agent-sdk"]).toBe(BUNDLED_CLAUDE_SDK);
  expect(BUNDLED_CLAUDE_SDK).toBe(SUPPORTED_VERSIONS.claudeSdk);
});
