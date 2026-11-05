import type { Provider } from "./types";
import type { UsageReading } from "./usageTypes";

interface Slot { connectionId: string; reading?: UsageReading; inFlight: boolean }

// Main-memory usage per provider, keyed by the connection it was read for; never written to disk. A new connectionId
// (sign-in, sign-out, a changed account) drops the old value, and a read that started under another connectionId is
// dropped when it ends, so one account's usage never shows for the next.
export class UsageStore {
  private readonly slots = new Map<Provider, Slot>();

  connect(provider: Provider, connectionId: string | null): void {
    if (connectionId === null) { this.slots.delete(provider); return; }
    if (this.slots.get(provider)?.connectionId !== connectionId) this.slots.set(provider, { connectionId, inFlight: false });
  }

  get(provider: Provider): { reading?: UsageReading; inFlight: boolean } | undefined {
    const slot = this.slots.get(provider);
    return slot && { inFlight: slot.inFlight, ...(slot.reading ? { reading: slot.reading } : {}) };
  }

  begin(provider: Provider, connectionId: string): boolean {
    const slot = this.current(provider, connectionId);
    if (slot) slot.inFlight = true;
    return slot !== undefined;
  }

  settle(provider: Provider, connectionId: string, reading: UsageReading): boolean {
    const slot = this.current(provider, connectionId);
    if (slot) { slot.reading = reading; slot.inFlight = false; }
    return slot !== undefined;
  }

  private current(provider: Provider, connectionId: string): Slot | undefined {
    const slot = this.slots.get(provider);
    return slot?.connectionId === connectionId ? slot : undefined;
  }
}
