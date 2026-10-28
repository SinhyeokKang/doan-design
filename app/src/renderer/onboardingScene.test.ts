import { expect, test } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import type { AuthStatusDto, Provider, Readiness } from "../main/agentAuth/types";
import { advance, canAdvance, canComplete, initialScene, isCurrent, mergeStatus, newerAuth, nextScene, ownedSignIns, type SceneEvent, type SceneState } from "./onboardingScene";

function provider(name: Provider, readiness: Readiness, extra: Partial<AuthStatusDto> = {}): AuthStatusDto {
  return { provider: name, revision: 1, phase: readiness.ready ? "connected" : "disconnected", account: null, attempt: null, readiness, error: null, actions: [], ...extra };
}
const READY: Readiness = { ready: true };
const notConnected: Readiness = { ready: false, cause: "not_connected", action: "signIn" };
const unverified: Readiness = { ready: false, cause: "unverified", action: "retry" };
const expired: Readiness = { ready: false, cause: "reauth_required", action: "reauth" };
function snapshot(revision: number, ...providers: AuthStatusDto[]): AuthSnapshot { return { revision, providers }; }
const none = snapshot(1, provider("claude", notConnected), provider("codex", notConnected));
const connectedNotReady = snapshot(2, provider("claude", unverified, { phase: "connected" }), provider("codex", expired, { phase: "reauthRequired" }));
const oneReady = snapshot(3, provider("claude", READY), provider("codex", notConnected));
const idle = { busy: false };

test("only a saved completion skips onboarding; anything else starts at Welcome", () => {
  expect(initialScene(false)).toEqual({ scene: "welcome", generation: 0 });
  expect(initialScene(true)).toEqual({ scene: "home", generation: 0 });
});

test("advancing needs one provider agent-auth judged ready; connected but not ready blocks", () => {
  expect(canAdvance(null)).toBe(false);
  expect(canAdvance(snapshot(1))).toBe(false);
  expect(canAdvance(none)).toBe(false);
  expect(canAdvance(connectedNotReady)).toBe(false);
  expect(canAdvance(oneReady)).toBe(true);
  // readiness is never re-judged: phase, account and actions do not matter.
  expect(canAdvance(snapshot(4, provider("cursor", READY, { phase: "checking", account: null, actions: ["retry"] })))).toBe(true);
  expect(canAdvance(snapshot(5, provider("cursor", notConnected, { phase: "connected", account: { email: "a@example.com" } })))).toBe(false);
});

test("Welcome, Agent, Project and Home follow the approved order", () => {
  let state: SceneState = initialScene(false);
  state = nextScene(state, { type: "start" }, { ...idle, auth: none });
  expect(state).toEqual({ scene: "agent", generation: 1 });
  expect(nextScene(state, { type: "continue" }, { ...idle, auth: none })).toBe(state);
  expect(nextScene(state, { type: "continue" }, { ...idle, auth: connectedNotReady })).toBe(state);
  expect(nextScene(state, { type: "step", to: "project" }, { ...idle, auth: connectedNotReady })).toBe(state);
  state = nextScene(state, { type: "continue" }, { ...idle, auth: oneReady });
  expect(state).toEqual({ scene: "project", generation: 2 });
  state = nextScene(state, { type: "completed" }, { ...idle, auth: oneReady });
  expect(state).toEqual({ scene: "home", generation: 3 });
});

test("Back and the completed-step stepper return one step and keep going back to Welcome", () => {
  const project: SceneState = { scene: "project", generation: 5 };
  expect(nextScene(project, { type: "back" }, { ...idle, auth: oneReady })).toEqual({ scene: "agent", generation: 6 });
  expect(nextScene(project, { type: "step", to: "agent" }, { ...idle, auth: oneReady })).toEqual({ scene: "agent", generation: 6 });
  expect(nextScene({ scene: "agent", generation: 6 }, { type: "back" }, { ...idle, auth: oneReady })).toEqual({ scene: "welcome", generation: 7 });
  expect(nextScene({ scene: "agent", generation: 6 }, { type: "step", to: "project" }, { ...idle, auth: oneReady })).toEqual({ scene: "project", generation: 7 });
});

test("setup or completion in progress blocks Back and the stepper", () => {
  const project: SceneState = { scene: "project", generation: 5 };
  for (const event of [{ type: "back" }, { type: "step", to: "agent" }] satisfies SceneEvent[]) expect(nextScene(project, event, { busy: true, auth: oneReady })).toBe(project);
});

test("top-level Escape and out-of-place events never skip a required step", () => {
  const scenes: SceneState[] = [initialScene(false), { scene: "agent", generation: 1 }, { scene: "project", generation: 2 }, initialScene(true)];
  for (const state of scenes) expect(nextScene(state, { type: "escape" }, { ...idle, auth: oneReady })).toBe(state);
  expect(nextScene(scenes[0]!, { type: "continue" }, { ...idle, auth: oneReady })).toBe(scenes[0]);
  expect(nextScene(scenes[0]!, { type: "completed" }, { ...idle, auth: oneReady })).toBe(scenes[0]);
  expect(nextScene(scenes[1]!, { type: "completed" }, { ...idle, auth: oneReady })).toBe(scenes[1]);
  expect(nextScene(scenes[2]!, { type: "start" }, { ...idle, auth: oneReady })).toBe(scenes[2]);
  expect(nextScene(scenes[3]!, { type: "back" }, { ...idle, auth: oneReady })).toBe(scenes[3]);
  expect(nextScene(scenes[2]!, { type: "step", to: "project" }, { ...idle, auth: oneReady })).toBe(scenes[2]);
});

test("on the Project step, the only ready provider expiring blocks completion; another ready one keeps it allowed", () => {
  const root = "/Users/alex/code/studio";
  expect(canComplete(oneReady, root)).toBe(true);
  const onlyExpired = snapshot(4, provider("claude", expired, { phase: "reauthRequired" }), provider("codex", notConnected));
  expect(canComplete(onlyExpired, root)).toBe(false);
  const otherStillReady = snapshot(4, provider("claude", expired, { phase: "reauthRequired" }), provider("codex", READY));
  expect(canComplete(otherStillReady, root)).toBe(true);
  expect(canComplete(oneReady, null)).toBe(false);
  expect(canComplete(oneReady, "")).toBe(false);
  expect(canComplete(null, root)).toBe(false);
});

test("a result started under an older scene or selection generation is discarded, in either completion order", () => {
  let selection = { generation: 0 };
  const first = selection.generation;
  selection = advance(selection);
  const second = selection.generation;
  // Newer finishes first, then the older one arrives late.
  expect(isCurrent(selection, second)).toBe(true);
  expect(isCurrent(selection, first)).toBe(false);
  // A scene change also outdates checks started on the previous scene.
  const scene = nextScene({ scene: "project", generation: 9 }, { type: "back" }, { ...idle, auth: oneReady });
  expect(isCurrent(scene, 9)).toBe(false);
  expect(isCurrent(scene, scene.generation)).toBe(true);
});

test("auth snapshots keep the newest revision whatever order replies and events arrive in", () => {
  const r5 = snapshot(5, provider("claude", READY)), r4 = snapshot(4, provider("claude", notConnected)), r5b = snapshot(5, provider("claude", notConnected));
  expect(newerAuth(null, r4)).toBe(r4);
  expect(newerAuth(r4, r5)).toBe(r5);
  expect(newerAuth(r5, r4)).toBe(r5);
  expect(newerAuth(r5, r5b)).toBe(r5);
});

type Status = { session: { id: string; revision: number }; auth: AuthSnapshot; root: string | null };
test("onboarding session revision and auth revision are merged independently", () => {
  const current: Status = { session: { id: "s1", revision: 3 }, auth: snapshot(8, provider("claude", READY)), root: "/a" };
  // A newer session state carrying an older auth snapshot keeps the auth snapshot already seen.
  const newerSession: Status = { session: { id: "s1", revision: 4 }, auth: snapshot(7, provider("claude", notConnected)), root: "/b" };
  expect(mergeStatus(current, newerSession, "s1")).toEqual({ ...newerSession, auth: current.auth });
  // An older session state still contributes a newer auth snapshot.
  const olderSession: Status = { session: { id: "s1", revision: 2 }, auth: snapshot(9, provider("claude", notConnected)), root: "/c" };
  expect(mergeStatus(current, olderSession, "s1")).toEqual({ ...current, auth: olderSession.auth });
  const same: Status = { session: { id: "s1", revision: 3 }, auth: snapshot(8, provider("claude", notConnected)), root: "/d" };
  expect(mergeStatus(current, same, "s1")).toBe(current);
  expect(mergeStatus(null, current, "s1")).toBe(current);
});

test("only the session named by the latest start or reconnect is accepted; a late reply from another is dropped", () => {
  const a: Status = { session: { id: "sA", revision: 5 }, auth: snapshot(8, provider("claude", READY)), root: "/a" };
  const b: Status = { session: { id: "sB", revision: 1 }, auth: snapshot(1, provider("claude", notConnected)), root: null };
  const lateA: Status = { session: { id: "sA", revision: 6 }, auth: snapshot(9, provider("claude", READY)), root: "/late" };
  // Start returned sB: the sA state is replaced wholesale, nothing of it is kept.
  const afterB = mergeStatus(a, b, "sB");
  expect(afterB).toBe(b);
  // A late sA reply, even with higher revisions, never comes back.
  expect(mergeStatus(afterB, lateA, "sB")).toBe(b);
  expect(mergeStatus(null, lateA, "sB")).toBeNull();
  // Before the sB reply lands, an sA reply cannot win either.
  expect(mergeStatus(a, lateA, "sB")).toBe(a);
});

test("Continue cancels only the sign-ins this window owns", () => {
  const signingIn = (name: Provider, id: string) => provider(name, { ready: false, cause: "busy", action: "wait" }, { phase: "signingIn", attempt: { id, kind: "signIn", cancelling: false }, actions: ["cancel"] });
  const auth = snapshot(6, provider("claude", READY), signingIn("codex", "a-own"), signingIn("cursor", "a-other"),
    provider("copilot", unverified, { phase: "checking", attempt: { id: "a-check", kind: "check", cancelling: false } }),
    provider("antigravity", { ready: false, cause: "busy", action: "wait" }, { phase: "signingIn", attempt: { id: "a-gone", kind: "signIn", cancelling: true } }));
  expect(ownedSignIns(auth, ["a-own", "a-check", "a-gone", "a-stale"])).toEqual([{ provider: "codex", attemptId: "a-own" }]);
  expect(ownedSignIns(auth, [])).toEqual([]);
  expect(ownedSignIns(null, ["a-own"])).toEqual([]);
});
