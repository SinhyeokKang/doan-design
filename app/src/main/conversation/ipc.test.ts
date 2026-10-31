import { describe, expect, it, vi } from "vitest";
import { conversationHandler, validateSendExtras } from "./ipc";
import { ConversationService, type Prepare } from "./service";
import { ModelCatalog, type ModelOption } from "./models";
import { AttachmentStore } from "../attachments";
import { ConversationStore } from "./store";
import { mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
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

function home(dir: string, models?: ModelOption[]) {
  let session = 0;
  const open = vi.fn(async () => ({ sessionId: `s${++session}`, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) }));
  const prepare = vi.fn<Prepare>(async request => ({ runtime: request.runtime ?? "claude", configDir: "/profile", cwd: "/repo", command: "/fake", env: {} }));
  const service = new ConversationService(new ConversationStore(dir), prepare, open, () => {});
  const start = vi.spyOn(service, "start");
  const catalog = new ModelCatalog((root, runtime) => prepare({ root, mode: "new", runtime, text: "", anchors: [] }), async () => models ?? []);
  const attachments = { resolve: vi.fn(), markSent: vi.fn(), consume: vi.fn() };
  const handle = conversationHandler(service, prepare, () => [{ path: "/repo", kind: "list", canvases: [] }], { models: catalog, attachments: attachments as unknown as AttachmentStore });
  return { handle, start, prepare, catalog, attachments };
}
const MODELS: ModelOption[] = [{ id: "sonnet", label: "Sonnet", default: true, efforts: ["low", "high"] }, { id: "haiku", label: "Haiku", default: false }];
it("keeps FirstPrompt's subject path and takes Home's multi-line text as is", async () => {
  const dir = mkdtempSync(join(tmpdir(), "doan-ipc-"));
  try {
    const h = home(dir);
    await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", subject: "a pricing page", text: "a pricing page" });
    expect(h.start.mock.calls[0]![0]).toMatchObject({ mode: "newDesign", subject: "a pricing page", text: "Use the doan skill to make a design canvas in /repo for a pricing page." });
    const text = "Make a pricing page\n\n- three tiers\n- dark header";
    expect(await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", text })).toHaveProperty("conversationId");
    expect(h.start.mock.calls[1]![0]).toMatchObject({ mode: "newDesign", text });
    expect(h.start.mock.calls[1]![0]).not.toHaveProperty("subject");
    for (const bad of [{ text: "   \n" }, {}, { subject: "line\nbreak", text: "x" }, { text: "x", canvas: { path: ".doan/canvases/a.html" } }, { text: "x".repeat(32_769) }, { text: "{{1}}" }])
      expect(await h.handle(true, "start", { root: "/repo", mode: "newDesign", runtime: "claude", ...bad })).toEqual({ error: "bad_request" });
    expect(await h.handle(true, "start", { root: "/repo", mode: "newDesign", text: "x" })).toEqual({ error: "no_agent" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
  it("refuses any of the three on a legacy external conversation", () => {
    for (const extra of [{ model: "sonnet" }, { effort: "high" }, { attachments: [{ id: "a" }] }]) expect(check(extra, "legacy-external")).toEqual({ error: "bad_request" });
    expect(check({ text: "x" }, "legacy-external")).toEqual({ ids: [] });
  });
});
