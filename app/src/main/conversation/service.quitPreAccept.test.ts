import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConversationStore } from "./store";
import { DraftStore } from "./drafts";
import { ConversationService, type OpenRunner, type Prepare, type Runner } from "./service";

// A send or start sets its turn busy before main accepts it, so Restart to Update waits for it like a running turn,
// and a quit in that window returns its message as a draft after the restart.
const paths: string[] = [];
afterEach(() => { vi.restoreAllMocks(); paths.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })); });

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "doan-quit-pre-accept-")); paths.push(dir);
  const store = new ConversationStore(dir);
  let held = false; const releases: (() => void)[] = []; let session = 0;
  const open = vi.fn<OpenRunner>(async input => {
    if (held) await new Promise<void>(resolve => { releases.push(resolve); });
    const runner: Runner = { sessionId: input.sessionId ?? `s${++session}`, send: vi.fn(async () => {}), answer: () => false, stop: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    return runner;
  });
  const owner = { kind: "doan" as const, provider: "claude" as const, connectionId: "c", accountId: "a", workspaceId: "w", profile: "p" };
  const prepare = vi.fn<Prepare>(async (_request, stored) => ({ runtime: "claude" as const, configDir: "/config", cwd: "/repo", command: "/fake", env: {}, owner, ...(stored ? { sessionId: stored.session.sessionId } : {}) }));
  const changes: string[] = [];
  const make = () => new ConversationService(store, prepare, open, () => {}, () => {}, 10_000, () => [], root => changes.push(root), { drafts: new DraftStore(join(dir, "conversations")) });
  const service = make();
  return { service, store, open, prepare, changes, restart: make, hold: () => { held = true; }, release: () => { held = false; releases.splice(0).forEach(r => r()); } };
}
const canvas = { path: ".doan/canvases/a.html", id: "a" };
const homeStart = { root: "/repo", mode: "newDesign" as const, runtime: "claude" as const, text: "Make a pricing page", anchors: [] };
const canvasStart = { root: "/repo", mode: "new" as const, runtime: "claude" as const, canvas, text: "Draw the hero", anchors: [] };

describe("Restart to Update before acceptance", () => {
  it("holds the restart while a start is prepared and opened", async () => {
    const h = fixture(); h.hold();
    const pending = h.service.start(homeStart);
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledOnce());
    expect(h.service.restartHolds().liveTurns).toBe(1);
    // The update gate is asked again on a list change: the start announces its root while it waits.
    expect(h.changes).toContain("/repo");
    // An accepted start still counts once.
    h.release(); await pending;
    expect(h.service.restartHolds().liveTurns).toBe(1);
  });
  // Its process may take a while to go after the refusal; the restart need not wait for that.
  it("lets the restart go as soon as a start is refused after its runner opened", async () => {
    const h = fixture(); h.hold();
    const pending = h.service.start(homeStart);
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledOnce());
    // Refused after its runner opened: the acceptance's write fails.
    vi.spyOn(h.store, "acceptStart").mockImplementationOnce(() => { throw new Error("EIO"); });
    h.release(); await expect(pending).rejects.toThrow("EIO");
    expect(h.service.restartHolds().liveTurns).toBe(0);
  });
  it("lets the restart go when a start is refused before acceptance, and announces it", async () => {
    const h = fixture();
    h.prepare.mockRejectedValueOnce(new Error("not_logged_in"));
    await expect(h.service.start(homeStart)).rejects.toThrow("not_logged_in");
    expect(h.service.restartHolds().liveTurns).toBe(0);
    expect(h.changes.filter(root => root === "/repo").length).toBeGreaterThanOrEqual(2);
  });
  it("holds the restart while a follow-up send is prepared and opened", async () => {
    const h = fixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    expect(h.service.restartHolds().liveTurns).toBe(0);
    h.hold(); const pending = h.service.send(id, "make it darker", []);
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
    expect(h.service.restartHolds().liveTurns).toBe(1);
    h.release(); await pending;
    expect(h.service.restartHolds().liveTurns).toBe(1);
  });
});

describe("a quit before acceptance keeps the message", () => {
  it("keeps a start pressed while the app is already quitting", async () => {
    const h = fixture();
    void h.service.quit();
    await expect(h.service.start(homeStart)).rejects.toThrow("busy");
    expect(h.restart().takeStartDraft("/repo")).toMatchObject({ text: "Make a pricing page" });
  });
  it("returns a Home start's first message as its root's draft after the restart, once", async () => {
    const h = fixture(); h.hold();
    const pending = h.service.start({ ...homeStart, attachments: [{ kind: "file", name: "brief.md", path: "/repo/brief.md", size: 3 }] });
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledOnce());
    await h.service.quit(); h.release(); await expect(pending).rejects.toThrow("busy");
    expect(h.store.list()).toEqual([]);
    const restarted = h.restart();
    expect(restarted.takeStartDraft("/elsewhere")).toBeNull();
    expect(restarted.takeStartDraft("/repo", canvas)).toBeNull();
    expect(restarted.takeStartDraft("/repo")).toMatchObject({ text: "Make a pricing page", anchors: [], attachments: [{ name: "brief.md", path: "/repo/brief.md" }], reason: "restarted" });
    expect(restarted.takeStartDraft("/repo")).toBeNull();
    expect(h.restart().takeStartDraft("/repo")).toBeNull();
  });
  it("returns a canvas start's first message as that canvas's draft, also after the canvas moved", async () => {
    const h = fixture(); h.hold();
    const pending = h.service.start(canvasStart);
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledOnce());
    await h.service.quit(); h.release(); await expect(pending).rejects.toThrow("busy");
    const restarted = h.restart();
    expect(restarted.takeStartDraft("/repo")).toBeNull();
    expect(restarted.takeStartDraft("/repo", { id: "b", path: ".doan/canvases/a.html" })).toBeNull();
    expect(restarted.takeStartDraft("/repo", { id: "a", path: ".doan/canvases/moved.html" })).toMatchObject({ text: "Draw the hero", reason: "restarted" });
  });
  it("keeps the message when the app ends before the start's own refusal arrives", async () => {
    const h = fixture(); h.hold();
    void h.service.start(homeStart).catch(() => {});
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledOnce());
    // The runner never settles: the process ended with the app.
    void h.service.quit();
    expect(h.restart().takeStartDraft("/repo")).toMatchObject({ text: "Make a pricing page" });
  });
  it("returns a follow-up send's message as the conversation's draft after the restart", async () => {
    const h = fixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    h.hold(); const pending = h.service.send(id, "make it darker", []);
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
    await h.service.quit(); h.release(); await expect(pending).rejects.toThrow("busy");
    expect(h.restart().takeDraft(id)).toMatchObject({ text: "make it darker", reason: "restarted" });
  });
  it("keeps a follow-up send's message when the app ends before the send's own refusal arrives", async () => {
    const h = fixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    h.hold(); void h.service.send(id, "make it darker", []).catch(() => {});
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
    void h.service.quit();
    expect(h.restart().takeDraft(id)).toMatchObject({ text: "make it darker" });
  });
});

// A quit whose appQuit write failed aborts, and the service stays quitting while the composers stay open: the person
// may press Send again on the busy refusal. Each composer keeps one held copy, its last, not one per press.
describe("after an aborted quit", () => {
  it("keeps one copy of a start pressed again on the same composer", async () => {
    const h = fixture();
    void h.service.quit();
    await expect(h.service.start(homeStart)).rejects.toThrow("busy");
    await expect(h.service.start({ ...homeStart, text: "Make a pricing page with FAQ" })).rejects.toThrow("busy");
    await expect(h.service.start(canvasStart)).rejects.toThrow("busy");
    await expect(h.service.start(canvasStart)).rejects.toThrow("busy");
    const restarted = h.restart();
    expect(restarted.takeStartDraft("/repo")).toMatchObject({ text: "Make a pricing page with FAQ" });
    expect(restarted.takeStartDraft("/repo", canvas)).toMatchObject({ text: "Draw the hero" });
  });
  it("replaces a start the quit refused when its composer presses it again", async () => {
    const h = fixture(); h.hold();
    const pending = h.service.start(homeStart);
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledOnce());
    await h.service.quit(); h.release(); await expect(pending).rejects.toThrow("busy");
    await expect(h.service.start(homeStart)).rejects.toThrow("busy");
    expect(h.restart().takeStartDraft("/repo")).toMatchObject({ text: "Make a pricing page" });
  });
  it("keeps one copy of a send pressed again in the same conversation", async () => {
    const h = fixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    h.hold(); const pending = h.service.send(id, "make it darker", []);
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
    await h.service.quit(); h.release(); await expect(pending).rejects.toThrow("busy");
    await expect(h.service.send(id, "make it darker", [])).rejects.toThrow("busy");
    await expect(h.service.send(id, "make it darker", [])).rejects.toThrow("busy");
    expect(h.restart().takeDraft(id)).toMatchObject({ text: "make it darker", reason: "restarted" });
  });
});

describe("no draft is left by a start or send that settled", () => {
  it("leaves nothing for an accepted start or send", async () => {
    const h = fixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    await h.service.start(homeStart);
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    await h.service.send(id, "make it darker", []);
    const restarted = h.restart();
    expect(restarted.takeStartDraft("/repo")).toBeNull();
    expect(restarted.takeStartDraft("/repo", canvas)).toBeNull();
    expect(restarted.takeDraft(id)).toBeNull();
  });
  it("leaves nothing for a refused start or send, whose composer keeps the draft", async () => {
    const h = fixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    h.prepare.mockRejectedValueOnce(new Error("not_logged_in"));
    await expect(h.service.start(homeStart)).rejects.toThrow("not_logged_in");
    h.prepare.mockRejectedValueOnce(new Error("not_logged_in"));
    await expect(h.service.send(id, "make it darker", [])).rejects.toThrow("not_logged_in");
    expect(h.service.takeDraft(id)).toBeNull();
    const restarted = h.restart();
    expect(restarted.takeStartDraft("/repo")).toBeNull();
    expect(restarted.takeDraft(id)).toBeNull();
  });
  it("does not hand a start draft of this run back while its start is still pending", async () => {
    const h = fixture(); h.hold();
    const pending = h.service.start(homeStart);
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledOnce());
    expect(h.service.takeStartDraft("/repo")).toBeNull();
    h.release(); await pending;
  });
});

// Move to Trash and `doan remove` ask whether a conversation runs: a start is listed only once accepted, and liveTurns
// counts only accepted turns, so both read these (POSTMORTEM 2026-11-17 'A quit before main accepted a send…').
describe("starts and sends before acceptance, for the trash and remove gates", () => {
  it("names a canvas start's canvas and root from its press until acceptance", async () => {
    const h = fixture(); h.hold();
    const pending = h.service.start(canvasStart);
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledOnce());
    expect(h.service.startingCanvases("/repo")).toEqual([canvas]);
    expect(h.service.startingCanvases("/other")).toEqual([]);
    expect([...h.service.pendingRoots()]).toEqual(["/repo"]);
    h.release(); await pending;
    expect(h.service.startingCanvases("/repo")).toEqual([]);
    expect([...h.service.pendingRoots()]).toEqual([]);
  });
  it("counts a Home start's root but names no canvas for it", async () => {
    const h = fixture(); h.hold();
    const pending = h.service.start(homeStart);
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledOnce());
    expect(h.service.startingCanvases("/repo")).toEqual([]);
    expect([...h.service.pendingRoots()]).toEqual(["/repo"]);
    h.release(); await pending;
  });
  it("forgets a start refused before acceptance", async () => {
    const h = fixture();
    let fail!: (error: Error) => void;
    h.prepare.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const pending = h.service.start(canvasStart);
    await vi.waitFor(() => expect(h.prepare).toHaveBeenCalledOnce());
    expect(h.service.startingCanvases("/repo")).toEqual([canvas]);
    fail(new Error("not_logged_in")); await expect(pending).rejects.toThrow("not_logged_in");
    expect(h.service.startingCanvases("/repo")).toEqual([]);
    expect([...h.service.pendingRoots()]).toEqual([]);
  });
  it("counts a follow-up send's root while it is prepared, not its canvas (the list already has the conversation)", async () => {
    const h = fixture();
    const id = (await h.service.start(canvasStart)).conversationId;
    h.service.receive(id, { type: "turn.done" }); h.open.mock.calls[0]![2]();
    h.hold(); const pending = h.service.send(id, "make it darker", []);
    await vi.waitFor(() => expect(h.open).toHaveBeenCalledTimes(2));
    expect(h.service.startingCanvases("/repo")).toEqual([]);
    expect([...h.service.pendingRoots()]).toEqual(["/repo"]);
    h.release(); await pending;
    expect([...h.service.pendingRoots()]).toEqual([]);
  });
});
