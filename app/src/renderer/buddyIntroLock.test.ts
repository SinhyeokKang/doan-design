import { beforeEach, expect, test, vi } from "vitest";

// useBuddyIntroLock driven with hooks as plain state, as buddySelection.hook.test.ts drives its hook.
const hooks = vi.hoisted(() => ({ states: [] as unknown[], effects: [] as (() => unknown)[], cursor: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (next: unknown) => { hooks.states[index] = next; }];
  },
  useEffect: (run: () => unknown) => { hooks.effects.push(run); },
}));
const { useBuddyIntroLock } = await import("./buddyIntroLock");

let answer: (open: boolean) => void;
const doan = { readBuddyIntro: vi.fn(() => new Promise<boolean>(resolve => { answer = resolve; })), closeBuddyIntro: vi.fn(async () => {}) };
const render = () => { hooks.cursor = 0; return useBuddyIntroLock(); };
const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
beforeEach(() => {
  hooks.states = []; hooks.effects = [];
  doan.readBuddyIntro.mockClear(); doan.closeBuddyIntro.mockClear();
  vi.stubGlobal("window", { doan });
});

test("closed until main answers, then open as main decided at launch", async () => {
  expect(render().open).toBe(false);
  const cleanup = hooks.effects[0]!();
  expect(doan.readBuddyIntro).toHaveBeenCalledOnce();
  answer(true);
  await settle();
  expect(render().open).toBe(true);
  expect(typeof cleanup).toBe("function");
});

test("main's answer after unmount changes nothing", async () => {
  render();
  const cleanup = hooks.effects[0]!() as () => void;
  cleanup();
  answer(true);
  await settle();
  expect(render().open).toBe(false);
});

test("close lifts the lock here at once and tells main", async () => {
  render();
  hooks.effects[0]!();
  answer(true);
  await settle();
  render().close();
  expect(render().open).toBe(false);
  expect(doan.closeBuddyIntro).toHaveBeenCalledOnce();
});
