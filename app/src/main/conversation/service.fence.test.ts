import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { ConversationService, type OpenRunner, type Prepare, type Prepared, type Runner } from "./service";
import { codexMechanism } from "../agentAuth/fence";

const dirs: string[] = []; afterEach(() => { dirs.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
const FENCE = { paths: { userData: "/u", profile: "/u/agent-auth/profiles/codex", attachments: ["/u/attachments"] } };
// A fenced Codex server keeps the mechanism it started with; closing it reports its exit, as a real group's end does.
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "doan-service-fence-")); dirs.push(dir);
  const store = new ConversationStore(dir); const runners: Runner[] = []; const inputs: Prepared[] = [];
  const open = vi.fn<OpenRunner>(async (input, _emit, exited) => {
    inputs.push(input);
    const runner: Runner = { sessionId: input.sessionId ?? "thread-1", mechanism: codexMechanism(input.permissionMode ?? "default"), send: vi.fn(async () => {}), answer: () => false,
      stop: vi.fn(async () => {}), close: vi.fn(async () => { setTimeout(exited, 5); }) };
    runners.push(runner); return runner;
  });
  const prepare = vi.fn<Prepare>(async () => ({ runtime: "codex" as const, configDir: "/u/agent-auth/profiles/codex", cwd: "/repo", sessionId: "thread-1", command: "/fake", env: {}, fence: FENCE }));
  return { service: new ConversationService(store, prepare, open, () => {}), runners, inputs, open, prepare };
}
const request = { root: "/repo", mode: "resume" as const, canvas: { path: ".doan/canvases/a.html" }, text: "hello", anchors: [] };

it("restarts a fenced Codex server when a send moves into or out of Full access, and reuses it otherwise", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  expect(h.runners[0]?.mechanism).toBe("codex-profile");
  h.service.receive(id, { type: "turn.done" }); await h.service.send(id, "same mechanism", [], { permissionMode: "acceptEdits" });
  expect(h.open).toHaveBeenCalledOnce(); expect(h.runners[0]?.close).not.toHaveBeenCalled();

  h.service.receive(id, { type: "turn.done" }); await h.service.send(id, "full access", [], { permissionMode: "bypass" });
  expect(h.runners[0]?.close).toHaveBeenCalledOnce();
  expect(h.open).toHaveBeenCalledTimes(2);
  // The new server resumes the same thread, prepared as a new open rather than a reuse.
  expect(h.inputs[1]).toMatchObject({ permissionMode: "bypass", sessionId: "thread-1" });
  expect(h.prepare.mock.calls.at(-1)?.[3]).toBe(false);
  expect(h.runners[1]?.send).toHaveBeenCalledOnce();

  h.service.receive(id, { type: "turn.done" }); await h.service.send(id, "back to ask first", [], { permissionMode: "default" });
  expect(h.runners[1]?.close).toHaveBeenCalledOnce();
  expect(h.open).toHaveBeenCalledTimes(3); expect(h.runners[2]?.mechanism).toBe("codex-profile");
});
it("keeps the stored mode's server when a send names no mode", async () => {
  const h = fixture(); const id = (await h.service.start({ ...request, permissionMode: "bypass" })).conversationId;
  expect(h.runners[0]?.mechanism).toBe("fence");
  h.service.receive(id, { type: "turn.done" }); await h.service.send(id, "again", []);
  expect(h.open).toHaveBeenCalledOnce();
});
it("never restarts a terminal session's Codex server, which has no fence", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  delete (h.runners[0] as { mechanism?: unknown }).mechanism;
  h.service.receive(id, { type: "turn.done" }); await h.service.send(id, "full access", [], { permissionMode: "bypass" });
  expect(h.open).toHaveBeenCalledOnce(); expect(h.runners[0]?.close).not.toHaveBeenCalled();
});
it("passes a send's attachments to prepare, so a Claude or ACP run can open this turn's pasted images", async () => {
  const h = fixture(); const id = (await h.service.start(request)).conversationId;
  h.service.receive(id, { type: "turn.done" });
  const image = { name: "pasted.png", size: 1, kind: "image" as const, path: "/u/attachments/0f4e/pasted.png" };
  await h.service.send(id, "look", [], { attachments: [image] });
  expect(h.prepare.mock.calls.at(-1)?.[0].attachments).toEqual([image]);
});
