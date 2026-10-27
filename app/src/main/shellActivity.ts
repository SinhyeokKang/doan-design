import { readSessionTail } from "./conversation/io";
import { object } from "./conversation/sessions";
import type { ConversationStore } from "./conversation/store";
export interface ShellActivity { root: string; at?: number; incomplete: boolean }
export function parseActivityRoots(value: unknown, registered: readonly string[]): string[] | null {
  if (!object(value) || Object.keys(value).length !== 1 || !Array.isArray(value.roots)) return null;
  const roots: string[] = [];
  for (const root of value.roots) {
    if (typeof root !== "string" || !registered.includes(root) || roots.includes(root)) return null;
    roots.push(root);
  }
  return roots;
}
export function readShellActivity(userData: string, store: ConversationStore, roots: readonly string[]): ShellActivity[] {
  const result = new Map<string, ShellActivity>(roots.map(root => [root, { root, incomplete: false }]));
  const record = (root: string, timestamp: string) => {
    const item = result.get(root), at = Date.parse(timestamp);
    if (item && Number.isFinite(at) && at >= 0 && at <= 8.64e15 && (item.at === undefined || at > item.at)) item.at = at;
  };
  try { for (const session of readSessionTail(userData)) record(session.root, session.at); }
  catch { for (const item of result.values()) item.incomplete = true; }
  try {
    for (const metadata of store.list()) {
      const item = result.get(metadata.root);
      if (!item) continue;
      try { for (const event of store.readRequired(metadata.conversationId)) if (event.type === "activity") record(metadata.root, event.at); }
      catch { item.incomplete = true; }
    }
  } catch { for (const item of result.values()) item.incomplete = true; }
  return [...result.values()];
}
