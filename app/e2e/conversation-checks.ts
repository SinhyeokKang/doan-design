import assert from "node:assert/strict";

export interface WireRow {
  runtime: "claude" | "codex"; pid: number; child?: number; kind: string; value?: Record<string, unknown>;
}

export async function verifyConversation(copyEvidence: () => Promise<void>, verifyState: () => Promise<void>, verifyPeers: () => Promise<void>): Promise<void> {
  const failures: unknown[] = [];
  for (const check of [copyEvidence, verifyState, verifyPeers]) {
    try { await check(); } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, "conversation verification failed");
}

export function assertCodexResponse(rows: WireRow[], pid: number, requestId: string, expected: Record<string, unknown>): void {
  const responses = rows.filter(r => r.runtime === "codex" && r.pid === pid && r.kind === "in" && r.value?.id === requestId && !("method" in r.value));
  assert.equal(responses.length, 1, `${pid}/${requestId} settles exactly once`);
  const response = responses[0]; assert.ok(response?.value);
  assert.deepEqual(response.value, { id: requestId, ...expected });
}
