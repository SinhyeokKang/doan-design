import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { pasteDialog, stopDialog, type Notice, type ProviderView } from "./agentAuthView";
import { AgentFooter, NoticeView, PasteDialog, ProviderRow, sceneMover, SetupSteps, StopDialog, Welcome } from "./Onboarding";

const noop = () => {};
const base: ProviderView = { provider: "claude", name: "Claude Code", detail: "Anthropic", detailRole: null, button: null, helper: null, notice: null, paste: null };

test("Welcome: wordmark, two-line heading and the lg Get started button with an arrow", () => {
  const html = renderToStaticMarkup(<Welcome start={noop} />);
  expect(html).toContain('<div class="ob-wordmark">doan</div>');
  expect(html).toContain('<h1 tabindex="-1">A place for your next idea.<br/>Bring it to life on canvas.</h1>');
  expect(html).toMatch(/<button type="button" class="doan-button" data-ui-variant="prominent" data-ui-size="lg">Get started<svg[^>]*aria-hidden="true"/);
  expect(html).toContain('<div class="ob-atmosphere" aria-hidden="true"></div>');
  expect(html).not.toMatch(/…|\.\.\./);
});

test("the setup steps reuse the shell capsule: current is aria-current, a done step shows a check and goes back", () => {
  const agent = renderToStaticMarkup(<SetupSteps scene="agent" canProject={false} busy={false} go={noop} />);
  expect(agent).toMatch(/^<nav class="shell-modes ob-steps" aria-label="Setup steps">/);
  expect(agent).toContain('<button type="button" class="current" aria-current="step">1 <span>Agent</span></button>');
  expect(agent).toContain('<button type="button" disabled="">2 <span>Project</span></button>');
  expect(renderToStaticMarkup(<SetupSteps scene="agent" canProject busy={false} go={noop} />)).toContain('<button type="button">2 <span>Project</span></button>');
  const project = renderToStaticMarkup(<SetupSteps scene="project" canProject busy={false} go={noop} />);
  expect(project).toMatch(/<button type="button" aria-label="Agent, completed"><svg[^>]*aria-hidden="true"[^>]*>.*<\/svg> <span>Agent<\/span><\/button>/);
  expect(project).toContain('<button type="button" class="current" aria-current="step">2 <span>Project</span></button>');
  expect(renderToStaticMarkup(<SetupSteps scene="project" canProject busy go={noop} />)).toMatch(/aria-label="Agent, completed" disabled=""/);
});

test("a provider row: mark, name, account line and its sm button; Connected is disabled with its accessible name", () => {
  const html = renderToStaticMarkup(<ProviderRow view={{ ...base, detail: "ada@example.com", button: { command: "signIn", label: "Connected", variant: "prominent", disabled: true, ariaLabel: "Connected to Claude Code" } }} run={noop} />);
  expect(html).toContain('<span class="ob-provider-mark" aria-hidden="true"><img src="provider-logos/claude.png" alt=""/></span>');
  expect(html).toContain('<div class="ob-provider-label"><strong>Claude Code</strong><span>ada@example.com</span></div>');
  expect(html).toContain('<button type="button" class="doan-button" data-ui-variant="prominent" data-ui-size="sm" aria-label="Connected to Claude Code" disabled="">Connected</button>');
  expect(renderToStaticMarkup(<ProviderRow view={{ ...base, provider: "codex", name: "Codex", detail: null }} run={noop} />)).toContain('<div class="ob-provider-label"><strong>Codex</strong></div>');
});

test("a button note is shown next to its button, not only in the accessible name", () => {
  const html = renderToStaticMarkup(<ProviderRow view={{ ...base, provider: "copilot", name: "GitHub Copilot", button: { command: "check", label: "Check again", variant: "prominent", disabled: false, ariaLabel: "Check GitHub Copilot again, uses one Copilot request", note: "Uses one Copilot request" } }} run={noop} />);
  expect(html).toContain('<span class="ob-button-note">Uses one Copilot request</span><button type="button" class="doan-button"');
});

test("a busy or not_owner detail line is a status", () => {
  const html = renderToStaticMarkup(<ProviderRow view={{ ...base, detail: "Finish this sign-in in the window that started it.", detailRole: "status" }} run={noop} />);
  expect(html).toContain('<span role="status">Finish this sign-in in the window that started it.</span>');
});

test("a progress notice puts the spinner in the icon slot and is a status; an error leads with the alert icon", () => {
  const progress: Notice = { role: "status", spinner: true, title: "Finish signing in to Claude Code", body: "Complete sign-in in your browser, then return here.", actions: [
    { command: "cancel", label: "Cancel", variant: "subtle", disabled: false }, { command: "openLink", label: "Open again", variant: "subtle", disabled: false }] };
  const html = renderToStaticMarkup(<NoticeView notice={progress} run={noop} />);
  expect(html).toContain('<div class="doan-notice doan-panel" role="status"><span class="doan-spinner doan-alert-icon" aria-hidden="true"></span><span><strong class="ob-notice-title">Finish signing in to Claude Code</strong><span class="ob-notice-body">Complete sign-in in your browser, then return here.</span></span></div>');
  expect(html).toContain('<div class="ob-state-actions"><button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm">Cancel</button><button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm">Open again</button></div>');
  const error = renderToStaticMarkup(<NoticeView notice={{ role: "alert", spinner: false, body: "Sign-in didn’t finish. Try again.", actions: [{ command: "signIn", label: "Sign in", variant: "prominent", disabled: false }] }} run={noop} />);
  expect(error).toMatch(/^<div class="doan-notice error doan-panel" role="alert"><svg[^>]*class="lucide lucide-circle-alert[^"]* doan-alert-icon" aria-hidden="true">/);
  expect(error).toContain('<span><span class="ob-notice-body">Sign-in didn’t finish. Try again.</span></span>');
  expect(error).toContain('<div class="ob-state-actions submit-only">');
});

test("Antigravity's paste line sits under the notice, outside its button row", () => {
  const html = renderToStaticMarkup(<ProviderRow view={{ ...base, provider: "antigravity", name: "Antigravity", notice: { role: "status", spinner: true, title: "Finish signing in to Antigravity", actions: [] },
    paste: { prompt: "Browser page didn’t load?", button: { command: "pasteAddress", label: "Paste its address", variant: "ghost", disabled: false } } }} run={noop} />);
  expect(html).toMatch(/<\/div><p class="ob-page-help">Browser page didn’t load\? <button type="button" class="doan-button" data-ui-variant="ghost" data-ui-size="sm" data-paste="antigravity">Paste its address<\/button><\/p>/);
});

test("the footer: Back with arrow-left on the left, Continue with arrow-right disabled until ready", () => {
  const html = renderToStaticMarkup(<AgentFooter canContinue={false} busy={false} back={noop} next={noop} />);
  expect(html).toMatch(/^<div class="ob-footer"><button type="button" class="doan-button" data-ui-variant="subtle"><svg[^>]*lucide-arrow-left[^>]*>.*?<\/svg>Back<\/button><button type="button" class="doan-button" data-ui-variant="prominent" disabled="" data-continue="">Continue<svg[^>]*lucide-arrow-right/);
  expect(renderToStaticMarkup(<AgentFooter canContinue busy={false} back={noop} next={noop} />)).not.toContain('disabled=""');
});

type DialogProps = { onKeyDown: (event: unknown) => void; onCancel: (event: unknown) => void };
const keyEvent = (key: string) => ({ key, nativeEvent: { isComposing: false }, preventDefault: vi.fn(), stopPropagation: vi.fn() });

test("the paste modal: one bounded input, Cancel and Submit; Escape closes only the modal", () => {
  const close = vi.fn();
  const html = renderToStaticMarkup(<PasteDialog view={pasteDialog()} value="" submittable={false} busy={false} change={noop} submit={noop} close={close} />);
  expect(html).toContain('<input class="doan-input" aria-label="Page address" placeholder="Page address from your browser" maxLength="16384" autofocus="" value=""/>');
  expect(html).toContain('<div class="doan-dialog-actions"><button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm">Cancel</button><button type="submit" class="doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled="">Submit</button></div>');
  const element = PasteDialog({ view: pasteDialog(), value: "", submittable: false, busy: false, change: noop, submit: noop, close }) as ReactElement<DialogProps>;
  const escape = keyEvent("Escape");
  element.props.onKeyDown(escape);
  expect(escape.preventDefault).toHaveBeenCalled();
  expect(escape.stopPropagation).toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
  element.props.onKeyDown(keyEvent("a"));
  expect(close).toHaveBeenCalledTimes(1);
});

test("the stop dialog is an alertdialog with Cancel and the confirm verb on the right", () => {
  const html = renderToStaticMarkup(<StopDialog view={stopDialog("claude", "signOut")} busy={false} confirm={noop} close={noop} />);
  expect(html).toMatch(/^<dialog class="doan-dialog" data-ui-size="compact" role="alertdialog" aria-labelledby="ob-stop-title"/);
  expect(html).toContain('<h3 class="doan-dialog-title" id="ob-stop-title">Stop Claude Code conversations?</h3>');
  expect(html).toContain('<button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm" autofocus="">Cancel</button><button type="button" class="doan-button" data-ui-variant="prominent" data-ui-size="sm">Stop and sign out</button>');
  const close = vi.fn();
  const element = StopDialog({ view: stopDialog("claude", "signIn"), busy: false, confirm: noop, close }) as ReactElement<DialogProps>;
  element.props.onKeyDown(keyEvent("Escape"));
  expect(close).toHaveBeenCalledTimes(1);
});

test("forward and back leave the Agent step only after its own sign-ins are cancelled, and only if the scene did not change meanwhile", async () => {
  let generation = 0;
  const moves: string[] = [];
  let releaseBack: () => void = () => {};
  const agents = { continue: vi.fn(async () => true), back: vi.fn(() => new Promise<void>(resolve => { releaseBack = resolve; })) };
  const mover = sceneMover(agents, event => { moves.push(event.type); generation++; }, () => generation);
  mover.back();
  mover.forward();
  await Promise.resolve(); await Promise.resolve();
  expect(agents.continue).toHaveBeenCalledTimes(1);
  expect(moves).toEqual(["continue"]);
  releaseBack();
  await Promise.resolve(); await Promise.resolve();
  expect(moves).toEqual(["continue"]);
  const refused = sceneMover({ continue: vi.fn(async () => false), back: vi.fn(async () => {}) }, event => moves.push(event.type), () => 0);
  refused.forward();
  await Promise.resolve(); await Promise.resolve();
  expect(moves).toEqual(["continue"]);
});
