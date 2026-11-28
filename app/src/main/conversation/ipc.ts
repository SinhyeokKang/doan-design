import { anchorTokens, LIMITS, validAnchor } from "./prompt";
import { sendCanvasAnchors } from "./canvasAnchors";
import { object } from "./sessions";
import { validCanvas, validId } from "./store";
import { validProvider, type Provider } from "../agentAuth/types";
import { permissionModeId, type PermissionModeId } from "./permissionMode";
import type { ConversationService, Prepare, QueueFiles, StartAttachments, StartRequest } from "./service";
import type { ConversationSummary } from "./summary";
import type { ModelCatalog } from "./models";
import type { SkillCatalog } from "./skills";
import { validMetadata, type AttachmentStore } from "../attachments";
import { QUESTION_LIMITS, type QuestionAnswerInput } from "./question";
import type { Anchor, AttachmentRecord, Canvas } from "./types";
export const conversationMethods = ["resumeTarget", "start", "send", "interrupt", "answerPermission", "answerQuestion", "read", "models", "skills", "list", "markSeen", "queue", "removeQueued", "sendQueuedNow", "takeDraft", "takeStartDraft", "setPermissionMode", "delete", "scheduled"] as const;
export type ConversationMethod = typeof conversationMethods[number];
// attachment_missing: missing names attachments moved, deleted or forgotten since added; replaced, those now folders
// leading elsewhere. resetsAt (ISO): with rate_limited, when the Doan connection's usage limit resets, if known.
export interface ConversationError { error: string; missing?: string[]; replaced?: string[]; resetsAt?: string }
// A send main took while its conversation's usage limit holds: the message waits as a queued item for the limit's reset
// at `at` (ISO) and goes out shortly after it.
export interface ScheduledSend { scheduled: { itemId: string; at: string } }
interface Project { path: string; kind: string; canvases?: Canvas[] }
function message(raw: Record<string, unknown>): { text: string; anchors: Anchor[] } | null {
  if (typeof raw.text !== "string" || !raw.text.trim() || raw.text.length > LIMITS.text) return null;
  const anchors: unknown[] = raw.anchors === undefined ? [] : Array.isArray(raw.anchors) ? [...raw.anchors] : [undefined];
  if (!anchors.every(validAnchor) || anchorTokens(raw.text, anchors) === null) return null;
  return { text: raw.text, anchors };
}
// Canvas anchors checked against root's list now; a root that is no list lists none. Queued and scheduled messages are
// checked when they go out instead (service.ts flush), since the agent may be rewriting the canvas when they are queued.
function listedMessage(input: { text: string; anchors: Anchor[] }, projects: () => Project[], root: string): { text: string; anchors: Anchor[] } {
  return sendCanvasAnchors(input.text, input.anchors, projects().find(p => p.path === root)?.canvases ?? []);
}
// The shape and limits of an answer only; whether it fits its question is the runner's check (questionAnswer).
// Only the answer's own fields go on.
function questionInput(raw: Record<string, unknown>): QuestionAnswerInput | null {
  const L = QUESTION_LIMITS;
  if (raw.outcome === "skipped") return raw.answers === undefined ? { outcome: "skipped" } : null;
  if (raw.outcome !== "answered" || !object(raw.answers) || Object.keys(raw.answers).length > L.questions) return null;
  const answers: NonNullable<QuestionAnswerInput["answers"]> = {};
  for (const [id, value] of Object.entries(raw.answers)) {
    if (!id || id.length > L.label || !object(value) || !Array.isArray(value.selected) || value.selected.length > L.options) return null;
    const selected: unknown[] = [...value.selected];
    if (!selected.every(n => Number.isInteger(n) && (n as number) >= 0 && (n as number) < L.options)) return null;
    if (value.other !== undefined && (typeof value.other !== "string" || value.other.length > L.text)) return null;
    answers[id] = { selected: selected as number[], ...(value.other !== undefined ? { other: value.other } : {}) };
  }
  return { outcome: "answered", answers };
}
function choice(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 512 && !value.includes("\0"); }
// ids: the attachment ids as sent, for the recheck, the sent marker and consume; attachments: their records now.
// fast: the person's Fast choice, stored with the conversation; whether a turn runs with it is judged apart (the send's fastTurn).
export interface SendExtras { model?: string; effort?: string; fast?: boolean; permissionMode?: PermissionModeId; ids: unknown[]; attachments?: AttachmentRecord[] }
// The model, effort, Fast, permission mode and attachments a start or send may carry. The provider is the conversation's
// and never changes; a legacy external conversation runs on the person's own CLI profile, so it takes none of them. A
// mode is one of the common ids, whatever the renderer offered (the ACP runner sets Default for a mode the provider cannot take).
// Fast only for Claude and Codex, whose lists say which models take it; turning it on needs this run's list to say the
// judged model takes it: the request's model, else the stored one, else the list's default row.
export function validateSendExtras(request: Record<string, unknown>, root: string, provider: Provider, owner: "doan" | "legacy-external", home: { models?: Pick<ModelCatalog, "accepts" | "fast">; attachments?: Pick<AttachmentStore, "resolve"> }, stored: { model?: string } = {}): SendExtras {
  if (request.runtime !== undefined || request.provider !== undefined) throw new Error("bad_request");
  const extras: SendExtras = { ids: [] };
  if (owner === "legacy-external") {
    if (request.model !== undefined || request.effort !== undefined || request.fast !== undefined || request.permissionMode !== undefined || request.attachments !== undefined) throw new Error("bad_request");
    return extras;
  }
  if (request.fast !== undefined) {
    if (typeof request.fast !== "boolean" || (provider !== "claude" && provider !== "codex")) throw new Error("bad_request");
    const judged = choice(request.model) ? request.model : stored.model;
    if (request.fast && !home.models?.fast(root, provider, judged)) throw new Error("bad_request");
    extras.fast = request.fast;
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
    if (!resolved.ok) throw resolved.error === "attachment_missing" ? missingError(resolved.missing, resolved.replaced) : new Error("bad_request");
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
      throw fresh.error === "attachment_missing" ? missingError(fresh.missing, fresh.replaced) : new Error(fresh.error);
    },
    sent: () => store.markSent(ids),
  };
}
function missingError(missing: string[], replaced: string[] | undefined): Error {
  return Object.assign(new Error("attachment_missing"), { missing, ...(replaced?.length ? { replaced } : {}) });
}
// The queue's hold on its attachments: at queue time main marks them sent (a paste survives a restart in drafts.json)
// and consumes them, so the renderer's chip removal no longer touches them; the queued send checks them again.
export function queueFiles(store: AttachmentStore): QueueFiles {
  return {
    reclaim: ids => {
      const back = store.recheck({ ids });
      const missing = back === null ? ids : back.filter(result => !result.ok).map(result => result.id);
      const replaced = (back ?? []).filter(result => !result.ok && result.error === "replaced").map(result => result.id);
      if (missing.length) throw missingError(missing, replaced);
      return attachedHooks(store, ids.map(id => ({ id })));
    },
    consume: ids => store.consume(ids.map(id => ({ id }))),
    discard: ids => store.discard(ids),
    release: ids => { store.release({ ids }); },
    // As Edit and resend's attachments:fromPaths, then held as a queued message's. Each must still be the kind it was sent
    // as (ARCHITECTURE §7 'Attachments'); any refusal refuses the whole message and releases every issued id.
    reissue: records => {
      // Display metadata from disk must not prevent a readable attachment from being reissued.
      const metadata = records.map(({ lines, excerpt }) => {
        const meta = { lines, excerpt }; return validMetadata(meta) ? meta : {};
      });
      const results = store.fromPaths({ paths: records.map(record => record.path), metadata });
      const ids = (results ?? []).flatMap(result => result.ok ? [result.attachment.id] : []);
      const same = !!results && results.length === records.length && results.every((result, i) => result.ok && result.attachment.kind === records[i]!.kind);
      if (!same) { for (const id of ids) store.remove({ id }); return null; }
      store.consume(ids.map(id => ({ id })));
      return ids;
    },
  };
}
const CODE_SHAPED = /^[a-z][a-z_]{0,63}$/;
// A refused start's cause for the log: a Doan code as it is, otherwise the error's name and the SDK's error class.
function startCause(error: unknown, code: string): string {
  if (CODE_SHAPED.test(code)) return code;
  const name = error instanceof Error && /^[A-Za-z]{1,64}$/.test(error.name) ? error.name : "unknown";
  const sdkClass = object(error) && typeof error.errorClass === "string" && CODE_SHAPED.test(error.errorClass) ? `, ${error.errorClass}` : "";
  return `${name}${sdkClass}`;
}
// allowed: the caller judged the sender (the main window, or the prototype window within the playing canvas's scope).
// rows: what a sender may see of the root's list; the prototype window sees the playing canvas's conversations only.
export function conversationHandler(service: ConversationService, prepare: Prepare, projects: () => Project[], home: { models?: ModelCatalog; skills?: SkillCatalog; attachments?: AttachmentStore } = {}) {
  return async (allowed: boolean, method: ConversationMethod, raw: unknown, rows?: (all: ConversationSummary[]) => ConversationSummary[]): Promise<unknown> => {
    if (!allowed || !object(raw)) return { error: "bad_request" };
    try {
      if (method === "list") {
        if (typeof raw.root !== "string" || raw.root.length > LIMITS.path) throw new Error("bad_request");
        if (!projects().some(p => p.path === raw.root)) throw new Error("project_not_open");
        const all = service.list(raw.root);
        return rows ? rows(all) : all;
      }
      if (method === "models") {
        if (typeof raw.root !== "string" || raw.root.length > LIMITS.path || !validProvider(raw.runtime) || !home.models) throw new Error("bad_request");
        if (!projects().some(p => p.path === raw.root)) throw new Error("project_not_open");
        return await home.models.models(raw.root, raw.runtime);
      }
      // The model list's checks: a provider process opens only for an open project. conversationId: an ACP conversation
      // whose session pushed its own command list (service acpCommands); Claude and Codex list theirs with the folder's.
      if (method === "skills") {
        if (typeof raw.root !== "string" || raw.root.length > LIMITS.path || !validProvider(raw.provider) || !home.skills || (raw.conversationId !== undefined && !validId(raw.conversationId))) throw new Error("bad_request");
        if (!projects().some(p => p.path === raw.root)) throw new Error("project_not_open");
        const listed = await home.skills.skills(raw.root, raw.provider);
        // passthrough: the server's unconfirmed commands, sent as written but shown in no row.
        return raw.conversationId === undefined ? listed : { skills: [...listed.skills, ...service.acpCommands(raw.conversationId, raw.root, raw.provider)], passthrough: service.acpPassthrough(raw.conversationId, raw.root, raw.provider) };
      }
      // A new conversation's composer of root (on canvas) takes the first message a quit stopped in an earlier run.
      if (method === "takeStartDraft") {
        if (typeof raw.root !== "string" || raw.root.length > LIMITS.path || (raw.canvas !== undefined && !validCanvas(raw.canvas))) throw new Error("bad_request");
        if (!projects().some(p => p.path === raw.root)) throw new Error("project_not_open");
        return service.takeStartDraft(raw.root, raw.canvas);
      }
      if (["start", "resumeTarget"].includes(method)) {
        if (typeof raw.root !== "string" || raw.root.length > LIMITS.path) throw new Error("bad_request");
        const project = projects().find(p => p.path === raw.root); if (!project) throw new Error("project_not_open");
        const canvas = raw.canvas;
        if (!(method === "start" && raw.mode === "newDesign")) {
          if (!validCanvas(canvas)) throw new Error("bad_request");
          if (!project.canvases?.some(c => c.path === canvas.path && c.id === canvas.id)) throw new Error("canvas_not_found");
        } else if (canvas !== undefined) throw new Error("bad_request");
        const input = message(raw);
        if (method === "resumeTarget") {
          // One session is one conversation: a session a conversation already holds is offered as none to continue,
          // until that conversation is deleted (a start would refuse it as session_in_use).
          const held = { available: false, reason: "no_record" };
          try {
            const ready = await prepare({ root: raw.root, mode: "resume", ...(validCanvas(canvas) ? { canvas } : {}), text: "", anchors: [] });
            if (ready.sessionId && service.sessionHeld(ready.runtime, ready.configDir, ready.sessionId)) return held;
            return { available: true, runtime: ready.runtime, lastCheckAt: ready.lastCheckAt ?? "", ...(ready.sessionId ? { session: ready.sessionId } : {}) };
          } catch (error) {
            const reason = error instanceof Error ? error.message : "session_unavailable";
            // A session a terminal process holds cannot run now, but it is still the target: the renderer matches it
            // with the terminal work list (createPrepare names it).
            if (reason === "session_in_use" && error instanceof Error && "runtime" in error && validProvider(error.runtime) && "sessionId" in error && typeof error.sessionId === "string")
              return service.sessionHeld(error.runtime, undefined, error.sessionId) ? held : { available: false, reason, runtime: error.runtime, session: error.sessionId };
            // A Claude session no registry record can vouch for: not offered, and the panel says why.
            if (reason === "session_unavailable" && error instanceof Error && "unverified" in error && "runtime" in error && validProvider(error.runtime) && "sessionId" in error && typeof error.sessionId === "string")
              return service.sessionHeld(error.runtime, undefined, error.sessionId) ? held : { available: false, reason: "session_unverified", runtime: error.runtime };
            return { available: false, reason: reason === "no_session" ? "no_record" : ["cli_missing", "outside_root", "session_unavailable", "session_in_use"].includes(reason) ? reason : "session_unavailable" };
          }
        }
        if (!input || !["resume", "new", "newDesign"].includes(String(raw.mode))) throw new Error("bad_request");
        if (raw.runtime !== undefined && !validProvider(raw.runtime)) throw new Error("bad_request");
        if (raw.mode !== "resume" && !raw.runtime) throw new Error("no_agent");
        const mode = raw.mode; if (mode !== "resume" && mode !== "new" && mode !== "newDesign") throw new Error("bad_request");
        const request: StartRequest = { root: raw.root, mode, ...listedMessage(input, projects, raw.root), ...(validCanvas(canvas) ? { canvas } : {}), ...(validProvider(raw.runtime) ? { runtime: raw.runtime } : {}) };
        let attachments: unknown[] = [];
        if (raw.subject !== undefined) throw new Error("bad_request");
        if (mode === "newDesign" || mode === "new") {
          if (!request.runtime) throw new Error("no_agent");
          const extras = validateSendExtras({ model: raw.model, effort: raw.effort, fast: raw.fast, permissionMode: raw.permissionMode, attachments: raw.attachments }, raw.root, request.runtime, "doan", home);
          if (extras.model !== undefined) request.model = extras.model;
          if (extras.effort !== undefined) request.effort = extras.effort;
          if (extras.fast !== undefined) request.fast = extras.fast;
          if (extras.permissionMode !== undefined) request.permissionMode = extras.permissionMode;
          if (extras.attachments) request.attachments = extras.attachments;
          // The first turn names the model's default level as a send's does (models.ts defaultEffort).
          const defaultEffort = request.model !== undefined && request.effort === undefined ? home.models?.defaultEffort(raw.root, request.runtime, request.model) : undefined;
          if (defaultEffort) request.defaultEffort = defaultEffort;
          attachments = extras.ids;
        } else if (raw.model !== undefined || raw.effort !== undefined || raw.fast !== undefined || raw.permissionMode !== undefined || raw.attachments !== undefined) throw new Error("bad_request");
        const store = home.attachments;
        const started = await service.start(request, store && attachments.length ? attachedHooks(store, attachments) : undefined);
        store?.consume(attachments);
        return started;
      }
      if (!validId(raw.conversationId)) throw new Error("bad_request");
      switch (method) {
        case "read": return service.read(raw.conversationId);
        // turnId: the turn the Stop was pressed for (a running turn's, or a done turn's background line); a late press
        // naming another turn does nothing.
        case "interrupt": {
          if (raw.turnId !== undefined && !validId(raw.turnId)) throw new Error("bad_request");
          if (raw.forRemoval === true) {
            if (rows || !validId(raw.turnId)) throw new Error("bad_request");
            await service.interruptProjectTurn(raw.conversationId, raw.turnId);
          } else await service.interrupt(raw.conversationId, raw.turnId);
          return undefined;
        }
        case "send": {
          const sent = message(raw); if (!sent) throw new Error("bad_request");
          const target = service.sendTarget(raw.conversationId);
          // While its usage limit holds, the message waits in main as a queued one does, and takes no picker change.
          if (service.scheduling(raw.conversationId)) {
            if (raw.model !== undefined || raw.effort !== undefined || raw.fast !== undefined || raw.permissionMode !== undefined) throw new Error("bad_request");
            const extras = validateSendExtras(raw, target.root, target.provider, target.owner, home), store = home.attachments;
            const ids = extras.ids.map(item => (item as { id: string }).id);
            if (store && ids.length) store.markSent(extras.ids);
            const scheduled = service.schedule(raw.conversationId, { ...sent, ...(extras.attachments ? { attachments: extras.attachments } : {}), ...(ids.length ? { ids } : {}) });
            if (store && ids.length) store.consume(extras.ids);
            return { scheduled } satisfies ScheduledSend;
          }
          const extras = validateSendExtras(raw, target.root, target.provider, target.owner, home, target), store = home.attachments;
          const input = listedMessage(sent, projects, target.root);
          // The turn's model without an effort still names the model's default level (models.ts defaultEffort).
          const model = extras.model ?? target.model, effort = extras.model !== undefined ? extras.effort : target.effort;
          const defaultEffort = model !== undefined && effort === undefined ? home.models?.defaultEffort(target.root, target.provider, model) : undefined;
          // The turn runs with Fast only when it is chosen and this run's list says the turn's model takes it now; the
          // choice itself stays stored either way (a model without Fast and back keeps it).
          const fastTurn = target.owner === "doan" && (extras.fast ?? target.fast === true) && !!home.models?.fast(target.root, target.provider, model);
          await service.send(raw.conversationId, input.text, input.anchors, { ...(extras.model !== undefined ? { model: extras.model } : {}), ...(extras.effort !== undefined ? { effort: extras.effort } : {}), ...(extras.fast !== undefined ? { fast: extras.fast } : {}), ...(extras.permissionMode !== undefined ? { permissionMode: extras.permissionMode } : {}), ...(extras.attachments ? { attachments: extras.attachments } : {}), ...(defaultEffort ? { defaultEffort } : {}), ...(fastTurn ? { fastTurn: true as const } : {}) },
            store && extras.ids.length ? attachedHooks(store, extras.ids) : undefined);
          store?.consume(extras.ids);
          return undefined;
        }
        case "queue": {
          // Text, anchors and attachments only: the turn the queue goes out in keeps the conversation's model and effort,
          // and takes the mode and Fast stored when it is flushed (setPermissionMode).
          const sent = message(raw); if (!sent || raw.model !== undefined || raw.effort !== undefined || raw.fast !== undefined || raw.permissionMode !== undefined) throw new Error("bad_request");
          const target = service.sendTarget(raw.conversationId);
          const extras = validateSendExtras(raw, target.root, target.provider, target.owner, home), store = home.attachments;
          const ids = extras.ids.map(item => (item as { id: string }).id);
          // The marker that keeps a paste through a restart can fail; it is written before the item is accepted, so a refusal
          // leaves nothing queued and the files with the renderer. Nothing after the acceptance can fail.
          if (store && ids.length) store.markSent(extras.ids);
          const queued = service.queue(raw.conversationId, { ...sent, ...(extras.attachments ? { attachments: extras.attachments } : {}), ...(ids.length ? { ids } : {}) });
          if (store && ids.length) store.consume(extras.ids);
          return queued;
        }
        case "setPermissionMode": {
          // A terminal session runs on the person's own profile, so Doan stores no mode for it.
          if (!permissionModeId(raw.permissionMode) || service.sendTarget(raw.conversationId).owner !== "doan") throw new Error("bad_request");
          service.setPermissionMode(raw.conversationId, raw.permissionMode); return undefined;
        }
        case "removeQueued":
          if (typeof raw.itemId !== "string" || raw.itemId.length > 64) throw new Error("bad_request");
          service.removeQueued(raw.conversationId, raw.itemId); return undefined;
        // Answers once the agent read the message (service.sendNow), not when the provider took it. The message runs in
        // the running turn's Fast, so a request naming one is refused.
        case "sendQueuedNow":
          if (typeof raw.itemId !== "string" || raw.itemId.length > 64 || raw.fast !== undefined) throw new Error("bad_request");
          await service.sendNow(raw.conversationId, raw.itemId); return undefined;
        case "takeDraft": return service.takeDraft(raw.conversationId);
        case "scheduled": return service.scheduled(raw.conversationId);
        case "delete": service.delete(raw.conversationId); return undefined;
        case "markSeen":
          if (typeof raw.seq !== "number" || !Number.isSafeInteger(raw.seq) || raw.seq < 0) throw new Error("bad_request");
          service.markSeen(raw.conversationId, raw.seq); return undefined;
        case "answerPermission": if (typeof raw.requestId !== "string" || raw.requestId.length > 512 || typeof raw.optionId !== "string" || raw.optionId.length > 512) throw new Error("bad_request"); service.answer(raw.conversationId, raw.requestId, raw.optionId); return undefined;
        case "answerQuestion": {
          if (typeof raw.requestId !== "string" || !raw.requestId || raw.requestId.length > 512) throw new Error("bad_request");
          const answer = questionInput(raw); if (!answer) throw new Error("bad_request");
          service.answerQuestion(raw.conversationId, raw.requestId, answer); return undefined;
        }
      }
      throw new Error("bad_request");
    } catch (error) {
      const known = ["bad_request", "command_mode_stale", "project_not_open", "canvas_not_found", "no_agent", "cli_missing", "cli_install_failed", "credential_override", "no_session", "session_unavailable", "runtime_unsupported", "session_in_use", "busy", "not_logged_in", "process_exited", "rate_limited", "unknown", "not_found", "stale", "not_running", "queue_limit", "account_changed", "workspace_changed", "sign_in_changed"];
      const code = error instanceof Error ? error.message : "unknown";
      if (code === "attachment_missing" && error instanceof Error && "missing" in error && Array.isArray(error.missing)) {
        return { error: code, missing: error.missing, ...("replaced" in error && Array.isArray(error.replaced) ? { replaced: error.replaced } : {}) };
      }
      if (code === "rate_limited" && error instanceof Error && "resetsAt" in error && typeof error.resetsAt === "string") return { error: code, resetsAt: error.resetsAt };
      const answered = code === "outside_root" ? "session_unavailable" : known.includes(code) ? code : "unknown";
      // No composer explains these beyond "Couldn't start", so the log keeps what refused the start; only Doan's code-shaped
      // words are logged, since an SDK or provider message can embed the provider's reply (POSTMORTEM 2026-11-01).
      if (method === "start" && (answered === "unknown" || answered === "bad_request")) console.error(`doan: conversation start refused: ${answered}${code !== answered ? ` (${startCause(error, code)})` : ""}`);
      return { error: answered };
    }
  };
}
