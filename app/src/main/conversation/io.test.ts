import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync, realpathSync, renameSync, constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSessionTail, claudeOccupancy, codexSessionExists } from "./io";
import { ConversationStore } from "./store";
const hooks = vi.hoisted(() => ({ open: undefined as undefined | ((path: unknown, flags: number) => void), truncate: false, beforeWrite: undefined as undefined | (() => void), oversizedList: false }));
vi.mock("node:fs", async original => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, readdirSync: (path: import("node:fs").PathLike) => hooks.oversizedList ? Array(65537).fill("2026") : fs.readdirSync(path),
    writeSync: (fd: number, buffer: Uint8Array) => { hooks.beforeWrite?.(); return fs.writeSync(fd, buffer); }, openSync: (path: import("node:fs").PathLike, flags: number, mode?: number) => { hooks.open?.(path, flags); return fs.openSync(path, flags, mode); },
    ftruncateSync: (fd: number, length: number) => { if (hooks.truncate) throw new Error("rollback interrupted"); return fs.ftruncateSync(fd, length); } };
});
const roots: string[] = [];
function temp() { const p = mkdtempSync(join(tmpdir(), "doan-conversation-")); roots.push(p); return p; }
afterEach(() => { hooks.open = undefined; hooks.truncate = false; hooks.beforeWrite = undefined; hooks.oversizedList = false; roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
describe("conversation disk boundaries", () => {
  it("reads only complete bounded session tail rows and rejects final links", () => {
    const root = temp(); const path = join(root, "sessions.jsonl");
    const row = { v: 1, at: "2026-10-27T00:00:00.000Z", root: "/repo", canvas: { path: "design/a.html" }, hash: `sha256:${"a".repeat(64)}`, runtime: "claude", sessionId: "s", cwd: "/repo", configDir: "/profile" };
    writeFileSync(path, `${"x".repeat(1024 * 1024)}\n${JSON.stringify(row)}\n${JSON.stringify({ ...row, sessionId: "partial" })}`);
    expect(readSessionTail(root).map(r => r.sessionId)).toEqual(["s"]);
    rmSync(path); const outside = join(temp(), "outside"); writeFileSync(outside, JSON.stringify(row) + "\n"); symlinkSync(outside, path);
    expect(() => readSessionTail(root)).toThrow();
  });
  it("persists ordered validated events and rejects traversal, links and corrupt event shapes", () => {
    const root = temp(); const store = new ConversationStore(root);
    const metadata = { conversationId: "conversation-1", root: "/repo", canvas: { path: "design/a.html" }, title: "Title", state: "current" as const, session: { runtime: "claude" as const, origin: "new" as const, sessionId: "session-1", cwd: "/repo", configDir: "/profile" } };
    store.save([metadata]);
    expect(store.append(metadata.conversationId, "turn-1", { type: "turn.started" }).seq).toBe(1);
    expect(store.append(metadata.conversationId, "turn-1", { type: "message.delta", messageId: "m", text: "hello" }).seq).toBe(2);
    const reopened = new ConversationStore(root); expect(reopened.list()).toEqual([metadata]); expect(reopened.read(metadata.conversationId)).toHaveLength(2);
    expect(() => store.read("../escape")).toThrow();
    const log = join(root, "conversations", "conversation-1.jsonl");
    writeFileSync(log, JSON.stringify({ v: 1, conversationId: "conversation-1", seq: 1, turnId: "t", at: "2026-10-27T00:00:00.000Z", type: "message.done" }) + "\n");
    expect(() => reopened.read(metadata.conversationId)).toThrow();
    rmSync(log); const sentinel = join(temp(), "sentinel"); writeFileSync(sentinel, "unchanged"); symlinkSync(sentinel, log);
    expect(() => store.append(metadata.conversationId, "t", { type: "turn.done" })).toThrow();
    expect(readFileSync(sentinel, "utf8")).toBe("unchanged");
  });
  it("refuses missing and malformed Claude registries and compares UTC process identity", async () => {
    const config = temp(); const start = "Tue Oct 27 12:00:00 2026";
    const inspect = async (pid: number) => pid === 12 ? start : null;
    expect(await claudeOccupancy(config, "s", inspect)).toBe("unknown");
    mkdirSync(join(config, "sessions")); expect(await claudeOccupancy(config, "s", inspect)).toBe("free");
    writeFileSync(join(config, "sessions", "12.json"), JSON.stringify({ pid: 12, sessionId: "s", cwd: "/other", kind: "interactive", version: "2.1.310", procStart: start }));
    expect(await claudeOccupancy(config, "s", inspect)).toBe("occupied");
    writeFileSync(join(config, "sessions", "12.json"), JSON.stringify({ pid: 12, sessionId: "s", cwd: "/other", kind: "interactive", version: "2.1.310", procStart: "Mon Oct 26 12:00:00 2026" }));
    expect(await claudeOccupancy(config, "s", inspect)).toBe("free");
    writeFileSync(join(config, "sessions", "bad.json"), "broken"); expect(await claudeOccupancy(config, "s", inspect)).toBe("unknown");
  });
});

it("keeps seq consistent when a regular log is replaced before the append open", () => {
  const root = realpathSync(temp()); const store = new ConversationStore(root);
  store.append("c", "t", { type: "turn.started" }); const path = join(root, "conversations", "c.jsonl");
  hooks.open = (opened, flags) => {
    if (opened === path && (flags & constants.O_APPEND)) { hooks.open = undefined; renameSync(path, path + ".old"); writeFileSync(path, ""); }
  };
  store.append("c", "t", { type: "turn.done" });
  expect(store.read("c").map(e => e.seq)).toEqual([1]);
  expect(JSON.parse(readFileSync(path + ".old", "utf8")).seq).toBe(1);
});

it("recovers an interrupted replacement rollback on restart before exposing history", () => {
  const root = temp(); const store = new ConversationStore(root);
  const old = { conversationId: "old", root: "/repo", title: "old", state: "current" as const, session: { runtime: "codex" as const, origin: "new" as const, sessionId: "s", configDir: "/profile", cwd: "/repo" } };
  store.save([old]); store.append("old", "t", { type: "turn.done" }); const before = store.read("old");
  const append = store.append.bind(store);
  vi.spyOn(store, "append").mockImplementation((id, turn, body) => { if (id === "new" && body.type === "turn.started") throw new Error("disk full"); return append(id, turn, body); });
  hooks.truncate = true;
  expect(() => store.acceptStart([{ ...old, state: "archived" }, { ...old, conversationId: "new" }], "new", [
    { id: "old", turn: "t", body: { type: "conversation.archived" } },
    { id: "new", turn: "t", body: { type: "user.message", text: "hello", anchors: [] } },
    { id: "new", turn: "t", body: { type: "turn.started" } },
  ])).toThrow("rollback interrupted");
  expect(() => store.list()).toThrow("rollback interrupted");
  hooks.truncate = false;
  const restarted = new ConversationStore(root);
  expect(restarted.list()).toEqual([old]); expect(restarted.read("old")).toEqual(before); expect(restarted.read("new")).toEqual([]);
});
it("keeps a committed replacement when recovery finds the committed index", () => {
  const root = temp(); const store = new ConversationStore(root);
  const entry = { conversationId: "new", root: "/repo", title: "new", state: "current" as const, session: { runtime: "codex" as const, origin: "new" as const, sessionId: "s", configDir: "/profile", cwd: "/repo" } };
  store.append("new", "t", { type: "turn.started" }); store.save([entry]);
  writeFileSync(join(root, "conversations", "start-undo.json"), JSON.stringify({ id: "new", previous: [] }));
  const restarted = new ConversationStore(root); expect(restarted.list()).toEqual([entry]); expect(restarted.read("new")).toHaveLength(1);
});

it("appends to the verified object if its pathname is replaced after reading", () => {
  const root = realpathSync(temp()); const store = new ConversationStore(root);
  store.append("c", "t", { type: "turn.started" }); const path = join(root, "conversations", "c.jsonl");
  hooks.beforeWrite = () => { hooks.beforeWrite = undefined; renameSync(path, path + ".pinned"); writeFileSync(path, ""); };
  expect(store.append("c", "t", { type: "turn.done" }).seq).toBe(2);
  expect(readFileSync(path, "utf8")).toBe("");
  expect(readFileSync(path + ".pinned", "utf8").trim().split("\n").map(line => JSON.parse(line).seq)).toEqual([1, 2]);
});
it("fails closed when the Codex storage enumeration budget is exhausted", () => {
  const root = realpathSync(temp()); mkdirSync(join(root, "sessions")); hooks.oversizedList = true;
  expect(codexSessionExists(root, "01a178ba-f9dc-7161-9544-f20f656064a1", root)).toBe(false);
});
