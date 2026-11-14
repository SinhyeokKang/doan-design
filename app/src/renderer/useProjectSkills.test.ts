import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ComposerTurn } from "./composerRules";

// The hook run as plain state, its effects after each call (the App tests' no-DOM style).
const hooks = vi.hoisted(() => ({ states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as { deps: unknown[] }[], pending: [] as (() => void)[], cursor: 0, refCursor: 0, effectCursor: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next; }];
  },
  useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
  useEffect: (run: () => void, deps: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.effects[index];
    if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
    hooks.effects[index] = { deps };
    hooks.pending.push(run);
  },
}));
const { useProjectSkills } = await import("./useProjectSkills");

let list: ReturnType<typeof vi.fn>;
beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = [];
  list = vi.fn(async () => ({ skills: [] }));
  vi.stubGlobal("window", { doan: { listConversationSkills: list } });
});
afterEach(() => vi.unstubAllGlobals());
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
async function render(turn: ComposerTurn) {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  useProjectSkills(window.doan, "/code/doan", "claude", turn);
  for (const run of hooks.pending) run();
  await settle();
}

// The list is read again as the turn ends, so a skill the agent made shows at once: the end is the turn's terminal, not
// main's judgement after it, which counts holding with idle.
test("reads again once when a turn ends into holding, and not again when holding turns idle", async () => {
  await render("idle");
  expect(list).toHaveBeenCalledTimes(1);
  await render("running");
  expect(list).toHaveBeenCalledTimes(1);
  await render("holding");
  expect(list).toHaveBeenCalledTimes(2);
  await render("idle");
  expect(list).toHaveBeenCalledTimes(2);
  // A turn that ends straight to idle still reads, and a waiting turn's end reads as well.
  await render("running");
  await render("idle");
  expect(list).toHaveBeenCalledTimes(3);
  await render("waiting");
  await render("holding");
  expect(list).toHaveBeenCalledTimes(4);
});
