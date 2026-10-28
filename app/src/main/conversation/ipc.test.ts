import { expect, it, vi } from "vitest";
import { conversationHandler } from "./ipc";
import { ConversationService } from "./service";
import { ConversationStore } from "./store";
import { mkdtempSync, rmSync } from "node:fs";
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
