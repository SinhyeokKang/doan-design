import { cloneElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { FolderEntry } from "../main/view";
import { DockedSupport } from "./dockedSupport";
import { OverviewRun, type ListView, type OverviewRunHost } from "./overviewRun";
import { ProjectOverview, type ProjectOverviewProps } from "./ProjectOverview";

// shell-panel-layout spec 1: the Overview header's New conversation button does what the title menu's New conversation
// and ⌘N do. Static markup has no clicks, so the tooltip trigger records its button's props for the test to press.
const triggers = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("./components/ui/tooltip", async original => {
  const actual = await original<typeof import("./components/ui/tooltip")>();
  return { ...actual, TooltipTrigger: ({ children }: { children: ReactElement }) => {
    if (isValidElement(children)) triggers.push(children.props as Record<string, unknown>);
    return cloneElement(children);
  } };
});
const focused = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("./chipField", async original => ({ ...await original<typeof import("./chipField")>(), focusFieldEnd: (field: unknown) => { focused.calls.push(field); } }));
const { TooltipProvider } = await import("./components/ui/tooltip");

const ROOT = "/code/doan";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const entry = { kind: "list", path: ROOT, servedRev: 0, canvases: [], git: { branch: "main", common: "/code/doan/.git" } } as unknown as FolderEntry;
const summary: ConversationSummary = { conversationId: A, title: "Checkout copy", state: "current", owner: "doan", provider: "claude",
  fromHome: true, phase: "ended", unseen: false, queued: 0, working: false, lastActivityAt: "2026-10-30T00:00:00.000Z", preview: "p" };
const authState: AuthState = { provider: "claude", generation: 1, verified: true, expired: false, connection: { provider: "claude", connectionId: "c", profile: "claude", account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" };
const AUTH: AuthSnapshot = { revision: 1, providers: [authStatus(authState, { cli: "found", version: "supported", tools: "ready" }, 1)] };
const FIELD = { field: true };

beforeEach(() => {
  triggers.length = 0; focused.calls.length = 0;
  vi.stubGlobal("window", { doan: { readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null) } });
  vi.stubGlobal("document", { querySelector: (selector: string) => selector === ".ov-main .composer-input" ? FIELD : null });
});
afterEach(() => vi.unstubAllGlobals());

function setup(list: ListView, current: string | null) {
  const host: OverviewRunHost = {
    list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: () => {}, remembered: () => ({}), remember: () => {},
    markSeen: () => {}, focused: () => true, openCanvas: () => {}, toast: () => {}, label: () => "doan", changed: () => {},
  };
  const run = new OverviewRun(host);
  run.show(ROOT);
  run.select(ROOT, current);
  const support = new DockedSupport(() => {});
  support.auth = AUTH;
  const props: ProjectOverviewProps = {
    run, support, root: ROOT, project: "doan", entry, worktrees: [entry], homeDirectory: "/code",
    notice: null, unavailable: null, list, seen: new Set(), holder: null, prefs: {}, defaults: null, now: Date.parse("2026-10-30T00:03:00.000Z"),
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {},
    onSendConversation: async () => {}, onAction: () => {}, onProjectSettings: () => {},
  };
  const html = renderToStaticMarkup(<TooltipProvider><ProjectOverview {...props} /></TooltipProvider>);
  const button = triggers.find(props => props["aria-label"] === "New conversation");
  return { run, html, press: () => (button!.onClick as () => void)() };
}

test("the header ends with a New conversation button", () => {
  const { html } = setup([summary], A);
  const head = html.slice(html.indexOf('<header class="ov-head"'), html.indexOf("</header>"));
  expect(head).toMatch(/<button type="button" class="doan-icon-button ov-new-conv" aria-label="New conversation"[^>]*>(?:(?!<button).)*<\/button>$/);
});

test("on a shown conversation the button moves to a new conversation and focuses the composer", async () => {
  const { run, press } = setup([summary], A);
  expect(run.view(ROOT)).toEqual({ kind: "conversation", conversationId: A });
  press();
  expect(run.view(ROOT).kind).toBe("new");
  await Promise.resolve();
  expect(focused.calls).toEqual([FIELD]);
});

test("on a new conversation the button only focuses the composer, and works while the list is read", async () => {
  for (const list of [[summary], "loading"] as ListView[]) {
    const { run, press } = setup(list, null);
    const select = vi.spyOn(run, "select");
    focused.calls.length = 0;
    press();
    expect(select).not.toHaveBeenCalled();
    expect(run.view(ROOT).kind).toBe("new");
    await Promise.resolve();
    expect(focused.calls).toEqual([FIELD]);
  }
});
