import { anchorTokens, LIMITS, validAnchor } from "./prompt";
import { object } from "./sessions";
import { validCanvas, validId } from "./store";
import { validProvider, type Provider } from "../agentAuth/types";
import { permissionModeId, type PermissionModeId } from "./permissionMode";
import type { ConversationService, Prepare, QueueFiles, StartAttachments, StartRequest } from "./service";
import type { ModelCatalog } from "./models";
import type { AttachmentStore } from "../attachments";
import type { Anchor, AttachmentRecord, Canvas } from "./types";
export const conversationMethods = ["resumeTarget", "forCanvas", "start", "send", "interrupt", "answerPermission", "read", "models", "list", "markSeen", "queue", "removeQueued", "takeDraft"] as const;
export type ConversationMethod = typeof conversationMethods[number];
// attachment_missing names the attachments that were moved, deleted or forgotten since they were added.
export interface ConversationError { error: string; missing?: string[] }
interface Project { path: string; kind: string; canvases?: Canvas[] }
function message(raw: Record<string, unknown>): { text: string; anchors: Anchor[] } | null {
  if (typeof raw.text !== "string" || !raw.text.trim() || raw.text.length > LIMITS.text) return null;
  const anchors: unknown[] = raw.anchors === undefined ? [] : Array.isArray(raw.anchors) ? [...raw.anchors] : [undefined];
  if (!anchors.every(validAnchor) || anchorTokens(raw.text, anchors) === null) return null;
  return { text: raw.text, anchors };
}
function choice(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 512 && !value.includes("\0"); }
// ids: the attachment ids as sent, for the recheck, the sent marker and consume; attachments: their records now.
export interface SendExtras { model?: string; effort?: string; permissionMode?: PermissionModeId; ids: unknown[]; attachments?: AttachmentRecord[] }
// The model, effort, permission mode and attachments a start or send may carry. The provider is the conversation's and
// never changes; a legacy external conversation runs on the person's own CLI profile, so it takes none of them. A mode
// is one of the common ids, whatever the renderer offered (an unmapped ACP mode sets nothing in the runner).
export function validateSendExtras(request: Record<string, unknown>, root: string, provider: Provider, owner: "doan" | "legacy-external", home: { models?: Pick<ModelCatalog, "accepts">; attachments?: Pick<AttachmentStore, "resolve"> }): SendExtras {
  if (request.runtime !== undefined || request.provider !== undefined) throw new Error("bad_request");
  const extras: SendExtras = { ids: [] };
  if (owner === "legacy-external") {
    if (request.model !== undefined || request.effort !== undefined || request.permissionMode !== undefined || request.attachments !== undefined) throw new Error("bad_request");
    return extras;
  }
  if (request.permissionMode !== undefined) {
    if (!permissionModeId(request.permissionMode)) throw new Error("bad_request");
    extras.permissionMode = request.permissionMode;
  }
  if (request.model !== undefined || request.effort !== undefined) {
    // Only a model, and an effort of that model, from the list this run delivered for this folder and provider.
    if (!choice(request.model) || (request.effort !== undefined && !choice(request.effort)) || !home.models?.accepts(root, provider, request.model, request.effort)) throw new Error("bad_request");
    extras.model = request.model; if (request.effort !== undefined) extras.effort = request.effort;
  }
  if (request.attachments !== undefined) {
    if (!home.attachments || !Array.isArray(request.attachments)) throw new Error("bad_request");
    extras.ids = [...request.attachments];
    const resolved = home.attachments.resolve(extras.ids);
    if (!resolved.ok) throw resolved.error === "attachment_missing" ? Object.assign(new Error(resolved.error), { missing: resolved.missing }) : new Error("bad_request");
    if (resolved.records.length) extras.attachments = resolved.records;
  }
  return extras;
}
// The start or send recheck right before acceptance, on the same ids, and the sent marker just before the commit.
function attachedHooks(store: AttachmentStore, ids: unknown[]): StartAttachments {
  return {
    recheck: () => {
      const fresh = store.resolve(ids);
      if (fresh.ok) return fresh.records;
      throw Object.assign(new Error(fresh.error), fresh.error === "attachment_missing" ? { missing: fresh.missing } : {});
    },
    sent: () => store.markSent(ids),
  };
}
// The queue's hold on its attachments: at queue time main marks them sent (a paste survives a restart in drafts.json)
// and consumes them, so the renderer's chip removal no longer touches them; the queued send checks them again.
export function queueFiles(store: AttachmentStore): QueueFiles {
  return {
    reclaim: ids => {
      const back = store.recheck({ ids });
      const missing = back === null ? ids : back.filter(result => !result.ok).map(result => result.id);
      if (missing.length) throw Object.assign(new Error("attachment_missing"), { missing });
      return attachedHooks(store, ids.map(id => ({ id })));
    },
    consume: ids => store.consume(ids.map(id => ({ id }))),
    discard: ids => store.discard(ids),
    release: ids => { store.release({ ids }); },
  };
}
export function conversationHandler(service: ConversationService, prepare: Prepare, projects: () => Project[], home: { models?: ModelCatalog; attachments?: AttachmentStore } = {}) {
  return async (allowed: boolean, method: ConversationMethod, raw: unknown): Promise<unknown> => {
    if (!allowed || !object(raw)) return { error: "bad_request" };
    try {
      if (method === "list") {
        if (typeof raw.root !== "string" || raw.root.length > LIMITS.path) throw new Error("bad_request");
        if (!projects().some(p => p.path === raw.root)) throw new Error("project_not_open");
        return service.list(raw.root);
      }
      if (method === "models") {
        if (typeof raw.root !== "string" || raw.root.length > LIMITS.path || !validProvider(raw.runtime) || !home.models) throw new Error("bad_request");
        if (!projects().some(p => p.path === raw.root)) throw new Error("project_not_open");
        return await home.models.models(raw.root, raw.runtime);
      }
      if (["start", "resumeTarget", "forCanvas"].includes(method)) {
        if (typeof raw.root !== "string" || raw.root.length > LIMITS.path) throw new Error("bad_request");
        const project = projects().find(p => p.path === raw.root); if (!project) throw new Error("project_not_open");
        const canvas = raw.canvas;
        if (!(method === "start" && raw.mode === "newDesign")) {
          if (!validCanvas(canvas)) throw new Error("bad_request");
          if (!project.canvases?.some(c => c.path === canvas.path && c.id === canvas.id)) throw new Error("canvas_not_found");
        } else if (canvas !== undefined) throw new Error("bad_request");
        if (method === "forCanvas" && validCanvas(canvas)) return service.forCanvas(raw.root, canvas);
        const input = message(raw);
        if (method === "resumeTarget") {
          try { const ready = await prepare({ root: raw.root, mode: "resume", ...(validCanvas(canvas) ? { canvas } : {}), text: "", anchors: [] }); return { available: true, runtime: ready.runtime, lastCheckAt: ready.lastCheckAt ?? "" }; }
          catch (error) { const reason = error instanceof Error ? error.message : "session_unavailable"; return { available: false, reason: reason === "no_session" ? "no_record" : ["cli_missing", "outside_root", "session_unavailable", "session_in_use"].includes(reason) ? reason : "session_unavailable" }; }
        }
        if (!input || !["resume", "new", "newDesign"].includes(String(raw.mode))) throw new Error("bad_request");
        if (raw.runtime !== undefined && !validProvider(raw.runtime)) throw new Error("bad_request");
        if (raw.mode !== "resume" && !raw.runtime) throw new Error("no_agent");
        const mode = raw.mode; if (mode !== "resume" && mode !== "new" && mode !== "newDesign") throw new Error("bad_request");
        const request: StartRequest = { root: raw.root, mode, ...input, ...(validCanvas(canvas) ? { canvas } : {}), ...(validProvider(raw.runtime) ? { runtime: raw.runtime } : {}) };
        let attachments: unknown[] = [];
        if (raw.subject !== undefined) throw new Error("bad_request");
        if (mode === "newDesign" || mode === "new") {
          if (!request.runtime) throw new Error("no_agent");
          const extras = validateSendExtras({ model: raw.model, effort: raw.effort, permissionMode: raw.permissionMode, attachments: raw.attachments }, raw.root, request.runtime, "doan", home);
          if (extras.model !== undefined) request.model = extras.model;
          if (extras.effort !== undefined) request.effort = extras.effort;
          if (extras.permissionMode !== undefined) request.permissionMode = extras.permissionMode;
          if (extras.attachments) request.attachments = extras.attachments;
          attachments = extras.ids;
        } else if (raw.model !== undefined || raw.effort !== undefined || raw.permissionMode !== undefined || raw.attachments !== undefined) throw new Error("bad_request");
        const store = home.attachments;
        const started = await service.start(request, store && attachments.length ? attachedHooks(store, attachments) : undefined);
        store?.consume(attachments);
        return started;
      }
      if (!validId(raw.conversationId)) throw new Error("bad_request");
      switch (method) {
        case "read": return service.read(raw.conversationId);
        case "interrupt": await service.interrupt(raw.conversationId); return undefined;
        case "send": {
          const input = message(raw); if (!input) throw new Error("bad_request");
          const target = service.sendTarget(raw.conversationId);
          const extras = validateSendExtras(raw, target.root, target.provider, target.owner, home), store = home.attachments;
          // The turn's model without an effort still names the model's default level (models.ts defaultEffort).
          const model = extras.model ?? target.model, effort = extras.model !== undefined ? extras.effort : target.effort;
          const defaultEffort = model !== undefined && effort === undefined ? home.models?.defaultEffort(target.root, target.provider, model) : undefined;
          await service.send(raw.conversationId, input.text, input.anchors, { ...(extras.model !== undefined ? { model: extras.model } : {}), ...(extras.effort !== undefined ? { effort: extras.effort } : {}), ...(extras.permissionMode !== undefined ? { permissionMode: extras.permissionMode } : {}), ...(extras.attachments ? { attachments: extras.attachments } : {}), ...(defaultEffort ? { defaultEffort } : {}) },
            store && extras.ids.length ? attachedHooks(store, extras.ids) : undefined);
          store?.consume(extras.ids);
          return undefined;
        }
        case "queue": {
          // Text, anchors, attachments and the picker's permission mode: the turn the queue goes out in keeps the
          // conversation's model and effort, and takes its last message's mode.
          const input = message(raw); if (!input || raw.model !== undefined || raw.effort !== undefined) throw new Error("bad_request");
          const target = service.sendTarget(raw.conversationId);
          const extras = validateSendExtras(raw, target.root, target.provider, target.owner, home), store = home.attachments;
          const ids = extras.ids.map(item => (item as { id: string }).id);
          // The marker that keeps a paste through a restart can fail; it is written before the item is accepted, so a refusal
          // leaves nothing queued and the files with the renderer. Nothing after the acceptance can fail.
          if (store && ids.length) store.markSent(extras.ids);
          const queued = service.queue(raw.conversationId, { ...input, ...(extras.attachments ? { attachments: extras.attachments } : {}), ...(ids.length ? { ids } : {}), ...(extras.permissionMode !== undefined ? { permissionMode: extras.permissionMode } : {}) });
          if (store && ids.length) store.consume(extras.ids);
          return queued;
        }
        case "removeQueued":
          if (typeof raw.itemId !== "string" || raw.itemId.length > 64) throw new Error("bad_request");
          service.removeQueued(raw.conversationId, raw.itemId); return undefined;
        case "takeDraft": return service.takeDraft(raw.conversationId);
        case "markSeen":
          if (typeof raw.seq !== "number" || !Number.isSafeInteger(raw.seq) || raw.seq < 0) throw new Error("bad_request");
          service.markSeen(raw.conversationId, raw.seq); return undefined;
        case "answerPermission": if (typeof raw.requestId !== "string" || raw.requestId.length > 512 || typeof raw.optionId !== "string" || raw.optionId.length > 512) throw new Error("bad_request"); service.answer(raw.conversationId, raw.requestId, raw.optionId); return undefined;
      }
      throw new Error("bad_request");
    } catch (error) {
      const known = ["bad_request", "project_not_open", "canvas_not_found", "no_agent", "cli_missing", "cli_install_failed", "credential_override", "no_session", "session_unavailable", "runtime_unsupported", "session_in_use", "busy", "not_logged_in", "process_exited", "rate_limited", "unknown", "not_found", "stale", "project_busy", "not_running", "queue_limit"];
      const code = error instanceof Error ? error.message : "unknown";
      if (code === "attachment_missing" && error instanceof Error && "missing" in error && Array.isArray(error.missing)) return { error: code, missing: error.missing };
      return { error: code === "outside_root" ? "session_unavailable" : known.includes(code) ? code : "unknown" };
    }
  };
}
