import { validProvider, type AccountConnection, type AccountIdentity, type AuthMetadata, type ConversationOwner } from "./types";
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
// Exact keys keep tokens or credential locations from riding along in stored documents.
function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => required.includes(k) || optional.includes(k));
}
// Conversation IDs share this path-safe shape (conversation/store.ts validId).
export function validAuthId(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value); }
function label(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 512 && !value.includes("\0"); }
function nullableLabel(value: unknown): value is string | null { return value === null || label(value); }
export function validAccount(value: unknown): value is AccountIdentity {
  return object(value) && keys(value, ["id", "workspace"], ["displayName", "email"]) && nullableLabel(value.id) && nullableLabel(value.workspace) &&
    (value.displayName === undefined || label(value.displayName)) && (value.email === undefined || label(value.email));
}
export function validConnection(value: unknown): value is AccountConnection {
  return object(value) && keys(value, ["provider", "connectionId", "profile", "account"]) && validProvider(value.provider) &&
    validAuthId(value.connectionId) && validAuthId(value.profile) && validAccount(value.account);
}
export function validOwner(value: unknown): value is ConversationOwner {
  if (!object(value)) return false;
  if (value.kind === "legacy-external") return keys(value, ["kind"]);
  return value.kind === "doan" && keys(value, ["kind", "provider", "connectionId", "accountId", "workspaceId", "profile"]) && validProvider(value.provider) &&
    validAuthId(value.connectionId) && nullableLabel(value.accountId) && nullableLabel(value.workspaceId) && validAuthId(value.profile);
}
function validMetadata(value: Record<string, unknown>): value is Record<string, unknown> & AuthMetadata {
  if (!keys(value, ["v", "accounts"], ["signOutFailed"]) || !Array.isArray(value.accounts) || !value.accounts.every(validConnection)) return false;
  const accounts: AccountConnection[] = value.accounts, failed = value.signOutFailed;
  // A failed sign-out belongs to a connection that is still stored.
  if (failed !== undefined && (!Array.isArray(failed) || new Set(failed).size !== failed.length || !failed.every(p => accounts.some(a => a.provider === p)))) return false;
  // One account per provider; profiles and connection IDs must not alias across providers.
  return (["provider", "connectionId", "profile"] as const).every(k => new Set(accounts.map(a => a[k])).size === accounts.length);
}
export type MetadataRead = { ok: true; metadata: AuthMetadata } | { ok: false; code: "corrupt" | "unknown_version" | "invalid" };
export function parseAuthMetadata(text: string): MetadataRead {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, code: "corrupt" }; }
  if (!object(raw)) return { ok: false, code: "corrupt" };
  if (raw.v !== 1) return { ok: false, code: "unknown_version" };
  return validMetadata(raw) ? { ok: true, metadata: raw } : { ok: false, code: "invalid" };
}
export function serializeAuthMetadata(metadata: AuthMetadata): string {
  if (!object(metadata) || metadata.v !== 1 || !validMetadata(metadata)) throw new Error("Invalid auth metadata");
  return JSON.stringify(metadata);
}
