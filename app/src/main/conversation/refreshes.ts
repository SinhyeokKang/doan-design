// A folder listing main hands to ConversationService.refreshed: each re-read of a listed folder with the canvas rows the
// watcher saw change since the listing before. A re-read makes a new rows array and a served-only refresh keeps it
// (shell.ts), so the same array is no refresh; a row whose rev moved (shell.ts withRevs, keyed by path) changed. A folder
// seen for the first time has nothing to compare with and hands over no changes.
export interface ListedRows { readonly path: string; readonly kind: string; readonly canvases?: readonly { path: string; rev?: number }[] }
export function folderRefreshes(previous: ReadonlyMap<string, readonly { path: string; rev?: number }[]>, entries: readonly ListedRows[]): { calls: { root: string; changed: string[] }[]; next: Map<string, readonly { path: string; rev?: number }[]> } {
  const next = new Map<string, readonly { path: string; rev?: number }[]>(), calls: { root: string; changed: string[] }[] = [];
  for (const entry of entries) {
    if (entry.kind !== "list" || !entry.canvases) continue;
    const before = previous.get(entry.path); next.set(entry.path, entry.canvases);
    if (before === entry.canvases) continue;
    const revs = new Map(before?.map(row => [row.path, row.rev]));
    calls.push({ root: entry.path, changed: before ? entry.canvases.filter(row => row.rev !== undefined && row.rev !== revs.get(row.path)).map(row => row.path) : [] });
  }
  return { calls, next };
}
