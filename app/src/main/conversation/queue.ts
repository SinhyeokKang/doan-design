import { MAX_ATTACHMENTS } from "../attachments";
import type { Anchor } from "./types";
export interface QueuedParts<A> { text: string; anchors: readonly Anchor[]; attachments: readonly A[] }
// Queued messages go out as one user message, in the order they were queued, separated by a blank line. Each
// message's {{n}} markers move past the anchors of the messages before it.
export function combineQueued<A>(items: readonly QueuedParts<A>[]): ({ ok: true } & { text: string; anchors: Anchor[]; attachments: A[] }) | { ok: false; error: "attachment_limit" } {
  const texts: string[] = [], anchors: Anchor[] = [], attachments: A[] = [];
  for (const item of items) {
    const offset = anchors.length;
    texts.push(item.text.replace(/\{\{([1-9][0-9]*)\}\}/g, (_match, n: string) => `{{${Number(n) + offset}}}`));
    anchors.push(...item.anchors); attachments.push(...item.attachments);
  }
  if (attachments.length > MAX_ATTACHMENTS) return { ok: false, error: "attachment_limit" };
  return { ok: true, text: texts.join("\n\n"), anchors, attachments };
}
// A provider command goes out alone (it must be the whole message for the provider to run it): the next send is either
// one command or the messages queued before the next command.
export function nextQueued<T>(items: readonly T[], isCommand: (item: T) => boolean): T[] {
  if (items.length > 0 && isCommand(items[0]!)) return [items[0]!];
  const end = items.findIndex(isCommand);
  return items.slice(0, end === -1 ? items.length : end);
}
