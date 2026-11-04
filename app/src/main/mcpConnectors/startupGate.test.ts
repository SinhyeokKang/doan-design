import { expect, test } from "vitest";
import events from "../conversation/fixtures/codex-mcp-startup-status.json";
import { codexStartupGate } from "./startupGate";

// One thread's mcpServer/startupStatus/updated notifications from the P2 probe (Codex 0.166.0): four servers start,
// the signed-out doan-notion fails about 45 ms later, the remote servers are ready after 1-1.6 s. The committed log had
// the server names redacted; they are put back from the probe notes.
const params = events.map(event => event.params);
const NAMES = ["doan-notion", "doan-atlassian", "doan-figma"];

test("a turn waits for every registered doan- server; failed counts as settled and other servers are not waited for", () => {
  expect(codexStartupGate([], NAMES, 0)).toEqual({ kind: "wait" });
  expect(codexStartupGate(params.slice(0, 4), NAMES, 50)).toEqual({ kind: "wait" });
  // doan-notion failed; the others still start.
  expect(codexStartupGate(params.slice(0, 5), NAMES, 50)).toEqual({ kind: "wait" });
  // doan-atlassian and codex_apps are ready; doan-figma is not yet.
  expect(codexStartupGate(params.slice(0, 7), NAMES, 50)).toEqual({ kind: "wait" });
  expect(codexStartupGate(params, NAMES, 50)).toEqual({ kind: "start" });
  expect(codexStartupGate(params, NAMES, 20_000)).toEqual({ kind: "start" });
});

test("with no doan- server registered the turn starts at once", () => {
  expect(codexStartupGate([], [], 0)).toEqual({ kind: "start" });
  expect(codexStartupGate(params.slice(0, 4), [], 0)).toEqual({ kind: "start" });
});

test("past one second the wait names the servers still starting; at ten seconds the turn starts without them", () => {
  const partial = params.slice(0, 5);
  expect(codexStartupGate(partial, NAMES, 1000)).toEqual({ kind: "wait" });
  expect(codexStartupGate(partial, NAMES, 1001)).toEqual({ kind: "wait_notice", names: ["doan-atlassian", "doan-figma"] });
  expect(codexStartupGate(partial, NAMES, 9999)).toEqual({ kind: "wait_notice", names: ["doan-atlassian", "doan-figma"] });
  expect(codexStartupGate(partial, NAMES, 10_000)).toEqual({ kind: "start_without", names: ["doan-atlassian", "doan-figma"] });
  // A server that never reported counts as still starting.
  expect(codexStartupGate([], NAMES, 10_000)).toEqual({ kind: "start_without", names: NAMES });
});

test("the latest status of a server wins, so a reused thread that restarts a server waits for it again", () => {
  const status = (name: string, value: string) => ({ threadId: "thread-1", name, status: value, error: null, failureReason: null });
  expect(codexStartupGate([status("doan-notion", "ready"), status("doan-notion", "starting")], ["doan-notion"], 0)).toEqual({ kind: "wait" });
  expect(codexStartupGate([status("doan-notion", "starting"), status("doan-notion", "cancelled")], ["doan-notion"], 0)).toEqual({ kind: "start" });
});

test("a malformed notification is ignored", () => {
  const ready = { threadId: "thread-1", name: "doan-notion", status: "ready", error: null, failureReason: null };
  for (const bad of [null, "ready", { name: "doan-notion" }, { name: 1, status: "ready" }, { name: "doan-notion", status: "unknown" }])
    expect(codexStartupGate([bad, ready], ["doan-notion"], 0), JSON.stringify(bad)).toEqual({ kind: "start" });
  expect(codexStartupGate([ready, { name: "doan-notion", status: "unknown" }], ["doan-notion"], 0)).toEqual({ kind: "start" });
});
