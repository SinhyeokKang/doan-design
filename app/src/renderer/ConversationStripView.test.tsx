import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConversationStrip, KeyedConversationStrip } from "./ConversationStripView";
import { stripView, type StripContext, type StripState } from "./conversationStrip";

// With `mock`, hooks run outside React: refs are plain objects (kept across calls while `reuse` is set, so a second
// call is the same strip redrawn) and effects are collected to be run by the test.
const hooks = vi.hoisted(() => ({ mock: false, reuse: false, at: 0, refs: [] as { current: unknown }[], effects: [] as (() => void)[] }));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useRef: (value: unknown) => {
      if (!hooks.mock) return actual.useRef(value);
      if (hooks.reuse && hooks.refs[hooks.at]) return hooks.refs[hooks.at++];
      const ref = { current: value }; hooks.refs.push(ref); hooks.at++; return ref;
    },
    useEffect: (effect: () => void, deps?: unknown[]) => { if (!hooks.mock) return actual.useEffect(effect, deps); hooks.effects.push(effect); },
  };
});
beforeEach(() => { hooks.refs = []; hooks.effects = []; hooks.at = 0; hooks.reuse = false; });
afterEach(() => { hooks.mock = false; vi.unstubAllGlobals(); });

const CTX: StripContext = { provider: "claude", project: "doan-design", branch: "main", canvas: null };
const ASK: StripState = { kind: "permission", requestId: "r1", summary: "Edit .doan/canvases/design-system.html", options: [{ id: "d", label: "Deny", kind: "deny" }, { id: "aa", label: "Always allow", kind: "allowAlways" }, { id: "a", label: "Allow", kind: "allow" }] };
const noop = () => {};
const render = (state: StripState, ctx = CTX) => renderToStaticMarkup(<ConversationStrip conversationId="c1" provider="claude" state={state} view={stripView(state, ctx)} onEditOnHome={noop} onDismiss={noop} onOpen={noop} />);

function elements(node: ReactNode): Record<string, unknown>[] {
  return Children.toArray(node).flatMap(child => isValidElement<{ children?: ReactNode; [key: string]: unknown }>(child) ? [child.props, ...elements(child.props.children)] : []);
}
function buttons(state: StripState, calls: { edit?: () => void; dismiss?: () => void; open?: () => void } = {}) {
  hooks.mock = true;
  const tree = ConversationStrip({ conversationId: "c1", provider: "claude", state, view: stripView(state, { ...CTX, canvas: "design-system" }), onEditOnHome: calls.edit ?? noop, onDismiss: calls.dismiss ?? noop, onOpen: calls.open ?? noop });
  return elements(tree).filter(props => typeof props.onClick === "function");
}
const text = (props: Record<string, unknown>) => Children.toArray(props.children as ReactNode).filter(child => typeof child === "string").join("");

test("the strip is the shared notice with the provider mark, a status line and its actions (draft workspace-working)", () => {
  const html = render({ kind: "working", activity: "Editing .doan/canvases/design-system.html" });
  expect(html).toContain('<div class="convo-strip doan-notice" role="region" aria-label="Conversation">');
  expect(html).toContain('<span class="strip-agent doan-alert-icon"><img class="logo" src="provider-logos/claude.png" alt=""/></span>');
  expect(html).toContain('<span class="strip-text" role="status"><b>Claude Code is working</b><span>Editing .doan/canvases/design-system.html</span></span>');
  expect(html).toMatch(/<button data-strip-stop="" type="button" class="doan-button" data-ui-size="sm"><svg[^>]*aria-hidden="true"[^>]*>.*<\/svg>Stop<\/button>/);
});

test("starting shows a spinner, failed an alert mark and done a check, as the states board draws them", () => {
  expect(render({ kind: "starting" })).toContain('<span class="strip-agent doan-alert-icon"><span class="doan-spinner" aria-hidden="true"></span></span>');
  expect(render({ kind: "failed", code: "process_exited" })).toMatch(/<span class="strip-agent doan-alert-icon"><svg[^>]*class="lucide[^"]*strip-alert"/);
  expect(render({ kind: "done" }, { ...CTX, canvas: "design-system" })).toMatch(/<span class="strip-agent doan-alert-icon"><svg[^>]*class="lucide[^"]*strip-ok"/);
  // The state's tone colours the strip's text and mark: failed is an error, done is ok, the rest neutral.
  expect(render({ kind: "failed", code: "process_exited" })).toContain('<div class="convo-strip doan-notice error" role="region"');
  expect(render({ kind: "done" }, { ...CTX, canvas: "design-system" })).toContain('<div class="convo-strip doan-notice ok" role="region"');
  expect(render({ kind: "starting" })).toContain('<div class="convo-strip doan-notice" role="region"');
});

test("a permission request is an alert keyed to the request; Allow is drawn prominent but never autofocused", () => {
  const html = render(ASK);
  expect(html).toContain('<span class="strip-text" role="alert"><b>Claude Code needs your answer</b><span>Edit .doan/canvases/design-system.html</span></span>');
  expect(html).toContain('<button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="panel">Deny</button><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="panel">Always allow</button><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="prominent">Allow</button>');
  expect(html).not.toMatch(/autofocus/i);
});

test("a choice button calls answerConversationPermission with the provider's option, then Stop takes focus", () => {
  const answer = vi.fn(async () => {}), focus = vi.fn();
  vi.stubGlobal("window", { doan: { answerConversationPermission: answer, interruptConversation: vi.fn() } });
  const all = buttons(ASK);
  hooks.refs[0]!.current = { focus };
  (all.find(props => text(props) === "Always allow")!.onClick as () => void)();
  expect(answer).toHaveBeenCalledWith({ conversationId: "c1", requestId: "r1", optionId: "aa" });
  expect(focus).toHaveBeenCalledTimes(1);
});

test("Stop calls interruptConversation; Edit on Home, Dismiss and Open call their handlers", () => {
  const interrupt = vi.fn(async () => {});
  vi.stubGlobal("window", { doan: { answerConversationPermission: vi.fn(), interruptConversation: interrupt } });
  const stop = buttons({ kind: "working", activity: null }).find(props => Children.toArray(props.children as ReactNode).includes("Stop"))!;
  (stop.onClick as () => void)();
  expect(interrupt).toHaveBeenCalledWith({ conversationId: "c1" });
  const edit = vi.fn(), dismiss = vi.fn(), open = vi.fn();
  for (const props of buttons({ kind: "failed", code: "process_exited" }, { edit, dismiss })) (props.onClick as () => void)();
  expect(edit).toHaveBeenCalledTimes(1);
  expect(dismiss).toHaveBeenCalledTimes(1);
  for (const props of buttons({ kind: "done" }, { open, dismiss })) (props.onClick as () => void)();
  expect(open).toHaveBeenCalledTimes(1);
  expect(dismiss).toHaveBeenCalledTimes(2);
});

test("failed and stopped offer Edit on Home (panel) and Dismiss; done offers Open (panel) and Dismiss", () => {
  expect(render({ kind: "failed", code: "not_logged_in" })).toContain('<b>Claude Code’s sign-in expired</b><span>Edit your request on Home and choose another agent.</span></span><span class="strip-actions"><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="panel">Edit on Home</button><button type="button" class="doan-button" data-ui-size="sm">Dismiss</button></span>');
  expect(render({ kind: "interrupted", reason: "user" })).toContain("<b>Stopped</b><span>You stopped this conversation.</span>");
  expect(render({ kind: "done" }, { ...CTX, canvas: "design-system" })).toContain('<button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="panel">Open</button><button type="button" class="doan-button" data-ui-size="sm">Dismiss</button>');
});

// Review BU3 🟡6/🟡7: the alert line is keyed to its request, so React keeps the node (one announcement) while the
// same request is redrawn and replaces it for a new one; Stop is marked for App's arrival focus.
test("the alert line keeps its key across redraws of one request and changes it for the next; Stop carries its marker", () => {
  hooks.mock = true;
  const line = (state: StripState) => {
    const tree = ConversationStrip({ conversationId: "c1", provider: "claude", state, view: stripView(state, CTX), onEditOnHome: noop, onDismiss: noop, onOpen: noop });
    const children = Children.toArray((tree.props as { children: ReactNode }).children);
    return children.find(child => isValidElement<{ className?: string; role?: string }>(child) && child.props.className === "strip-text") as { key: string | null; props: { role: string } };
  };
  const first = line(ASK), redraw = line(ASK), next = line({ ...ASK, requestId: "r2" }), working = line({ kind: "working", activity: null });
  expect(first.props.role).toBe("alert");
  expect(redraw.key).toBe(first.key);
  expect(next.key).not.toBe(first.key);
  expect(working.props.role).toBe("status");
  expect(working.key).not.toBe(first.key);
  expect(render(ASK)).toMatch(/<button data-strip-stop="" type="button" class="doan-button" data-ui-size="sm"><svg/);
  expect(render(ASK).match(/data-strip-stop/g)).toHaveLength(1);
});

// BV1 defect (2026-10-30): a Copilot Deny ended the turn right after the answer; Stop went away with focus on it and
// focus fell to the page. Review BV2 🟡1/🟡2: the move depends on Stop holding focus when it leaves, not on an answer
// made earlier, and a strip is keyed by its conversation in App.
function strip() {
  const dismissFocus = vi.fn();
  const draw = (state: StripState) => { hooks.mock = true; hooks.at = 0; hooks.effects = []; const all = elements(ConversationStrip({ conversationId: "c1", provider: "claude", state, view: stripView(state, CTX), onEditOnHome: noop, onDismiss: noop, onOpen: noop })); hooks.reuse = true; return all; };
  const effects = () => { hooks.refs[1]!.current = { focus: dismissFocus }; for (const effect of hooks.effects) effect(); };
  // The Stop button's callback ref, as React attaches it; its cleanup runs when React detaches Stop, before removal.
  const attachStop = (all: Record<string, unknown>[]) => { const node = { focus: vi.fn() }; const ref = all.find(props => props["data-strip-stop"] === "")!.ref as (node: unknown) => (() => void); return { node, detach: ref(node) }; };
  return { dismissFocus, draw, effects, attachStop };
}

test("when the turn ends while Stop has focus, focus moves from the vanished Stop to Dismiss", () => {
  vi.stubGlobal("window", { doan: { answerConversationPermission: vi.fn(async () => {}), interruptConversation: vi.fn() } });
  const { dismissFocus, draw, effects, attachStop } = strip();
  const { node, detach } = attachStop(draw({ kind: "working", activity: null }));
  const doc = { activeElement: node as unknown, body: {} };
  vi.stubGlobal("document", doc);
  // Still running: Stop stays, nothing moves.
  draw({ kind: "working", activity: "Editing" }); effects();
  expect(dismissFocus).not.toHaveBeenCalled();
  // The turn ends: React detaches Stop while it is focused, then focus is on the page.
  detach(); doc.activeElement = doc.body;
  draw({ kind: "failed", code: "process_exited" }); effects();
  expect(dismissFocus).toHaveBeenCalledTimes(1);
  // Once per loss: a later redraw does not take focus again.
  draw({ kind: "failed", code: "process_exited" }); effects();
  expect(dismissFocus).toHaveBeenCalledTimes(1);
});

test("a person whose focus was elsewhere when Stop went away keeps it", () => {
  vi.stubGlobal("window", { doan: { answerConversationPermission: vi.fn(async () => {}), interruptConversation: vi.fn() } });
  const { dismissFocus, draw, effects, attachStop } = strip();
  const { detach } = attachStop(draw(ASK));
  // Answered, then the person clicked a blank part of the page: the body is active but Stop did not hold focus.
  const doc = { activeElement: {} as unknown, body: {} };
  vi.stubGlobal("document", doc);
  detach(); doc.activeElement = doc.body;
  draw({ kind: "done" }); effects();
  expect(dismissFocus).not.toHaveBeenCalled();
});

test("the strip App draws is keyed by its conversation, so another conversation gets a fresh instance", () => {
  const strip = (conversationId: string) => KeyedConversationStrip({ conversationId, provider: "claude", state: ASK, view: stripView(ASK, CTX), onEditOnHome: noop, onDismiss: noop, onOpen: noop });
  expect(strip("c1").type).toBe(ConversationStrip);
  expect(strip("c1").key).toBe("c1");
  expect(strip("c2").key).toBe("c2");
});
