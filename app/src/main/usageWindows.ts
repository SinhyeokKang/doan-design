import { USAGE_CHANNELS } from "./agentAuth/usageIpc";
import type { UsageEntry } from "./agentAuth/usageTypes";

// Usage is read while either window can show it, so closing the main window does not stop the prototype window's
// drawer. prototypeShown is its own visible(), which already folds in a hidden app.
export function usageVisible({ mainShown, appHidden, prototypeShown }: { mainShown: boolean; appHidden: boolean; prototypeShown: boolean }): boolean {
  return (mainShown && !appHidden) || prototypeShown;
}

// Every change goes to both windows. UsageEntry carries no connection ID, profile or account, so the prototype
// window's no-identity rule holds.
export function usagePublisher(send: { main(channel: string, value: unknown): void; prototype(channel: string, value: unknown): void }): (entries: UsageEntry[]) => void {
  return entries => {
    send.main(USAGE_CHANNELS.changed, entries);
    send.prototype(USAGE_CHANNELS.changed, entries);
  };
}
