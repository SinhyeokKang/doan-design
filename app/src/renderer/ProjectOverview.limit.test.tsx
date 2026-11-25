import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState } from "../main/agentAuth/types";
import type { ConversationSummary } from "../main/conversation/summary";
import type { ConversationEvent } from "../main/conversation/types";
import type { FolderEntry } from "../main/view";
import type { DockedComposerProps } from "./DockedComposer";
import { DockedSupport } from "./dockedSupport";
import { OverviewRun, type ListView, type OverviewRunHost } from "./overviewRun";
import { ProjectOverview, type ProjectOverviewProps } from "./ProjectOverview";
import { TooltipProvider } from "./components/ui/tooltip";

// The Overview at the usage limit: the composer gets the limit and the schedule, the thread the live reset, and a send
// main scheduled becomes a row. Static markup has no clicks, so the composer records its props.
const composer = vi.hoisted(() => ({ props: null as DockedComposerProps | null }));
vi.mock("./DockedComposer", async original => ({
  ...await original<typeof import("./DockedComposer")>(),
  DockedComposer: (props: DockedComposerProps) => { composer.props = props; return null; },
}));

const ROOT = "/code/doan";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const entry = { kind: "list", path: ROOT, servedRev: 0, canvases: [], git: { branch: "main", common: "/code/doan/.git" } } as unknown as FolderEntry;
const AT = new Date(Date.now() + 3_600_000).toISOString();
const summary: ConversationSummary = { conversationId: A, title: "Checkout copy", owner: "doan", provider: "claude",
  fromHome: true, phase: "ended", unseen: false, queued: 1, working: false, lastActivityAt: "2026-10-30T00:00:00.000Z", preview: "p",
  limitResetsAt: AT, scheduledAt: AT, permissionMode: "acceptEdits" };
const authState: AuthState = { provider: "claude", generation: 1, verified: true, expired: false, connection: { provider: "claude", connectionId: "c", profile: "claude", account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" };
const AUTH: AuthSnapshot = { revision: 1, providers: [authStatus(authState, { cli: "found", version: "supported", tools: "ready" }, 1)] };
let seq = 0;
const event = (payload: Record<string, unknown>): ConversationEvent => ({ v: 1, conversationId: A, seq: ++seq, turnId: "t1", at: "2026-10-30T00:00:00Z", ...payload } as ConversationEvent);
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

let doan: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  seq = 0; composer.props = null;
  const history = [event({ type: "user.message", text: "Draw the checkout", anchors: [] }), event({ type: "turn.started" }),
    event({ type: "turn.failed", code: "rate_limited" })];
  doan = {
    readConversation: vi.fn(async () => ({ events: history, lastSeq: history.at(-1)!.seq, turn: "running" })),
    takeConversationDraft: vi.fn(async () => null),
    queueConversation: vi.fn(async () => ({ itemId: "q1" })),
    scheduledMessages: vi.fn(async () => [{ itemId: "s0", text: "Earlier", anchors: [], attachments: [] }]),
  };
  vi.stubGlobal("window", { doan });
});
afterEach(() => vi.unstubAllGlobals());

const send = vi.fn(async (): Promise<{ scheduled: { itemId: string; at: string } }> => ({ scheduled: { itemId: "s1", at: AT } }));
function setup(listed: ConversationSummary = summary) {
  const list: ListView = [listed];
  const host: OverviewRunHost = {
    list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: () => {}, remembered: () => ({}), remember: () => {},
    markSeen: () => {}, focused: () => true, openCanvas: () => {}, toast: () => {}, label: () => "doan", changed: () => {},
  };
  const run = new OverviewRun(host, window.doan);
  run.show(ROOT);
  run.select(ROOT, A);
  run.sync();
  const support = new DockedSupport(() => {}, window.doan);
  support.auth = AUTH;
  const props: ProjectOverviewProps = {
    run, support, root: ROOT, project: "doan", entry, worktrees: [entry], homeDirectory: "/code",
    notice: null, unavailable: null, list, seen: new Set(), prefs: {}, defaults: null, now: Date.now(),
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {},
    onSendConversation: send, onAction: () => {}, onProjectSettings: () => {},
  };
  const render = () => renderToStaticMarkup(<TooltipProvider><ProjectOverview {...props} /></TooltipProvider>);
  return { run, render, props };
}

test("the composer gets the limit and the schedule with no Send now, and the failed line names the reset", async () => {
  const { run, render } = setup();
  render();
  await flush();
  const html = render();
  expect(composer.props).toMatchObject({ limitResetsAt: AT, scheduledFor: AT, sendNow: false });
  expect(html).toContain("Messages you send now go out then.");
  expect(run.queue(A).map(row => row.id)).toEqual(["s0"]);
});

test("a send main scheduled becomes a row and carries no picker change", async () => {
  const { run, render } = setup();
  render();
  await flush();
  expect(await composer.props!.onSend({ text: "Tighten it", anchors: [], attachments: [] })).toEqual({ ok: true, itemId: "s1" });
  expect(send).toHaveBeenLastCalledWith("claude", { conversationId: A, text: "Tighten it", anchors: [] });
  expect(run.queue(A).map(row => row.id)).toEqual(["s0", "s1"]);
});

test("a list main scheduled reads without its markers in the row and keeps them in the message", async () => {
  const { run, render } = setup();
  render();
  await flush();
  expect(await composer.props!.onSend({ text: "- Hero\n  - Footer", anchors: [], attachments: [] })).toEqual({ ok: true, itemId: "s1" });
  expect(run.queue(A).at(-1)).toMatchObject({ id: "s1", text: "Hero Footer", message: { text: "- Hero\n  - Footer" } });
});

// Before the summary has a title, the header reads the first message the way a new title is made: markers dropped.
test("an untitled conversation's header reads its first list message without markers", async () => {
  const history = [event({ type: "user.message", text: "- Hero\n  - Footer {{1}}", anchors: [{ frame: { id: "cart", title: "Cart" } }] }), event({ type: "turn.started" })];
  doan.readConversation = vi.fn(async () => ({ events: history, lastSeq: history.at(-1)!.seq, turn: "running" }));
  const { render } = setup({ ...summary, title: "" });
  render();
  await flush();
  expect(render()).toMatch(/class="ov-title doan-button"[^>]*>.*?<span>Hero Footer Cart<\/span>/);
});

test("a chosen file main refuses and files over the limit are reported to the composer, not as a toast", async () => {
  const { render, props } = setup();
  const onNotice = vi.fn();
  props.onNotice = onNotice;
  doan.chooseAttachments = vi.fn(async () => [{ ok: false, name: "brief.pdf", error: "not_found" }]);
  render();
  await flush();
  const chosen = vi.fn();
  (composer.props!.onAttach as (report: (text: string) => void) => void)(chosen);
  await flush();
  expect(chosen).toHaveBeenCalledExactlyOnceWith("brief.pdf wasn’t found, so it wasn’t attached.");
  doan.addAttachmentFiles = vi.fn(() => new Promise(() => {}));
  const limited = vi.fn();
  (composer.props!.onFiles as (files: File[], pasted: boolean, report: (text: string) => void) => void)(Array.from({ length: 11 }, (_, i) => new File(["x"], `f${i}.md`)), false, limited);
  expect(limited).toHaveBeenCalledExactlyOnceWith("Only 10 attachments can be added. 1 was left out.");
  expect(onNotice).not.toHaveBeenCalled();
});
