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

// canvas-composer-polish A2 on the Overview: a queued message keeps its request, and Send now shows it in the
// Overview's thread, above an open permission request, until main answers. Static markup has no clicks, so the
// composer records its props for the test to queue and press Send now through.
const composer = vi.hoisted(() => ({ props: null as DockedComposerProps | null }));
vi.mock("./DockedComposer", async original => ({
  ...await original<typeof import("./DockedComposer")>(),
  DockedComposer: (props: DockedComposerProps) => { composer.props = props; return null; },
}));

const ROOT = "/code/doan";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const entry = { kind: "list", path: ROOT, servedRev: 0, canvases: [], git: { branch: "main", common: "/code/doan/.git" } } as unknown as FolderEntry;
const summary: ConversationSummary = { conversationId: A, title: "Checkout copy", state: "current", owner: "doan", provider: "claude",
  fromHome: true, phase: "waiting", unseen: false, queued: 1, working: true, lastActivityAt: "2026-10-30T00:00:00.000Z", preview: "p" };
const authState: AuthState = { provider: "claude", generation: 1, verified: true, expired: false, connection: { provider: "claude", connectionId: "c", profile: "claude", account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" };
const AUTH: AuthSnapshot = { revision: 1, providers: [authStatus(authState, { cli: "found", version: "supported", tools: "ready" }, 1)] };
let seq = 0;
const event = (payload: Record<string, unknown>): ConversationEvent => ({ v: 1, conversationId: A, seq: ++seq, turnId: "t1", at: "2026-10-30T00:00:00Z", ...payload } as ConversationEvent);
const options = [{ id: "a", label: "Allow once", kind: "allow" }];
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

let doan: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  seq = 0; composer.props = null;
  const history = [event({ type: "user.message", text: "Draw the checkout", anchors: [] }), event({ type: "turn.started" }),
    event({ type: "permission.request", requestId: "r1", tool: "Bash", summary: "Run doan check", options })];
  doan = {
    readConversation: vi.fn(async () => ({ events: history, lastSeq: history.at(-1)!.seq, turn: "running" })),
    takeConversationDraft: vi.fn(async () => null),
    queueConversation: vi.fn(async () => ({ itemId: "q1" })),
  };
  vi.stubGlobal("window", { doan });
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const list: ListView = [summary];
  const host: OverviewRunHost = {
    list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: () => {}, remembered: () => ({}), remember: () => {},
    markSeen: () => {}, focused: () => true, openCanvas: () => {}, toast: () => {}, label: () => "doan", changed: () => {},
  };
  const run = new OverviewRun(host);
  run.show(ROOT);
  run.select(ROOT, A);
  const support = new DockedSupport(() => {});
  support.auth = AUTH;
  const props: ProjectOverviewProps = {
    run, support, root: ROOT, project: "doan", entry, worktrees: [entry], homeDirectory: "/code",
    notice: null, unavailable: null, list, seen: new Set(), holder: null, prefs: {}, defaults: null, now: Date.parse("2026-10-30T00:03:00.000Z"),
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {},
    onSendConversation: async () => {}, onAction: () => {}, onProjectSettings: () => {},
  };
  const render = () => renderToStaticMarkup(<TooltipProvider><ProjectOverview {...props} /></TooltipProvider>);
  return { run, render };
}

test("Send now shows the queued message with its chips and files above the open permission request; a refusal puts it back", async () => {
  const { run, render } = setup();
  render();
  await flush();
  const anchors = [{ frame: { id: "cart", title: "Cart" } }];
  expect(await composer.props!.onQueue({ text: "Tighten {{1}}", anchors, attachments: [{ id: "f1" }], files: [{ name: "notes.pdf", size: 86016, kind: "file" }] })).toEqual({ ok: true });
  // The Overview's row keeps the request's own text.
  render();
  expect(composer.props!.queued).toEqual([{ id: "q1", text: "Tighten {{1}}" }]);

  const answer = (() => { let resolve!: (value: { error: string }) => void; const promise = new Promise<{ error: string }>(r => { resolve = r; }); return { promise, resolve }; })();
  doan.sendQueuedNow = vi.fn(() => answer.promise);
  const sent = composer.props!.onSendQueuedNow!("q1");
  const html = render();
  expect(composer.props!.queued).toEqual([]);
  const message = html.match(/<div class="msg-user"><div class="bubble">Tighten <span class="anchor-chip"[^]*?<span class="msg-sending">[^]*?Sending<\/span><\/div>/)?.[0];
  expect(message).toBeDefined();
  expect(message).toContain("<b>notes.pdf</b>");
  expect(html.indexOf("msg-sending")).toBeLessThan(html.indexOf("Claude Code needs your answer"));
  expect(html.indexOf("Draw the checkout")).toBeLessThan(html.indexOf("msg-sending"));

  answer.resolve({ error: "not_running" });
  expect(await sent).toMatchObject({ error: "not_running" });
  expect(render()).not.toContain("msg-sending");
  expect(composer.props!.queued).toEqual([{ id: "q1", text: "Tighten {{1}}" }]);
  expect(run.sending(A)).toEqual([]);
});
