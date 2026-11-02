import type { Provider } from "../agentAuth/types";

// The permission modes a person can pick for a conversation, the same for every provider, and how each provider
// receives them (permission-mode design '모드 대응'). The renderer imports this module by value, so it must import
// nothing but types: a value import of the validators or a Node module leaves the built app's window blank
// (rendererImports.test.ts, POSTMORTEM 2026-10-30).

export const PERMISSION_MODES = ["default", "acceptEdits", "plan", "bypass"] as const;
export type PermissionModeId = typeof PERMISSION_MODES[number];

export function permissionModeId(value: unknown): value is PermissionModeId { return PERMISSION_MODES.some(mode => mode === value); }
// A stored value this build does not know (a later build's mode, or a damaged field) reads as Default: that field
// only, never the whole file, and never a wider mode than the person picked.
export function readPermissionMode(value: unknown): PermissionModeId { return permissionModeId(value) ? value : "default"; }

// What an ACP server listed in its session/new reply: its mode ids, and whether it offers Copilot's allow_all option.
export interface AcpModes { available: string[]; allowAll: boolean }
export interface AcpSetting { configId: "mode" | "allow_all"; value: string }

const COPILOT = "https://agentclientprotocol.com/protocol/session-modes#";
// Cursor `ask` and Copilot `#autopilot` have no common mode and are never set. allowAll: Copilot's allow_all value
// for that mode; Default and Plan turn it off, because a session keeps the last value across session/load.
const ACP: Partial<Record<Provider, Partial<Record<PermissionModeId, { mode: string; allowAll?: "on" | "off" }>>>> = {
  cursor: { default: { mode: "agent" }, plan: { mode: "plan" } },
  antigravity: { default: { mode: "default" }, acceptEdits: { mode: "auto_edit" }, bypass: { mode: "yolo" } },
  copilot: { default: { mode: `${COPILOT}agent`, allowAll: "off" }, plan: { mode: `${COPILOT}plan`, allowAll: "off" }, bypass: { mode: `${COPILOT}agent`, allowAll: "on" } },
};

// The session/set_config_option requests that put an ACP session in this mode; none when the table has no entry or
// the server did not list the mode. Default is set explicitly too: a session keeps its last mode across session/load.
export function acpModeFor(provider: Provider, mode: PermissionModeId, acp: AcpModes | undefined): AcpSetting[] {
  const entry = ACP[provider]?.[mode];
  if (!entry || !acp?.available.includes(entry.mode)) return [];
  if (entry.allowAll === "on" && !acp.allowAll) return [];
  return [{ configId: "mode", value: entry.mode }, ...(entry.allowAll && acp.allowAll ? [{ configId: "allow_all" as const, value: entry.allowAll }] : [])];
}

// The modes the picker offers. An ACP provider offers only what its server listed and the table maps, and nothing
// (no picker) when Default itself cannot be set, since every other mode falls back to it.
export function permissionOptions(provider: Provider, acp?: AcpModes): PermissionModeId[] {
  if (provider === "claude" || provider === "codex") return [...PERMISSION_MODES];
  const offered = PERMISSION_MODES.filter(mode => acpModeFor(provider, mode, acp).length > 0);
  return offered.includes("default") ? offered : [];
}

// Agent SDK query() options (0.3.312 sdk.d.ts). Default passes nothing, so the profile's and project's settings apply.
export function claudePermission(mode: PermissionModeId): { permissionMode?: "acceptEdits" | "plan" | "bypassPermissions"; allowDangerouslySkipPermissions?: true } {
  switch (mode) {
    case "default": return {};
    case "acceptEdits": return { permissionMode: "acceptEdits" };
    case "plan": return { permissionMode: "plan" };
    case "bypass": return { permissionMode: "bypassPermissions", allowDangerouslySkipPermissions: true };
  }
}

// The mode a Claude status message reports once a plan was approved; a mode with no common id (auto, dontAsk) reads
// as Default.
export function claudeModeAfterPlan(sdkMode: unknown): PermissionModeId {
  switch (sdkMode) {
    case "acceptEdits": return "acceptEdits";
    case "plan": return "plan";
    case "bypassPermissions": return "bypass";
    default: return "default";
  }
}

type Json = Record<string, unknown>;
const record = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
// Codex's own values for this folder, from the reply to an ephemeral thread/start (approvalPolicy: a string or a
// granular object; sandbox: a SandboxPolicy object, the shape turn/start's sandboxPolicy takes).
export interface CodexDefaults { approvalPolicy: string | Json; sandbox: Json }
// config/read's sandbox_workspace_write, in turn/start's names.
export interface CodexWorkspace { networkAccess?: boolean; writableRoots?: string[] }
export interface CodexTurnPermission { approvalPolicy: string | Json; sandboxPolicy: Json }

// null: the reply does not carry both values, so Default cannot be stated (the open fails rather than guessing).
export function codexDefaults(reply: unknown): CodexDefaults | null {
  if (!record(reply)) return null;
  const { approvalPolicy, sandbox } = reply;
  if (!((typeof approvalPolicy === "string" && approvalPolicy.length > 0) || record(approvalPolicy))) return null;
  if (!record(sandbox) || typeof sandbox.type !== "string") return null;
  return { approvalPolicy, sandbox };
}
export function codexWorkspace(reply: unknown): CodexWorkspace {
  const write = record(reply) && record(reply.config) ? reply.config.sandbox_workspace_write : undefined;
  if (!record(write)) return {};
  const roots = write.writable_roots;
  return {
    ...(typeof write.network_access === "boolean" ? { networkAccess: write.network_access } : {}),
    ...(Array.isArray(roots) && roots.every(root => typeof root === "string") ? { writableRoots: [...roots] as string[] } : {}),
  };
}
// Every Codex turn states its values, Default included: an override holds for later turns and across thread/resume,
// and null does not clear it (0.163.0, P2). A bare workspaceWrite would turn the user's network access off, so Accept
// edits carries the configured network access and roots.
export function codexPermission(mode: PermissionModeId, defaults: CodexDefaults, workspace: CodexWorkspace): CodexTurnPermission {
  switch (mode) {
    case "default": return { approvalPolicy: defaults.approvalPolicy, sandboxPolicy: defaults.sandbox };
    case "acceptEdits": return { approvalPolicy: "on-request", sandboxPolicy: { type: "workspaceWrite", ...workspace } };
    case "plan": return { approvalPolicy: "never", sandboxPolicy: { type: "readOnly" } };
    case "bypass": return { approvalPolicy: "never", sandboxPolicy: { type: "dangerFullAccess" } };
  }
}
