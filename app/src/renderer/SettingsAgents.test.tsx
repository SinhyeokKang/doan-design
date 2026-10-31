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
    openInstallPage: vi.fn(async () => true),
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
  expect(labelled("Model for new conversations")[0]?.props["aria-label"]).toBe("Model for new conversations: Default");
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
    "Agent for new conversations: Claude Code", "Model for new conversations: Opus 5.5", "Effort for new conversations: High"]);
  expect(all(tree).filter(element => element.type === DropdownMenu.Content)).toHaveLength(3);
  expect(all(tree).some(element => typeof element.type === "object" && element.type !== null && String((element.type as { displayName?: string }).displayName).startsWith("Select"))).toBe(false);
  const groups = all(tree).filter(element => element.type === DropdownMenu.RadioGroup);
  (groups[0]!.props.onValueChange as (value: string) => void)("last");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: null });
  (groups[1]!.props.onValueChange as (value: string) => void)("haiku");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: { provider: "claude", model: "haiku" } });
  (groups[2]!.props.onValueChange as (value: string) => void)("low");
  expect(props.save).toHaveBeenLastCalledWith({ newConversation: { provider: "claude", model: "opus", effort: "low" } });
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

test("an install page that would not open says so in the default notice on the white page: error tone, alert icon, no panel", async () => {
  auth = { revision: 1, providers: [dto("claude"), dto("codex", { account: false, facts: { cli: "missing" } })] };
  api.openInstallPage = vi.fn(async () => false);
  await settle();
  const install = all(tree).find(element => element.props["data-command"] === "install")!;
  (install.props.onClick as () => void)();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  render();
  const notice = all(tree).find(element => element.props.role === "alert" && words(element.props.children) === "Couldn’t open the Codex install page.")!;
  expect(notice.props.className).toBe("doan-notice error");
  expect((notice.props.children as ReactElement[])[0]!.type).toBe(AlertIcon);
});
