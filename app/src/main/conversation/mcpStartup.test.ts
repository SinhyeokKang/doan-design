import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import statuses from "./fixtures/codex-mcp-startup-status.json";
import { CodexStartupWatch, codexProfileServers, notReadyLine, waitingLine } from "./mcpStartup";
import type { EventPayload } from "./types";

// One thread's mcpServer/startupStatus/updated notifications from the P2 probe (Codex 0.166.0, names put back from the
// probe notes): four servers start, the signed-out doan-notion fails, the remote servers are ready after 1-1.6 s.
const THREAD = "thread-1014";
const NAMES = ["doan-notion", "doan-atlassian", "doan-figma"];
const LABELS = { "doan-notion": "Notion", "doan-atlassian": "Atlassian", "doan-figma": "Figma" };
const status = (threadId: string, name: string, value: string) => ({ method: "mcpServer/startupStatus/updated", params: { threadId, name, status: value, error: null, failureReason: null } });

describe("the doan- servers a Codex profile registers", () => {
  it("reads every [mcp_servers.doan-*] table, bare or quoted, and nothing else", () => {
    const toml = [
      'model = "gpt-6"',
      "[mcp_servers.doan-notion]",
      'url = "https://mcp.notion.com/mcp"',
      '[mcp_servers."doan-example-com"]',
      'url = "https://example.com/mcp"',
      "  [ mcp_servers.doan-figma ]  # trailing comment",
      "[mcp_servers.doan-notion.env]",
      "[mcp_servers.notion]",
      "[mcp_servers.codex_apps]",
      "[mcp_servers.doan-Notion]",
      "[mcp_servers.doan-]",
      `[mcp_servers.doan-${"a".repeat(17)}]`,
      "# [mcp_servers.doan-commented]",
      'note = "[mcp_servers.doan-in-string]"',
    ].join("\n");
    expect(codexProfileServers(toml)).toEqual(["doan-notion", "doan-example-com", "doan-figma"]);
  });
  it("names a server once and reads an empty or unrelated profile as none", () => {
    expect(codexProfileServers("[mcp_servers.doan-notion]\n[mcp_servers.doan-notion]\n")).toEqual(["doan-notion"]);
    expect(codexProfileServers("")).toEqual([]);
    expect(codexProfileServers('model = "gpt-6"\n[profiles.fast]\n')).toEqual([]);
  });
});

describe("the activity lines of the wait", () => {
  it("names the connectors, never their doan- names", () => {
    expect(waitingLine(["doan-notion"], LABELS)).toBe("Waiting for Notion");
    expect(waitingLine(["doan-notion", "doan-figma"], LABELS)).toBe("Waiting for Notion and Figma");
    expect(waitingLine(NAMES, LABELS)).toBe("Waiting for Notion, Atlassian and Figma");
    expect(waitingLine(["doan-example-com"], {})).toBe("Waiting for example-com");
    expect(notReadyLine(["doan-notion"], LABELS)).toBe("Notion wasn’t ready, so this turn started without it.");
    expect(notReadyLine(["doan-notion", "doan-figma"], LABELS)).toBe("Notion and Figma weren’t ready, so this turn started without them.");
  });
  it("keeps the line within 512 characters", () => {
    const names = Array.from({ length: 64 }, (_, index) => `doan-server-${index}`);
    expect(waitingLine(names, {}).length).toBeLessThanOrEqual(512);
    expect(notReadyLine(names, {}).length).toBeLessThanOrEqual(512);
  });
});

describe("the startup watch of one Codex runner", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  function waiting(watch: CodexStartupWatch, names = NAMES, thread = THREAD) {
    const events: EventPayload[] = []; let result: boolean | undefined;
    const wait = watch.wait(thread, names, LABELS, event => events.push(event));
    void wait.started.then(value => { result = value; });
    return { events, wait, result: () => result };
  }

  it("takes only startup notifications, and only this thread's once the thread is known", () => {
    const watch = new CodexStartupWatch();
    expect(watch.receive(status(THREAD, "doan-notion", "ready"), "")).toBe(true);
    expect(watch.receive({ id: 3, ...status(THREAD, "doan-notion", "ready") }, THREAD)).toBe(false);
    expect(watch.receive({ method: "item/started", params: { threadId: THREAD } }, THREAD)).toBe(false);
    expect(watch.receive({ method: "mcpServer/startupStatus/updated", params: null }, THREAD)).toBe(false);
    // Another thread's notification (the runner's ephemeral defaults probe) is consumed but not counted.
    expect(watch.receive(status("probe", "doan-figma", "ready"), THREAD)).toBe(true);
    expect(watch.settled(THREAD, ["doan-figma"])).toBe(false);
    expect(watch.settled(THREAD, ["doan-notion"])).toBe(true);
  });

  it("keeps what arrived before the thread id was known: thread/start's reply and its first notifications share a chunk", () => {
    const watch = new CodexStartupWatch();
    for (const event of statuses) watch.receive(event, "");
    expect(watch.settled(THREAD, NAMES)).toBe(true);
    expect(watch.settled("other", NAMES)).toBe(false);
  });

  it("starts at once when every server already settled, and with no server to wait for", async () => {
    const watch = new CodexStartupWatch();
    for (const event of statuses) watch.receive(event, THREAD);
    const settled = waiting(watch); await vi.advanceTimersByTimeAsync(0);
    expect(settled.result()).toBe(true); expect(settled.events).toEqual([]);
    const none = waiting(new CodexStartupWatch(), []); await vi.advanceTimersByTimeAsync(0);
    expect(none.result()).toBe(true); expect(none.events).toEqual([]);
  });

  it("waits for the servers still starting and starts when the last one settles, without a line under one second", async () => {
    const watch = new CodexStartupWatch();
    for (const event of statuses.slice(0, 5)) watch.receive(event, THREAD);
    const h = waiting(watch);
    await vi.advanceTimersByTimeAsync(500); expect(h.result()).toBeUndefined();
    watch.receive(statuses[5], THREAD); await vi.advanceTimersByTimeAsync(0); expect(h.result()).toBeUndefined();
    // Another thread's ready says nothing about this one.
    watch.receive(status("probe", "doan-figma", "ready"), THREAD); await vi.advanceTimersByTimeAsync(0); expect(h.result()).toBeUndefined();
    watch.receive(status(THREAD, "doan-figma", "failed"), THREAD); await vi.advanceTimersByTimeAsync(0);
    expect(h.result()).toBe(true); expect(h.events).toEqual([]);
  });

  it("after one second shows one Waiting line naming what is still starting, and no second one", async () => {
    const watch = new CodexStartupWatch();
    for (const event of statuses.slice(0, 5)) watch.receive(event, THREAD);
    const h = waiting(watch);
    await vi.advanceTimersByTimeAsync(1000); expect(h.events).toEqual([]);
    await vi.advanceTimersByTimeAsync(1); expect(h.events).toEqual([{ type: "activity", kind: "other", summary: "Waiting for Atlassian and Figma" }]);
    watch.receive(statuses[5], THREAD); await vi.advanceTimersByTimeAsync(3000);
    expect(h.events).toHaveLength(1);
    watch.receive(statuses[7], THREAD); await vi.advanceTimersByTimeAsync(0);
    expect(h.result()).toBe(true); expect(h.events).toHaveLength(1);
  });

  it("at ten seconds starts without the servers still starting and says so", async () => {
    const watch = new CodexStartupWatch();
    for (const event of statuses.slice(0, 5)) watch.receive(event, THREAD);
    const h = waiting(watch);
    watch.receive(statuses[5], THREAD);
    await vi.advanceTimersByTimeAsync(9999); expect(h.result()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.result()).toBe(true);
    expect(h.events).toEqual([
      { type: "activity", kind: "other", summary: "Waiting for Figma" },
      { type: "activity", kind: "other", summary: "Figma wasn’t ready, so this turn started without it." },
    ]);
  });

  it("a server that never reported counts as starting", async () => {
    const h = waiting(new CodexStartupWatch(), ["doan-notion"]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.result()).toBe(true);
    expect(h.events.map(e => e.type === "activity" && e.summary)).toEqual(["Waiting for Notion", "Notion wasn’t ready, so this turn started without it."]);
  });

  it("after a reload forgets those servers' statuses and waits for new ones", async () => {
    const watch = new CodexStartupWatch();
    for (const event of statuses) watch.receive(event, THREAD);
    watch.forget(THREAD, ["doan-notion", "doan-figma"]);
    expect(watch.settled(THREAD, ["doan-atlassian"])).toBe(true);
    const h = waiting(watch);
    await vi.advanceTimersByTimeAsync(50); expect(h.result()).toBeUndefined();
    watch.receive(status(THREAD, "doan-notion", "starting"), THREAD); watch.receive(status(THREAD, "doan-figma", "starting"), THREAD);
    watch.receive(status(THREAD, "doan-notion", "ready"), THREAD); await vi.advanceTimersByTimeAsync(0); expect(h.result()).toBeUndefined();
    watch.receive(status(THREAD, "doan-figma", "ready"), THREAD); await vi.advanceTimersByTimeAsync(0);
    expect(h.result()).toBe(true); expect(h.events).toEqual([]);
  });

  it("a cancelled wait settles false at once and writes nothing more", async () => {
    const h = waiting(new CodexStartupWatch(), ["doan-notion"]);
    await vi.advanceTimersByTimeAsync(1500); expect(h.events).toHaveLength(1);
    h.wait.cancel(); await vi.advanceTimersByTimeAsync(0);
    expect(h.result()).toBe(false);
    await vi.advanceTimersByTimeAsync(20_000); expect(h.events).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("holds a bounded number of threads and servers", () => {
    const watch = new CodexStartupWatch();
    for (let index = 0; index < 100; index += 1) watch.receive(status(`t-${index}`, "doan-notion", "ready"), "");
    for (let index = 0; index < 1000; index += 1) watch.receive(status(THREAD, `doan-s-${index}`, "ready"), THREAD);
    expect(watch.size()).toBeLessThanOrEqual(8 * 256);
  });
});
