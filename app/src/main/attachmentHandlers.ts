// The composer attachment requests of both windows (index.ts registers them behind the sender guard). Each draft is a
// window's own (PRODUCT §5 item 2 'Prototype window'), so an attachment id in a draft belongs to the window that holds
// it now: the one it was issued to, or the one that took it back (a returned queue's ids go to the window that took the
// draft, and a recheck makes a sent id that window's draft again). Once main accepts a start, send or queue carrying
// it, the id is the conversation's (a queue the service reclaims and sends later, a send under way) and no window's
// close touches it. A window may use only its own ids; the prototype window also none main never gave it, while the
// main window keeps the ids main issues outside these handlers (a canvas capture, the service's reissue). A closed
// prototype window's close forgets only the drafts it still holds. Electron-free: the Attach dialog is the caller's.
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

// The ids a start, send or queue names in its `attachments`.
function attachmentIds(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null) return [];
  const list: unknown = Reflect.get(raw, "attachments");
  return Array.isArray(list) ? list.flatMap(item => idsOf(item, "id")) : [];
}

function refused(reply: unknown): boolean {
  return typeof reply === "object" && reply !== null && "error" in reply;
}

export function createAttachmentHandlers(store: AttachmentStore, deps: AttachmentHandlerDeps) {
  const owners = new Map<string, AttachmentOwner>();
  const issued = <T extends AttachmentResult | RecheckResult | null>(owner: AttachmentOwner, results: readonly T[] | null): void => {
    for (const result of results ?? []) if (result?.ok) owners.set(result.attachment.id, owner);
  };
  const mine = (owner: AttachmentOwner, ids: readonly string[]): boolean => ids.every(id => {
    const holder = owners.get(id);
    return holder === undefined ? owner === "main" : holder === owner;
  });
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
      // The owner stays: a removed sent id goes back aside for its own window's recheck, not another window's.
      return mine(owner, idsOf(value, "id")) && store.remove(value);
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
    // A conversation start, send or queue from the owner's window. A refused one leaves the ids in its draft.
    async conversation(owner: AttachmentOwner, raw: unknown, run: () => Promise<unknown>): Promise<unknown> {
      const ids = attachmentIds(raw);
      if (!mine(owner, ids)) return { error: "bad_request" };
      const reply = await run();
      if (!refused(reply)) for (const id of ids) if (owners.get(id) === owner) owners.delete(id);
      return reply;
    },
    // A returned queue's ids, handed to the window that took the draft (conversation takeDraft).
    taken(owner: AttachmentOwner, ids: readonly string[]): void { for (const id of ids) owners.set(id, owner); },
    // The prototype window closed: the drafts it still holds go with it. A sent or queued id left it with its request
    // (conversation above), and a queued message rechecks its ids when it goes out, so nothing is released here.
    closed(owner: AttachmentOwner): void {
      for (const [id, holder] of [...owners]) {
        if (holder !== owner) continue;
        store.remove({ id });
        owners.delete(id);
      }
    },
  };
}
