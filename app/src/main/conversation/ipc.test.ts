import { describe, expect, it, vi } from "vitest";
import { conversationHandler, conversationMethods, queueFiles, validateSendExtras } from "./ipc";
import { ConversationService, type OpenRunner, type Prepare, type Prepared } from "./service";
import { ModelCatalog, parseCodexModels, type ModelOption } from "./models";
import { SkillCatalog } from "./skills";
import { AttachmentStore } from "../attachments";
import { ConversationStore } from "./store";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
it("rejects wrong senders, unsaved roots, unlisted canvases and sparse anchors before preparation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-ipc-")); const prepare = vi.fn();
  try {
    const service = new ConversationService(new ConversationStore(dir), prepare, vi.fn(), () => {});
    const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: [{ path: ".doan/canvases/a.html" }] }]);
    expect(await handle(false, "start", {})).toEqual({ error: "bad_request" });
    const request = { root: "/repo", mode: "new", runtime: "claude", canvas: { path: ".doan/canvases/a.html" }, text: "hello" };
    expect(await handle(true, "start", { ...request, root: "/missing" })).toEqual({ error: "project_not_open" });
    expect(await handle(true, "start", { ...request, canvas: { path: ".doan/canvases/b.html" } })).toEqual({ error: "canvas_not_found" });
    expect(await handle(true, "start", { ...request, anchors: new Array(1), text: "{{1}}" })).toEqual({ error: "bad_request" });
    expect(prepare).not.toHaveBeenCalled();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("passes a provider runtime install failure through as its own code", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-ipc-")); const prepare = vi.fn(async () => { throw new Error("cli_install_failed"); });
  try {
    const service = new ConversationService(new ConversationStore(dir), prepare, vi.fn(), () => {});
    const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: [{ path: ".doan/canvases/a.html" }] }]);
    expect(await handle(true, "start", { root: "/repo", mode: "new", runtime: "antigravity", canvas: { path: ".doan/canvases/a.html" }, text: "hello" })).toEqual({ error: "cli_install_failed" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function home(dir: string, models?: ModelOption[], canvases: { path: string }[] = []) {
  let session = 0;
  const open = vi.fn(async () => ({ sessionId: `s${++session}`, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) }));
  const prepare = vi.fn<Prepare>(async request => ({ runtime: request.runtime ?? "claude", configDir: "/profile", cwd: "/repo", command: "/fake", env: {} }));
  const service = new ConversationService(new ConversationStore(dir), prepare, open, () => {});
  const start = vi.spyOn(service, "start");
  const catalog = new ModelCatalog((root, runtime) => prepare({ root, mode: "new", runtime, text: "", anchors: [] }), async () => ({ models: models ?? [] }));
  const attachments = { resolve: vi.fn(), markSent: vi.fn(), consume: vi.fn() };
  const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases }], { models: catalog, attachments: attachments as unknown as AttachmentStore });
  return { handle, start, prepare, catalog, attachments, service };
}
// The renderer holds the terminal session choice while that session (provider:id) works in a
// terminal, so the resume target names its session.
it("names the terminal session in the resume target", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
  try {
    const h = home(dir, undefined, [{ path: ".doan/canvases/a.html" }]);
    h.prepare.mockResolvedValueOnce({ runtime: "codex", configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, sessionId: "019a-thread", lastCheckAt: "2026-11-01T14:02:00.000Z" });
    expect(await h.handle(true, "resumeTarget", { root: "/repo", canvas: { path: ".doan/canvases/a.html" } }))
      .toEqual({ available: true, runtime: "codex", lastCheckAt: "2026-11-01T14:02:00.000Z", session: "019a-thread" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
const MODELS: ModelOption[] = [{ id: "sonnet", label: "Sonnet", default: true, efforts: ["low", "high"] }, { id: "haiku", label: "Haiku", default: false }];
it("takes newDesign multi-line text as is and rejects subject requests", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
  try {
    const h = home(dir);
    const text = "Make a pricing page\n\n- three tiers\n- dark header";
    expect(await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text })).toHaveProperty("conversationId");
    expect(h.start.mock.calls[0]![0]).toMatchObject({ mode: "newDesign", text });
    expect(h.start.mock.calls[0]![0]).not.toHaveProperty("subject");
    for (const bad of [{ text: "   \n" }, {}, { subject: "line\nbreak", text: "x" }, { subject: "a pricing page", text: "a pricing page" }, { text: "x", canvas: { path: ".doan/canvases/a.html" } }, { text: "x".repeat(32_769) }, { text: "{{1}}" }])
      expect(await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", ...bad })).toEqual({ error: "bad_request" });
    expect(await h.handle(true, "start", { root: "/repo", mode: "newDesign", text: "x" })).toEqual({ error: "no_agent" });
  } finally { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); }
});
it("accepts a model and effort only from the list delivered in this run for that folder and provider", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
  try {
    const h = home(dir, MODELS);
    const start = (over: Record<string, unknown>) => h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x", ...over });
    expect(await start({ model: "sonnet" })).toEqual({ error: "bad_request" });
    expect(await h.handle(true, "models", { root: "/repo", runtime: "claude" })).toEqual({ models: MODELS });
    for (const bad of [{ model: "opus" }, { model: "sonnet", effort: "max" }, { model: "haiku", effort: "low" }, { effort: "low" }, { model: "" }, { model: 1 }, { runtime: "codex", model: "sonnet" }])
      expect(await start(bad)).toEqual({ error: "bad_request" });
    expect(h.start).not.toHaveBeenCalled();
    expect(await start({ model: "sonnet", effort: "high" })).toHaveProperty("conversationId");
    expect(h.start.mock.calls[0]![0]).toMatchObject({ model: "sonnet", effort: "high" });
    expect(await h.handle(true, "start", { root: "/repo", mode: "new", runtime: "claude", text: "x", model: "sonnet", canvas: undefined })).toEqual({ error: "bad_request" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
// The project skill list has the model list's checks, so no provider opens for an unopened folder.
it("answers conversation:skills for an open project and refuses other windows, frames and inputs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
  try {
    const prepare = vi.fn<Prepare>(async request => ({ runtime: request.runtime ?? "claude", configDir: "/profile", cwd: "/repo", command: "/fake", env: {} }));
    const service = new ConversationService(new ConversationStore(dir), prepare, vi.fn(), () => {});
    const list = vi.fn(async () => [{ name: "deploy", description: "Ship." }]);
    const skills = new SkillCatalog((root, provider) => prepare({ root, mode: "new", runtime: provider, text: "", anchors: [] }), list);
    const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: [] }], { skills });
    expect(conversationMethods).toContain("skills");
    expect(await handle(false, "skills", { root: "/repo", provider: "claude" })).toEqual({ error: "bad_request" });
    expect(await handle(true, "skills", { root: "/missing", provider: "claude" })).toEqual({ error: "project_not_open" });
    for (const bad of [{ root: "/repo", provider: "gemini" }, { root: "/repo" }, { root: "/repo", runtime: "claude" }, { root: 1, provider: "claude" }, { root: "x".repeat(4097), provider: "claude" }])
      expect(await handle(true, "skills", bad)).toEqual({ error: "bad_request" });
    expect(prepare).not.toHaveBeenCalled();
    expect(await handle(true, "skills", { root: "/repo", provider: "claude" })).toEqual({ skills: [{ name: "deploy", description: "Ship." }] });
    expect(await handle(true, "skills", { root: "/repo", provider: "cursor" })).toEqual({ skills: [] });
    expect(list).toHaveBeenCalledOnce();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("answers conversation:skills with the start code when the provider cannot be read", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
  try {
    for (const code of ["cli_missing", "not_logged_in", "no_agent", "process_exited", "outside_root", "something else"]) {
      const prepare = vi.fn<Prepare>(async () => { throw new Error(code); });
      const service = new ConversationService(new ConversationStore(dir), prepare, vi.fn(), () => {});
      const skills = new SkillCatalog((root, provider) => prepare({ root, mode: "new", runtime: provider, text: "", anchors: [] }), vi.fn());
      const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: [] }], { skills });
      const expected = code === "outside_root" ? "session_unavailable" : code === "something else" ? "unknown" : code;
      expect(await handle(true, "skills", { root: "/repo", provider: "codex" })).toEqual({ error: expected });
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("answers conversation:models for an open project and refuses other windows, frames and inputs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
  try {
    const h = home(dir, MODELS);
    expect(await h.handle(false, "models", { root: "/repo", runtime: "claude" })).toEqual({ error: "bad_request" });
    expect(await h.handle(true, "models", { root: "/missing", runtime: "claude" })).toEqual({ error: "project_not_open" });
    expect(await h.handle(true, "models", { root: "/repo", runtime: "gemini" })).toEqual({ error: "bad_request" });
    expect(await h.handle(true, "models", { root: "/repo", runtime: "cursor" })).toEqual({ models: MODELS });
    // A refused window never reaches start either, whatever it names.
    expect(await h.handle(false, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x" })).toEqual({ error: "bad_request" });
    expect(h.prepare).toHaveBeenCalledOnce();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("passes rechecked attachments to the start, marks them sent before acceptance and names missing ones", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
  try {
    const h = home(dir);
    const records = [{ name: "a.png", size: 3, kind: "image", path: "/Users/me/a.png" }];
    h.attachments.resolve.mockReturnValueOnce({ ok: false, error: "attachment_missing", missing: ["gone"] });
    expect(await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x", attachments: [{ id: "gone" }] })).toEqual({ error: "attachment_missing", missing: ["gone"] });
    h.attachments.resolve.mockReturnValueOnce({ ok: false, error: "bad_request" });
    expect(await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x", attachments: [{ id: 1 }] })).toEqual({ error: "bad_request" });
    expect(await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x", attachments: "x" })).toEqual({ error: "bad_request" });
    expect(h.start).not.toHaveBeenCalled();
    // Checked at the request and again right before acceptance.
    h.attachments.resolve.mockReturnValue({ ok: true, records });
    expect(await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x", attachments: [{ id: "a" }] })).toHaveProperty("conversationId");
    expect(h.start.mock.calls[0]![0].attachments).toEqual(records);
    expect(h.attachments.markSent).toHaveBeenCalledWith([{ id: "a" }]);
    expect(h.attachments.consume).toHaveBeenCalledWith([{ id: "a" }]);
    expect(h.attachments.markSent.mock.invocationCallOrder[0]).toBeLessThan(h.attachments.consume.mock.invocationCallOrder[0]!);
    expect(h.attachments.resolve).toHaveBeenCalledTimes(4);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("names a folder replaced before the request alongside the missing ones", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
  try {
    const h = home(dir);
    h.attachments.resolve.mockReturnValueOnce({ ok: false, error: "attachment_missing", missing: ["gone", "swapped"], replaced: ["swapped"] });
    expect(await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x", attachments: [{ id: "gone" }, { id: "swapped" }] }))
      .toEqual({ error: "attachment_missing", missing: ["gone", "swapped"], replaced: ["swapped"] });
    expect(h.start).not.toHaveBeenCalled();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
it("refuses a start whose folder was replaced while the runner was opening, naming it replaced", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-ipc-")), files = mkdtempSync(join(tmpdir(), "doan-ipc-files-"));
  try {
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
    const open = vi.fn(async () => { await held; return { sessionId: "s1", send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) }; });
    const prepare = vi.fn<Prepare>(async () => ({ runtime: "claude", configDir: "/profile", cwd: "/repo", command: "/fake", env: {} }));
    const store = new ConversationStore(dir);
    const service = new ConversationService(store, prepare, open, () => {});
    const attachments = new AttachmentStore(join(dir, "attachments"), { thumbnail: () => null, reencode: () => null });
    const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: [] }], { attachments });
    const folder = join(realpathSync(files), "refs"); mkdirSync(folder);
    const added = attachments.addPaths({ paths: [folder] })![0]!; if (!added.ok) throw new Error("refused");
    const starting = handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x", attachments: [{ id: added.attachment.id }] });
    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    renameSync(folder, `${folder}-old`); mkdirSync(folder); release();
    expect(await starting).toEqual({ error: "attachment_missing", missing: [added.attachment.id], replaced: [added.attachment.id] });
    expect(store.list()).toEqual([]);
    expect(existsSync(`${folder}-old`)).toBe(true);
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(files, { recursive: true, force: true }); }
});
it("names a queued folder replaced before its send as replaced", () => {
  const recheck = vi.fn(() => [{ id: "a", ok: true }, { id: "b", ok: false, error: "replaced" }, { id: "c", ok: false, error: "not_found" }]);
  const files = queueFiles({ recheck } as unknown as AttachmentStore);
  let thrown: unknown; try { files.reclaim(["a", "b", "c"]); } catch (error) { thrown = error; }
  expect(thrown).toMatchObject({ message: "attachment_missing", missing: ["b", "c"], replaced: ["b"] });
});
it("refuses a start whose attachment vanished while the runner was opening, before anything is accepted", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-ipc-")), files = mkdtempSync(join(tmpdir(), "doan-ipc-files-"));
  try {
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
    const open = vi.fn(async () => { await held; return { sessionId: "s1", send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) }; });
    const prepare = vi.fn<Prepare>(async () => ({ runtime: "claude", configDir: "/profile", cwd: "/repo", command: "/fake", env: {} }));
    const store = new ConversationStore(dir);
    const service = new ConversationService(store, prepare, open, () => {});
    const attachments = new AttachmentStore(join(dir, "attachments"), { thumbnail: () => null, reencode: () => null });
    const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: [] }], { attachments });
    const file = join(realpathSync(files), "a.txt"); writeFileSync(file, "a");
    const added = attachments.addPaths({ paths: [file] })![0]!; if (!added.ok) throw new Error("refused");
    const starting = handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x", attachments: [{ id: added.attachment.id }] });
    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    unlinkSync(file); release();
    expect(await starting).toEqual({ error: "attachment_missing", missing: [added.attachment.id] });
    expect(store.list()).toEqual([]);
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(files, { recursive: true, force: true }); }
});

describe("validateSendExtras", () => {
  const records = [{ name: "a.png", size: 3, kind: "image" as const, path: "/Users/me/a.png" }];
  const catalog = { accepts: vi.fn((root: string, runtime: string, model: string, effort?: string) => root === "/repo" && runtime === "claude" && model === "sonnet" && (effort === undefined || effort === "high")) };
  const attachments = { resolve: vi.fn((value: unknown) => Array.isArray(value) && value.every(v => v.id === "a") ? { ok: true, records } : Array.isArray(value) && value.some(v => v.id === "gone") ? { ok: false, error: "attachment_missing", missing: ["gone"] } : { ok: false, error: "bad_request" }) };
  const home = { models: catalog as unknown as ModelCatalog, attachments: attachments as unknown as AttachmentStore };
  const check = (request: Record<string, unknown>, owner: "doan" | "legacy-external" = "doan") => { try { return validateSendExtras(request, "/repo", "claude", owner, home); } catch (error) { return { error: (error as Error).message, ...("missing" in (error as object) ? { missing: (error as { missing: string[] }).missing } : {}) }; } };
  it("passes nothing through when nothing changed", () => {
    expect(check({ conversationId: "c", text: "x" })).toEqual({ ids: [] });
  });
  it("accepts a model and effort from this run's list for the conversation's provider", () => {
    expect(check({ model: "sonnet", effort: "high" })).toEqual({ model: "sonnet", effort: "high", ids: [] });
    expect(check({ model: "sonnet" })).toEqual({ model: "sonnet", ids: [] });
    for (const bad of [{ model: "opus" }, { model: "sonnet", effort: "max" }, { effort: "high" }, { model: "" }, { model: 1 }]) expect(check(bad)).toEqual({ error: "bad_request" });
  });
  it("resolves main-issued attachment ids and names missing ones", () => {
    expect(check({ attachments: [{ id: "a" }] })).toEqual({ ids: [{ id: "a" }], attachments: records });
    expect(check({ attachments: [{ id: "gone" }] })).toEqual({ error: "attachment_missing", missing: ["gone"] });
    expect(check({ attachments: [{ id: 1 }] })).toEqual({ error: "bad_request" });
    expect(check({ attachments: "a" })).toEqual({ error: "bad_request" });
  });
  it("refuses a provider field: the conversation's provider is fixed", () => {
    expect(check({ runtime: "claude" })).toEqual({ error: "bad_request" });
    expect(check({ provider: "codex", model: "sonnet" })).toEqual({ error: "bad_request" });
  });
  it("accepts only the common permission mode ids, without a model list", () => {
    for (const permissionMode of ["default", "acceptEdits", "plan", "bypass"]) expect(check({ permissionMode })).toEqual({ permissionMode, ids: [] });
    expect(check({ model: "sonnet", permissionMode: "plan" })).toEqual({ model: "sonnet", permissionMode: "plan", ids: [] });
    for (const permissionMode of ["bypassPermissions", "auto", "", 1, null, "Plan"]) expect(check({ permissionMode })).toEqual({ error: "bad_request" });
  });
  it("refuses a permission mode on a legacy external conversation", () => {
    expect(check({ permissionMode: "plan" }, "legacy-external")).toEqual({ error: "bad_request" });
    expect(check({ permissionMode: "default" }, "legacy-external")).toEqual({ error: "bad_request" });
  });
  it("refuses any of the three on a legacy external conversation", () => {
    for (const extra of [{ model: "sonnet" }, { effort: "high" }, { attachments: [{ id: "a" }] }]) expect(check(extra, "legacy-external")).toEqual({ error: "bad_request" });
    expect(check({ text: "x" }, "legacy-external")).toEqual({ ids: [] });
  });
});

// The list, the seen marker and a send's extras through IPC.
describe("conversation list, seen marker and send extras", () => {
  function sendFixture(dir: string, list: ModelOption[] = MODELS) {
    const owner = { kind: "doan" as const, provider: "claude" as const, connectionId: "c", accountId: "a", workspaceId: "o", profile: "p" };
    const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: "claude", configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, owner, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
    const open = vi.fn(async (_input: Prepared) => ({ sessionId: "s1", send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) }));
    const store = new ConversationStore(dir);
    const service = new ConversationService(store, prepare, open, () => {});
    const catalog = new ModelCatalog((root, runtime) => prepare({ root, mode: "new", runtime, text: "", anchors: [] }), async () => ({ models: list }));
    const records = [{ name: "a.png", size: 3, kind: "image", path: "/Users/me/a.png" }];
    const attachments = { resolve: vi.fn((value: unknown[]) => value.some(v => (v as { id: string }).id === "gone") ? { ok: false, error: "attachment_missing", missing: ["gone"] } : { ok: true, records }), markSent: vi.fn(), consume: vi.fn() };
    const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: [] }], { models: catalog, attachments: attachments as unknown as AttachmentStore });
    const send = vi.spyOn(service, "send").mockResolvedValue(undefined);
    return { handle, service, store, send, attachments, records, open };
  }
  it("lists a registered root and refuses others, wrong senders and malformed requests", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = sendFixture(dir);
      expect(await h.handle(true, "list", { root: "/repo" })).toEqual([]);
      expect(await h.handle(true, "list", { root: "/missing" })).toEqual({ error: "project_not_open" });
      expect(await h.handle(true, "list", { root: 1 })).toEqual({ error: "bad_request" });
      expect(await h.handle(false, "list", { root: "/repo" })).toEqual({ error: "bad_request" });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("marks seen only with a whole non-negative seq of a known conversation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = sendFixture(dir);
      const id = (await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x" }) as { conversationId: string }).conversationId;
      for (const seq of [-1, 1.5, "2", undefined]) expect(await h.handle(true, "markSeen", { conversationId: id, seq })).toEqual({ error: "bad_request" });
      expect(await h.handle(true, "markSeen", { conversationId: "missing", seq: 1 })).toEqual({ error: "not_found" });
      expect(await h.handle(true, "markSeen", { conversationId: id, seq: 1 })).toBeUndefined();
      expect(h.store.list()[0]!.seenSeq).toBe(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("checks a send's model and effort against this run's list for the conversation's provider", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = sendFixture(dir);
      const id = (await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x" }) as { conversationId: string }).conversationId;
      // Before this run read the list, a model cannot be checked.
      expect(await h.handle(true, "send", { conversationId: id, text: "y", model: "sonnet" })).toEqual({ error: "bad_request" });
      await h.handle(true, "models", { root: "/repo", runtime: "claude" });
      for (const bad of [{ model: "opus" }, { model: "sonnet", effort: "max" }, { effort: "low" }, { runtime: "claude" }, { provider: "codex" }])
        expect(await h.handle(true, "send", { conversationId: id, text: "y", ...bad })).toEqual({ error: "bad_request" });
      expect(h.send).not.toHaveBeenCalled();
      expect(await h.handle(true, "send", { conversationId: id, text: "y", model: "sonnet", effort: "high" })).toBeUndefined();
      expect(h.send.mock.calls[0]!.slice(0, 4)).toEqual([id, "y", [], { model: "sonnet", effort: "high" }]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("passes a send's attachments with their recheck, marks them sent before consuming them, and names missing ones", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = sendFixture(dir);
      const id = (await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x" }) as { conversationId: string }).conversationId;
      expect(await h.handle(true, "send", { conversationId: id, text: "y", attachments: [{ id: "gone" }] })).toEqual({ error: "attachment_missing", missing: ["gone"] });
      h.send.mockImplementationOnce(async (_id, _text, _anchors, _extras, attached) => { attached!.recheck(); attached!.sent(); });
      expect(await h.handle(true, "send", { conversationId: id, text: "y", attachments: [{ id: "a" }] })).toBeUndefined();
      expect(h.send.mock.calls[0]![3]).toEqual({ attachments: h.records });
      expect(h.attachments.markSent).toHaveBeenCalledWith([{ id: "a" }]);
      expect(h.attachments.consume).toHaveBeenLastCalledWith([{ id: "a" }]);
      expect(h.attachments.markSent.mock.invocationCallOrder[0]).toBeLessThan(h.attachments.consume.mock.invocationCallOrder.at(-1)!);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("passes a send's permission mode, Default included, and refuses an unknown id", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = sendFixture(dir);
      const id = (await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x" }) as { conversationId: string }).conversationId;
      expect(await h.handle(true, "send", { conversationId: id, text: "y", permissionMode: "auto" })).toEqual({ error: "bad_request" });
      expect(h.send).not.toHaveBeenCalled();
      await h.handle(true, "send", { conversationId: id, text: "y", permissionMode: "bypass" });
      await h.handle(true, "send", { conversationId: id, text: "y", permissionMode: "default" });
      expect(h.send.mock.calls.map(call => call[3])).toEqual([{ permissionMode: "bypass" }, { permissionMode: "default" }]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("passes the model's default effort along when the send's model has no effort", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = sendFixture(dir, [{ id: "sonnet", label: "Sonnet", default: true, efforts: ["low", "high"], defaultEffort: "low" }]);
      const id = (await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x" }) as { conversationId: string }).conversationId;
      await h.handle(true, "models", { root: "/repo", runtime: "claude" });
      await h.handle(true, "send", { conversationId: id, text: "y", model: "sonnet" });
      expect(h.send.mock.calls[0]![3]).toEqual({ model: "sonnet", defaultEffort: "low" });
      await h.handle(true, "send", { conversationId: id, text: "y", model: "sonnet", effort: "high" });
      expect(h.send.mock.calls[1]![3]).toEqual({ model: "sonnet", effort: "high" });
      // Without a new model, the stored one's default goes along when the stored choice has no effort.
      h.store.save(h.store.list().map(m => ({ ...m, model: "sonnet" })));
      await h.handle(true, "send", { conversationId: id, text: "y" });
      expect(h.send.mock.calls[2]![3]).toEqual({ defaultEffort: "low" });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  // The first turn too, so the person's Codex model_reasoning_effort never runs it at another level.
  it("runs a start's first turn at its model's default effort when it names none, without storing it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      for (const [extras, effort] of [[{ model: "sonnet" }, "low"], [{ model: "sonnet", effort: "high" }, "high"], [{}, undefined]] as const) {
        const h = sendFixture(mkdtempSync(join(dir, "case-")), [{ id: "sonnet", label: "Sonnet", default: true, efforts: ["low", "high"], defaultEffort: "low" }]);
        await h.handle(true, "models", { root: "/repo", runtime: "claude" });
        const id = (await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x", ...extras }) as { conversationId: string }).conversationId;
        expect(h.open.mock.calls[0]![0].effort, JSON.stringify(extras)).toBe(effort);
        expect(h.store.list().find(m => m.conversationId === id)?.effort, JSON.stringify(extras)).toBe("effort" in extras ? extras.effort : undefined);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("refuses extras on a legacy external conversation and passes project_busy through", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = sendFixture(dir);
      h.store.save([{ conversationId: "legacy", root: "/repo", canvas: { path: ".doan/canvases/a.html" }, title: "t", state: "current", owner: { kind: "legacy-external" }, session: { runtime: "codex", origin: "resumed", sessionId: "s", configDir: "/c", cwd: "/repo" } }]);
      await h.handle(true, "models", { root: "/repo", runtime: "claude" });
      for (const extra of [{ model: "sonnet" }, { attachments: [{ id: "a" }] }, { permissionMode: "plan" }]) expect(await h.handle(true, "send", { conversationId: "legacy", text: "y", ...extra })).toEqual({ error: "bad_request" });
      h.send.mockRejectedValueOnce(new Error("project_busy"));
      expect(await h.handle(true, "send", { conversationId: "legacy", text: "y" })).toEqual({ error: "project_busy" });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  // An earlier sign-in's conversation is its own refusal, not collapsed into unknown or session_unavailable.
  it("passes account_changed and sign_in_changed through a send", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = sendFixture(dir);
      h.store.save([{ conversationId: "legacy", root: "/repo", canvas: { path: ".doan/canvases/a.html" }, title: "t", state: "current", owner: { kind: "legacy-external" }, session: { runtime: "codex", origin: "resumed", sessionId: "s", configDir: "/c", cwd: "/repo" } }]);
      for (const code of ["account_changed", "sign_in_changed"]) {
        h.send.mockRejectedValueOnce(new Error(code));
        expect(await h.handle(true, "send", { conversationId: "legacy", text: "y" })).toEqual({ error: code });
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

// The queue channels and the returned draft.
describe("queue channels", () => {
  function queueFixture(dir: string) {
    const owner = { kind: "doan" as const, provider: "claude" as const, connectionId: "c", accountId: "a", workspaceId: "o", profile: "p" };
    const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: "claude", configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, owner, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
    const open = vi.fn(async (_input: Prepared) => ({ sessionId: "s1", send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) }));
    const store = new ConversationStore(dir);
    const service = new ConversationService(store, prepare, open, () => {});
    const records = [{ name: "a.png", size: 3, kind: "image", path: "/Users/me/a.png" }];
    const attachments = { resolve: vi.fn((value: unknown[]) => value.some(v => (v as { id: string }).id === "gone") ? { ok: false, error: "attachment_missing", missing: ["gone"] } : { ok: true, records }), markSent: vi.fn(), consume: vi.fn() };
    const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: [] }], { attachments: attachments as unknown as AttachmentStore });
    return { handle, service, store, attachments, records };
  }
  it("names the queue channels among the conversation methods", () => {
    expect(conversationMethods).toEqual(expect.arrayContaining(["queue", "removeQueued", "takeDraft"]));
  });
  it("queues a running conversation's message with its attachments, which main then holds, and refuses the rest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = queueFixture(dir);
      const id = (await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x" }) as { conversationId: string }).conversationId;
      for (const bad of [{ text: "" }, { text: "{{1}}" }, { text: "y", model: "sonnet" }, { text: "y", effort: "low" }, { text: "y", runtime: "claude" }, { text: "y", provider: "codex" }, { text: "y", permissionMode: "auto" }])
        expect(await h.handle(true, "queue", { conversationId: id, ...bad })).toEqual({ error: "bad_request" });
      expect(await h.handle(true, "queue", { conversationId: id, text: "y", attachments: [{ id: "gone" }] })).toEqual({ error: "attachment_missing", missing: ["gone"] });
      expect(await h.handle(false, "queue", { conversationId: id, text: "y" })).toEqual({ error: "bad_request" });
      const queued = await h.handle(true, "queue", { conversationId: id, text: "y", attachments: [{ id: "a" }] }) as { itemId: string };
      expect(queued).toEqual({ itemId: expect.any(String) });
      expect(h.attachments.markSent).toHaveBeenLastCalledWith([{ id: "a" }]);
      expect(h.attachments.consume).toHaveBeenLastCalledWith([{ id: "a" }]);
      expect(h.service.list("/repo")[0]!.queued).toBe(1);
      expect(await h.handle(true, "removeQueued", { conversationId: id, itemId: 1 })).toEqual({ error: "bad_request" });
      expect(await h.handle(true, "removeQueued", { conversationId: id, itemId: queued.itemId })).toBeUndefined();
      expect(await h.handle(true, "removeQueued", { conversationId: id, itemId: queued.itemId })).toEqual({ error: "stale" });
      // Judged and with nothing left to wait for, the conversation is not working.
      h.service.receive(id, { type: "turn.done" }); h.service.refreshed("/repo", []);
      expect(await h.handle(true, "queue", { conversationId: id, text: "y" })).toEqual({ error: "not_running" });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  // A queue goes out in the mode stored when it is flushed, so a queued message carries none; a picker change goes
  // through setPermissionMode instead.
  it("refuses a queued message's mode, and stores a picker change except on a legacy external conversation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = queueFixture(dir);
      expect(conversationMethods).toContain("setPermissionMode");
      const id = (await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x" }) as { conversationId: string }).conversationId;
      expect(await h.handle(true, "queue", { conversationId: id, text: "y", permissionMode: "plan" })).toEqual({ error: "bad_request" });
      for (const permissionMode of ["auto", "bypassPermissions", "", 1, null, undefined])
        expect(await h.handle(true, "setPermissionMode", { conversationId: id, permissionMode })).toEqual({ error: "bad_request" });
      expect(await h.handle(true, "setPermissionMode", { conversationId: "missing", permissionMode: "plan" })).toEqual({ error: "not_found" });
      expect(await h.handle(false, "setPermissionMode", { conversationId: id, permissionMode: "plan" })).toEqual({ error: "bad_request" });
      expect(await h.handle(true, "setPermissionMode", { conversationId: id, permissionMode: "plan" })).toBeUndefined();
      expect(h.service.list("/repo")[0]).toMatchObject({ permissionMode: "plan" });
      expect(await h.handle(true, "setPermissionMode", { conversationId: id, permissionMode: "default" })).toBeUndefined();
      expect(h.service.list("/repo")[0]).not.toHaveProperty("permissionMode");
      h.store.save([...h.store.list(), { conversationId: "legacy", root: "/repo", canvas: { path: ".doan/canvases/a.html" }, title: "t", state: "current", owner: { kind: "legacy-external" }, session: { runtime: "codex", origin: "resumed", sessionId: "s", configDir: "/c", cwd: "/repo" } }]);
      expect(await h.handle(true, "setPermissionMode", { conversationId: "legacy", permissionMode: "plan" })).toEqual({ error: "bad_request" });
      expect(await h.handle(true, "setPermissionMode", { conversationId: "legacy", permissionMode: "default" })).toEqual({ error: "bad_request" });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("hands a returned draft over once", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = queueFixture(dir);
      const id = (await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x" }) as { conversationId: string }).conversationId;
      expect(await h.handle(true, "takeDraft", { conversationId: id })).toBeNull();
      await h.handle(true, "queue", { conversationId: id, text: "y", attachments: [{ id: "a" }] });
      h.service.receive(id, { type: "interrupted", reason: "user" });
      expect(await h.handle(true, "takeDraft", { conversationId: id })).toEqual({ text: "y", anchors: [], attachments: h.records, reason: "interrupted" });
      expect(await h.handle(true, "takeDraft", { conversationId: id })).toBeNull();
      expect(await h.handle(true, "takeDraft", { conversationId: "33333333-3333-4333-8333-333333333333" })).toEqual({ error: "not_found" });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

// conversation:delete takes an opaque id and answers nothing or a known code.
describe("delete channel", () => {
  it("deletes an idle conversation and answers busy, not_found, unknown and bad_request as codes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      expect(conversationMethods).toContain("delete");
      const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: "codex", configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, sessionId: stored?.session.sessionId ?? "s1" }));
      const exits: (() => void)[] = [];
      const open = vi.fn<OpenRunner>(async (_input, _emit, exited) => { exits.push(exited); return { sessionId: "s1", send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) }; });
      const store = new ConversationStore(dir), service = new ConversationService(store, prepare, open, () => {});
      const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: [{ path: ".doan/canvases/a.html" }] }]);
      const id = (await handle(true, "start", { root: "/repo", mode: "resume", canvas: { path: ".doan/canvases/a.html" }, text: "x" }) as { conversationId: string }).conversationId;
      expect(await handle(true, "delete", { conversationId: id })).toEqual({ error: "busy" });
      for (const conversationId of [undefined, "", "../x", 1]) expect(await handle(true, "delete", { conversationId })).toEqual({ error: "bad_request" });
      expect(await handle(false, "delete", { conversationId: id })).toEqual({ error: "bad_request" });
      service.receive(id, { type: "turn.done" });
      expect(await handle(true, "delete", { conversationId: id })).toBeUndefined();
      expect(store.list()).toEqual([]);
      expect(await handle(true, "delete", { conversationId: id })).toEqual({ error: "not_found" });
      writeFileSync(join(dir, "conversations", "index.json"), "broken");
      expect(await handle(true, "delete", { conversationId: id })).toEqual({ error: "unknown" });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

// A queued message is accepted only after main holds its attachments.
describe("queue acceptance", () => {
  function fixture(dir: string, markSent: () => void) {
    const owner = { kind: "doan" as const, provider: "claude" as const, connectionId: "c", accountId: "a", workspaceId: "o", profile: "p" };
    const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: "claude", configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, owner, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
    const open = vi.fn(async (_input: Prepared) => ({ sessionId: "s1", send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) }));
    const service = new ConversationService(new ConversationStore(dir), prepare, open, () => {});
    const records = [{ name: "a.png", size: 3, kind: "image", path: "/Users/me/a.png" }];
    const attachments = { resolve: vi.fn(() => ({ ok: true, records })), markSent: vi.fn(markSent), consume: vi.fn() };
    const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: [] }], { attachments: attachments as unknown as AttachmentStore });
    return { handle, service, attachments };
  }
  it("refuses a queued message whose pasted image could not be marked, with nothing queued and the image still the renderer's", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = fixture(dir, () => { throw new Error("ENOSPC"); });
      const id = (await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x" }) as { conversationId: string }).conversationId;
      expect(await h.handle(true, "queue", { conversationId: id, text: "y", attachments: [{ id: "a" }] })).toEqual({ error: "unknown" });
      expect(h.service.list("/repo")[0]!.queued).toBe(0);
      expect(h.attachments.consume).not.toHaveBeenCalledWith([{ id: "a" }]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("passes queue_limit through", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = fixture(dir, () => {});
      const id = (await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x" }) as { conversationId: string }).conversationId;
      vi.spyOn(h.service, "queue").mockImplementationOnce(() => { throw new Error("queue_limit"); });
      expect(await h.handle(true, "queue", { conversationId: id, text: "y" })).toEqual({ error: "queue_limit" });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});


it("accepts validated extras for a new canvas conversation and refuses each extra for resume", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
  try {
    const canvas = { path: ".doan/canvases/a.html" };
    const h = home(dir, MODELS, [canvas]);
    const request = { root: "/repo", mode: "new", runtime: "claude", canvas, text: "change it" };
    const records = [{ name: "a.png", size: 3, kind: "image", path: "/Users/me/a.png" }];
    const extras = { model: "sonnet", effort: "high", attachments: [{ id: "a" }] };
    expect(await h.handle(true, "start", { ...request, ...extras })).toEqual({ error: "bad_request" });
    await h.handle(true, "models", { root: "/repo", runtime: "claude" });
    for (const bad of [{ model: "opus" }, { model: "sonnet", effort: "max" }, { effort: "high" }, { attachments: "a" }])
      expect(await h.handle(true, "start", { ...request, ...bad })).toEqual({ error: "bad_request" });
    h.attachments.resolve.mockReturnValueOnce({ ok: false, error: "attachment_missing", missing: ["a"] });
    expect(await h.handle(true, "start", { ...request, ...extras })).toEqual({ error: "attachment_missing", missing: ["a"] });
    for (const extra of [{ model: "sonnet" }, { effort: "high" }, { attachments: [] }, { permissionMode: "plan" }, extras])
      expect(await h.handle(true, "start", { ...request, mode: "resume", ...extra })).toEqual({ error: "bad_request" });
    expect(await h.handle(true, "start", { ...request, permissionMode: "auto" })).toEqual({ error: "bad_request" });
    expect(h.start).not.toHaveBeenCalled();
    h.attachments.resolve.mockReturnValue({ ok: true, records });
    expect(await h.handle(true, "start", { ...request, ...extras })).toHaveProperty("conversationId");
    expect(h.start.mock.calls[0]![0]).toMatchObject({ mode: "new", canvas, model: "sonnet", effort: "high", attachments: records });
    expect(await h.handle(true, "start", { ...request, permissionMode: "bypass" })).toHaveProperty("conversationId");
    expect(h.start.mock.calls[1]![0]).toMatchObject({ mode: "new", permissionMode: "bypass" });
    expect(h.attachments.resolve).toHaveBeenCalledTimes(3);
    expect(h.attachments.markSent).toHaveBeenCalledWith(extras.attachments);
    expect(h.attachments.consume).toHaveBeenCalledWith(extras.attachments);
    expect(h.attachments.markSent.mock.invocationCallOrder[0]).toBeLessThan(h.attachments.consume.mock.invocationCallOrder[0]!);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Send now's channel answers once the agent read the message, not when the provider took it.
describe("send queued now channel", () => {
  it("validates the request, answers after the read, and passes stale and not_running through", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const owner = { kind: "doan" as const, provider: "codex" as const, connectionId: "c", accountId: "a", workspaceId: "o", profile: "p" };
      const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: "codex", configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, owner, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
      const steer = vi.fn(async () => {});
      const open = vi.fn<OpenRunner>(async () => ({ sessionId: "s1", send: vi.fn(async () => {}), steer, answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) }));
      const service = new ConversationService(new ConversationStore(dir), prepare, open, () => {});
      const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: [] }]);
      expect(conversationMethods).toContain("sendQueuedNow");
      const id = (await handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "codex", text: "x" }) as { conversationId: string }).conversationId;
      const queued = await handle(true, "queue", { conversationId: id, text: "y" }) as { itemId: string };
      for (const bad of [{ conversationId: id }, { conversationId: id, itemId: 1 }, { conversationId: id, itemId: "x".repeat(65) }, { conversationId: "../x", itemId: queued.itemId }])
        expect(await handle(true, "sendQueuedNow", bad)).toEqual({ error: "bad_request" });
      expect(await handle(false, "sendQueuedNow", { conversationId: id, itemId: queued.itemId })).toEqual({ error: "bad_request" });
      let answered: unknown = "pending";
      const sent = handle(true, "sendQueuedNow", { conversationId: id, itemId: queued.itemId }).then(value => { answered = value; });
      await vi.waitFor(() => expect(steer).toHaveBeenCalledOnce());
      expect(await handle(true, "sendQueuedNow", { conversationId: id, itemId: queued.itemId })).toEqual({ error: "stale" });
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(answered).toBe("pending");
      open.mock.calls[0]![0].steerConsumed!((steer.mock.calls[0] as unknown as string[])[2]!);
      await sent;
      expect(answered).toBeUndefined();
      const left = await handle(true, "queue", { conversationId: id, text: "z" }) as { itemId: string };
      service.receive(id, { type: "turn.done" });
      expect(await handle(true, "sendQueuedNow", { conversationId: id, itemId: left.itemId })).toEqual({ error: "not_running" });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
// ipc checks the shape and limits only; the runner holding the question checks the rest.
describe("answerQuestion", () => {
  function questions(result: "ok" | "stale" | "bad_request" = "ok") {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-")); const answerQuestion = vi.fn(() => result);
    const open = vi.fn(async (_input: Prepared) => ({ sessionId: "s1", send: vi.fn(async () => {}), answer: () => false, answerQuestion, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) }));
    const prepare = vi.fn<Prepare>(async () => ({ runtime: "claude" as const, configDir: "/profile", cwd: "/repo", command: "/fake", env: {} }));
    const service = new ConversationService(new ConversationStore(dir), prepare, open, () => {});
    const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: [{ path: ".doan/canvases/a.html" }] }]);
    return { dir, service, handle, answerQuestion };
  }
  const start = { root: "/repo", mode: "new", runtime: "claude", canvas: { path: ".doan/canvases/a.html" }, text: "hello" };
  it("is a conversation method main registers", () => {
    expect(conversationMethods).toContain("answerQuestion");
  });
  it("passes a well-formed answer or skip to the runner and maps its refusals", async () => {
    for (const result of ["ok", "stale", "bad_request"] as const) {
      const h = questions(result);
      try {
        const { conversationId } = await h.handle(true, "start", start) as { conversationId: string };
        const answered = { outcome: "answered", answers: { "0": { selected: [1] }, "1": { selected: [], other: "Green" } } };
        expect(await h.handle(true, "answerQuestion", { conversationId, requestId: "q1", ...answered })).toEqual(result === "ok" ? undefined : { error: result });
        expect(h.answerQuestion).toHaveBeenLastCalledWith("q1", answered);
        await h.handle(true, "answerQuestion", { conversationId, requestId: "q1", outcome: "skipped" });
        expect(h.answerQuestion).toHaveBeenLastCalledWith("q1", { outcome: "skipped" });
      } finally { rmSync(h.dir, { recursive: true, force: true }); }
    }
  });
  it.each([
    ["no request id", { outcome: "skipped", requestId: undefined }],
    ["a request id past 512", { outcome: "skipped", requestId: "r".repeat(513) }],
    ["an unknown outcome", { outcome: "expired" }],
    ["a skip with answers", { outcome: "skipped", answers: {} }],
    ["an answer without answers", { outcome: "answered" }],
    ["answers that are a list", { outcome: "answered", answers: [] }],
    ["five answers", { outcome: "answered", answers: Object.fromEntries([0, 1, 2, 3, 4].map(n => [String(n), { selected: [0] }])) }],
    ["a question id past 512", { outcome: "answered", answers: { ["q".repeat(513)]: { selected: [0] } } }],
    ["choices that are not a list", { outcome: "answered", answers: { "0": { selected: 0 } } }],
    ["nine choices", { outcome: "answered", answers: { "0": { selected: [0, 1, 2, 3, 4, 5, 6, 7, 8] } } }],
    ["a choice that is not an index", { outcome: "answered", answers: { "0": { selected: ["Red"] } } }],
    ["a negative choice", { outcome: "answered", answers: { "0": { selected: [-1] } } }],
    ["a choice past the options limit", { outcome: "answered", answers: { "0": { selected: [8] } } }],
    ["a fractional choice", { outcome: "answered", answers: { "0": { selected: [0.5] } } }],
    ["Other text that is not text", { outcome: "answered", answers: { "0": { selected: [], other: 3 } } }],
    ["Other text past 4,096", { outcome: "answered", answers: { "0": { selected: [], other: "x".repeat(4_097) } } }],
  ])("refuses %s before the runner sees it", async (_label, body) => {
    const h = questions();
    try {
      const { conversationId } = await h.handle(true, "start", start) as { conversationId: string };
      expect(await h.handle(true, "answerQuestion", { conversationId, requestId: "q1", ...body })).toEqual({ error: "bad_request" });
      expect(h.answerQuestion).not.toHaveBeenCalled();
    } finally { rmSync(h.dir, { recursive: true, force: true }); }
  });
  it("passes on only the answer's own fields", async () => {
    const h = questions();
    try {
      const { conversationId } = await h.handle(true, "start", start) as { conversationId: string };
      await h.handle(true, "answerQuestion", { conversationId, requestId: "q1", outcome: "answered", answers: { "0": { selected: [0], note: "n" } }, optionId: "allow" });
      expect(h.answerQuestion).toHaveBeenLastCalledWith("q1", { outcome: "answered", answers: { "0": { selected: [0] } } });
    } finally { rmSync(h.dir, { recursive: true, force: true }); }
  });
  it("accepts every limit exactly", async () => {
    const h = questions();
    try {
      const { conversationId } = await h.handle(true, "start", start) as { conversationId: string };
      const answers = Object.fromEntries([0, 1, 2, 3].map(n => [`${n}`.padEnd(512, "q"), { selected: [0, 1, 2, 3, 4, 5, 6, 7], other: "x".repeat(4_096) }]));
      expect(await h.handle(true, "answerQuestion", { conversationId, requestId: "r".repeat(512), outcome: "answered", answers })).toBeUndefined();
    } finally { rmSync(h.dir, { recursive: true, force: true }); }
  });
  it("refuses another window's request", async () => {
    const h = questions();
    try { expect(await h.handle(false, "answerQuestion", { conversationId: "00000000-0000-4000-8000-000000000000", requestId: "q1", outcome: "skipped" })).toEqual({ error: "bad_request" }); }
    finally { rmSync(h.dir, { recursive: true, force: true }); }
  });
});

// Fast only for doan-owned Claude and Codex conversations, judged by the turn's model in this run's list;
// the turn's effective Fast goes along like the default effort.
describe("fast", () => {
  const catalog = {
    accepts: vi.fn((_root: string, _runtime: string, model: string) => ["sonnet", "opus", "haiku"].includes(model)),
    fast: vi.fn((_root: string, runtime: string, model?: string) => (runtime === "claude" || runtime === "codex") && (model === undefined || model === "opus")),
  };
  const home = { models: catalog as unknown as ModelCatalog };
  const check = (request: Record<string, unknown>, provider: "claude" | "codex" | "cursor" | "copilot" | "antigravity" = "claude", owner: "doan" | "legacy-external" = "doan", stored: { model?: string } = {}) => {
    try { return validateSendExtras(request, "/repo", provider, owner, home, stored); } catch (error) { return { error: (error as Error).message }; }
  };
  it("accepts Fast on a doan Claude or Codex conversation when the judged model takes it, a Fast-only send included", () => {
    expect(check({ fast: true }, "claude", "doan", { model: "opus" })).toEqual({ fast: true, ids: [] });
    expect(check({ fast: true }, "codex", "doan", { model: "opus" })).toEqual({ fast: true, ids: [] });
    expect(catalog.fast).toHaveBeenLastCalledWith("/repo", "codex", "opus");
    // No stored model: the list's default row judges it.
    expect(check({ fast: true })).toEqual({ fast: true, ids: [] });
    expect(catalog.fast).toHaveBeenLastCalledWith("/repo", "claude", undefined);
    // The request's model judges it over the stored one.
    expect(check({ model: "opus", fast: true }, "claude", "doan", { model: "haiku" })).toEqual({ model: "opus", fast: true, ids: [] });
    expect(check({ model: "haiku", fast: true }, "claude", "doan", { model: "opus" })).toEqual({ error: "bad_request" });
    expect(check({ fast: true }, "claude", "doan", { model: "haiku" })).toEqual({ error: "bad_request" });
  });
  it("accepts turning Fast off without a list", () => {
    expect(check({ fast: false }, "claude", "doan", { model: "haiku" })).toEqual({ fast: false, ids: [] });
    expect(validateSendExtras({ fast: false }, "/repo", "codex", "doan", {})).toEqual({ fast: false, ids: [] });
  });
  it("refuses Fast on ACP providers, legacy external conversations and in any shape but a boolean", () => {
    for (const provider of ["cursor", "copilot", "antigravity"] as const) for (const fast of [true, false]) expect(check({ fast }, provider)).toEqual({ error: "bad_request" });
    for (const fast of [true, false]) expect(check({ fast }, "claude", "legacy-external")).toEqual({ error: "bad_request" });
    for (const fast of ["true", 1, null]) expect(check({ fast })).toEqual({ error: "bad_request" });
  });
});

describe("fast through the channels", () => {
  const FAST: ModelOption[] = [
    { id: "default", label: "Default", default: true, efforts: ["low", "high"], fast: {} },
    { id: "opus", label: "Opus", default: false, efforts: ["low", "high"], fast: { description: "Same model, faster output." } },
    { id: "haiku", label: "Haiku", default: false },
  ];
  function fixture(dir: string, list: ModelOption[] = FAST, runtime: "claude" | "codex" = "claude") {
    const owner = { kind: "doan" as const, provider: runtime, connectionId: "c", accountId: "a", workspaceId: "o", profile: "p" };
    const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime, configDir: "/profile", cwd: "/repo", command: "/fake", env: {}, owner, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
    const steer = vi.fn(async () => {}); let session = 0;
    const open = vi.fn<OpenRunner>(async () => ({ sessionId: `s${++session}`, send: vi.fn(async () => {}), steer, answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) }));
    const store = new ConversationStore(dir);
    const service = new ConversationService(store, prepare, open, () => {});
    const catalog = new ModelCatalog((root, r) => prepare({ root, mode: "new", runtime: r, text: "", anchors: [] }), async () => ({ models: list }));
    const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: [{ path: ".doan/canvases/a.html" }, { path: ".doan/canvases/b.html" }] }], { models: catalog });
    const start = vi.spyOn(service, "start");
    const send = vi.spyOn(service, "send").mockResolvedValue(undefined);
    const entry = (id: string, change: Record<string, unknown>) => store.save(store.list().map(m => m.conversationId === id ? { ...m, ...change } : m));
    const started = async () => (await handle(true, "start", { root: "/repo", mode: "newDesign", runtime, text: "x" }) as { conversationId: string }).conversationId;
    return { handle, service, store, start, send, entry, started, steer };
  }
  const listed = (h: ReturnType<typeof fixture>, runtime = "claude") => h.handle(true, "models", { root: "/repo", runtime });
  it("refuses Fast before this run read the list, and sends no Fast for the turn then", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = fixture(dir); const id = await h.started();
      expect(await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x", fast: true })).toEqual({ error: "bad_request" });
      expect(await h.handle(true, "send", { conversationId: id, text: "y", fast: true })).toEqual({ error: "bad_request" });
      // A stored Fast does not go out while nothing says the model takes it.
      h.entry(id, { fast: true, model: "opus" });
      expect(await h.handle(true, "send", { conversationId: id, text: "y" })).toBeUndefined();
      expect(h.send.mock.calls[0]![3]).toEqual({});
    } finally { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); }
  });
  it("judges a Fast-only send by the stored model, else the list's default row, and passes the turn's Fast", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = fixture(dir); const id = await h.started(); await listed(h);
      expect(await h.handle(true, "send", { conversationId: id, text: "y", fast: true })).toBeUndefined();
      expect(h.send.mock.calls[0]![3]).toEqual({ fast: true, fastTurn: true });
      h.entry(id, { model: "haiku" });
      expect(await h.handle(true, "send", { conversationId: id, text: "y", fast: true })).toEqual({ error: "bad_request" });
      h.entry(id, { model: "opus" });
      expect(await h.handle(true, "send", { conversationId: id, text: "y", fast: true })).toBeUndefined();
      expect(h.send.mock.calls[1]![3]).toEqual({ fast: true, fastTurn: true });
      expect(await h.handle(true, "send", { conversationId: id, text: "y", fast: false })).toBeUndefined();
      expect(h.send.mock.calls[2]![3]).toEqual({ fast: false });
    } finally { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); }
  });
  it("sends a stored Fast only on a model that takes it, and again once the conversation is back on one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = fixture(dir); const id = await h.started(); await listed(h);
      h.entry(id, { fast: true, model: "opus" });
      await h.handle(true, "send", { conversationId: id, text: "y" });
      expect(h.send.mock.calls[0]![3]).toEqual({ fastTurn: true });
      await h.handle(true, "send", { conversationId: id, text: "y", model: "haiku" });
      expect(h.send.mock.calls[1]![3]).toEqual({ model: "haiku" });
      h.entry(id, { model: "haiku" });
      await h.handle(true, "send", { conversationId: id, text: "y" });
      expect(h.send.mock.calls[2]![3]).toEqual({});
      await h.handle(true, "send", { conversationId: id, text: "y", model: "opus", effort: "high" });
      expect(h.send.mock.calls[3]![3]).toEqual({ model: "opus", effort: "high", fastTurn: true });
    } finally { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); }
  });
  it("sends no Fast for a model whose account cannot use it, and refuses turning it on there", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = fixture(dir, [{ id: "default", label: "Default", default: true, fast: { unavailable: "extra_usage" } }]); const id = await h.started(); await listed(h);
      expect(await h.handle(true, "send", { conversationId: id, text: "y", fast: true })).toEqual({ error: "bad_request" });
      h.entry(id, { fast: true });
      await h.handle(true, "send", { conversationId: id, text: "y" });
      expect(h.send.mock.calls[0]![3]).toEqual({});
    } finally { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); }
  });
  it("passes a start's Fast once the list says its model takes it, and refuses it for resume and ACP starts", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = fixture(dir); await listed(h);
      const canvas = { path: ".doan/canvases/a.html" };
      expect(await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x", model: "haiku", fast: true })).toEqual({ error: "bad_request" });
      for (const fast of [true, false]) {
        expect(await h.handle(true, "start", { root: "/repo", mode: "resume", canvas, text: "x", fast })).toEqual({ error: "bad_request" });
        expect(await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "cursor", text: "x", fast })).toEqual({ error: "bad_request" });
      }
      expect(h.start).not.toHaveBeenCalled();
      expect(await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text: "x", fast: true })).toHaveProperty("conversationId");
      expect(h.start.mock.calls[0]![0]).toMatchObject({ fast: true });
      expect(await h.handle(true, "start", { root: "/repo", mode: "new", canvas, runtime: "claude", text: "x", model: "opus", fast: true })).toHaveProperty("conversationId");
      expect(h.start.mock.calls[1]![0]).toMatchObject({ model: "opus", fast: true });
      expect(await h.handle(true, "start", { root: "/repo", mode: "new", canvas: { path: ".doan/canvases/b.html" }, runtime: "claude", text: "x", model: "haiku", fast: false })).toHaveProperty("conversationId");
      expect(h.start.mock.calls[2]![0]).toMatchObject({ model: "haiku", fast: false });
    } finally { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); }
  });
  it("refuses Fast on a legacy external send, a queued message and Send now", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const h = fixture(dir, FAST, "codex"); await listed(h, "codex");
      h.store.save([...h.store.list(), { conversationId: "legacy", root: "/repo", canvas: { path: ".doan/canvases/a.html" }, title: "t", state: "current", owner: { kind: "legacy-external" }, session: { runtime: "codex", origin: "resumed", sessionId: "s", configDir: "/c", cwd: "/repo" } }]);
      for (const fast of [true, false]) expect(await h.handle(true, "send", { conversationId: "legacy", text: "y", fast })).toEqual({ error: "bad_request" });
      h.send.mockRestore();
      const id = await h.started();
      const queued = await h.handle(true, "queue", { conversationId: id, text: "q" }) as { itemId: string };
      expect(queued).toHaveProperty("itemId");
      for (const fast of [true, false]) {
        expect(await h.handle(true, "queue", { conversationId: id, text: "q", fast })).toEqual({ error: "bad_request" });
        expect(await h.handle(true, "sendQueuedNow", { conversationId: id, itemId: queued.itemId, fast })).toEqual({ error: "bad_request" });
      }
      expect(h.steer).not.toHaveBeenCalled();
    } finally { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); }
  });
});

// The renderer reads Fast from the models reply and the list, never a provider's tier id.
describe("fast in the replies", () => {
  it("carries Fast rows without a tier id in the models reply and the stored Fast in the list", async () => {
    const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
    try {
      const rows = parseCodexModels({ data: [
        { id: "gpt-6-luna", displayName: "GPT-6-Luna", isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: "low" }], serviceTiers: [{ id: "priority", name: "Fast", description: "2x speed, increased usage" }] },
        { id: "gpt-6-sol", displayName: "GPT-6-Sol", isDefault: false, serviceTiers: [] },
      ] });
      const h = home(dir, rows);
      const reply = await h.handle(true, "models", { root: "/repo", runtime: "codex" }) as { models: ModelOption[] };
      expect(reply.models.map(m => m.fast)).toEqual([{ description: "2x speed, increased usage" }, undefined]);
      expect(JSON.stringify(reply)).not.toContain("priority");
      const id = (await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "codex", text: "x", fast: true }) as { conversationId: string }).conversationId;
      expect(await h.handle(true, "list", { root: "/repo" })).toEqual([expect.objectContaining({ conversationId: id, fast: true })]);
    } finally { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); }
  });
});
