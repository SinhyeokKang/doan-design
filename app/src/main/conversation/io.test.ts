import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync, realpathSync, renameSync, constants, openSync, closeSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { readSessionTail, claudeOccupancy, codexOccupancy, codexSessionExists, fileHolders, type FileHolder } from "./io";
import { ConversationStore } from "./store";
const hooks = vi.hoisted(() => ({ open: undefined as undefined | ((path: unknown, flags: number) => void), truncate: false, beforeWrite: undefined as undefined | (() => void), oversizedList: false }));
vi.mock("node:fs", async original => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, readdirSync: (path: import("node:fs").PathLike) => hooks.oversizedList ? Array(65537).fill("2026") : fs.readdirSync(path),
    writeSync: (fd: number, buffer: Uint8Array) => { hooks.beforeWrite?.(); return fs.writeSync(fd, buffer); }, openSync: (path: import("node:fs").PathLike, flags: number, mode?: number) => { hooks.open?.(path, flags); return fs.openSync(path, flags, mode); },
    ftruncateSync: (fd: number, length: number) => { if (hooks.truncate) throw new Error("rollback interrupted"); return fs.ftruncateSync(fd, length); } };
});
// lsof replies for fileHolders; undefined runs the real command.
const lsof = vi.hoisted(() => ({ reply: undefined as undefined | { error: null | { code?: unknown; killed?: boolean; signal?: string }; stdout: string; stderr: string } }));
vi.mock("node:child_process", async original => {
  const cp = await original<typeof import("node:child_process")>();
  return { ...cp, execFile: (...args: unknown[]) => {
    const reply = lsof.reply; if (!reply || args[0] !== "/usr/sbin/lsof") return (cp.execFile as (...a: unknown[]) => unknown)(...args);
    const callback = args.at(-1) as (error: unknown, stdout: string, stderr: string) => void;
    queueMicrotask(() => callback(reply.error && Object.assign(new Error("lsof"), reply.error), reply.stdout, reply.stderr));
  } };
});
const roots: string[] = [];
function temp() { const p = mkdtempSync(join(tmpdir(), "doan-conversation-")); roots.push(p); return p; }
afterEach(() => { lsof.reply = undefined; hooks.open = undefined; hooks.truncate = false; hooks.beforeWrite = undefined; hooks.oversizedList = false; roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });
describe("conversation disk boundaries", () => {
  it("reads only complete bounded session tail rows and rejects final links", () => {
    const root = temp(); const path = join(root, "sessions.jsonl");
    const row = { v: 1, at: "2026-10-27T00:00:00.000Z", root: "/repo", canvas: { path: ".doan/canvases/a.html" }, hash: `sha256:${"a".repeat(64)}`, runtime: "claude", sessionId: "s", cwd: "/repo", configDir: "/profile" };
    writeFileSync(path, `${"x".repeat(1024 * 1024)}\n${JSON.stringify(row)}\n${JSON.stringify({ ...row, sessionId: "partial" })}`);
    expect(readSessionTail(root).map(r => r.sessionId)).toEqual(["s"]);
    rmSync(path); const outside = join(temp(), "outside"); writeFileSync(outside, JSON.stringify(row) + "\n"); symlinkSync(outside, path);
    expect(() => readSessionTail(root)).toThrow();
  });
  it("persists ordered validated events and rejects traversal, links and corrupt event shapes", () => {
    const root = temp(); const store = new ConversationStore(root);
    const metadata = { conversationId: "conversation-1", root: "/repo", canvas: { path: ".doan/canvases/a.html" }, title: "Title", state: "current" as const, owner: { kind: "legacy-external" as const }, session: { runtime: "claude" as const, origin: "new" as const, sessionId: "session-1", cwd: "/repo", configDir: "/profile" } };
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
  it("reads bound and restored lines in event v1 and still refuses unknown types and bad canvases", () => {
    const root = temp(); const store = new ConversationStore(root);
    const log = join(root, "conversations", "c.jsonl");
    const line = (seq: number, body: Record<string, unknown>) => JSON.stringify({ v: 1, conversationId: "c", seq, turnId: "t", at: "2026-10-31T00:00:00.000Z", ...body }) + "\n";
    writeFileSync(log, line(1, { type: "turn.started" }) + line(2, { type: "turn.done" }) + line(3, { type: "conversation.bound", canvas: { path: ".doan/canvases/a.html", id: "a" } }) +
      line(4, { type: "conversation.archived" }) + line(5, { type: "conversation.restored" }));
    expect(store.read("c").map(e => e.type)).toEqual(["turn.started", "turn.done", "conversation.bound", "conversation.archived", "conversation.restored"]);
    expect(store.append("c", "t", { type: "conversation.bound", canvas: { path: ".doan/canvases/b.html" } }).seq).toBe(6);
    for (const bad of [{ type: "conversation.unbound" }, { type: "conversation.bound" }, { type: "conversation.bound", canvas: { path: "../a.html" } }]) {
      writeFileSync(log, line(1, { type: "turn.started" }) + line(2, bad));
      expect(() => store.read("c")).toThrow("Invalid conversation event");
    }
  });
  it("refuses missing and malformed Claude registries and compares UTC process identity", async () => {
    const config = temp(); const start = "Tue Oct 27 12:00:00 2026";
    const inspect = async (pid: number) => pid === 12 ? start : null;
    expect(await claudeOccupancy(config, "s", inspect)).toBe("unknown");
    mkdirSync(join(config, "sessions")); expect(await claudeOccupancy(config, "s", inspect)).toBe("free");
    writeFileSync(join(config, "sessions", "12.json"), JSON.stringify({ pid: 12, sessionId: "s", cwd: "/other", kind: "interactive", version: "2.1.312", procStart: start }));
    expect(await claudeOccupancy(config, "s", inspect)).toBe("occupied");
    writeFileSync(join(config, "sessions", "12.json"), JSON.stringify({ pid: 12, sessionId: "s", cwd: "/other", kind: "interactive", version: "2.1.312", procStart: "Mon Oct 26 12:00:00 2026" }));
    expect(await claudeOccupancy(config, "s", inspect)).toBe("free");
    // 2.1.312 writes a per-process key file beside each record; it is skipped, never parsed.
    writeFileSync(join(config, "sessions", `12.${"a".repeat(64)}.key`), "not json", { mode: 0o600 });
    expect(await claudeOccupancy(config, "s", inspect)).toBe("free");
    writeFileSync(join(config, "sessions", "12.json"), JSON.stringify({ pid: 12, sessionId: "s", cwd: "/other", kind: "interactive", version: "2.1.283", procStart: start }));
    expect(await claudeOccupancy(config, "s", inspect)).toBe("unknown");
    rmSync(join(config, "sessions", "12.json"));
    writeFileSync(join(config, "sessions", "12.key"), "not json"); expect(await claudeOccupancy(config, "s", inspect)).toBe("unknown");
    rmSync(join(config, "sessions", "12.key"));
    writeFileSync(join(config, "sessions", "bad.json"), "broken"); expect(await claudeOccupancy(config, "s", inspect)).toBe("unknown");
  });
  it("accepts registry records at or above the floor and fails the whole profile closed on any other version", async () => {
    const config = temp(); const start = "Wed Oct 28 10:40:00 2026"; mkdirSync(join(config, "sessions"));
    const inspect = async (pid: number) => pid === 12 || pid === 13 ? start : null;
    const write = (pid: number, sessionId: string, version: unknown) => writeFileSync(join(config, "sessions", `${pid}.json`), JSON.stringify({ pid, sessionId, cwd: "/other", kind: "interactive", version, procStart: start }));
    for (const version of ["2.1.284", "2.1.400", "3.0.0", "2.1.400-beta.1"]) { write(12, "s", version); expect(await claudeOccupancy(config, "s", inspect)).toBe("occupied"); }
    write(12, "s", "2.1.400");
    // Another terminal's record below the floor or in another shape makes every resume in that profile unverifiable.
    for (const version of ["2.1.283", "v2.1.400", "2.1.400 (Claude Code)", 2, null]) { write(13, "other", version); expect(await claudeOccupancy(config, "s", inspect)).toBe("unknown"); }
  });
  it("lets one doan Claude conversation resume while another runs in the same dedicated profile", async () => {
    // The record shape a running doan SDK turn left in the dedicated profile (B45 live, CLI 2.1.312): interactive, sdk-ts.
    const config = temp(); const start = "Wed Oct 28 10:40:00 2026"; mkdirSync(join(config, "sessions"));
    const running = { pid: 55058, sessionId: "running-y", cwd: "/repo-y", kind: "interactive", entrypoint: "sdk-ts", version: "2.1.312", procStart: start };
    writeFileSync(join(config, "sessions", "55058.json"), JSON.stringify(running));
    writeFileSync(join(config, "sessions", `55058.${"1f".repeat(32)}.key`), "x", { mode: 0o600 });
    const inspect = async (pid: number) => pid === 55058 ? start : null;
    expect(await claudeOccupancy(config, "idle-x", inspect)).toBe("free");
    expect(await claudeOccupancy(config, "running-y", inspect)).toBe("occupied");
    // A record left by a killed run of the same version is dead and does not block.
    expect(await claudeOccupancy(config, "running-y", async () => null)).toBe("free");
  });
  // codex 0.166.0 live (batch E PoC): the thread's writer holds <CODEX_HOME>/thread-writer-locks/<id>.lock with an
  // exclusive flock and deletes it on a clean exit; a SIGKILL leaves the file behind with nobody holding it.
  it("reads a Codex thread writer lock and fails closed on anything it cannot read", async () => {
    const config = realpathSync(temp()), id = "01a1a1f0-3466-7691-96f0-37f5415d3cb9", locks = join(config, "thread-writer-locks"), lock = join(locks, `${id}.lock`);
    const inspect = vi.fn(async (_path: string): Promise<FileHolder[]> => [{ pid: 900, pgid: 900, ppid: 1 }]);
    // No supported writer has run in this profile, so none holds the thread.
    expect(await codexOccupancy(config, id, inspect)).toBe("free");
    mkdirSync(locks); writeFileSync(join(locks, ".coordination.lock"), "");
    expect(await codexOccupancy(config, id, inspect)).toBe("free");
    expect(inspect).not.toHaveBeenCalled();
    writeFileSync(lock, "");
    expect(await codexOccupancy(config, id, inspect)).toBe("occupied"); expect(inspect).toHaveBeenCalledWith(lock);
    expect(await codexOccupancy(config, id, async () => [])).toBe("free");
    expect(await codexOccupancy(config, id, async () => { throw new Error("lsof timed out"); })).toBe("unknown");
    expect(await codexOccupancy(config, "not-a-thread", inspect)).toBe("unknown");
    rmSync(lock); const target = join(temp(), "held.lock"); writeFileSync(target, ""); symlinkSync(target, lock);
    expect(await codexOccupancy(config, id, inspect)).toBe("unknown");
    rmSync(lock); mkdirSync(lock); expect(await codexOccupancy(config, id, inspect)).toBe("unknown");
    rmSync(locks, { recursive: true });
    const linked = realpathSync(temp()); symlinkSync(linked, locks); expect(await codexOccupancy(config, id, inspect)).toBe("unknown");
    rmSync(locks); writeFileSync(locks, ""); expect(await codexOccupancy(config, id, inspect)).toBe("unknown");
    rmSync(locks); mkdirSync(locks); chmodSync(locks, 0o000);
    try { expect(await codexOccupancy(config, id, inspect)).toBe("unknown"); } finally { chmodSync(locks, 0o755); }
  });
  // Doan's own Codex server holds the lock of the session it resumed; Doan's reservations govern that, not this check.
  it("ignores lock holders in a process group Doan's main process leads and counts every other holder", async () => {
    const config = realpathSync(temp()), id = "01a1a1f0-3466-7691-96f0-37f5415d3cb9", self = 4000;
    mkdirSync(join(config, "thread-writer-locks")); writeFileSync(join(config, "thread-writer-locks", `${id}.lock`), "");
    const server = { pid: 700, pgid: 700, ppid: self }, serverChild = { pid: 701, pgid: 700, ppid: 700 };
    const read = (holders: FileHolder[]) => codexOccupancy(config, id, async () => holders, self);
    expect(await read([server, serverChild])).toBe("free");
    expect(await read([server, { pid: 900, pgid: 900, ppid: 1 }])).toBe("occupied");
    // A descendant whose group leader is not among the holders cannot be traced back to Doan.
    expect(await read([{ pid: 801, pgid: 800, ppid: 800 }])).toBe("occupied");
    // A direct child that shares another group was not spawned as a runner's own group.
    expect(await read([{ pid: 702, pgid: 3999, ppid: self }])).toBe("occupied");
  });
  it.each([
    ["one holder", { error: null, stdout: "p12\ng12\nR1\nf3\n", stderr: "" }, [{ pid: 12, pgid: 12, ppid: 1 }]],
    ["two holders", { error: null, stdout: "p12\ng12\nR1\nf3\np13\ng12\nR12\nf3\nf4\n", stderr: "" }, [{ pid: 12, pgid: 12, ppid: 1 }, { pid: 13, pgid: 12, ppid: 12 }]],
    ["nobody", { error: { code: 1 }, stdout: "", stderr: "" }, []],
  ])("parses lsof holders: %s", async (_name, reply, holders) => {
    lsof.reply = reply; expect(await fileHolders("/x.lock")).toEqual(holders);
  });
  it.each([
    ["exit 0 without a process", { error: null, stdout: "f3\n", stderr: "" }],
    ["exit 0 empty", { error: null, stdout: "", stderr: "" }],
    ["missing group and parent", { error: null, stdout: "p12\nf3\n", stderr: "" }],
    ["unknown field", { error: null, stdout: "p12\ng12\nR1\nx9\n", stderr: "" }],
    ["repeated field", { error: null, stdout: "p12\ng12\ng13\nR1\n", stderr: "" }],
    ["non-numeric pid", { error: null, stdout: "pabc\ng12\nR1\n", stderr: "" }],
    ["exit 1 with stderr", { error: { code: 1 }, stdout: "", stderr: "lsof: status error on /x.lock: No such file or directory\n" }],
    ["exit 1 with stdout", { error: { code: 1 }, stdout: "p12\n", stderr: "" }],
    ["timeout", { error: { killed: true, code: null, signal: "SIGTERM" }, stdout: "", stderr: "" }],
    ["missing lsof", { error: { code: "ENOENT" }, stdout: "", stderr: "" }],
  ])("refuses an lsof reply it cannot read: %s", async (_name, reply) => {
    lsof.reply = reply; await expect(fileHolders("/x.lock")).rejects.toThrow();
    const config = realpathSync(temp()), id = "01a1a1f0-3466-7691-96f0-37f5415d3cb9";
    mkdirSync(join(config, "thread-writer-locks")); writeFileSync(join(config, "thread-writer-locks", `${id}.lock`), "");
    expect(await codexOccupancy(config, id)).toBe("unknown");
  });
  it("tells a detached child of this process from another holder with the real lsof", async () => {
    const config = realpathSync(temp()), id = "01a1a1f0-3466-7691-96f0-37f5415d3cb9", lock = join(config, "thread-writer-locks", `${id}.lock`);
    mkdirSync(join(config, "thread-writer-locks")); writeFileSync(lock, "");
    const hold = async (detached: boolean) => {
      const child = spawn("/bin/sh", ["-c", 'exec 3<"$1"; echo ready; exec sleep 30', "sh", lock], { detached, stdio: ["ignore", "pipe", "ignore"] });
      await new Promise<void>(resolve => child.stdout.once("data", () => resolve()));
      return child;
    };
    // Doan's runners spawn the provider detached, so it leads its own group with this process as its parent.
    const own = await hold(true);
    try {
      expect((await fileHolders(lock)).map(h => h.pid)).toContain(own.pid);
      expect(await codexOccupancy(config, id)).toBe("free");
    } finally { process.kill(-own.pid!, "SIGKILL"); }
    await vi.waitFor(async () => expect(await fileHolders(lock)).toEqual([]));
    const other = await hold(false);
    try { expect(await codexOccupancy(config, id)).toBe("occupied"); } finally { other.kill("SIGKILL"); }
  });
  it("sees a Codex lock file another descriptor holds open and treats an unopened one as stale", async () => {
    const config = realpathSync(temp()), id = "01a1a1f0-3466-7691-96f0-37f5415d3cb9", lock = join(config, "thread-writer-locks", `${id}.lock`);
    mkdirSync(join(config, "thread-writer-locks")); writeFileSync(lock, "");
    expect(await codexOccupancy(config, id)).toBe("free");
    const fd = openSync(lock, "r");
    try { expect(await codexOccupancy(config, id)).toBe("occupied"); } finally { closeSync(fd); }
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
  const old = { conversationId: "old", root: "/repo", title: "old", state: "current" as const, owner: { kind: "legacy-external" as const }, session: { runtime: "codex" as const, origin: "new" as const, sessionId: "s", configDir: "/profile", cwd: "/repo" } };
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
  const entry = { conversationId: "new", root: "/repo", title: "new", state: "current" as const, owner: { kind: "legacy-external" as const }, session: { runtime: "codex" as const, origin: "new" as const, sessionId: "s", configDir: "/profile", cwd: "/repo" } };
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
