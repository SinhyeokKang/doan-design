import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConversationStrip } from "./ConversationStripView";
import { stripView, type StripContext, type StripState } from "./conversationStrip";

const hooks = vi.hoisted(() => ({ mock: false, refs: [] as { current: unknown }[] }));
vi.mock("react", async original => {
  const actual = await original<typeof import("react")>();
  return { ...actual, useRef: (value: unknown) => { if (!hooks.mock) return actual.useRef(value); const ref = { current: value }; hooks.refs.push(ref); return ref; } };
});
beforeEach(() => { hooks.refs = []; });
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

test("the strip is the shared panel notice with the provider mark, a status line and its actions (draft workspace-working)", () => {
  const html = render({ kind: "working", activity: "Editing .doan/canvases/design-system.html" });
  expect(html).toContain('<div class="convo-strip doan-notice doan-panel" role="region" aria-label="Conversation">');
  expect(html).toContain('<span class="strip-agent"><img class="logo" src="provider-logos/claude.png" alt=""/></span>');
  expect(html).toContain('<span class="strip-text" role="status"><b>Claude Code is working</b><span>Editing .doan/canvases/design-system.html</span></span>');
  expect(html).toMatch(/<button type="button" class="doan-button" data-ui-size="sm"><svg[^>]*aria-hidden="true"[^>]*>.*<\/svg>Stop<\/button>/);
});

test("starting shows a spinner, failed an alert mark and done a check, as the states board draws them", () => {
  expect(render({ kind: "starting" })).toContain('<span class="strip-agent"><span class="doan-spinner" aria-hidden="true"></span></span>');
  expect(render({ kind: "failed", code: "process_exited" })).toMatch(/<span class="strip-agent"><svg[^>]*class="lucide[^"]*strip-alert"/);
  expect(render({ kind: "done" }, { ...CTX, canvas: "design-system" })).toMatch(/<span class="strip-agent"><svg[^>]*class="lucide[^"]*strip-ok"/);
});

test("a permission request is an alert keyed to the request; Allow is drawn prominent but never autofocused", () => {
  const html = render(ASK);
  expect(html).toContain('<span class="strip-text" role="alert"><b>Claude Code needs your answer</b><span>Edit .doan/canvases/design-system.html</span></span>');
  expect(html).toContain('<button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="subtle">Deny</button><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="subtle">Always allow</button><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="prominent">Allow</button>');
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

test("failed and stopped offer Edit on Home (subtle) and Dismiss; done offers Open (subtle) and Dismiss", () => {
  expect(render({ kind: "failed", code: "not_logged_in" })).toContain('<b>Claude Code’s sign-in expired</b><span>Edit your request on Home and choose another agent.</span></span><span class="strip-actions"><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="subtle">Edit on Home</button><button type="button" class="doan-button" data-ui-size="sm">Dismiss</button></span>');
  expect(render({ kind: "interrupted", reason: "user" })).toContain("<b>Stopped</b><span>You stopped this conversation.</span>");
  expect(render({ kind: "done" }, { ...CTX, canvas: "design-system" })).toContain('<button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="subtle">Open</button><button type="button" class="doan-button" data-ui-size="sm">Dismiss</button>');
});
