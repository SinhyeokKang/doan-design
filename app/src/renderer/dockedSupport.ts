import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { PermissionModeId } from "../main/conversation/permissionMode";
import type { ModelsState, PresetListReply } from "./homeComposer";

// What the Overview's docked composer reads from main besides the conversation (buzz-conversation design §8, buzz-project
// design §2.2): accounts, design presets and model lists, read once for the run as Home's are, and the person's model
// picks per draft key. App owns one, so leaving and coming back does not read them again or lose a pick.

// provider: a new conversation's agent; model and effort: what the person changed, sent only then. permissionMode: a
// new conversation's pick for its provider (a provider switch drops it: modes are remembered per provider, spec
// decision 4, and Full access never carries to another); in an existing one, a pick main has not yet reported back in
// the conversation's summary, with permissionFrom, the stored mode it was picked over (when the summary was known).
export interface DockedPick { provider?: Provider; model?: string; effort?: string; permissionMode?: PermissionModeId; permissionFrom?: PermissionModeId }

export const modelsKey = (root: string, provider: Provider) => `${root}\n${provider}`;

export class DockedSupport {
  auth: AuthSnapshot | null | undefined = undefined;
  presets: PresetListReply | undefined = undefined;
  models: Record<string, ModelsState> = {};
  picks: Record<string, DockedPick> = {};
  // The mode a conversation started here was started in, by its key, until its summary arrives: the list read lags
  // the start, and the stored mode would read as Default meanwhile. Not the person's pick, so never sent or remembered.
  started: Record<string, PermissionModeId> = {};
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
    for (const field of ["provider", "model", "effort", "permissionMode", "permissionFrom"] as const) if (next[field] === undefined) delete next[field];
    this.picks = { ...this.picks, [key]: next as DockedPick };
    this.changed();
  }
  // An existing conversation's mode is stored by main at once (permission-mode spec decision 7, orch decision 8), so
  // a running turn's queue goes out in it. The pick shows until the conversation's summary reports it
  // (settlePermission), or until the stored mode moves off the one it was picked over (`from`): main changed it
  // (a plan approval) and the list read may have skipped the pick. A refused one is dropped, back to the stored mode.
  pickPermission(key: string, conversationId: string | null, mode: PermissionModeId, from?: PermissionModeId): void {
    this.pick(key, { permissionMode: mode, permissionFrom: from });
    if (!conversationId) return;
    void window.doan.setConversationPermissionMode({ conversationId, permissionMode: mode }).catch(() => ({ error: "unknown" })).then(reply => {
      if (reply && "error" in reply && this.picks[key]?.permissionMode === mode) this.pick(key, { permissionMode: undefined, permissionFrom: undefined });
    });
  }
  startedIn(key: string, mode: PermissionModeId): void { this.started = { ...this.started, [key]: mode }; this.changed(); }
  // stored: the conversation's summary's mode, null before the list names it.
  settlePermission(key: string, stored: PermissionModeId | null): void {
    if (stored === null) return;
    if (key in this.started) {
      const { [key]: _gone, ...rest } = this.started;
      this.started = rest;
      this.changed();
    }
    const pick = this.picks[key];
    if (pick?.permissionMode === undefined) return;
    if (pick.permissionMode === stored || (pick.permissionFrom !== undefined && pick.permissionFrom !== stored)) this.pick(key, { permissionMode: undefined, permissionFrom: undefined });
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
