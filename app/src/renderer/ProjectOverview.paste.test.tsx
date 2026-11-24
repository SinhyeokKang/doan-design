import type { AttachmentResult } from "../main/attachments";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import type { ConversationSummary } from "../main/conversation/summary";
import type { FolderEntry } from "../main/view";

// The Overview attachment host mounted with effects and calls through its own store.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as ({ deps: unknown[] | undefined; cleanup?: () => void } | undefined)[],
  pending: [] as (() => void)[], cursor: 0, refCursor: 0, effectCursor: 0, dirty: false,
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
      return [hooks.states[index], (next: unknown) => {
        const value = typeof next === "function" ? (next as (value: unknown) => unknown)(hooks.states[index]) : next;
        if (!Object.is(value, hooks.states[index])) { hooks.states[index] = value; hooks.dirty = true; }
      }];
    },
    useRef: (value: unknown) => { const index = hooks.refCursor++; if (!(index in hooks.refs)) hooks.refs[index] = { current: value }; return hooks.refs[index]; },
    useEffect: effect, useLayoutEffect: effect,
  };
});

const { ProjectOverview } = await import("./ProjectOverview");
const { OverviewRun } = await import("./overviewRun");
const { DockedSupport } = await import("./dockedSupport");

const ROOT = "/code/doan";
const A = "aaaaaaaa-0000-4000-8000-000000000001";
const entry = { kind: "list", path: ROOT, servedRev: 0, canvases: [], git: { branch: "main", common: "/code/doan/.git" } } as unknown as FolderEntry;
const waiting: ConversationSummary = { conversationId: A, title: "Checkout copy", owner: "doan", provider: "claude",
  fromHome: true, phase: "waiting", unseen: false, queued: 0, working: false, lastActivityAt: "2026-11-23T00:00:00.000Z", preview: "p" };
beforeEach(() => {
  hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.pending = [];
  vi.stubGlobal("document", { querySelector: () => null });
});
afterEach(() => vi.unstubAllGlobals());

function render(component: () => ReactNode): ReactNode {
  for (let round = 0; round < 20; round++) {
    hooks.cursor = 0; hooks.refCursor = 0; hooks.effectCursor = 0; hooks.pending = []; hooks.dirty = false;
    const tree = component();
    for (const run of hooks.pending) run();
    if (!hooks.dirty) return tree;
  }
  throw new Error("did not settle");
}

function composerProps(node: ReactNode): import("./DockedComposer").DockedComposerProps | null {
  if (Array.isArray(node)) { for (const child of node) { const found = composerProps(child); if (found) return found; } return null; }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as { type: unknown; props: Record<string, unknown> & { children?: ReactNode } };
  if (typeof element.type === "function" && element.type.name === "DockedComposer") return element.props as unknown as import("./DockedComposer").DockedComposerProps;
  return composerProps(element.props.children);
}

test("Overview pastes reserve the last slot, settle in the original draft, and clean up a removed Checking chip", async () => {
  let save!: (result: AttachmentResult) => void;
  const addPastedText = vi.fn((_text: string, _meta: { lines: number; excerpt: string }) => new Promise<AttachmentResult>(resolve => { save = resolve; }));
  const removeAttachment = vi.fn(async () => true);
  vi.stubGlobal("window", { doan: {
    readConversation: vi.fn(() => new Promise(() => {})), takeConversationDraft: vi.fn(async () => null), onAgentAuth: vi.fn(() => () => {}), onAgentUsage: vi.fn(() => () => {}),
    readAgentUsage: vi.fn(async () => []), listConversationSkills: vi.fn(async () => ({ skills: [] })), addPastedText, removeAttachment,
  } });
  const list = [waiting];
  const run = new OverviewRun({
    list: () => list, readsStarted: () => 1, readsApplied: () => 1, reread: () => {}, remembered: () => ({}), remember: () => {},
    markSeen: () => {}, focused: () => true, openCanvas: () => {}, toast: () => {}, label: () => "doan", changed: () => {},
  }, window.doan);
  run.show(ROOT); run.select(ROOT, A);
  const support = Object.assign(new DockedSupport(() => {}, window.doan), { readPresets: vi.fn(), readModels: vi.fn() });
  const overview = () => ProjectOverview({
    run, support, root: ROOT, project: "doan", entry, worktrees: [entry], homeDirectory: "/code",
    notice: null, unavailable: null, list, seen: new Set(), prefs: {}, defaults: null, now: Date.parse("2026-11-23T00:03:00.000Z"),
    onWorktree: () => {}, onOpenCanvas: () => {}, onRetryList: () => {}, onStart: async () => ({ ok: true }), onSettings: () => {},
    onSendConversation: async () => {}, onAction: () => {}, onProjectSettings: () => {},
  });
  const composer = composerProps(render(overview))!;
  const at = `conversation:${A}`;
  run.setDrafts(() => new Map([[at, { segments: [], preset: null, shape: "capsule", attachments: Array.from({ length: 9 }, (_, i) => ({ key: `${i}`, name: `${i}`, kind: "file", pasted: false, status: "ready" })) }]]));
  const report = vi.fn();
  const saving = composer.onPastedText("x".repeat(1000), { lines: 1, excerpt: "x" }, report);
  await composer.onPastedText("x".repeat(1000), { lines: 1, excerpt: "x" }, report);
  expect(addPastedText).toHaveBeenCalledOnce();
  expect(report).toHaveBeenCalledWith("Only 10 attachments can be added, so the pasted text wasn’t added. Remove one and paste again.");
  run.select(ROOT, null); render(overview);
  save({ ok: true, attachment: { id: "t", name: "pasted-text-now.txt", path: "/u/pasted-text-now.txt", kind: "file", pasted: true, size: 1000, lines: 1, excerpt: "x" } });
  await saving;
  expect(run.drafts.get(at)?.attachments.at(-1)).toMatchObject({ id: "t", lines: 1, excerpt: "x", status: "ready" });
  expect(run.drafts.get(`new:${ROOT}`)?.attachments ?? []).toEqual([]);
  run.setDrafts(() => new Map());
  const late = composer.onPastedText("x".repeat(1000), { lines: 1, excerpt: "x" }, report);
  run.setDrafts(() => new Map());
  save({ ok: true, attachment: { id: "late", name: "pasted-text-now.txt", path: "/u/pasted-text-now.txt", kind: "file", pasted: true, size: 1000 } });
  await late;
  expect(removeAttachment).toHaveBeenCalledWith("late");
  addPastedText.mockRejectedValueOnce(new Error("disk full"));
  await composer.onPastedText("x".repeat(1000), { lines: 1, excerpt: "x" }, report);
  expect(report).toHaveBeenCalledWith("Couldn’t save the pasted text. Paste it again.");
});
