import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { Provider } from "../main/agentAuth/types";
import type { PermissionModeId } from "../main/conversation/permissionMode";
import type { DoanApi } from "../preload";
import { draftKey } from "./dockedRules";
import type { ModelsState, PresetListReply } from "./homeComposer";

// Accounts, presets, model lists and picks: App owns one, so leaving does not re-read them or lose a pick.

// A provider switch drops permissionMode and fast: modes are remembered per provider, and Full access never carries.
// permissionFrom: the stored mode a pick in an existing conversation was made over, until main reports it back.
export interface DockedPick { provider?: Provider; model?: string; effort?: string; fast?: boolean; permissionMode?: PermissionModeId; permissionFrom?: PermissionModeId }

// main lists a new connection again, and a Codex replacement can keep the provider and the email shown, so nothing
// else tells the window.
export const modelsKey = (root: string, provider: Provider, generation: number) => `${root}\n${provider}\n${generation}`;
export function generationOf(auth: AuthSnapshot | null | undefined, provider: Provider): number {
  return auth?.providers.find(status => status.provider === provider)?.generation ?? 0;
}

// The prototype window has the same members on `window.doanPrototype`.
export type DockedSupportCalls = Pick<DoanApi, "designSkills" | "listConversationModels" | "setConversationPermissionMode">;

export class DockedSupport {
  auth: AuthSnapshot | null | undefined = undefined;
  presets: PresetListReply | undefined = undefined;
  models: Record<string, ModelsState> = {};
  picks: Record<string, DockedPick> = {};
  // The list read lags the start, and the stored mode would read as Default meanwhile. Not the person's pick, so never
  // sent or remembered.
  started: Record<string, PermissionModeId> = {};
  // By attachment key.
  thumbnails: Record<string, string> = {};

  constructor(private changed: () => void, private calls: DockedSupportCalls) {}

  setAuth(snapshot: AuthSnapshot): void { this.auth = snapshot; this.changed(); }
  // A failure is read again when the presets popover opens, from the loading state.
  readPresets(): void {
    this.presets = undefined;
    this.changed();
    void this.retryPresets();
  }
  // Retry keeps the failed reply, its line and itself, until the answer (DESIGN 'Busy action').
  retryPresets(): Promise<boolean> {
    return this.calls.designSkills.list().catch(() => undefined).then(reply => {
      this.presets = reply ?? { v: 1, ok: false, error: { code: "cli_error", reason: "failed", message: "" } } as PresetListReply;
      this.changed();
      return reply?.ok === true;
    });
  }
  readModels(root: string, provider: Provider): void {
    const key = modelsKey(root, provider, generationOf(this.auth, provider));
    const known = this.models[key];
    // A failed read is not kept for the run: the picker asks again when it opens.
    if (known !== undefined && !(typeof known === "object" && "error" in known)) return;
    this.models = { ...this.models, [key]: "loading" };
    this.changed();
    void this.calls.listConversationModels({ root, runtime: provider }).catch(() => ({ error: "unknown" })).then(reply => {
      this.models = { ...this.models, [key]: reply };
      this.changed();
    });
  }
  // An undefined field drops that pick, back to the default.
  pick(key: string, patch: { [K in keyof DockedPick]?: DockedPick[K] | undefined }): void {
    const next = { ...this.picks[key], ...patch };
    for (const field of ["provider", "model", "effort", "fast", "permissionMode", "permissionFrom"] as const) if (next[field] === undefined) delete next[field];
    this.picks = { ...this.picks, [key]: next as DockedPick };
    this.changed();
  }
  // main stores an existing conversation's mode at once, so a running turn's queue goes out in it. The pick shows until
  // the summary reports it or the stored mode moves off `from` (main changed it, as a plan approval does).
  pickPermission(key: string, conversationId: string | null, mode: PermissionModeId, from?: PermissionModeId): void {
    this.pick(key, { permissionMode: mode, permissionFrom: from });
    if (!conversationId) return;
    void this.calls.setConversationPermissionMode({ conversationId, permissionMode: mode }).catch(() => ({ error: "unknown" })).then(reply => {
      if (reply && "error" in reply && this.picks[key]?.permissionMode === mode) this.pick(key, { permissionMode: undefined, permissionFrom: undefined });
    });
  }
  // A switch still held here would send it again.
  fastTurnedOff(conversationId: string): void {
    // An existing conversation's draft key is its id alone; the provider does not enter it.
    const key = draftKey({ kind: "existing", conversationId, provider: "claude" });
    if (this.picks[key]?.fast !== undefined) this.pick(key, { fast: undefined });
  }
  startedIn(key: string, mode: PermissionModeId): void { this.started = { ...this.started, [key]: mode }; this.changed(); }
  // stored: null before the list names it.
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
  // The next start begins from the defaults again, as Home's does.
  clearPick(key: string): void {
    if (!(key in this.picks)) return;
    const { [key]: _gone, ...rest } = this.picks;
    this.picks = rest;
    this.changed();
  }
  setThumbnail(key: string, url: string): void { this.thumbnails = { ...this.thumbnails, [key]: url }; this.changed(); }
}
