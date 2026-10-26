import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSessionTail, claudeOccupancy } from "./io";
import { ConversationStore } from "./store";
const roots: string[] = [];
function temp() { const p = mkdtempSync(join(tmpdir(), "doan-conversation-")); roots.push(p); return p; }
afterEach(() => roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })));
describe("conversation disk boundaries", () => {
  it("reads only complete bounded session tail rows and rejects final links", () => {
    const root = temp(); const path = join(root, "sessions.jsonl");
    const row = { v: 1, at: "2026-10-27T00:00:00Z", root: "/repo", canvas: { path: "design/a.html" }, hash: `sha256:${"a".repeat(64)}`, runtime: "claude", sessionId: "s", cwd: "/repo", configDir: "/profile" };
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
    writeFileSync(log, JSON.stringify({ v: 1, conversationId: "conversation-1", seq: 1, turnId: "t", at: "2026-10-27T00:00:00Z", type: "message.done" }) + "\n");
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
    writeFileSync(join(config, "sessions", "12.json"), JSON.stringify({ pid: 12, sessionId: "s", cwd: "/other", kind: "interactive", version: "2.1.310", procStart: "older" }));
    expect(await claudeOccupancy(config, "s", inspect)).toBe("free");
    writeFileSync(join(config, "sessions", "bad.json"), "broken"); expect(await claudeOccupancy(config, "s", inspect)).toBe("unknown");
  });
});
