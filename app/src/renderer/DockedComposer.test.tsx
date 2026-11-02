import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState, Provider } from "../main/agentAuth/types";
import { textSegments } from "./anchorField";
import { TooltipProvider } from "./components/ui/tooltip";
import { DockedComposer, type DockedComposerProps } from "./DockedComposer";
import { draftKey, EMPTY_DRAFT, type DockedDraft } from "./dockedRules";
import type { ModelPickerView } from "./homeComposer";
import { permissionPickerView } from "./permissionPicker";

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
// `text` is typed text only; the field draws no children in static markup (ChipField draws them once mounted).
function render(patch: Partial<DockedComposerProps> = {}, { text, ...draft }: Partial<DockedDraft> & { text?: string } = {}) {
  const props: DockedComposerProps = {
    mode: MODE, project: "doan-design", homeDirectory: "/Users/ada", placeholder: "Reply, / for presets",
    drafts: new Map([[draftKey(patch.mode ?? MODE), { ...EMPTY_DRAFT, ...(text === undefined ? {} : { segments: textSegments(text) }), ...draft }]]), onDrafts: () => {},
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
  // DOM order: field, Presets, Send in the card, then Attach, the model and effort under it (Attach left the card for
  // the tray, before the pickers).
  const order = ["composer-input", 'aria-label="Design presets"', 'aria-label="Send"', 'aria-label="Attach files"', "composer-agent", "composer-effort"].map(part => capsule.indexOf(part));
  expect(order.every(at => at >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

test("an existing conversation names its model with the fixed provider, on xs buttons", () => {
  const html = render();
  expect(html).toMatch(/class="composer-agent doan-button" data-ui-size="xs" data-ui-variant="trigger" aria-label="Model: Opus 5.5 \(Claude Code\)"/);
  expect(html).toMatch(/class="composer-effort doan-button" data-ui-size="xs"/);
  expect(html).toContain('aria-placeholder="Reply, / for presets"');
  expect(html).toContain('class="composer-input" aria-label="Message" tabindex="0" contentEditable="true"');
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

test("an anchor chip in the text makes the box, as an attachment chip does", () => {
  const html = render({}, { segments: [{ kind: "text", text: "Make " }, { kind: "chip", anchor: { frame: { id: "payment", title: "Payment" } } }], shape: "capsule" });
  expect(html).toContain('data-shape="box"');
  expect(render({}, { text: "Make it quieter", shape: "capsule" })).toContain('data-shape="capsule"');
});

test("a chip makes the box and draws the chip row before the field", () => {
  const html = render({}, { attachments: [{ key: "k", id: "a", name: "notes.md", kind: "file", pasted: false, status: "ready", size: 4096 }], shape: "box" });
  expect(html).toContain('data-shape="box"');
  expect(html.indexOf("composer-chips")).toBeLessThan(html.indexOf("composer-input"));
});

// buzz-canvas-conversation design §2 'Picker': Pick from canvas at the left end of the model row, pressed while the
// canvas picks; unavailable with aria-disabled (not disabled) so its reason shows as a tooltip.
test("the canvas panel's composer draws Pick from canvas first in the model row", () => {
  const html = render({ pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} } });
  expect(html).toMatch(/<div class="composer-tray"><button type="button" class="doan-icon-button composer-attach" data-ui-size="xs" aria-label="Attach files"[^>]*><svg[^]*?<\/button><button type="button" class="doan-icon-button composer-pick" data-ui-size="xs" aria-label="Pick from canvas" aria-pressed="false"/);
  expect(html.indexOf("composer-pick")).toBeLessThan(html.indexOf("composer-agent"));
  expect(render({ pick: { pressed: true, enabled: true, reason: null, onToggle: () => {} } })).toContain('aria-label="Pick from canvas" aria-pressed="true"');
  const off = render({ pick: { pressed: false, enabled: false, reason: "Pick from canvas isn’t available while the canvas can’t be shown.", onToggle: () => {} } });
  expect(off).toMatch(/aria-label="Pick from canvas" aria-pressed="false" aria-disabled="true"/);
  expect(off).not.toMatch(/composer-pick"[^>]*disabled=""/);
  expect(render()).not.toContain("composer-pick");
});

test("a terminal session's composer keeps Attach and Pick from canvas before its fixed triggers", () => {
  const html = render({ fixed: true, pick: { pressed: false, enabled: true, reason: null, onToggle: () => {} } });
  expect(html.indexOf("composer-pick")).toBeGreaterThan(-1);
  expect(html.indexOf("composer-pick")).toBeLessThan(html.indexOf("composer-agent"));
  expect(html).toMatch(/<div class="composer-tray"><button type="button" class="doan-icon-button composer-attach" data-ui-size="xs" aria-label="Attach files" aria-disabled="true"/);
});

// Attach sits outside the card, first in the tray: the card keeps only Presets and Send around the field.
test("the card holds no Attach; the tray starts with it at xs", () => {
  const html = render();
  const card = html.slice(html.indexOf("composer-card"), html.indexOf("composer-tray"));
  expect(card).not.toContain("Attach files");
  expect(html).toMatch(/<div class="composer-tray"><button type="button" class="doan-icon-button composer-attach" data-ui-size="xs" aria-label="Attach files"/);
  expect(render({ locked: true, unavailable: "This page isn’t in the list." })).toMatch(/composer-attach" data-ui-size="xs" aria-label="Attach files" disabled=""/);
});

test("docked CSS: no grid area for Attach in the card; the tray's Attach takes the quiet and disabled inks", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).not.toMatch(/grid-template-areas: "[^"]*attach/);
  expect(css).toMatch(/\.docked \.composer-tray :is\(\.composer-attach, \.composer-pick\) \{[^}]*color: var\(--text-subtle\)/);
  expect(css).toMatch(/\.docked \.composer-tray :is\(\.composer-attach, \.composer-pick\):is\(:disabled, \[aria-disabled="true"\]\) \{ color: var\(--text-disabled\); \}/);
});

// Full access: the danger ink on the trigger's own fills, no warning capsule; the menu row's icon matches.
test("permission CSS: Full access is danger ink with no warning fill", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toContain(':is(.doan-button.composer-permission, .doan-button.settings-select)[data-mode="bypass"] { color: var(--text-danger); }');
  expect(css).toContain('.doan-menu .perm-item[data-mode="bypass"] > svg:first-child { color: var(--text-danger); }');
  expect(css).not.toMatch(/\[data-mode="bypass"\][^{]*\{[^}]*(--affordance-warning|--text-warning)/);
});

// design §2 'Chip field': a draft that points at 32 places shows the reason line under the composer, whatever was
// pressed; removing one place takes it away (Pick from canvas, Add and ⌘L stay unavailable meanwhile, App's part).
test("a draft at 32 places shows the limit line under the composer until a chip goes", () => {
  const chips = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: "chip" as const, anchor: { frame: { id: `frame-${i}` } } }));
  const pick = { pressed: false, enabled: false, reason: "A message can point at up to 32 places. Remove one to add another.", onToggle: () => {} };
  const line = '<div class="composer-reason docked-reason" role="status"><span>A message can point at up to 32 places. Remove one to add another.</span></div>';
  expect(render({ pick }, { segments: chips(32) })).toContain(line);
  // The same place twice counts once.
  expect(render({ pick: { ...pick, enabled: true, reason: null } }, { segments: [...chips(31), ...chips(1)] })).not.toContain(line);
  expect(render({ pick: { ...pick, enabled: true, reason: null } }, { segments: chips(31) })).not.toContain(line);
  // Only the canvas panel's composer takes chips from the canvas.
  expect(render({}, { segments: chips(32) })).not.toContain(line);
});

// permission-mode spec decision 1 and draft frame `docked-tray`: the picker follows Effort in the tray; each label is a
// `.label` the width steps hide, and the trigger keeps its tooltip and aria-label.
test("the permission picker follows Effort in the tray, at xs, with its mode and a tooltip", () => {
  const html = render({ permission: permissionPickerView("claude", undefined, "plan"), onPickPermission: () => {} });
  expect(html).toMatch(/class="composer-permission doan-button" data-ui-size="xs" data-ui-variant="trigger" data-mode="plan" aria-label="Permission: Plan \(read-only\)"/);
  expect(html).toContain('<span class="label">Plan (read-only)</span>');
  expect(html.indexOf("composer-effort")).toBeLessThan(html.indexOf("composer-permission"));
  expect(html).toMatch(/class="composer-effort doan-button"[^>]*>.*?<span class="label">High<\/span>/);
  expect(render({ permission: null, onPickPermission: () => {} })).not.toContain("composer-permission");
});

// spec decision 9, draft frame `docked-fixed`: a terminal session takes no mode; its trigger keeps its place.
test("a terminal session shows a fixed Permission trigger after its fixed Effort", () => {
  const html = render({ fixed: true, permission: permissionPickerView("claude", undefined, "bypass"), onPickPermission: () => {} });
  expect(html).toMatch(/class="composer-permission doan-button is-fixed" data-ui-size="xs" data-ui-variant="trigger" aria-disabled="true" aria-label="Permission: set by the terminal session"[^>]*><svg[^>]*lucide-shield[^-]/);
  expect(html).toMatch(/aria-label="Permission: set by the terminal session"[^>]*>.*?<span class="label">Default<\/span>/);
  expect(html).not.toContain('data-mode="bypass"');
  expect(html.indexOf("composer-effort")).toBeLessThan(html.indexOf("composer-permission"));
});
