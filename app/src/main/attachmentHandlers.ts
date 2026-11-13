// The composer attachment requests of both windows (index.ts registers them behind the sender guard). Each draft is a
// window's own (PRODUCT §5 item 2 'Prototype window'), so every attachment id belongs to the window that holds it now:
// the one it was issued to, or the one that took it back (a returned queue's ids go to the window that took the
// draft, and a recheck makes a sent id that window's draft again). A window may remove, recheck or release only its own
// ids, and a closed prototype window's close forgets only the drafts it still holds. Electron-free: the Attach dialog
// is the caller's.
import type { AttachmentResult, AttachmentStore, RecheckResult } from "./attachments";

// The window that asked: "main", or the prototype window by its webContents id, so a closed window's late reply is
// not taken for the next window's.
export type AttachmentOwner = "main" | `prototype:${number}`;

export interface AttachmentHandlerDeps {
  // The paths the person chose in the Attach dialog over the owner's window; empty when cancelled or gone.
  pick(owner: AttachmentOwner): Promise<string[]>;
  // The owner's window is still open: a dialog answered after its window closed issues nothing.
  alive(owner: AttachmentOwner): boolean;
}

function idsOf(value: unknown, key: "id" | "ids"): string[] {
  if (typeof value !== "object" || value === null || !(key in value)) return [];
  const raw: unknown = Reflect.get(value, key);
  const list: unknown[] = Array.isArray(raw) ? [...raw] : [raw];
  return list.filter((id): id is string => typeof id === "string");
}

export function createAttachmentHandlers(store: AttachmentStore, deps: AttachmentHandlerDeps) {
  const owners = new Map<string, AttachmentOwner>();
  const issued = <T extends AttachmentResult | RecheckResult | null>(owner: AttachmentOwner, results: readonly T[] | null): void => {
    for (const result of results ?? []) if (result?.ok) owners.set(result.attachment.id, owner);
  };
  // An id main never issued in this run has no owner; the store refuses it on its own.
  const mine = (owner: AttachmentOwner, ids: readonly string[]): boolean => ids.every(id => (owners.get(id) ?? owner) === owner);
  return {
    async choose(owner: AttachmentOwner): Promise<AttachmentResult[]> {
      const paths = await deps.pick(owner);
      if (paths.length === 0 || !deps.alive(owner)) return [];
      const results = store.addPaths({ paths: paths.slice(0, 64) }) ?? [];
      issued(owner, results);
      return results;
    },
    addPaths(owner: AttachmentOwner, value: unknown): AttachmentResult[] | null { const results = store.addPaths(value); issued(owner, results); return results; },
    addPasted(owner: AttachmentOwner, value: unknown): AttachmentResult { const result = store.addPasted(value); issued(owner, [result]); return result; },
    fromPaths(owner: AttachmentOwner, value: unknown): AttachmentResult[] | null { const results = store.fromPaths(value); issued(owner, results); return results; },
    remove(owner: AttachmentOwner, value: unknown): boolean {
      if (!mine(owner, idsOf(value, "id"))) return false;
      const removed = store.remove(value);
      if (removed) for (const id of idsOf(value, "id")) owners.delete(id);
      return removed;
    },
    recheck(owner: AttachmentOwner, value: unknown): RecheckResult[] | null {
      if (!mine(owner, idsOf(value, "ids"))) return null;
      const results = store.recheck(value);
      issued(owner, results);
      return results;
    },
    release(owner: AttachmentOwner, value: unknown): boolean {
      if (!mine(owner, idsOf(value, "ids"))) return false;
      return store.release(value);
    },
    // A returned queue's ids, handed to the window that took the draft (conversation takeDraft).
    taken(owner: AttachmentOwner, ids: readonly string[]): void { for (const id of ids) owners.set(id, owner); },
    // The prototype window closed: the drafts it still holds go with it. A sent or queued id is no draft (remove leaves
    // it), and a queued message rechecks its ids when it goes out, so nothing is released here.
    closed(owner: AttachmentOwner): void {
      for (const [id, holder] of [...owners]) {
        if (holder !== owner) continue;
        store.remove({ id });
        owners.delete(id);
      }
    },
  };
}
