import { promptSentence } from "../../firstPrompt/promptSentence";
import { anchorTokens, LIMITS, validAnchor } from "./prompt";
import { object } from "./sessions";
import { validCanvas, validId } from "./store";
import { validProvider } from "../agentAuth/types";
import type { ConversationService, Prepare, StartRequest } from "./service";
import type { ModelCatalog } from "./models";
import type { AttachmentStore } from "../attachments";
import type { Anchor, Canvas } from "./types";
export const conversationMethods = ["resumeTarget", "forCanvas", "start", "send", "interrupt", "answerPermission", "read", "models"] as const;
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
export function conversationHandler(service: ConversationService, prepare: Prepare, projects: () => Project[], home: { models?: ModelCatalog; attachments?: AttachmentStore } = {}) {
  return async (allowed: boolean, method: ConversationMethod, raw: unknown): Promise<unknown> => {
    if (!allowed || !object(raw)) return { error: "bad_request" };
    try {
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
        if (mode === "newDesign") {
          // FirstPrompt sends a one-line subject that main turns into its sentence; Home sends its own text as is.
          if (raw.subject !== undefined) {
            if (typeof raw.subject !== "string") throw new Error("bad_request");
            const sentence = promptSentence(raw.root, raw.subject); if (typeof sentence !== "string") throw new Error("bad_request");
            request.subject = raw.subject; request.text = sentence;
          }
          if (raw.model !== undefined || raw.effort !== undefined) {
            // Only a model, and an effort of that model, from the list this run delivered for this folder and provider.
            if (!choice(raw.model) || (raw.effort !== undefined && !choice(raw.effort)) || !request.runtime ||
                !home.models?.accepts(raw.root, request.runtime, raw.model, raw.effort)) throw new Error("bad_request");
            request.model = raw.model; if (raw.effort !== undefined) request.effort = raw.effort;
          }
          if (raw.attachments !== undefined) {
            if (!home.attachments || !Array.isArray(raw.attachments)) throw new Error("bad_request");
            attachments = [...raw.attachments];
            const resolved = home.attachments.resolve(attachments);
            if (!resolved.ok) return resolved.error === "attachment_missing" ? { error: resolved.error, missing: resolved.missing } : { error: "bad_request" };
            if (resolved.records.length) request.attachments = resolved.records;
          }
        } else if (raw.model !== undefined || raw.effort !== undefined || raw.attachments !== undefined) throw new Error("bad_request");
        const store = home.attachments;
        const started = await service.start(request, store && attachments.length ? {
          recheck: () => {
            const fresh = store.resolve(attachments);
            if (fresh.ok) return fresh.records;
            throw Object.assign(new Error(fresh.error), fresh.error === "attachment_missing" ? { missing: fresh.missing } : {});
          },
          sent: () => store.markSent(attachments),
        } : undefined);
        store?.consume(attachments);
        return started;
      }
      if (!validId(raw.conversationId)) throw new Error("bad_request");
      switch (method) {
        case "read": return service.read(raw.conversationId);
        case "interrupt": await service.interrupt(raw.conversationId); return undefined;
        case "send": { const input = message(raw); if (!input) throw new Error("bad_request"); await service.send(raw.conversationId, input.text, input.anchors); return undefined; }
        case "answerPermission": if (typeof raw.requestId !== "string" || raw.requestId.length > 512 || typeof raw.optionId !== "string" || raw.optionId.length > 512) throw new Error("bad_request"); service.answer(raw.conversationId, raw.requestId, raw.optionId); return undefined;
      }
      throw new Error("bad_request");
    } catch (error) {
      const known = ["bad_request", "project_not_open", "canvas_not_found", "no_agent", "cli_missing", "cli_install_failed", "credential_override", "no_session", "session_unavailable", "runtime_unsupported", "session_in_use", "busy", "not_logged_in", "process_exited", "rate_limited", "unknown", "not_found", "stale"];
      const code = error instanceof Error ? error.message : "unknown";
      if (code === "attachment_missing" && error instanceof Error && "missing" in error && Array.isArray(error.missing)) return { error: code, missing: error.missing };
      return { error: code === "outside_root" ? "session_unavailable" : known.includes(code) ? code : "unknown" };
    }
  };
}
