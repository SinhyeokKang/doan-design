import { describe, expect, it, vi } from "vitest";
import { CodexDispatcher, RpcError } from "./dispatcher";
import type { EventPayload, TransportState } from "./types";
function harness() {
  const writes: unknown[] = [], events: EventPayload[] = []; const cleanup = vi.fn();
  const rpc = new CodexDispatcher(v => writes.push(v), v => events.push(v), cleanup);
  rpc.begin({ root: "/repo", sessionId: "s", turnId: "t" });
  return { rpc, writes, events, cleanup };
}
describe("Codex wire dispatcher", () => {
  it.each([
    ["a malformed message", (h: ReturnType<typeof harness>) => h.rpc.receive({ id: null, method: "bad", params: {} })],
    ["close", (h: ReturnType<typeof harness>) => h.rpc.close()],
  ])("drops cached file summaries when %s closes the dispatcher before the transport ends", (_, closeIt) => {
    const h = harness(); const summaries = () => (h.rpc as unknown as { state: TransportState }).state.fileSummaries;
    h.rpc.receive({ method: "item/started", params: { threadId: "s", turnId: "t", item: { type: "fileChange", id: "f", changes: [{ path: "/repo/a.html", kind: { type: "add" }, diff: "" }] } } });
    expect(summaries()).toEqual({ f: "a.html" });
    closeIt(h); expect(summaries()).toEqual({});
    const before = h.events.length; h.rpc.end(); expect(summaries()).toEqual({}); expect(h.events.length).toBe(before);
  });
  it("publishes command activity without the command, while the approval still shows it", () => {
    const h = harness(); const command = "API_TOKEN=SYNTH_ENV_SECRET curl -H 'Authorization: Bearer SYNTH_BEARER_SECRET' https://u:SYNTH_URL_PASSWORD@example.invalid";
    h.rpc.receive({ method: "item/started", params: { threadId: "s", turnId: "t", item: { type: "commandExecution", id: "c", command, commandActions: [] } } });
    expect(h.events).toEqual([{ type: "activity", kind: "command", summary: "Running a command" }]);
    h.rpc.receive({ id: 4, method: "item/commandExecution/requestApproval", params: { threadId: "s", turnId: "t", itemId: "c", command } });
    expect(h.events.at(-1)).toMatchObject({ type: "permission.request", summary: command });
  });
  it("settles unsupported global foreign and post-terminal requests with original typed IDs", () => {
    const h = harness();
    for (const id of [0, "0", 3]) h.rpc.receive({ id, method: "account/unknown", params: {} });
    h.rpc.receive({ method: "turn/completed", params: { threadId: "s", turn: { id: "t", status: "completed" } } });
    h.rpc.receive({ id: "late", method: "item/fileChange/requestApproval", params: { threadId: "s", turnId: "t" } });
    h.rpc.receive({ id: "foreign", method: "item/fileChange/requestApproval", params: { threadId: "other", turnId: "t" } });
    expect(h.writes).toEqual([0, "0", 3, "late", "foreign"].map(id => ({ id, error: { code: -32601, message: "Unsupported request or unavailable owner." } })));
    expect(h.events.filter(e => e.type === "turn.done")).toHaveLength(1);
  });
  it("sends only offered permission replies and rejects stale replies after interruption", () => {
    const h = harness(); h.rpc.receive({ id: 7, method: "item/fileChange/requestApproval", params: { threadId: "s", turnId: "t" } });
    expect(h.rpc.answer("number:7", "decline")).toBe(true);
    expect(h.writes).toEqual([{ id: 7, result: { decision: "decline" } }]);
    expect(h.events.at(-1)).toEqual({ type: "permission.resolved", requestId: "number:7", optionId: "decline" });
    expect(h.rpc.answer("number:7", "accept")).toBe(false);
    h.rpc.receive({ id: "8", method: "item/fileChange/requestApproval", params: { threadId: "s", turnId: "t" } });
    h.rpc.expire(); expect(h.rpc.answer("string:8", "accept")).toBe(false);
    expect(h.writes.at(-1)).toMatchObject({ id: "8", error: { code: -32601 } });
  });
  it("isolates exact pending IDs and instances and settles promises once", async () => {
    const h = harness(), other = harness(); const p = h.rpc.request("test", {}, { requestId: 0, sessionId: "s", turnId: "t" });
    h.rpc.receive({ id: "0", result: "wrong type" }); other.rpc.receive({ id: 0, result: "wrong server" });
    h.rpc.receive({ id: 0, result: "ok" }); h.rpc.receive({ id: 0, error: { message: "late" } });
    expect(await p).toBe("ok"); expect(h.events).toEqual([]);
    const pending = h.rpc.request("next", {}); const rejected = expect(pending).rejects.toThrow(); h.rpc.close(); await rejected;
  });
  it("does not attribute old reply errors to the current turn and cleans malformed envelopes", async () => {
    const h = harness(); const p = h.rpc.request("test", {}, { requestId: 2, sessionId: "s", turnId: "old" }); const rejected = expect(p).rejects.toThrow();
    h.rpc.receive({ id: 2, error: { message: "old failed" } }); await rejected; expect(h.events).toEqual([]);
    h.rpc.receive({ id: null, method: "bad", params: {} }); expect(h.cleanup).toHaveBeenCalledOnce();
  });
});

it("expires permissions and rejects pending RPCs before one transport failure", async () => {
  const events: EventPayload[] = [];
  let dead = false;
  const rpc = new CodexDispatcher(() => { if (dead) throw new Error("closed pipe"); }, e => events.push(e), () => { throw new Error("must not classify dead-pipe expiry as protocol failure"); });
  rpc.begin({ root: "/repo", sessionId: "s", turnId: "t" });
  rpc.receive({ id: 7, method: "item/fileChange/requestApproval", params: { threadId: "s", turnId: "t" } });
  const pending = expect(rpc.request("test", {})).rejects.toThrow("process_exited");
  dead = true; rpc.end(); rpc.end(); await pending;
  expect(events.slice(1)).toEqual([{ type: "permission.resolved", requestId: "number:7", optionId: "expired" }, { type: "turn.failed", code: "process_exited" }]);
  expect(rpc.answer("number:7", "accept")).toBe(false);
});
it("keeps a stop requested before the native turn reply when transport ends", () => {
  const events: EventPayload[] = [];
  const rpc = new CodexDispatcher(() => {}, e => events.push(e), () => {});
  rpc.begin({ root: "/repo", sessionId: "s", turnId: "local" });
  rpc.stop("user"); rpc.started("native"); rpc.end();
  expect(events).toEqual([{ type: "interrupted", reason: "user" }]);
});
it("tags only a server error reply to the matched pending request as an RPC error", async () => {
  const h = harness();
  const answered = h.rpc.request("initialize", {}); const owned = answered.catch((error: unknown) => error);
  h.rpc.receive({ id: "doan-99", error: { message: "unowned" } });
  h.rpc.receive({ id: "doan-1", error: { message: "Unsupported protocol" } });
  const error = await owned;
  expect(error).toBeInstanceOf(RpcError); expect((error as Error).message).toBe("Unsupported protocol");
  const lost = h.rpc.request("thread/start", {}).catch((e: unknown) => e); h.rpc.close();
  expect(await lost).not.toBeInstanceOf(RpcError);
  const unwritable = new CodexDispatcher(() => { throw new Error("closed pipe"); }, () => {}, () => {});
  expect(await unwritable.request("initialize", {}).catch((e: unknown) => e)).not.toBeInstanceOf(RpcError);
});
it("does not tag an RPC timeout as an error reply", async () => {
  vi.useFakeTimers();
  try {
    const h = harness(); const timedOut = h.rpc.request("initialize", {}).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    const error = await timedOut; expect((error as Error).message).toBe("RPC timeout"); expect(error).not.toBeInstanceOf(RpcError);
  } finally { vi.useRealTimers(); }
});
