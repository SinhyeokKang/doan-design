import { isValidElement, type ReactElement, type ReactNode } from "react";
import { DropdownMenu } from "radix-ui";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AccountIdentity, AuthAttempt, AuthState, AuthStatusDto, Provider, ToolFacts } from "../main/agentAuth/types";
import type { Preferences, PreferencesSnapshot } from "../main/preferences";

// buzz-settings U3: Settings > Agents, driven with hooks as plain state so the component's own handlers and effects run
// (App.addProjects.test.tsx style). The sign-in controller is the real one over a fake agent-auth API.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as ({ deps: unknown[] | undefined; cleanup?: () => void } | undefined)[],
  pending: [] as (() => void)[], cursor: 0, refCursor: 0, effectCursor: 0,
}));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  const effect = (run: () => unknown, deps?: unknown[]) => {
    const index = hooks.effectCursor++, previous = hooks.effects[index];
    if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((dep, i) => Object.is(dep, previous.deps![i]))) return;
    const slot: { deps: unknown[] | undefined; cleanup?: () => void } = { deps };
    hooks.effects[index] = slot;
    hooks.pending.push(() => { previous?.cleanup?.(); const cleanup = run(); if (typeof cleanup === "function") slot.cleanup = cleanup as () => void; });
  };
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next; }];
    },
    useReducer: () => [0, () => {}],
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: effect, useLayoutEffect: effect,
  };
});

const { SettingsAgents } = await import("./SettingsAgents");
const { AgentSignIn } = await import("./agentSignIn");
const { NoticeView, StopDialog } = await import("./Onboarding");
const { AlertIcon } = await import("./AlertIcon");
const { PermissionMenuItems } = await import("./ComposerParts");

const FACTS: ToolFacts = { cli: "found", version: "supported", tools: "ready" };
const ACCOUNT: AccountIdentity = { id: "acct", workspace: "org", email: "ada@example.com" };
function dto(provider: Provider, f: { account?: boolean; attempt?: Pick<AuthAttempt, "kind" | "id">; facts?: Partial<ToolFacts> } = {}, revision = 1): AuthStatusDto {
  const account = f.account ?? true;
  const state: AuthState = {
    provider, generation: 1, verified: true, expired: false, connection: account ? { provider, connectionId: "c", profile: provider, account: ACCOUNT } : null,
    attempt: f.attempt ? { owner: 7, cancelled: false, ...f.attempt } : null, error: null,
    phase: f.attempt ? "signingIn" : account ? "connected" : "disconnected",
  };
  return authStatus(state, { ...FACTS, ...f.facts }, revision);
}
const prefs = (newConversation: Preferences["newConversation"]): PreferencesSnapshot => ({ preferences: { v: 1, notifications: { enabled: true, approval: true, finished: true, failed: true }, newConversation }, notice: null });

let auth: AuthSnapshot;
let api: Record<string, ReturnType<typeof vi.fn>>;
let authListener: (snapshot: AuthSnapshot) => void;
let promptListener: (event: { provider: Provider; attemptId: string; url: string }) => void;
let signIn: InstanceType<typeof AgentSignIn>;
let tree: ReactNode;
let props: Parameters<typeof SettingsAgents>[0];

beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  auth = { revision: 1, providers: [dto("claude"), dto("codex", { account: false })] };
  api = {
    readAgentAuth: vi.fn(async () => auth), onAgentAuth: vi.fn((listener: typeof authListener) => { authListener = listener; return () => {}; }),
    onAgentSignInPrompt: vi.fn((listener: typeof promptListener) => { promptListener = listener; return () => {}; }),
    checkAgentAuth: vi.fn(async () => ({ ok: true })), signInAgent: vi.fn(async () => ({ ok: true, attemptId: "a1" })), signOutAgent: vi.fn(async () => ({ ok: true })),
    cancelAgentSignIn: vi.fn(async () => ({ ok: true })), submitAgentSignInCode: vi.fn(async () => ({ ok: true })), openAgentSignInLink: vi.fn(async () => ({ ok: true })),
    openInstallPage: vi.fn(async () => true), openInstall: vi.fn(async () => "terminal"),
    listConversationModels: vi.fn(async () => ({ models: [{ id: "opus", label: "Opus 5.5", default: true, efforts: ["low", "high"] }, { id: "haiku", label: "Haiku 5.5", default: false }] })),
    startConversation: vi.fn(), sendConversation: vi.fn(),
  };
  vi.stubGlobal("window", { doan: api, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { activeElement: null, body: {}, hasFocus: () => true, querySelector: () => null });
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => { run(); return 0; });
  vi.stubGlobal("HTMLElement", class {});
  signIn = new AgentSignIn({ api: api as never, hasFocus: () => true });
  signIn.start();
  props = { signIn, arrival: null, onLock: vi.fn(), preferences: prefs(null), save: vi.fn(async () => null), project: { root: "/code/acme", name: "acme-web" } };
});
// review BU1 ⚪4: the Settings page shares the main window's preload, so nothing here may start or send a conversation.
afterEach(() => {
  expect(api.startConversation).not.toHaveBeenCalled();
  expect(api.sendConversation).not.toHaveBeenCalled();
  vi.unstubAllGlobals(); vi.useRealTimers();
});

function render(next: Partial<typeof props> = {}): ReactNode {
  props = { ...props, ...next };
  hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = [];
  const top = SettingsAgents(props);
  // The defaults section is its own component; it renders here as React would, after its parent.
  tree = [top, ...all(top).filter(element => typeof element.type === "function" && element.type.name === "NewConversations").map(element => (element.type as (props: unknown) => ReactNode)(element.props))];
  for (const run of hooks.pending) run();
  return tree;
}
async function settle(next: Partial<typeof props> = {}) {
  render(next);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return render();
}
function unmount() { for (const slot of hooks.effects) slot?.cleanup?.(); hooks.states = []; hooks.refs = []; hooks.effects = []; }
function all(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...Object.values(node.props).flatMap(value => Array.isArray(value) || isValidElement(value) ? all(value as ReactNode) : [])];
}
const words = (node: unknown): string => Array.isArray(node) ? node.map(words).join("") : typeof node === "string" ? node : isValidElement<Record<string, unknown>>(node) ? words(node.props.children) : "";
const labelled = (prefix: string) => all(tree).filter(element => typeof element.props["aria-label"] === "string" && (element.props["aria-label"] as string).startsWith(prefix));
// Picks a Model menu row by its text, through the value the row itself carries.
function pickModel(text: string) {
  const group = all(tree).filter(element => element.type === DropdownMenu.RadioGroup)[1]!;
  const item = all(group).find(element => element.type === DropdownMenu.RadioItem && words(element.props.children).startsWith(text))!;
  (group.props.onValueChange as (value: string) => void)(item.props.value as string);
}
const modelRows = () => all(all(tree).filter(element => element.type === DropdownMenu.RadioGroup)[1]!).filter(element => element.type === DropdownMenu.RadioItem);
const checked = () => modelRows().filter(item => all(item.props.children as ReactNode).some(element => element.props.className === "check")).map(item => words(item.props.children));
const row = (provider: Provider) => all(tree).find(element => element.props["data-provider"] === provider && element.props.role === "group");

test("rows are provider groups split into Connected and Not connected; an empty section is hidden", async () => {
  await settle();
  const titles = all(tree).filter(element => element.props.className === "settings-section-title").map(element => words(element.props.children));
  expect(titles).toEqual(["Connected", "Not connected", "New conversations"]);
  expect(row("claude")?.props).toMatchObject({ role: "group", "aria-label": "Claude Code", tabIndex: -1 });
  auth = { revision: 2, providers: [dto("claude", {}, 2)] };
  authListener(auth); render();
  expect(all(tree).filter(element => element.props.className === "settings-section-title").map(element => words(element.props.children))).toEqual(["Connected", "New conversations"]);
});

test("a saved default whose agent is no longer signed in keeps its choice and says what Home does instead", async () => {
  await settle({ preferences: prefs({ provider: "codex" }) });
  expect(labelled("Agent for new conversations")[0]?.props["aria-label"]).toBe("Agent for new conversations: Codex");
  const warning = all(tree).find(element => element.props.role === "status" && words(element.props.children).includes("isn’t signed in"));
  expect(words(warning?.props.children)).toBe("Codex isn’t signed in, so Home starts with the agent you sent with last.");
});

// review BU1 ⚪1/⚪2: a fixed default that is connected but cannot run says why, and so does its Model row.
test("a connected default that cannot run says the real cause, and Model says why it is off", async () => {
  auth = { revision: 1, providers: [dto("claude"), dto("codex", { facts: { version: "unsupported" } })] };
  await settle({ preferences: prefs({ provider: "codex" }) });
  const warning = all(tree).find(element => element.props.role === "status" && words(element.props.children).includes("so Home starts"));
  expect(words(warning?.props.children)).toBe("Codex needs an update, so Home starts with the agent you sent with last.");
  const model = labelled("Model for new conversations")[0]!;
  expect(model.props.disabled).toBe(true);
  const modelRow = all(tree).find(element => element.props.className === "doan-preference-row" && all(element.props.children as ReactNode).includes(model))!;
  expect(modelRow.props["data-disabled"]).toBe("");
  expect(words(modelRow.props.children)).toContain("Codex can’t run right now, so its models can’t be listed.");
});

// review BU1 ❓2 (spec 'New conversations'): Effort is offered with Model Default too, from the default model's efforts.
test("with Model Default, Effort lists the default model's efforts and saves without a model; a default without efforts hides it", async () => {
  await settle({ preferences: prefs({ provider: "claude" }) });
  await settle();
  expect(labelled("Model for new conversations")[0]?.props["aria-label"]).toBe("Model for new conversations: Default · Opus 5.5");
  expect(labelled("Effort for new conversations")[0]?.props["aria-label"]).toBe("Effort for new conversations: Default");
  const groups = all(tree).filter(element => element.type === DropdownMenu.RadioGroup);
  (groups[2]!.props.onValueChange as (value: string) => void)("high");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: { provider: "claude", effort: "high" } });
  await settle({ preferences: prefs({ provider: "claude", effort: "high" }) });
  expect(labelled("Effort for new conversations")[0]?.props["aria-label"]).toBe("Effort for new conversations: High");
  resetHooksAndList([{ id: "opus", label: "Opus 5.5", default: true }, { id: "haiku", label: "Haiku 5.5", default: false, efforts: ["low"] }]);
  await settle({ preferences: prefs({ provider: "claude" }) });
  await settle();
  expect(labelled("Effort for new conversations")).toHaveLength(0);
});
// picker-default-labels A4 (spec 'Settings > New conversations', design decision 5): the Model menu always opens with a
// Default row that unfixes it, and only this menu leaves Claude Code's own default row out.
test("the Model menu opens with a Default row naming today's default; picking it unfixes the model", async () => {
  resetHooksAndList([{ id: "default", label: "Opus 5.5", default: true, efforts: ["low", "high"] }, { id: "haiku", label: "Haiku 5.5", default: false }]);
  await settle({ preferences: prefs({ provider: "claude", model: "haiku", permissionMode: "plan" }) });
  await settle();
  expect(labelled("Model for new conversations")[0]?.props["aria-label"]).toBe("Model for new conversations: Haiku 5.5");
  const group = all(tree).filter(element => element.type === DropdownMenu.RadioGroup)[1]!;
  const items = all(group).filter(element => element.type === DropdownMenu.RadioItem);
  expect(items.map(item => words(item.props.children))).toEqual(["DefaultOpus 5.5", "Haiku 5.5"]);
  expect(group.props.value).toBe(items[1]!.props.value);
  pickModel("Default");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: { provider: "claude", permissionMode: "plan" } });
});

test("a saved Claude Code \"default\" reads as nothing fixed", async () => {
  resetHooksAndList([{ id: "default", label: "Opus 5.5", default: true, efforts: ["low", "high"] }, { id: "haiku", label: "Haiku 5.5", default: false }]);
  await settle({ preferences: prefs({ provider: "claude", model: "default", effort: "high" }) });
  await settle();
  expect(labelled("Model for new conversations")[0]?.props["aria-label"]).toBe("Model for new conversations: Default · Opus 5.5");
  const groups = all(tree).filter(element => element.type === DropdownMenu.RadioGroup);
  expect(checked()).toEqual(["DefaultOpus 5.5"]);
  // Only the Default row stands for it: the saved id is never offered as a model of its own.
  expect(all(groups[1]!).filter(element => element.type === DropdownMenu.RadioItem)).toHaveLength(2);
  expect(labelled("Effort for new conversations")[0]?.props["aria-label"]).toBe("Effort for new conversations: High");
  (groups[2]!.props.onValueChange as (value: string) => void)("low");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: { provider: "claude", effort: "low" } });
});

test("Codex with nothing fixed names its default model and level", async () => {
  auth = { revision: 1, providers: [dto("claude"), dto("codex")] };
  resetHooksAndList([{ id: "gpt-6-luna", label: "GPT-6-Luna", default: true, efforts: ["low", "medium"], defaultEffort: "medium" }]);
  await settle({ preferences: prefs({ provider: "codex" }) });
  await settle();
  expect(labelled("Model for new conversations")[0]?.props["aria-label"]).toBe("Model for new conversations: Default · GPT-6-Luna");
  expect(labelled("Effort for new conversations")[0]?.props["aria-label"]).toBe("Effort for new conversations: Default · Medium");
  expect(labelled("Permission for new conversations")[0]?.props["aria-label"]).toBe("Permission for new conversations: Ask first");
});
// A Codex account replacement mints a new connection, whose list main reads again; the list read for the account
// before it must not stay on the Model row.
test("a new connection of the default agent reads its models again instead of keeping the previous account's", async () => {
  auth = { revision: 1, providers: [dto("claude"), dto("codex")] };
  resetHooksAndList([{ id: "gpt-old", label: "GPT Old", default: true }]);
  await settle({ preferences: prefs({ provider: "codex" }) });
  await settle();
  expect(labelled("Model for new conversations")[0]?.props["aria-label"]).toBe("Model for new conversations: Default · GPT Old");
  api.listConversationModels!.mockResolvedValue({ models: [{ id: "gpt-new", label: "GPT New", default: true }] });
  authListener({ revision: 2, providers: [dto("claude", {}, 2), { ...dto("codex", {}, 2), generation: 2 }] });
  await settle();
  await settle();
  expect(api.listConversationModels).toHaveBeenCalledTimes(2);
  expect(labelled("Model for new conversations")[0]?.props["aria-label"]).toBe("Model for new conversations: Default · GPT New");
});
// RV 🟡1: an ACP agent may list a real model whose id is "default". The top Default row must stay apart from it:
// picking that model fixes it, the top row unfixes, and a stored value checks exactly one row.
test("an ACP model whose id is default is fixed by its own row, never confused with the top Default row", async () => {
  auth = { revision: 1, providers: [dto("claude"), dto("copilot")] };
  resetHooksAndList([{ id: "default", label: "Auto", default: true }, { id: "gpt-5.6", label: "GPT-5.6", default: false }]);
  await settle({ preferences: prefs({ provider: "copilot", model: "gpt-5.6" }) });
  await settle();
  expect(modelRows().map(item => words(item.props.children))).toEqual(["DefaultAuto", "Auto", "GPT-5.6"]);
  expect(new Set(modelRows().map(item => item.props.value)).size).toBe(3);
  expect(checked()).toEqual(["GPT-5.6"]);
  pickModel("Auto");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: { provider: "copilot", model: "default" } });
  pickModel("Default");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: { provider: "copilot" } });
  // A stored "default" is that model, fixed: only its row is checked and the trigger names it alone.
  resetHooksAndList([{ id: "default", label: "Auto", default: true }, { id: "gpt-5.6", label: "GPT-5.6", default: false }]);
  await settle({ preferences: prefs({ provider: "copilot", model: "default" }) });
  await settle();
  expect(checked()).toEqual(["Auto"]);
  expect(labelled("Model for new conversations")[0]?.props["aria-label"]).toBe("Model for new conversations: Auto");
  resetHooksAndList([{ id: "default", label: "Auto", default: true }, { id: "gpt-5.6", label: "GPT-5.6", default: false }]);
  await settle({ preferences: prefs({ provider: "copilot" }) });
  await settle();
  expect(checked()).toEqual(["DefaultAuto"]);
});
function resetHooksAndList(models: unknown[]) {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  api.listConversationModels!.mockResolvedValue({ models });
}

test("without a healthy project Model is disabled and says why", async () => {
  await settle({ preferences: prefs({ provider: "claude" }), project: null });
  const model = labelled("Model for new conversations")[0]!;
  expect(model.props.disabled).toBe(true);
  const modelRow = all(tree).find(element => element.props.className === "doan-preference-row" && all(element.props.children as ReactNode).includes(model))!;
  expect(modelRow.props["data-disabled"]).toBe("");
  expect(words(modelRow.props.children)).toContain("Add a project to choose a model. Until then, Home uses Claude Code’s default.");
  expect(api.listConversationModels).not.toHaveBeenCalled();
});

test("Last used hides Model and Effort", async () => {
  await settle({ preferences: prefs(null) });
  expect(labelled("Agent for new conversations")[0]?.props["aria-label"]).toBe("Agent for new conversations: Last used");
  expect(labelled("Model for new conversations")).toHaveLength(0);
  expect(labelled("Effort for new conversations")).toHaveLength(0);
});

test("Agent, Model and Effort are menus (role=menu), never a listbox Select, and each choice is saved", async () => {
  await settle({ preferences: prefs({ provider: "claude", model: "opus", effort: "high" }) });
  await settle();
  const triggers = all(tree).filter(element => element.type === DropdownMenu.Trigger);
  expect(triggers.map(trigger => (trigger.props.children as ReactElement<Record<string, unknown>>).props["aria-label"])).toEqual([
    "Agent for new conversations: Claude Code", "Model for new conversations: Opus 5.5", "Effort for new conversations: High", "Permission for new conversations: Ask first"]);
  expect(all(tree).filter(element => element.type === DropdownMenu.Content)).toHaveLength(4);
  expect(all(tree).some(element => typeof element.type === "object" && element.type !== null && String((element.type as { displayName?: string }).displayName).startsWith("Select"))).toBe(false);
  const groups = all(tree).filter(element => element.type === DropdownMenu.RadioGroup);
  (groups[0]!.props.onValueChange as (value: string) => void)("last");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: null });
  pickModel("Haiku 5.5");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: { provider: "claude", model: "haiku" } });
  (groups[2]!.props.onValueChange as (value: string) => void)("low");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: { provider: "claude", model: "opus", effort: "low" } });
});

// permission-mode U1 (draft frame settings-row): Permission follows Effort, uses the composer's menu, and is saved
// with the model and effort; a model or effort change keeps the saved mode.
test("Permission is a menu after Effort and saves the mode with the saved model and effort", async () => {
  await settle({ preferences: prefs({ provider: "claude", model: "opus", effort: "high", permissionMode: "bypass" }) });
  await settle();
  const trigger = labelled("Permission for new conversations")[0]!;
  expect(trigger.props["aria-label"]).toBe("Permission for new conversations: Full access, no approval requests");
  expect(trigger.props["data-mode"]).toBe("bypass");
  expect(words(trigger.props.children)).toBe("Full access");
  const menu = all(all(tree).filter(element => element.type === DropdownMenu.Content).at(-1)!).find(element => element.type === PermissionMenuItems)!;
  expect(menu.props.view).toMatchObject({ title: "Permissions · Claude Code", mode: "bypass" });
  expect((menu.props.view as { options: { description: string }[] }).options[0]!.description).toBe("Asks before edits and commands unless allowed");
  const groups = all(tree).filter(element => element.type === DropdownMenu.RadioGroup);
  const pickMode = menu.props.onPick as (value: string) => void;
  pickMode("plan");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: { provider: "claude", model: "opus", effort: "high", permissionMode: "plan" } });
  pickMode("default");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: { provider: "claude", model: "opus", effort: "high" } });
  pickModel("Haiku 5.5");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: { provider: "claude", model: "haiku", permissionMode: "bypass" } });
  (groups[2]!.props.onValueChange as (value: string) => void)("low");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: { provider: "claude", model: "opus", effort: "low", permissionMode: "bypass" } });
});

test("Last used hides Permission; a file from a newer Doan disables it with the others", async () => {
  await settle({ preferences: prefs(null) });
  expect(labelled("Permission for new conversations")).toHaveLength(0);
  unmount();
  await settle({ preferences: { ...prefs({ provider: "claude", permissionMode: "plan" }), notice: "newer" } });
  await settle();
  expect(labelled("Permission for new conversations")[0]?.props.disabled).toBe(true);
});

// A saved provider that cannot run keeps the row and its value; the Agent row carries the warning (draft settings-row).
test("a saved provider that cannot run keeps its Permission value under the Agent warning", async () => {
  await settle({ preferences: prefs({ provider: "codex", permissionMode: "acceptEdits" }) });
  expect(words(all(tree).find(element => element.props.role === "status" && words(element.props.children).includes("so Home starts"))?.props.children)).toContain("Codex isn’t signed in");
  expect(labelled("Permission for new conversations")[0]?.props["aria-label"]).toBe("Permission for new conversations: Accept edits");
});

test("leaving the page during a sign-in and coming back shows the waiting row with Cancel and Open again", async () => {
  await settle();
  const signInButton = all(row("codex")).find(element => element.props["data-command"] === "signIn")!;
  (signInButton.props.onClick as () => void)();
  await settle();
  expect(api.signInAgent).toHaveBeenCalledWith("codex", {});
  unmount();
  // The prompt and the snapshot arrive while no Agents page is mounted; the controller keeps them.
  auth = { revision: 2, providers: [dto("claude", {}, 2), dto("codex", { account: false, attempt: { kind: "signIn", id: "a1" } }, 2)] };
  authListener(auth);
  promptListener({ provider: "codex", attemptId: "a1", url: "https://auth.example/codex" });
  await settle();
  const notice = all(row("codex")).find(element => element.type === NoticeView)!;
  expect((notice.props.notice as { actions: { label: string; disabled: boolean }[] }).actions.map(action => `${action.label}${action.disabled ? " (off)" : ""}`)).toEqual(["Cancel", "Open again"]);
});

test("a stop_required refusal opens the stop dialog and locks the page until it closes", async () => {
  await settle({ preferences: prefs(null) });
  signIn.refuse("claude", "stop_required", "signOut");
  render();
  expect(props.onLock).toHaveBeenLastCalledWith(true);
  const dialog = all(tree).find(element => element.type === StopDialog)!;
  // mcp-connectors spec 8: signing out also drops the agent's MCP connections.
  expect((dialog.props.view as { body: string }).body).toBe("Claude Code is running a conversation. Signing out stops it. Your conversation history stays. Its MCP connectors need connecting again.");
  (dialog.props.close as () => void)();
  render();
  expect(props.onLock).toHaveBeenLastCalledWith(false);
  expect(all(tree).some(element => element.type === StopDialog)).toBe(false);
});

test("an arrival with a provider focuses its row group and flashes it for 2.4 s", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const doc: Record<string, unknown> = { activeElement: null, body: {}, hasFocus: () => true };
  const group = { focus: vi.fn(() => { doc.activeElement = group; }), isConnected: true, matches: () => false, querySelector: () => null };
  const focus = group.focus;
  doc.querySelector = (selector: string) => selector.includes('data-provider="codex"') ? group : null;
  vi.stubGlobal("document", doc);
  await settle({ arrival: { provider: "codex", seq: 1 } });
  expect(focus).toHaveBeenCalledTimes(1);
  expect(row("codex")?.props["data-flash"]).toBe("");
  vi.advanceTimersByTime(2400);
  render();
  expect(row("codex")?.props["data-flash"]).toBeUndefined();
  // The same arrival is not applied again on the next render.
  render();
  expect(focus).toHaveBeenCalledTimes(1);
});

// agent-cli-terminal T4: the row's install states on Settings, with the click handler's own promise awaited (POSTMORTEM
// 2026-10-25 UX K: a fixed pause let an unconsumed stale error pass).
// Row notices and their buttons are components (NoticeView, ActionButton); drawn here as React would.
const NOTICE_PARTS = new Set(["NoticeView", "ActionButton"]);
const drawn = (node: ReactNode): ReactElement<Record<string, unknown>>[] => all(node).flatMap(element =>
  typeof element.type === "function" && NOTICE_PARTS.has(element.type.name) ? [element, ...drawn((element.type as (props: unknown) => ReactNode)(element.props))] : [element]);
const click = (provider: Provider, command: string) => {
  const button = drawn(row(provider)).find(element => element.props["data-command"] === command && element.type === "button");
  if (!button) throw new Error(`no ${command} on ${provider}`);
  return (button.props.onClick as () => Promise<void> | undefined)();
};
const alerts = () => drawn(tree).filter(element => element.props.role === "alert").map(element => words(element.props.children));

test("Install opens Terminal: the row says to press Return there, and after the return check offers Check again", async () => {
  auth = { revision: 1, providers: [dto("claude"), dto("codex", { account: false, facts: { cli: "missing" } })] };
  api.openInstall = vi.fn(async () => "terminal");
  await settle();
  await click("codex", "install");
  render();
  expect(api.openInstall).toHaveBeenCalledWith("codex");
  expect(words(all(row("codex")).find(element => String(element.props.className).includes("settings-help"))?.props.children)).toBe("Terminal is open with the install command. Press Return there, then come back to Doan.");
  const focus = vi.mocked(window.addEventListener).mock.calls.find(call => call[0] === "focus")![1] as () => void;
  focus();
  await settle();
  expect(api.checkAgentAuth).toHaveBeenCalledWith("codex");
  await click("codex", "check");
  expect(api.checkAgentAuth).toHaveBeenCalledTimes(2);
  auth = { revision: 2, providers: [dto("claude", {}, 2), dto("codex", { account: false }, 2)] };
  authListener(auth); render();
  expect(all(tree).find(element => element.props.role === "status" && element.props.className === "ob-live")?.props.children).toBe("Codex is installed.");
  expect(all(row("codex")).some(element => element.props["data-command"] === "signIn")).toBe(true);
});

test("a Terminal that would not open puts the alert on its row with Open install page; a page that also fails says so there", async () => {
  auth = { revision: 1, providers: [dto("claude"), dto("codex", { account: false, facts: { cli: "missing" } })] };
  api.openInstall = vi.fn(async () => "failed");
  api.openInstallPage = vi.fn(async () => false);
  await settle();
  await click("codex", "install");
  render();
  expect(alerts()).toEqual(["Couldn’t open Terminal to install Codex. Open the install page to install it yourself."]);
  const notice = all(row("codex")).find(element => element.type === NoticeView);
  expect(notice).toBeDefined();
  await click("codex", "installPage");
  render();
  expect(api.openInstallPage).toHaveBeenCalledWith("codex");
  const failed = drawn(row("codex")).find(element => element.props.role === "alert")!;
  expect(words(failed.props.children)).toBe("Couldn’t open the Codex install page.");
  // On the white page the row notice keeps the default look: error tone, alert icon, no panel.
  expect(failed.props.className).toBe("doan-notice error");
  expect((failed.props.children as ReactElement[])[0]!.type).toBe(AlertIcon);
  expect(alerts()).toEqual(["Couldn’t open the Codex install page."]);
});

test("Settings: an older Install result never replaces the newer one, in either completion order", async () => {
  auth = { revision: 1, providers: [dto("claude"), dto("codex", { account: false, facts: { cli: "missing" } }), dto("cursor", { account: false, facts: { cli: "missing" } })] };
  const held: ((result: string) => void)[] = [];
  api.openInstall = vi.fn(() => new Promise<string>(resolve => { held.push(resolve); }));
  await settle();
  // Newer first: the older failure lands after the newer Terminal opened.
  const older = click("codex", "install"), newer = click("cursor", "install");
  held[1]!("terminal"); await newer;
  held[0]!("failed"); await older;
  render();
  expect(alerts()).toEqual([]);
  expect(all(row("cursor")).some(element => words(element.props.children) === "Terminal is open with the install command. Press Return there, then come back to Doan.")).toBe(true);
  // Older first: the older failure lands while the newer is pending, then the newer one shows.
  const third = click("codex", "install"), fourth = click("cursor", "install");
  held[2]!("failed"); await third;
  render();
  expect(alerts()).toEqual([]);
  held[3]!("failed"); await fourth;
  render();
  expect(alerts()).toEqual(["Couldn’t open Terminal to install Cursor. Open the install page to install it yourself."]);
});

test("Settings: an update that ends in an unreadable version shows the version alert, not an update announcement", async () => {
  auth = { revision: 1, providers: [dto("claude"), dto("codex", { account: false, facts: { version: "unsupported", installed: "0.150.0" } })] };
  api.openInstall = vi.fn(async () => "terminal");
  await settle();
  await click("codex", "update");
  auth = { revision: 2, providers: [dto("claude", {}, 2), dto("codex", { account: false, facts: { version: "unknown" } }, 2)] };
  authListener(auth); render();
  const live = () => all(tree).find(element => element.props.role === "status" && element.props.className === "ob-live")?.props.children;
  expect(live()).toBeUndefined();
  expect(drawn(row("codex")).some(element => words(element.props.children) === "Couldn’t read the Codex version")).toBe(true);
  auth = { revision: 3, providers: [dto("claude", {}, 3), dto("codex", { account: false }, 3)] };
  authListener(auth); render();
  expect(all(row("codex")).some(element => element.props["data-command"] === "signIn")).toBe(true);
  expect(live()).toBeUndefined();
});

// model-drawer-older task 3 (spec 6): the Model menu folds older models under the same line; Default stays on top.
const CODEX_OLDER = [
  { id: "gpt-6.1-sol", label: "GPT-6.1-Sol", default: true },
  { id: "gpt-6-sol", label: "GPT-6-Sol", default: false, older: true },
  { id: "gpt-6-astra", label: "GPT-6-Astra", default: false },
  { id: "gpt-5.6-terra", label: "GPT-5.6-Terra", default: false, older: true },
];
const modelRoot = () => all(tree).filter(element => element.type === DropdownMenu.Root).find(root => all(root).some(element => element.props["aria-label"] === "Model for new conversations" && element.type === DropdownMenu.Content))!;
const olderLines = () => all(modelRoot()).filter(element => element.type === DropdownMenu.Item && String(element.props.className).includes("older-row"));
async function openModelMenu() {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  try {
    const content = all(modelRoot()).find(element => element.type === DropdownMenu.Content)!;
    (content.props.ref as (node: unknown) => void)({ dataset: { side: "bottom" }, querySelector: () => null });
    (modelRoot().props.onOpenChange as (open: boolean) => void)(true);
    await settle();
    frames.splice(0).forEach(callback => callback(0));
    await settle();
    frames.splice(0).forEach(callback => callback(0));
    return render();
  } finally { vi.unstubAllGlobals(); }
}
test("the Model menu shows Default and the current models, then the Older models line; the line unfolds the rest", async () => {
  auth = { revision: 1, providers: [dto("claude"), dto("codex")] };
  resetHooksAndList(CODEX_OLDER);
  await settle({ preferences: prefs({ provider: "codex" }) });
  await settle();
  await openModelMenu();
  expect(modelRows().map(item => words(item.props.children))).toEqual(["DefaultGPT-6.1-Sol", "GPT-6.1-Sol", "GPT-6-Astra"]);
  expect(olderLines()).toHaveLength(1);
  expect(olderLines()[0]!.props).toMatchObject({ className: "doan-menu-item older-row", textValue: "Older models", "aria-label": "Older models (Codex), 2", "aria-expanded": false });
  // Only the Default row has a separator after it.
  expect(all(modelRoot()).filter(element => element.type === DropdownMenu.Separator)).toHaveLength(1);
  const select = { preventDefault: vi.fn() };
  (olderLines()[0]!.props.onSelect as (event: unknown) => void)(select);
  expect(select.preventDefault).toHaveBeenCalled();
  render();
  expect(olderLines()[0]!.props["aria-expanded"]).toBe(true);
  expect(modelRows().map(item => words(item.props.children))).toEqual(["DefaultGPT-6.1-Sol", "GPT-6.1-Sol", "GPT-6-Astra", "GPT-6-Sol", "GPT-5.6-Terra"]);
  pickModel("GPT-6-Sol");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: { provider: "codex", model: "gpt-6-sol" } });
});
test("a fixed older model opens the Model menu with its rows unfolded and checked", async () => {
  auth = { revision: 1, providers: [dto("claude"), dto("codex")] };
  resetHooksAndList(CODEX_OLDER);
  await settle({ preferences: prefs({ provider: "codex", model: "gpt-5.6-terra" }) });
  await settle();
  expect(labelled("Model for new conversations")[0]?.props["aria-label"]).toBe("Model for new conversations: GPT-5.6-Terra");
  await openModelMenu();
  expect(olderLines()[0]!.props["aria-expanded"]).toBe(true);
  expect(checked()).toEqual(["GPT-5.6-Terra"]);
});
test("a list without older models draws no line", async () => {
  auth = { revision: 1, providers: [dto("claude"), dto("codex")] };
  resetHooksAndList([{ id: "gpt-6.1-sol", label: "GPT-6.1-Sol", default: true }, { id: "gpt-6-astra", label: "GPT-6-Astra", default: false }]);
  await settle({ preferences: prefs({ provider: "codex" }) });
  await settle();
  await openModelMenu();
  expect(olderLines()).toHaveLength(0);
});
