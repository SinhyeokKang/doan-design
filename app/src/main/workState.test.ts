import { expect, test } from "vitest";
import { applyWork, expireWork, retainWorkRoots, workItems, MAX_WORK_SESSIONS, MAX_WORK_PATHS, WORK_EXPIRY_MS, type WorkState } from "./workState";
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
  expect(workItems(state)).toEqual([{ root, path, session: "two", provider: "claude" }]);
});
test("anonymous sessions are one per root and paths need not yet be listed", () => {
  let state = applyWork(empty(), start(), 0);
  state = applyWork(state, start({ path: ".doan/ds/tokens.html" }), 0);
  state = applyWork(state, start({ root: "/other" }), 0);
  state = applyWork(state, { v: 3, token: "t", root, action: "done" }, 0);
  expect(workItems(state)).toEqual([{ root: "/other", path, session: null, provider: null }]);
});
test("unregistered roots are discarded and removed projects lose all their sessions", () => {
  expect(applyWork(empty(), start({ root: "/unknown" }), 0)).toEqual(empty());
  const state = applyWork(applyWork(empty(), start(), 0), start({ root: "/other" }), 0);
  expect(workItems(retainWorkRoots(state, ["/other"]))).toEqual([{ root: "/other", path, session: null, provider: null }]);
});
test("expiry uses the later start or file change of a member in the same root", () => {
  expect(WORK_EXPIRY_MS).toBe(300_000);
  let state = applyWork(empty(), start(), 10);
  state = applyWork(state, start({ root: "/other" }), 10);
  const lastChange = (r: string, p: string) => r === root && p === path ? 50 : 0;
  expect(workItems(expireWork(state, 109, lastChange, 100))).toHaveLength(2);
  expect(workItems(expireWork(state, 110, lastChange, 100))).toEqual([{ root, path, session: null, provider: null }]);
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
  expect(workItems(retainWorkRoots(state, ["/other"]))).toEqual([{ root: "/other", path, ...identity }]);
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
