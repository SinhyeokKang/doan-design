import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { PermissionModeId } from "../main/conversation/permissionMode";
import type { ModelsState, PresetListReply } from "./homeComposer";

// What the Overview's docked composer reads from main besides the conversation (buzz-conversation design §8, buzz-project
// design §2.2): accounts, design presets and model lists, read once for the run as Home's are, and the person's model
// picks per draft key. App owns one, so leaving and coming back does not read them again or lose a pick.

// provider: a new conversation's agent; model and effort: what the person changed, sent only then. permissionMode: a
// new conversation's pick; in an existing one, a pick main has not yet reported back in the conversation's summary.
export interface DockedPick { provider?: Provider; model?: string; effort?: string; permissionMode?: PermissionModeId }

export const modelsKey = (root: string, provider: Provider) => `${root}\n${provider}`;

export class DockedSupport {
  auth: AuthSnapshot | null | undefined = undefined;
  presets: PresetListReply | undefined = undefined;
  models: Record<string, ModelsState> = {};
  picks: Record<string, DockedPick> = {};
  // Object URLs of image chips by attachment key.
  thumbnails: Record<string, string> = {};

  constructor(private changed: () => void) {}

  setAuth(snapshot: AuthSnapshot): void { this.auth = snapshot; this.changed(); }
  // A failure is read again when the presets popover opens (buzz-home design §4.4).
  readPresets(): void {
    this.presets = undefined;
    this.changed();
    void window.doan.designSkills.list().catch(() => undefined).then(reply => {
      this.presets = reply ?? { v: 1, ok: false, error: { code: "cli_error", reason: "failed", message: "" } } as PresetListReply;
      this.changed();
    });
  }
  readModels(root: string, provider: Provider): void {
    const key = modelsKey(root, provider);
    if (this.models[key] !== undefined) return;
    this.models = { ...this.models, [key]: "loading" };
    this.changed();
    void window.doan.listConversationModels({ root, runtime: provider }).catch(() => ({ error: "unknown" })).then(reply => {
      this.models = { ...this.models, [key]: reply };
      this.changed();
    });
  }
  // An undefined field drops that pick, back to the default.
  pick(key: string, patch: { [K in keyof DockedPick]?: DockedPick[K] | undefined }): void {
    const next = { ...this.picks[key], ...patch };
    for (const field of ["provider", "model", "effort", "permissionMode"] as const) if (next[field] === undefined) delete next[field];
    this.picks = { ...this.picks, [key]: next as DockedPick };
    this.changed();
  }
  // An existing conversation's mode is stored by main at once (permission-mode spec decision 7, orch decision 8), so
  // a running turn's queue goes out in it. The pick shows until the conversation's summary reports it
  // (settlePermission); a refused one is dropped, back to the stored mode.
  pickPermission(key: string, conversationId: string | null, mode: PermissionModeId): void {
    this.pick(key, { permissionMode: mode });
    if (!conversationId) return;
    void window.doan.setConversationPermissionMode({ conversationId, permissionMode: mode }).catch(() => ({ error: "unknown" })).then(reply => {
      if (reply && "error" in reply && this.picks[key]?.permissionMode === mode) this.pick(key, { permissionMode: undefined });
    });
  }
  settlePermission(key: string, stored: PermissionModeId): void {
    if (this.picks[key]?.permissionMode === stored) this.pick(key, { permissionMode: undefined });
  }
  // A start sends the new conversation's picks; the next one starts from the defaults again, as Home's does.
  clearPick(key: string): void {
    if (!(key in this.picks)) return;
    const { [key]: _gone, ...rest } = this.picks;
    this.picks = rest;
    this.changed();
  }
  setThumbnail(key: string, url: string): void { this.thumbnails = { ...this.thumbnails, [key]: url }; this.changed(); }
}
