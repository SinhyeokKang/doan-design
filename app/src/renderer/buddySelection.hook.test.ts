import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PreferencesSnapshot, PreferencesWriteReply } from "../main/preferences";
import type { BuddyId } from "./buddies";

// useBuddySelection driven with hooks as plain state, as the App tests drive App.
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], cursor: 0, refCursor: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (next: unknown) => { hooks.states[index] = next; }];
  },
  useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
}));
const { DEFAULT_PREFERENCES } = await import("../main/preferences");
const { useBuddySelection } = await import("./buddySelection");

const snap = (buddy?: BuddyId): PreferencesSnapshot => ({ preferences: buddy ? { ...DEFAULT_PREFERENCES, buddy } : DEFAULT_PREFERENCES, notice: null });
let replies: ((reply: PreferencesWriteReply | null) => void)[];
let saved: PreferencesSnapshot | null;
// App's savePreferences: takes a reply's snapshot as App's own.
const save = vi.fn((_patch: unknown) => new Promise<PreferencesWriteReply | null>(resolve => { replies.push(reply => { if (reply) saved = reply.snapshot; resolve(reply); }); }));
const render = () => { hooks.cursor = 0; hooks.refCursor = 0; return useBuddySelection(saved, save, "doany"); };
const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
beforeEach(() => { hooks.states = []; hooks.refs = []; replies = []; saved = snap("dori"); save.mockClear(); });

test("rendering saves nothing; a pick shows at once and saves only the buddy", () => {
  expect(render().shown).toBe("dori");
  expect(save).not.toHaveBeenCalled();
  void render().select("popo");
  expect(save).toHaveBeenCalledWith({ buddy: "popo" });
  expect(render().shown).toBe("popo");
});

test("A's failure arriving after B was picked is ignored; B's reply decides", async () => {
  const a = render().select("popo");
  const b = render().select("puri");
  replies[0]!({ ok: false, reason: "write_failed", snapshot: snap("dori") });
  expect(await a).toBe(false);
  expect(render()).toMatchObject({ shown: "puri", failure: null });
  replies[1]!({ ok: true, snapshot: snap("puri") });
  expect(await b).toBe(true);
  expect(render()).toMatchObject({ shown: "puri", failure: null });
});

// App owns the selection, so a reply that lands after first run closed its Buddy step still applies.
test("a reply after the screen that picked has gone still applies", async () => {
  void render().select("popo");
  replies[0]!({ ok: true, snapshot: snap("popo") });
  await settle();
  expect(render().shown).toBe("popo");
});

test("a null reply goes back to App's snapshot and names both buddies; a later success clears it", async () => {
  void render().select("popo");
  replies[0]!(null);
  await settle();
  expect(render()).toMatchObject({ shown: "dori", failure: { picked: "popo", kept: "dori" } });
  void render().select("popo");
  expect(render()).toMatchObject({ shown: "popo", failure: { picked: "popo", kept: "dori" } });
  replies[1]!({ ok: true, snapshot: snap("popo") });
  await settle();
  expect(render()).toMatchObject({ shown: "popo", failure: null });
});

test("Continue waits for the latest save and learns whether it worked; dismiss clears the notice", async () => {
  expect(await render().settled()).toBe(true);
  void render().select("popo");
  const waiting = render().settled();
  let done: boolean | null = null;
  void waiting.then(value => { done = value; });
  await settle();
  expect(done).toBeNull();
  replies[0]!({ ok: false, reason: "write_failed", snapshot: snap("dori") });
  expect(await waiting).toBe(false);
  expect(render().failure).toEqual({ picked: "popo", kept: "dori" });
  render().dismiss();
  expect(render().failure).toBeNull();
});

// POSTMORTEM 2026-10-25 'An older install failure replaced newer feedback': both completion orders.
test.each([
  ["a refusal", (replies: ((reply: PreferencesWriteReply | null) => void)[]) => replies[1]!({ ok: false, reason: "write_failed", snapshot: snap("popo") })],
  ["a null reply", (replies: ((reply: PreferencesWriteReply | null) => void)[]) => replies[1]!(null)],
])("A saves while B is pending, then B fails with %s: A shows and the notice keeps A", async (_name, failB) => {
  const a = render().select("popo");
  const b = render().select("puri");
  replies[0]!({ ok: true, snapshot: snap("popo") });
  expect(await a).toBe(true);
  expect(render()).toMatchObject({ shown: "puri", failure: null });
  failB(replies);
  expect(await b).toBe(false);
  expect(render()).toMatchObject({ shown: "popo", failure: { picked: "puri", kept: "popo" } });
});

test("B fails first, then A's older success lands: the notice for B stays and the saved buddy shows", async () => {
  const a = render().select("popo");
  const b = render().select("puri");
  replies[1]!({ ok: false, reason: "write_failed", snapshot: snap("dori") });
  expect(await b).toBe(false);
  expect(render()).toMatchObject({ shown: "dori", failure: { picked: "puri", kept: "dori" } });
  replies[0]!({ ok: true, snapshot: snap("popo") });
  expect(await a).toBe(true);
  // A's reply is not the latest: it clears nothing. App's snapshot took what main saved, so that is what shows.
  expect(render()).toMatchObject({ shown: "popo", failure: { picked: "puri", kept: "dori" } });
});

// The existing-user buddy screen: Continue saves the buddy on screen when the file has none (Doany at first).
test("commit with no saved buddy saves the shown buddy, Doany at first, and resolves with that save", async () => {
  saved = snap();
  const committing = render().commit();
  expect(save).toHaveBeenCalledExactlyOnceWith({ buddy: "doany" });
  replies[0]!({ ok: true, snapshot: snap("doany") });
  expect(await committing).toBe(true);
});

test("commit after a saved pick saves nothing more", async () => {
  saved = snap();
  void render().select("popo");
  replies[0]!({ ok: true, snapshot: snap("popo") });
  await settle();
  expect(await render().commit()).toBe(true);
  expect(save).toHaveBeenCalledOnce();
});

test("commit while a pick is saving waits for it; a failure keeps the screen with its notice", async () => {
  saved = snap();
  void render().select("popo");
  const committing = render().commit();
  expect(save).toHaveBeenCalledOnce();
  replies[0]!({ ok: false, reason: "write_failed", snapshot: snap() });
  expect(await committing).toBe(false);
  expect(render().failure).toEqual({ picked: "popo", kept: "doany" });
});

test("commit after a failed pick saves the buddy now on screen", async () => {
  saved = snap();
  void render().select("popo");
  replies[0]!(null);
  await settle();
  const committing = render().commit();
  expect(save).toHaveBeenLastCalledWith({ buddy: "doany" });
  replies[1]!({ ok: true, snapshot: snap("doany") });
  expect(await committing).toBe(true);
  expect(render().failure).toBeNull();
});

test("commit with a saved buddy and nothing picked saves nothing", async () => {
  expect(await render().commit()).toBe(true);
  expect(save).not.toHaveBeenCalled();
});

// A failure that already answered is not a save to wait for: Continue goes on with the buddy that stays (draft frame
// buddy-step-failed), and only a press while a save runs waits for it.
test("after a failed save has answered, Continue goes on; a press while a save runs still waits for it", async () => {
  void render().select("popo");
  replies[0]!({ ok: false, reason: "write_failed", snapshot: snap("dori") });
  await settle();
  expect(render().failure).toEqual({ picked: "popo", kept: "dori" });
  expect(await render().settled()).toBe(true);
  void render().select("puri");
  const waiting = render().settled();
  replies[1]!(null);
  expect(await waiting).toBe(false);
  await settle();
  expect(await render().settled()).toBe(true);
});

// Settings > General's switch starts the 24-hour lock (PRODUCT §5 item 0 'General'); first run and the buddy screen do
// not.
describe("the buddy lock", () => {
  const H = 3_600_000;
  const NOW = Date.parse("2026-11-14T10:00:00.000Z");
  const AT = "2026-11-14T10:00:00.000Z";
  const locked = (buddy: BuddyId, at: string): PreferencesSnapshot => ({ preferences: { ...DEFAULT_PREFERENCES, buddy, buddyChangedAt: at }, notice: null });
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); });
  afterEach(() => vi.useRealTimers());

  test("a Settings pick sends the buddy and its change time as one patch", () => {
    void render().select("popo", AT);
    expect(save).toHaveBeenCalledExactlyOnceWith({ buddy: "popo", buddyChangedAt: AT });
  });

  test("first run's and the buddy screen's picks, commit and Retry send no change time", async () => {
    void render().select("popo");
    expect(save).toHaveBeenLastCalledWith({ buddy: "popo" });
    replies[0]!(null);
    await settle();
    expect(render().failure).toEqual({ picked: "popo", kept: "dori" });
    expect(render().failure).not.toHaveProperty("cooldown");
    saved = snap();
    void render().commit();
    expect(save).toHaveBeenLastCalledWith({ buddy: "doany" });
  });

  // Retry then goes the same way: SettingsGeneral sends a fresh time only for a failure marked as a Settings switch.
  test("a failed Settings switch says so in its failure", async () => {
    void render().select("popo", AT);
    replies[0]!({ ok: false, reason: "write_failed", snapshot: snap("dori") });
    await settle();
    expect(render().failure).toEqual({ picked: "popo", kept: "dori", cooldown: true });
  });

  test("no lock without a change time, or before the snapshot", () => {
    expect(render().lockedUntil).toBeNull();
    saved = null;
    expect(render().lockedUntil).toBeNull();
  });

  test("the lock ends 24 hours after the saved change", () => {
    saved = locked("popo", new Date(NOW - 2 * H).toISOString());
    expect(render().lockedUntil).toBe(NOW + 22 * H);
  });

  test("a saved switch locks from the reply's change time", async () => {
    void render().select("popo", AT);
    replies[0]!({ ok: true, snapshot: locked("popo", AT) });
    await settle();
    expect(render().lockedUntil).toBe(NOW + 24 * H);
  });

  // The clock went back: one run locks at most 24 hours from when it first saw the time, however often it renders.
  test("a change time in the future is first seen once per value: later renders keep the same end", () => {
    saved = locked("popo", new Date(NOW + 100 * H).toISOString());
    expect(render().lockedUntil).toBe(NOW + 24 * H);
    vi.setSystemTime(NOW + 3 * H);
    expect(render().lockedUntil).toBe(NOW + 24 * H);
    // A new value is seen anew.
    saved = locked("puri", new Date(NOW + 200 * H).toISOString());
    expect(render().lockedUntil).toBe(NOW + 27 * H);
  });

  test("an unparsable time from IPC locks nothing", () => {
    saved = locked("popo", "soon");
    expect(render().lockedUntil).toBeNull();
  });
});
