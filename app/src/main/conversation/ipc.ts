import { promptSentence } from "../../firstPrompt/promptSentence";
import { anchorTokens, LIMITS, validAnchor } from "./prompt";
import { object } from "./sessions";
import { validCanvas, validId } from "./store";
import { validProvider } from "../agentAuth/types";
import type { ConversationService, Prepare, StartRequest } from "./service";
import type { Anchor, Canvas } from "./types";
export const conversationMethods = ["resumeTarget", "forCanvas", "start", "send", "interrupt", "answerPermission", "read"] as const;
export type ConversationMethod = typeof conversationMethods[number];
export interface ConversationError { error: string }
interface Project { path: string; kind: string; canvases?: Canvas[] }
function message(raw: Record<string, unknown>): { text: string; anchors: Anchor[] } | null {
  if (typeof raw.text !== "string" || !raw.text.trim() || raw.text.length > LIMITS.text) return null;
  const anchors: unknown[] = raw.anchors === undefined ? [] : Array.isArray(raw.anchors) ? [...raw.anchors] : [undefined];
  if (!anchors.every(validAnchor) || anchorTokens(raw.text, anchors) === null) return null;
  return { text: raw.text, anchors };
}
export function conversationHandler(service: ConversationService, prepare: Prepare, projects: () => Project[]) {
  return async (allowed: boolean, method: ConversationMethod, raw: unknown): Promise<unknown> => {
    if (!allowed || !object(raw)) return { error: "bad_request" };
    try {
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
        if (mode === "newDesign") {
          if (typeof raw.subject !== "string") throw new Error("bad_request");
          const sentence = promptSentence(raw.root, raw.subject); if (typeof sentence !== "string") throw new Error("bad_request");
          request.subject = raw.subject; request.text = sentence;
        }
        return await service.start(request);
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
      return { error: code === "outside_root" ? "session_unavailable" : known.includes(code) ? code : "unknown" };
    }
  };
}
