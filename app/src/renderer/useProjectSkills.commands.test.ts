import { afterEach, beforeEach, expect, test, vi, type Mock } from "vitest";
import type { Provider } from "../main/agentAuth/types";
import type { SkillsCalls } from "./useProjectSkills";

// An ACP agent's commands are its conversation's: main answers only for a conversationId,
// with the server's unconfirmed commands as `passthrough`.
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

let list: Mock<SkillsCalls["listConversationSkills"]>;
beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = [];
  list = vi.fn<SkillsCalls["listConversationSkills"]>(async () => ({ skills: [{ kind: "command", name: "compact", description: "" }], passthrough: ["share"] }));
});
afterEach(() => vi.unstubAllGlobals());
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
async function render(provider: Provider, conversationId?: string) {
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  let result = useProjectSkills({ listConversationSkills: list }, "/code/doan", provider, "idle", 0, conversationId);
  for (const run of hooks.pending) run();
  await settle();
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  result = useProjectSkills({ listConversationSkills: list }, "/code/doan", provider, "idle", 0, conversationId);
  return result;
}

test("an ACP conversation reads its commands and unconfirmed names by its id", async () => {
  const result = await render("copilot", "c1");
  expect(list).toHaveBeenCalledWith({ root: "/code/doan", provider: "copilot", conversationId: "c1" });
  expect(result.skills).toEqual([{ kind: "command", name: "compact", description: "" }]);
  expect(result.passthrough).toEqual(["share"]);
});

test("an ACP agent without a conversation reads nothing and lists nothing", async () => {
  const result = await render("cursor");
  expect(list).not.toHaveBeenCalled();
  expect(result.skills).toEqual([]);
  expect(result.passthrough).toEqual([]);
});

// Their commands are the fixed allowlist of the folder's read, the same in every conversation of the root.
test("Claude Code and Codex read by the root alone, with or without a conversation", async () => {
  const result = await render("codex", "c2");
  expect(list).toHaveBeenCalledWith({ root: "/code/doan", provider: "codex" });
  expect(result.skills).toHaveLength(1);
});

test("another conversation's list is not shown while its own is read", async () => {
  list.mockImplementationOnce(async () => ({ skills: [{ kind: "command", name: "share-a", description: "" }], passthrough: ["a"] }));
  await render("copilot", "c1");
  list.mockImplementationOnce(() => new Promise(() => {}));
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  const other = useProjectSkills({ listConversationSkills: list }, "/code/doan", "copilot", "idle", 0, "c2");
  expect(other.skills).toEqual([]);
  expect(other.passthrough).toEqual([]);
});
