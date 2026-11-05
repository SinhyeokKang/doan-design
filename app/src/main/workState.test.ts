import { describe, expect, test } from "vitest";
import { applyWork, expireWork, nextWorkExpiry, retainWorkRoots, workItems, workItemsChanged, MAX_WORK_SESSIONS, MAX_WORK_PATHS, WORK_EXPIRY_MS, type WorkState } from "./workState";
import type { WorkRequest } from "../formats/types";
const root = "/repo", path = ".doan/canvases/new.html";
const start = (extra: Partial<{ root: string; path: string; session: string; provider: "claude" | "codex" }> = {}): WorkRequest => ({ v: 3, token: "t", root, action: "start", path, ...extra });
const empty = (): WorkState => ({ roots: [root, "/other"], sessions: [] });
test("starts form a set, repeat starts renew it, and done empties only that session", () => {
  let state = applyWork(empty(), start({ session: "one", provider: "codex" }), 1);
  state = applyWork(state, start({ session: "one", provider: "codex" }), 2);
  state = applyWork(state, start({ session: "two", provider: "claude" }), 3);
  expect(workItems(state)).toHaveLength(2);
  state = applyWork(state, { v: 3, token: "t", root, action: "done", session: "one", provider: "codex" }, 4);
  expect(workItems(state)).toMatchObject([{ root, path, session: "two", provider: "claude" }]);
});
test("anonymous sessions are one per root and paths need not yet be listed", () => {
  let state = applyWork(empty(), start(), 0);
  state = applyWork(state, start({ path: ".doan/ds/tokens.html" }), 0);
  state = applyWork(state, start({ root: "/other" }), 0);
  state = applyWork(state, { v: 3, token: "t", root, action: "done" }, 0);
  expect(workItems(state)).toMatchObject([{ root: "/other", path, session: null, provider: null }]);
});
test("unregistered roots are discarded and removed projects lose all their sessions", () => {
  expect(applyWork(empty(), start({ root: "/unknown" }), 0)).toEqual(empty());
  const state = applyWork(applyWork(empty(), start(), 0), start({ root: "/other" }), 0);
  expect(workItems(retainWorkRoots(state, ["/other"]))).toMatchObject([{ root: "/other", path, session: null, provider: null }]);
});
test("expiry uses the later start or file change of a member in the same root", () => {
  expect(WORK_EXPIRY_MS).toBe(300_000);
  let state = applyWork(empty(), start(), 10);
  state = applyWork(state, start({ root: "/other" }), 10);
  const lastChange = (r: string, p: string) => r === root && p === path ? 50 : 0;
  expect(workItems(expireWork(state, 109, lastChange, 100))).toHaveLength(2);
  expect(workItems(expireWork(state, 110, lastChange, 100))).toMatchObject([{ root, path, session: null, provider: null }]);
  expect(workItems(expireWork(state, 150, lastChange, 100))).toEqual([]);
  state = applyWork(state, start(), 140);
  expect(workItems(expireWork(state, 239, lastChange, 100))).toHaveLength(1);
  expect(workItems(expireWork(state, 240, lastChange, 100))).toEqual([]);
});
test("session and path caps drop excess starts while allowing renewal and done", () => {
  expect(MAX_WORK_SESSIONS).toBe(128); expect(MAX_WORK_PATHS).toBe(128);
  let state = empty();
  for (let i = 0; i < 129; i++) state = applyWork(state, start({ session: `s${i}`, provider: "codex" }), i);
  expect(state.sessions).toHaveLength(128);
  for (let i = 0; i < 129; i++) state = applyWork(state, start({ session: "s0", provider: "codex", path: `.doan/canvases/${i}.html` }), 200);
  expect(workItems(state).filter(item => item.session === "s0")).toHaveLength(128);
  state = applyWork(state, start({ session: "s0", provider: "codex" }), 300);
  expect(workItems(expireWork(state, 400, () => 0, 101))).toHaveLength(128);
});

test("an identified session spans roots, shares expiry, and done clears the whole set", () => {
  const identity = { session: "one", provider: "codex" } as const;
  let state = applyWork(empty(), start(identity), 0);
  state = applyWork(state, start({ ...identity, root: "/other" }), 10);
  expect(state.sessions).toHaveLength(1);
  expect(workItems(expireWork(state, 100, (r) => r === root ? 50 : 0, 100))).toHaveLength(2);
  expect(workItems(retainWorkRoots(state, ["/other"]))).toMatchObject([{ root: "/other", path, ...identity }]);
  state = applyWork(state, { v: 3, token: "t", action: "done", root, ...identity }, 20);
  expect(workItems(state)).toEqual([]);
});
test("the per-session path cap counts root and path pairs across roots", () => {
  const identity = { session: "one", provider: "codex" } as const;
  let state = empty();
  for (let i = 0; i < MAX_WORK_PATHS; i++) state = applyWork(state, start({ ...identity, path: `.doan/canvases/${i}.html` }), 0);
  state = applyWork(state, start({ ...identity, root: "/other" }), 1);
  expect(workItems(state)).toHaveLength(MAX_WORK_PATHS);
  expect(workItems(state).every(item => item.root === root)).toBe(true);
});

test("retaining unchanged roots and paths preserves state identity", () => {
  const state = applyWork(empty(), start(), 0);
  expect(retainWorkRoots(state, [...state.roots])).toBe(state);
  const idle = empty();
  expect(retainWorkRoots(idle, [...idle.roots])).toBe(idle);
});

test("a capped start renews the existing session without adding its path", () => {
  const identity = { session: "one", provider: "codex" } as const;
  let state = empty();
  for (let i = 0; i < MAX_WORK_PATHS; i++) state = applyWork(state, start({ ...identity, path: `.doan/canvases/${i}.html` }), 0);
  state = applyWork(state, start({ ...identity, root: "/other" }), 90);
  expect(workItems(state)).toHaveLength(MAX_WORK_PATHS);
  expect(workItems(state).every(item => item.root === root)).toBe(true);
  expect(workItems(expireWork(state, 100, () => 0, 100))).toHaveLength(MAX_WORK_PATHS);
  expect(workItems(expireWork(state, 190, () => 0, 100))).toEqual([]);
});

test("the next deadline uses the earliest session expiry and an injectable limit", () => {
  expect(nextWorkExpiry(empty(), () => 0, 100)).toBeUndefined();
  let state = applyWork(empty(), start(), 10);
  state = applyWork(state, start({ root: "/other" }), 20);
  const changed = (r: string) => r === root ? 50 : 0;
  expect(nextWorkExpiry(state, changed, 100)).toBe(120);
  state = expireWork(state, 120, changed, 100);
  expect(nextWorkExpiry(state, changed, 100)).toBe(150);
});

// work-update design §1 rule 4: an update counts as a start and replaces that entry's content; a start renews only touched.
const update = (extra: Partial<{ root: string; path: string; session: string; provider: "claude" | "codex"; frame: string; note: string }> = {}): WorkRequest => ({ v: 3, token: "t", root, action: "update", path, ...extra });
const done = (extra: Partial<{ root: string; session: string; provider: "claude" | "codex" }> = {}): WorkRequest => ({ v: 3, token: "t", root, action: "done", ...extra });
const identity = { session: "one", provider: "codex" } as const;
describe("update", () => {
  test("an update without a start adds the path, and each update replaces the content an omitted part clears", () => {
    let state = applyWork(empty(), update({ ...identity, frame: "hero", note: "Drawing the hero" }), 10);
    expect(workItems(state)).toMatchObject([{ root, path, ...identity, frame: "hero", note: "Drawing the hero", touched: 10 }]);
    state = applyWork(state, update({ ...identity, frame: "pricing" }), 20);
    const [item] = workItems(state);
    expect(item).toMatchObject({ frame: "pricing", touched: 20 });
    expect(item).not.toHaveProperty("note");
    state = applyWork(state, update(identity), 30);
    expect(workItems(state)[0]).not.toHaveProperty("frame");
    expect(workItems(state)[0]).not.toHaveProperty("note");
    expect(workItems(expireWork(state, 30 + 99, () => 0, 100))).toHaveLength(1);
  });
  test("a start keeps the content and renews only touched, also for a path the session already has", () => {
    let state = applyWork(empty(), update({ ...identity, frame: "hero", note: "n" }), 10);
    state = applyWork(state, start(identity), 25);
    expect(workItems(state)).toMatchObject([{ frame: "hero", note: "n", touched: 25 }]);
    state = applyWork(state, start({ ...identity, path: ".doan/canvases/other.html" }), 30);
    expect(workItems(state)).toMatchObject([{ path, frame: "hero", touched: 25 }, { path: ".doan/canvases/other.html", touched: 30 }]);
    expect(workItems(state)[1]).not.toHaveProperty("frame");
  });
  // POSTMORTEM 2026-11-01: content is kept per (session, root, path), never per path alone.
  test("two roots sharing a path keep their own content, for one identified session and for anonymous ones", () => {
    let state = applyWork(empty(), update({ ...identity, frame: "a" }), 1);
    state = applyWork(state, update({ ...identity, root: "/other", frame: "b", note: "other" }), 2);
    expect(workItems(state)).toMatchObject([{ root, path, frame: "a", touched: 1 }, { root: "/other", path, frame: "b", note: "other", touched: 2 }]);
    expect(workItems(state)[0]).not.toHaveProperty("note");
    let anonymous = applyWork(empty(), update({ frame: "a" }), 1);
    anonymous = applyWork(anonymous, update({ root: "/other", frame: "b" }), 2);
    expect(workItems(anonymous)).toMatchObject([{ root, path, session: null, frame: "a" }, { root: "/other", path, session: null, frame: "b" }]);
    expect(workItems(applyWork(anonymous, done(), 3))).toMatchObject([{ root: "/other", frame: "b" }]);
  });
  test("a capped update renews the session without adding its path or content", () => {
    let state = empty();
    for (let i = 0; i < MAX_WORK_PATHS; i++) state = applyWork(state, start({ ...identity, path: `.doan/canvases/${i}.html` }), 0);
    state = applyWork(state, update({ ...identity, root: "/other", frame: "x" }), 90);
    expect(workItems(state)).toHaveLength(MAX_WORK_PATHS);
    expect(workItems(state).some(item => item.root === "/other" || item.frame !== undefined)).toBe(false);
    expect(workItems(expireWork(state, 189, () => 0, 100))).toHaveLength(MAX_WORK_PATHS);
  });
  test("done clears the content, so the next work starts without it", () => {
    let state = applyWork(empty(), update({ ...identity, frame: "hero", note: "n" }), 1);
    state = applyWork(state, done(identity), 2);
    expect(workItems(state)).toEqual([]);
    state = applyWork(state, start(identity), 3);
    expect(workItems(state)[0]).not.toHaveProperty("frame");
    expect(workItems(state)[0]).not.toHaveProperty("note");
  });
  test("an update an unregistered root sends is discarded", () => {
    expect(applyWork(empty(), update({ root: "/unknown", frame: "a" }), 0)).toEqual(empty());
  });
  // design decision 9: an app conversation's update is never terminal work.
  test("an update that names a conversation never becomes terminal work", () => {
    const state = empty();
    expect(applyWork(state, { v: 3, token: "t", root, action: "update", path, conversation: "c1", frame: "a" } as WorkRequest, 0)).toBe(state);
  });
});
// design §1 rule 9 'work-turn key': made once by main when the session starts, so every subscriber sees the same key.
describe("work turn", () => {
  test("a session keeps its turn across updates and starts and gets a new one after done or expiry", () => {
    let state = applyWork(empty(), start(identity), 0);
    const first = workItems(state)[0]?.turn;
    expect(first).toEqual(expect.any(String));
    state = applyWork(state, update({ ...identity, frame: "a" }), 1);
    state = applyWork(state, update({ ...identity, root: "/other", frame: "b" }), 2);
    state = applyWork(state, start(identity), 3);
    expect(workItems(state).map(item => item.turn)).toEqual([first, first]);
    state = applyWork(applyWork(state, done(identity), 4), update({ ...identity, frame: "a" }), 5);
    const second = workItems(state)[0]?.turn;
    expect(second).not.toBe(first);
    state = applyWork(expireWork(state, 1000, () => 0, 100), update({ ...identity, frame: "a" }), 1001);
    const third = workItems(state)[0]?.turn;
    expect([first, second]).not.toContain(third);
  });
  test("each session has its own turn, and the turn names its provider", () => {
    let state = applyWork(empty(), start({ session: "same", provider: "codex" }), 0);
    state = applyWork(state, start({ session: "same", provider: "claude" }), 0);
    state = applyWork(state, start(), 0);
    const turns = workItems(state).map(item => item.turn);
    expect(new Set(turns).size).toBe(3);
    expect(turns[0]?.startsWith("codex:")).toBe(true);
    expect(turns[1]?.startsWith("claude:")).toBe(true);
  });
});
// design §2 function 5: work:changed must also see content, or an update reaches main and never the renderer.
describe("workItemsChanged", () => {
  const item = { root, path, session: "one", provider: "codex" as const, touched: 1, turn: "codex:t" };
  test("the same items, in new objects, are unchanged", () => {
    expect(workItemsChanged([], [])).toBe(false);
    expect(workItemsChanged([{ ...item, frame: "a", note: "n" }], [{ ...item, frame: "a", note: "n" }])).toBe(false);
  });
  test.each([
    ["frame", { frame: "b" }], ["note", { note: "m" }], ["touched", { touched: 2 }], ["turn", { turn: "codex:u" }],
    ["root", { root: "/other" }], ["path", { path: "x.html" }], ["session", { session: "two" }], ["provider", { provider: "claude" as const }],
  ])("a changed %s is a change", (_label, change) => {
    expect(workItemsChanged([{ ...item, frame: "a", note: "n" }], [{ ...item, frame: "a", note: "n", ...change }])).toBe(true);
  });
  test("an added or cleared part and a changed length are changes", () => {
    expect(workItemsChanged([item], [{ ...item, frame: "a" }])).toBe(true);
    expect(workItemsChanged([{ ...item, note: "n" }], [item])).toBe(true);
    expect(workItemsChanged([item], [item, { ...item, root: "/other" }])).toBe(true);
  });
});
