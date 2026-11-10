import { beforeEach, expect, test, vi } from "vitest";
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
