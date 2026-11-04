import { describe, expect, it, vi } from "vitest";
import { CodexDispatcher, RpcError } from "./dispatcher";
import elicitation from "./fixtures/codex-mcp-elicitation.json";
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
// queue-send-now: turn/steer goes through a request whose timeout refuses only that steer, and its echo is reported
// in line with the turn's events.
describe("Codex steer path", () => {
  function steering() {
    const writes: unknown[] = [], seen: unknown[] = []; const cleanup = vi.fn();
    const rpc = new CodexDispatcher(v => writes.push(v), v => seen.push(v), cleanup, id => seen.push({ consumed: id }));
    rpc.begin({ root: "/repo", sessionId: "s", turnId: "local" }); rpc.started("t");
    return { rpc, writes, seen, cleanup };
  }
  const echo = (clientId: string) => ({ method: "item/started", params: { threadId: "s", turnId: "t", item: { type: "userMessage", id: "u", clientId, content: [] } } });
  it("reports a steered message's echo between the turn's events, once", async () => {
    const h = steering();
    h.rpc.receive({ method: "item/agentMessage/delta", params: { threadId: "s", turnId: "t", itemId: "m", delta: "a" } });
    const accepted = h.rpc.steer({ threadId: "s", expectedTurnId: "t", input: [], clientUserMessageId: "c1" }, "c1");
    expect(h.writes).toEqual([{ id: "doan-1", method: "turn/steer", params: { threadId: "s", expectedTurnId: "t", input: [], clientUserMessageId: "c1" } }]);
    h.rpc.receive({ id: "doan-1", result: { turnId: "t" } }); await expect(accepted).resolves.toEqual({ turnId: "t" });
    h.rpc.receive(echo("c1")); h.rpc.receive({ method: "item/completed", params: { threadId: "s", turnId: "t", item: { type: "userMessage", id: "u", clientId: "c1", content: [] } } });
    h.rpc.receive({ method: "turn/completed", params: { threadId: "s", turn: { id: "t", status: "completed" } } });
    expect(h.seen).toEqual([{ type: "message.delta", messageId: "m", text: "a" }, { consumed: "c1" }, { type: "turn.done" }]);
  });
  it("refuses a steer the server answers with an error without failing the turn, and never reports it read", async () => {
    const h = steering();
    const refused = h.rpc.steer({}, "c1").catch((e: unknown) => e);
    // The echo right behind the error in the same chunk is received before the rejection's handlers run.
    h.rpc.receive({ id: "doan-1", error: { code: -32600, message: "no active turn to steer" } }); h.rpc.receive(echo("c1"));
    const error = await refused; expect(error).toBeInstanceOf(RpcError); expect((error as Error).message).toBe("no active turn to steer");
    expect(h.seen).toEqual([]); expect(h.cleanup).not.toHaveBeenCalled(); expect(h.rpc.running()).toBe(true);
  });
  it("refuses a steer unanswered for 10 s without failing the turn or the protocol", async () => {
    vi.useFakeTimers();
    try {
      const h = steering();
      const timedOut = h.rpc.steer({}, "c1").catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(((await timedOut) as Error).message).toBe("RPC timeout");
      expect(h.cleanup).not.toHaveBeenCalled(); expect(h.rpc.running()).toBe(true);
      // The server may still have taken it, so a late echo is still the message's consumption.
      h.rpc.receive({ id: "doan-1", result: { turnId: "t" } }); h.rpc.receive(echo("c1"));
      h.rpc.receive({ method: "turn/completed", params: { threadId: "s", turn: { id: "t", status: "completed" } } });
      expect(h.seen).toEqual([{ consumed: "c1" }, { type: "turn.done" }]); expect(h.cleanup).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("refuses a steer once the turn has ended, without writing it", async () => {
    const h = steering();
    h.rpc.receive({ method: "turn/completed", params: { threadId: "s", turn: { id: "t", status: "completed" } } });
    expect(h.rpc.running()).toBe(false);
    await expect(h.rpc.steer({}, "c1")).rejects.toThrow("not_running");
    const closed = steering(); closed.rpc.close(); expect(closed.rpc.running()).toBe(false);
    await expect(closed.rpc.steer({}, "c1")).rejects.toThrow("not_running");
    const stopped = steering(); stopped.rpc.stop("user"); expect(stopped.rpc.running()).toBe(false);
    await expect(stopped.rpc.steer({}, "c1")).rejects.toThrow("not_running");
    expect([...h.writes, ...closed.writes, ...stopped.writes]).toEqual([]);
  });
});

// mcp-connectors C2 (POSTMORTEM 2026-10-27 'Codex ingress confused unowned requests and notification errors'): every
// MCP elicitation is answered exactly once with an explicit disposition, and none of them fails the turn.
describe("Codex MCP elicitation wiring", () => {
  const thread = elicitation.params.threadId, turn = elicitation.params.turnId;
  function mcp() {
    const writes: unknown[] = [], events: EventPayload[] = []; const cleanup = vi.fn();
    const rpc = new CodexDispatcher(v => writes.push(v), v => events.push(v), cleanup);
    rpc.begin({ root: "/repo", sessionId: thread, turnId: turn, labels: { "doan-echo-poc": "Echo" } });
    return { rpc, writes, events, cleanup };
  }
  const withParams = (id: number | string, patch: Record<string, unknown>) => ({ ...elicitation, id, params: { ...elicitation.params, ...patch } });
  const done = { method: "turn/completed", params: { threadId: thread, turn: { id: turn, status: "completed" } } };
  it.each([
    ["accept", { action: "accept", content: {} }],
    ["decline", { action: "decline" }],
    ["acceptForSession", { action: "accept", content: {}, _meta: { persist: "session" } }],
  ])("asks with the connector's name and sends the answer for %s once", (option, result) => {
    const h = mcp(); h.rpc.receive(elicitation);
    expect(h.events).toEqual([expect.objectContaining({ type: "permission.request", requestId: "number:7", tool: "mcpToolCall", summary: "Run ping on Echo" })]);
    expect(h.writes).toEqual([]);
    expect(h.rpc.answer("number:7", option)).toBe(true);
    expect(h.rpc.answer("number:7", option)).toBe(false);
    expect(h.writes).toEqual([{ id: 7, result }]);
    expect(h.events.at(-1)).toEqual({ type: "permission.resolved", requestId: "number:7", optionId: option });
    h.rpc.receive(done); expect(h.events.at(-1)).toEqual({ type: "turn.done" }); expect(h.cleanup).not.toHaveBeenCalled();
  });
  it("refuses the always option Codex offers, which would write a lasting approval", () => {
    const h = mcp(); h.rpc.receive(elicitation);
    expect(h.rpc.answer("number:7", "always")).toBe(false); expect(h.writes).toEqual([]);
  });
  it("declines a form elicitation at once and keeps the turn running", () => {
    const h = mcp(); h.rpc.receive(withParams(8, { _meta: { codex_approval_kind: "form" } }));
    expect(h.writes).toEqual([{ id: 8, result: { action: "decline" } }]);
    expect(h.events).toEqual([]); expect(h.rpc.running()).toBe(true);
    h.rpc.receive({ method: "item/agentMessage/delta", params: { threadId: thread, turnId: turn, itemId: "m", delta: "go on" } });
    h.rpc.receive(done);
    expect(h.events).toEqual([{ type: "message.delta", messageId: "m", text: "go on" }, { type: "turn.done" }]);
    expect(h.cleanup).not.toHaveBeenCalled();
  });
  it("declines an approval that comes after the turn ended and leaves nothing pending", () => {
    const h = mcp(); h.rpc.receive(done); h.rpc.receive(withParams("late", {}));
    expect(h.writes).toEqual([{ id: "late", result: { action: "decline" } }]);
    expect(h.events).toEqual([{ type: "turn.done" }]);
    expect(h.rpc.answer("string:late", "accept")).toBe(false); expect(h.writes).toHaveLength(1);
  });
  it("answers another thread's or turn's elicitation once without asking or failing this turn", () => {
    const h = mcp();
    h.rpc.receive(withParams(9, { threadId: "other" })); h.rpc.receive(withParams(10, { turnId: "other" }));
    expect(h.writes).toEqual([9, 10].map(id => ({ id, error: { code: -32601, message: "Unsupported request or unavailable owner." } })));
    expect(h.events).toEqual([]); expect(h.rpc.running()).toBe(true); expect(h.cleanup).not.toHaveBeenCalled();
  });
  it("answers an unanswered approval once when the turn ends", () => {
    const h = mcp(); h.rpc.receive(elicitation); h.rpc.receive(done);
    expect(h.writes).toEqual([{ id: 7, error: { code: -32601, message: "Unsupported request or unavailable owner." } }]);
    expect(h.events.slice(1)).toEqual([{ type: "turn.done" }, { type: "permission.resolved", requestId: "number:7", optionId: "expired" }]);
    expect(h.rpc.answer("number:7", "accept")).toBe(false); expect(h.writes).toHaveLength(1);
  });
  it("fails the protocol on a repeated request id instead of answering twice", () => {
    const h = mcp(); h.rpc.receive(elicitation); h.rpc.receive(elicitation);
    // Closing answers the first one, once.
    expect(h.cleanup).toHaveBeenCalledOnce(); expect(h.writes).toEqual([{ id: 7, error: { code: -32601, message: "Unsupported request or unavailable owner." } }]);
  });
});
