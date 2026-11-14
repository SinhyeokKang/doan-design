import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { AuthSnapshot } from "../main/agentAuth/ipc";
import { authStatus } from "../main/agentAuth/state";
import type { AuthState } from "../main/agentAuth/types";
import type { FieldSegment } from "./anchorField";
import { TooltipProvider } from "./components/ui/tooltip";
import { DockedComposer, playingMessage, type DockedComposerProps } from "./DockedComposer";
import { draftKey, EMPTY_DRAFT, type DockedDraft } from "./dockedRules";
import type { ModelPickerView } from "./homeComposer";

// The prototype window's composer: the playing frame chip pinned first in the card's chip row, outside the field, and
// put first in every message it sends.

const state: AuthState = { provider: "claude", generation: 1, verified: true, expired: false, connection: { provider: "claude", connectionId: "c", profile: "claude", account: {} }, attempt: null, error: null, phase: "connected" } as never;
const AUTH: AuthSnapshot = { revision: 1, providers: [authStatus(state, { cli: "found", version: "supported", tools: "ready" }, 1)] };
const PICKER: ModelPickerView = {
  trigger: { provider: "claude", label: "Opus 5.5", ariaLabel: "Agent: Claude Code, model Opus 5.5", placeholder: false, isDefault: false },
  groups: [{ provider: "claude", name: "Claude Code", selectable: true, cause: null, note: null, read: false, rows: [] }], effort: null,
};
const MODE = { kind: "existing", conversationId: "c1", provider: "claude" } as const;
const PLAYING = { frame: { id: "pay", title: "Checkout" }, name: "Checkout", description: "Frame Checkout is sent with each message." };
const ok = async () => ({ ok: true as const });
function props(patch: Partial<DockedComposerProps> = {}, draft: Partial<DockedDraft> = {}): DockedComposerProps {
  return {
    skills: [], onSkillsWanted: () => {}, mode: MODE, project: "acme", homeDirectory: null, placeholder: "Reply, / for presets",
    drafts: new Map([[draftKey(MODE), { ...EMPTY_DRAFT, ...draft }]]), onDrafts: () => {},
    auth: AUTH, picker: PICKER, provider: "claude", effort: null,
    onPickerOpen: () => {}, onPickModel: () => {}, onPickEffort: () => {}, onPickFast: () => {}, onSettings: () => {},
    presets: undefined, suggested: [], onPresetsOpen: () => {}, onPresetsRetry: () => {},
    thumbnails: {}, onAttach: () => {}, onFiles: () => {}, onAttachmentRemoved: () => {},
    turn: "idle", busy: null, canvasGone: false, queued: [],
    onSend: ok, onQueue: ok, onStop: () => {}, onRemoveQueued: async () => true, onOpen: () => {}, playing: PLAYING, ...patch,
  };
}
const html = (patch: Partial<DockedComposerProps> = {}, draft: Partial<DockedDraft> = {}) => renderToStaticMarkup(<TooltipProvider><DockedComposer {...props(patch, draft)} /></TooltipProvider>);

test("the playing chip comes first in the card's chip row, outside the field, with only a native title", () => {
  const markup = html();
  const chip = markup.match(/<span class="anchor-chip pw-playing"[^>]*>.*?<\/span><\/span>/)?.[0] ?? "";
  expect(chip).toContain('data-kind="frame"');
  expect(chip).toContain('title="Sent with each message"');
  expect(chip).toContain('<span class="sr-only">Frame </span>');
  expect(chip).toContain("<span>Checkout</span>");
  expect(chip).not.toContain("tabindex");
  expect(chip).not.toContain("<button");
  expect(markup.indexOf('class="composer-chips"')).toBeLessThan(markup.indexOf("pw-playing"));
  expect(markup.indexOf("pw-playing")).toBeLessThan(markup.indexOf("composer-input"));
  // A chip counts toward the box shape as the field's chips do.
  expect(markup).toContain('data-shape="box"');
});

test("the field is described by the frame it sends, until the composer is locked", () => {
  const markup = html();
  const id = markup.match(/<span class="sr-only" id="([^"]+)">Frame Checkout is sent with each message\.<\/span>/)?.[1];
  expect(id).toBeTruthy();
  expect(markup).toMatch(new RegExp(`class="composer-input"[^>]*aria-describedby="[^"]*${id}`));
  const locked = html({ unavailable: "This canvas isn’t listed in acme, so its conversation can’t continue.", locked: true });
  expect(locked).not.toContain("is sent with each message.");
});

test("without a playing frame nothing is pinned (the main window's composers)", () => {
  const { playing: _none, ...rest } = props();
  const markup = renderToStaticMarkup(<TooltipProvider><DockedComposer {...rest} /></TooltipProvider>);
  expect(markup).not.toContain("pw-playing");
});

test("the message starts with the playing frame's chip, once, and refuses past the place limit", () => {
  const typed: FieldSegment[] = [{ kind: "text", text: "This button does nothing" }];
  expect(playingMessage({ ...EMPTY_DRAFT, segments: typed }, [], PLAYING.frame)).toEqual({ text: "{{1}} This button does nothing", anchors: [{ frame: { id: "pay", title: "Checkout" } }] });
  const returned: FieldSegment[] = [{ kind: "chip", anchor: { frame: { id: "pay", title: "Checkout" } } }, { kind: "text", text: " again" }];
  expect(playingMessage({ ...EMPTY_DRAFT, segments: returned }, [], PLAYING.frame)?.anchors).toHaveLength(1);
  const full: FieldSegment[] = Array.from({ length: 32 }, (_, i) => ({ kind: "chip" as const, anchor: { element: { doanId: `e${i}`, selector: `#e${i}` } } }));
  expect(playingMessage({ ...EMPTY_DRAFT, segments: full }, [], PLAYING.frame)).toBeNull();
});

test("past the place limit with the playing frame, Send waits with the shipped limit line", () => {
  const full: FieldSegment[] = Array.from({ length: 32 }, (_, i) => ({ kind: "chip" as const, anchor: { element: { doanId: `e${i}`, selector: `#e${i}` } } }));
  const markup = html({}, { segments: full });
  expect(markup).toContain("A message can point at up to 32 places. Remove one to add another.");
  expect(markup).toMatch(/aria-label="Send"[^>]*disabled=""|disabled=""[^>]*aria-label="Send"/);
});

// The pinned chip goes with the message, but it is not the person's message: an empty field while a turn runs still
// offers Stop, the only way to stop the turn from this composer.
test("an empty field offers Stop while a turn runs, and Send (not Queue) on an empty queue", () => {
  const running = html({ turn: "running" });
  expect(running).toContain("composer-stop");
  expect(running).not.toContain('aria-label="Queue"');
  const typed = html({ turn: "running" }, { segments: [{ kind: "text", text: "Also the back link" }] });
  expect(typed).toContain('aria-label="Queue"');
});
