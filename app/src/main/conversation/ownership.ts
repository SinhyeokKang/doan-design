import type { Reservation, SessionKey } from "./types";
export type ReservationResult = { ok: true; reservations: Reservation[] } | { ok: false; code: "busy" | "session_in_use" | "stale" };
function sameKey(a: SessionKey, b: SessionKey): boolean {
  return a.runtime === b.runtime && a.configDir === b.configDir && a.sessionId === b.sessionId;
}
// The main-process caller must replace its reservation list synchronously before any await.
export function reserveSession(reservations: readonly Reservation[], owner: string, key: SessionKey | null, reuseOwnedCodexServer = false): ReservationResult {
  if (key && reservations.some(r => r.owner !== owner && r.key && sameKey(r.key, key))) return { ok: false, code: "session_in_use" };
  const own = reservations.find(r => r.owner === owner);
  if (own) {
    if (reuseOwnedCodexServer && key?.runtime === "codex" && own.key && sameKey(own.key, key)) return { ok: true, reservations: [...reservations] };
    return { ok: false, code: "busy" };
  }
  return { ok: true, reservations: [...reservations, { owner, key }] };
}
export function promoteReservation(reservations: readonly Reservation[], owner: string, key: SessionKey): ReservationResult {
  if (!reservations.some(r => r.owner === owner && r.key === null)) return { ok: false, code: "stale" };
  if (reservations.some(r => r.owner !== owner && r.key && sameKey(r.key, key))) return { ok: false, code: "session_in_use" };
  return { ok: true, reservations: reservations.map(r => r.owner === owner ? { owner, key } : r) };
}
export type ReleaseEvidence = "process_exited" | "not_spawned" | "turn_done" | "kill_requested" | "timeout" | "cleanup_failed" | "unknown";
export function releaseReservation(reservations: readonly Reservation[], owner: string, evidence: ReleaseEvidence): Reservation[] {
  // Codex process_exited means its owned server exited, not merely that a turn ended.
  return evidence === "process_exited" || evidence === "not_spawned" ? reservations.filter(r => r.owner !== owner) : [...reservations];
}
