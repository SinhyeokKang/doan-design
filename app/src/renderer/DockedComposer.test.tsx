import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState, Provider } from "../main/agentAuth/types";
import { TooltipProvider } from "./components/ui/tooltip";
import { DockedComposer, type DockedComposerProps } from "./DockedComposer";
import { draftKey, EMPTY_DRAFT, type DockedDraft } from "./dockedRules";
import type { ModelPickerView } from "./homeComposer";

// Static markup with mocked handlers (ARCHITECTURE §7 'Home tests without a DOM'). Real focus and IME across a shape
// change are left to buzz-project's /runtime-test.

function status(provider: Provider) {
  const state: AuthState = { provider, generation: 1, verified: true, expired: false, connection: { provider, connectionId: "c", profile: provider, account: { id: "a", workspace: "org", email: "ada@example.com" } }, attempt: null, error: null, phase: "connected" };
  return authStatus(state, { cli: "found", version: "supported", tools: "ready" }, 1);
}
const AUTH: AuthSnapshot = { revision: 1, providers: [status("claude"), status("codex")] };
const PICKER: ModelPickerView = {
  trigger: { provider: "claude", label: "Opus 5.5", ariaLabel: "Agent: Claude Code, model Opus 5.5" },
  groups: [{ provider: "claude", name: "Claude Code", selectable: true, cause: null, note: null, read: false, rows: [] }],
  effort: { label: "High", ariaLabel: "Effort: High", menuLabel: "Effort for Opus 5.5", title: "Effort · Opus 5.5", options: [] },
};
const MODE = { kind: "existing", conversationId: "c1", provider: "claude" } as const;
const ok = async () => ({ ok: true as const });
function render(patch: Partial<DockedComposerProps> = {}, draft: Partial<DockedDraft> = {}) {
  const props: DockedComposerProps = {
    mode: MODE, project: "doan-design", homeDirectory: "/Users/ada", placeholder: "Reply, / for presets",
    drafts: new Map([[draftKey(patch.mode ?? MODE), { ...EMPTY_DRAFT, ...draft }]]), onDrafts: () => {},
    auth: AUTH, picker: PICKER, provider: "claude", effort: "high",
    onPickerOpen: () => {}, onPickModel: () => {}, onPickEffort: () => {}, onSettings: () => {},
    presets: undefined, suggested: [], onPresetsOpen: () => {}, onPresetsRetry: () => {},
    thumbnails: {}, onAttach: () => {}, onFiles: () => {}, onAttachmentRemoved: () => {},
    turn: "idle", busy: null, canvasGone: false, queued: [],
    onSend: ok, onQueue: ok, onStop: () => {}, onRemoveQueued: () => {}, onOpen: () => {},
    ...patch,
  };
  return renderToStaticMarkup(<TooltipProvider><DockedComposer {...props} /></TooltipProvider>);
}

test("both shapes draw the same field at the same place; only data-shape differs", () => {
  const text = "Keep the settings groups but move Notifications above Agents";
  const capsule = render({}, { text, shape: "capsule" }), box = render({}, { text, shape: "box" });
  expect(capsule).toContain('data-shape="capsule"');
  expect(box).toBe(capsule.replace('data-shape="capsule"', 'data-shape="box"'));
  // DOM order: field, Attach, Presets, Send, then the model and effort under the card (design §3.1).
  const order = ["composer-input", 'aria-label="Attach files"', 'aria-label="Design presets"', 'aria-label="Send"', "composer-agent", "composer-effort"].map(part => capsule.indexOf(part));
  expect(order.every(at => at >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

test("an existing conversation names its model with the fixed provider, on xs buttons", () => {
  const html = render();
  expect(html).toMatch(/class="composer-agent doan-button" data-ui-size="xs" data-ui-variant="trigger" aria-label="Model: Opus 5.5 \(Claude Code\)"/);
  expect(html).toMatch(/class="composer-effort doan-button" data-ui-size="xs"/);
  expect(html).toContain('placeholder="Reply, / for presets"');
  expect(html).toContain('rows="1"');
});

test("new-conversation mode keeps Home's agent label", () => {
  const html = render({ mode: { kind: "new", root: "/code/doan" }, placeholder: "Ask about doan-design, / for presets" });
  expect(html).toContain('aria-label="Agent: Claude Code, model Opus 5.5"');
  expect(html).toContain('placeholder="Ask about doan-design, / for presets"');
});

test("while the turn runs, Send's place is Stop on an empty field and Queue with text", () => {
  const stop = render({ turn: "running" });
  expect(stop).toMatch(/class="composer-send doan-icon-button composer-stop" data-ui-variant="accent" aria-label="Stop"/);
  expect(stop).not.toMatch(/aria-label="Stop"[^>]*disabled/);
  const queue = render({ turn: "running", queued: [{ id: "q1", text: "Also make the caption shorter" }] }, { text: "Use the shorter label" });
  expect(queue).toMatch(/class="composer-send doan-icon-button" data-ui-variant="accent" aria-label="Queue"/);
  // Queued messages sit above the card in the order sent, each with Remove only.
  expect(queue).toMatch(/<div class="queue" role="list" aria-label="Queued messages"><div class="queue-item" role="listitem">.*<span class="queue-text">Also make the caption shorter<\/span><button type="button" class="chip-remove doan-icon-button" data-ui-size="xs" aria-label="Remove queued message">/);
  expect(queue.indexOf('class="queue"')).toBeLessThan(queue.indexOf("composer-card"));
  // Queued messages do not change the slot: an empty field still offers Stop.
  expect(render({ turn: "running", queued: [{ id: "q1", text: "x" }] })).toContain('aria-label="Stop"');
});

test("waiting for a permission answer shows the reason line, and the line describes the field", () => {
  const html = render({ turn: "waiting" });
  const id = /class="composer-reason docked-reason" role="status" id="([^"]+)"><span>Answer or stop the request above\.<\/span>/.exec(html)?.[1];
  expect(id).toBeTruthy();
  expect(html).toContain(`aria-describedby="${id}"`);
});

test("another project conversation running blocks Send with Open named for the running conversation", () => {
  const html = render({ busy: { kind: "project", waiting: false, open: "c9" } }, { text: "Draw a first settings screen" });
  expect(html).toMatch(/aria-label="Send" disabled=""/);
  expect(html).toMatch(/<span>Another conversation is still running in doan-design\.<\/span><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="panel" aria-label="Open the running conversation">Open<\/button>/);
});

test("an archived conversation whose canvas is gone shows the line instead of the composer", () => {
  const html = render({ mode: { kind: "archived", conversationId: "c1", provider: "claude" }, canvasGone: true });
  expect(html).not.toContain("composer-input");
  expect(html).toContain('<div class="canvas-gone" role="status">');
  expect(html).toContain("This conversation’s canvas is no longer in doan-design, so it can’t continue.");
});

test("a chip makes the box and draws the chip row before the field", () => {
  const html = render({}, { attachments: [{ key: "k", id: "a", name: "notes.md", kind: "file", pasted: false, status: "ready", size: 4096 }], shape: "box" });
  expect(html).toContain('data-shape="box"');
  expect(html.indexOf("composer-chips")).toBeLessThan(html.indexOf("composer-input"));
});
