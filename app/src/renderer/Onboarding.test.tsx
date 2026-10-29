import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { pasteDialog, stopDialog, type Notice, type ProviderView } from "./agentAuthView";
import { authStatus } from "../main/agentAuth/state";
import type { AuthAttempt, AuthState, Provider } from "../main/agentAuth/types";
import { providerView } from "./agentAuthView";
import { AgentFooter, firstUsable, focusLost, NoticeView, PasteDialog, ProjectChoice, recoveryControl, ProjectScreen, projectFocusTarget, projectNotice, ProviderRow, sceneMover, SetupSteps, StopDialog, Welcome, type ProjectScreenProps } from "./Onboarding";
import type { ProjectStepState } from "./projectStep";

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

test("the setup steps are the shell capsule drawn with sm buttons: current is aria-current, a done step shows a check and goes back", () => {
  const agent = renderToStaticMarkup(<SetupSteps scene="agent" canProject={false} busy={false} go={noop} />);
  expect(agent).toMatch(/^<nav class="ob-steps" aria-label="Setup steps">/);
  expect(agent).toContain('<button type="button" class="doan-button current" data-ui-size="sm" data-ui-variant="subtle" aria-current="step">1 <span>Agent</span></button>');
  expect(agent).toContain('<button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="ghost" disabled="">2 <span>Project</span></button>');
  expect(renderToStaticMarkup(<SetupSteps scene="agent" canProject busy={false} go={noop} />)).toContain('data-ui-variant="ghost">2 <span>Project</span></button>');
  const project = renderToStaticMarkup(<SetupSteps scene="project" canProject busy={false} go={noop} />);
  expect(project).toContain('<button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="ghost" aria-label="Agent, completed"><span aria-hidden="true">✓</span> <span>Agent</span></button>');
  expect(project).toContain('aria-current="step">2 <span>Project</span></button>');
  expect(renderToStaticMarkup(<SetupSteps scene="project" canProject busy go={noop} />)).toMatch(/aria-label="Agent, completed" disabled=""/);
});


test("a provider row: mark, name, account line and its sm button; Connected is disabled with its accessible name", () => {
  const html = renderToStaticMarkup(<ProviderRow view={{ ...base, detail: "ada@example.com", button: { command: "signIn", label: "Connected", variant: "prominent", disabled: true, ariaLabel: "Connected to Claude Code" } }} run={noop} />);
  expect(html).toContain('<span class="ob-provider-mark" aria-hidden="true"><img src="provider-logos/claude.png" alt=""/></span>');
  expect(html).toContain('<div class="ob-provider-label"><strong>Claude Code</strong><span>ada@example.com</span></div>');
  expect(html).toContain('<button type="button" class="doan-button" data-ui-variant="prominent" data-ui-size="sm" data-command="signIn" aria-label="Connected to Claude Code" disabled="">Connected</button>');
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
  expect(html).toContain('<div class="doan-notice doan-panel" role="status" tabindex="-1"><span class="doan-spinner doan-alert-icon" aria-hidden="true"></span><span><strong class="ob-notice-title">Finish signing in to Claude Code</strong><span class="ob-notice-body">Complete sign-in in your browser, then return here.</span></span></div>');
  expect(html).toContain('<div class="ob-state-actions"><button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm" data-command="cancel">Cancel</button><button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm" data-command="openLink">Open again</button></div>');
  const error = renderToStaticMarkup(<NoticeView notice={{ role: "alert", spinner: false, body: "Sign-in didn’t finish. Try again.", actions: [{ command: "signIn", label: "Sign in", variant: "prominent", disabled: false }] }} run={noop} />);
  expect(error).toMatch(/^<div class="doan-notice error doan-panel" role="alert" tabindex="-1"><svg[^>]*class="lucide lucide-circle-alert[^"]* doan-alert-icon" aria-hidden="true">/);
  expect(error).toContain('<span><span class="ob-notice-body">Sign-in didn’t finish. Try again.</span></span>');
  expect(error).toContain('<div class="ob-state-actions submit-only">');
});

test("Antigravity's paste line sits under the notice, outside its button row", () => {
  const html = renderToStaticMarkup(<ProviderRow view={{ ...base, provider: "antigravity", name: "Antigravity", notice: { role: "status", spinner: true, title: "Finish signing in to Antigravity", actions: [] },
    paste: { prompt: "Browser page didn’t load?", button: { command: "pasteAddress", label: "Paste its address", variant: "ghost", disabled: false } } }} run={noop} />);
  expect(html).toMatch(/<\/div><p class="ob-page-help">Browser page didn’t load\? <button type="button" class="doan-button" data-ui-variant="ghost" data-ui-size="sm" data-command="pasteAddress" data-paste="antigravity">Paste its address<\/button><\/p>/);
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
  const html = renderToStaticMarkup(<PasteDialog view={pasteDialog()} value="" submittable={false} tooLong={false} busy={false} change={noop} submit={noop} close={close} />);
  expect(html).not.toContain("maxLength");
  expect(html).not.toContain("too long");
  expect(html).toContain('<input class="doan-input" aria-label="Page address" placeholder="Page address from your browser" autofocus="" value=""/>');
  expect(html).toContain('<div class="doan-dialog-actions"><button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm">Cancel</button><button type="submit" class="doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled="">Submit</button></div>');
  const element = PasteDialog({ view: pasteDialog(), value: "", submittable: false, tooLong: false, busy: false, change: noop, submit: noop, close }) as ReactElement<DialogProps>;
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
  expect(html).toContain('<button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm" autofocus="">Cancel</button><button type="button" class="doan-button" data-ui-variant="prominent" data-ui-size="sm" data-consent="">Stop and sign out</button>');
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

test("fix 3: an over-long paste shows the limit line and keeps Submit disabled", () => {
  const html = renderToStaticMarkup(<PasteDialog view={pasteDialog()} value={"x".repeat(16385)} submittable={false} tooLong busy={false} change={noop} submit={noop} close={noop} />);
  expect(html).toContain('<p class="ob-field-error" role="alert">This address is too long to submit.</p>');
  expect(html).toMatch(/<button type="submit"[^>]* disabled="">Submit<\/button>/);
});

// Rows as agent-auth's own DTOs make them, before and after the snapshot that follows a command.
function row(provider: Provider, state: Omit<Partial<AuthState>, "attempt"> & { attempt?: Partial<AuthAttempt> & { kind: AuthAttempt["kind"] } | null }, ctx = {}) {
  const account = { id: "a", workspace: "w", email: "ada@example.com" };
  const full: AuthState = {
    provider, generation: 1, verified: false, expired: false, connection: null, error: null, phase: "disconnected", ...state,
    attempt: state.attempt ? { id: "a1", owner: 7, cancelled: false, ...state.attempt } : null,
  };
  if (state.connection === undefined && state.verified !== undefined) full.connection = { provider, connectionId: "c", profile: provider, account };
  return providerView(authStatus(full, { cli: "found", version: "supported", tools: (state as { tools?: "ready" | "failed" }).tools ?? "ready" }, 1), ctx);
}

test("fix 2: Sign in replaced by the waiting notice hands focus to Cancel", () => {
  expect(firstUsable(row("claude", {}))).toBe("signIn");
  expect(firstUsable(row("claude", { phase: "signingIn", attempt: { kind: "signIn" } }))).toBe("cancel");
});

test("fix 2: Retry disabled while its check runs leaves no control, so focus goes to the heading", () => {
  expect(firstUsable(row("codex", { phase: "connected", verified: false }))).toBe("check");
  expect(firstUsable(row("codex", { phase: "checking", verified: false, attempt: { kind: "check" } }))).toBeNull();
});

test("fix 2: Check again disabled while its check runs hands focus to the row's notice", () => {
  const failed = providerView(authStatus({ provider: "codex", generation: 1, verified: true, expired: false, phase: "checking", error: null,
    connection: { provider: "codex", connectionId: "c", profile: "codex", account: { id: "a", workspace: "w" } }, attempt: { id: "k", owner: 7, cancelled: false, kind: "check" } },
  { cli: "found", version: "supported", tools: "failed" }, 1));
  expect(failed.notice?.actions.every(b => b.disabled)).toBe(true);
  expect(firstUsable(failed)).toBe("notice");
});

test("fix 2: Cancel disabled while cancelling hands focus to the row's notice", () => {
  expect(firstUsable(row("cursor", { phase: "signingIn", attempt: { kind: "signIn", cancelled: true } }, { prompt: "a1" }))).toBe("notice");
});

test("fix 2: after Stop and sign in, the new attempt's Cancel takes focus from the removed Sign in again", () => {
  expect(firstUsable(row("claude", { phase: "signingIn", attempt: { kind: "signIn" } }, { prompt: "a1" }))).toBe("cancel");
});

test("fix 2: focus is recovered only when it was lost, never taken from where the user moved it", () => {
  const node = (connected: boolean, disabled: boolean) => ({ isConnected: connected, matches: (selector: string) => selector === ":disabled" && disabled });
  const watched = node(true, false);
  expect(focusLost(watched, watched)).toBe("keep");
  expect(focusLost(null, node(false, false))).toBe("recover");
  const disabled = node(true, true);
  expect(focusLost(disabled, disabled)).toBe("recover");
  expect(focusLost(null, watched)).toBe("recover");
  expect(focusLost(node(true, false), node(false, false))).toBe("release");
});

// U2: the Project step.
const on: ProjectScreenProps["on"] = new Proxy({} as ProjectScreenProps["on"], { get: () => noop });
const base2: ProjectStepState = { phase: { kind: "choose" }, url: "", inspectedUrl: null, error: null, listChoice: null };
const screen = (state: Partial<ProjectStepState>, props: Partial<ProjectScreenProps> = {}) => renderToStaticMarkup(<ProjectScreen state={{ ...base2, ...state }} busy={false} agentReady projects={[]} home="/Users/ada" urlValid={false} heading={noop} on={on} {...props} />);

test("U2 Choose your project: local folder card, divider, URL field and a disabled Open doan", () => {
  const html = screen({});
  expect(html).toContain('<h2 tabindex="-1">Choose your project</h2><p>Start with a folder on your Mac, or a GitHub repository.</p>');
  expect(html).toMatch(/<div class="doan-panel ob-local-option"><span class="ob-folder-icon"><svg[^>]*lucide-folder[^>]*>.*?<\/svg><\/span><div><strong>Open a local folder<\/strong><p>Use a project that’s already on your Mac.<\/p><\/div><button type="button" class="doan-button" data-ui-variant="subtle">Choose folder<\/button><\/div>/);
  expect(html).toContain('<div class="ob-divider"><span>or use GitHub</span></div><label class="ob-field-label" for="ob-project-url">Repository URL</label>');
  expect(html).toMatch(/<div class="ob-url-action"><button type="button" class="doan-button" data-ui-variant="prominent" disabled="">Find repository<svg/);
  expect(html).toMatch(/data-ui-variant="prominent" disabled="" data-consent="">Open doan<svg/);
  expect(html).not.toContain("Your projects");
  expect(html).not.toMatch(/…/);
});

test("U2 Your projects lists registered projects with the sidebar thumbnail rule", () => {
  const html = screen({ listChoice: "/Users/ada/code/doan-design" }, { projects: ["/Users/ada/code/doan-design"] });
  expect(html).toContain('<div class="ob-field-label">Your projects</div>');
  // D23: each project is a selectable card like the chosen card; the selected one carries its check.
  expect(html).toMatch(/<div role="radiogroup" aria-label="Your projects" class="ob-choice-list"><label class="doan-panel ob-choice"><input type="radio" name="Your projects" checked=""\/><span class="shell-thumbnail onboarding-thumbnail hue-indigo" aria-hidden="true">D<\/span><span class="ob-choice-text"><strong>doan-design<\/strong><small>~\/code\/doan-design<\/small><\/span><svg[^>]*lucide-check[^>]*>/);
  expect(html).toContain('data-ui-size="sm">Use this folder</button>');
});

test("U2 an invalid URL marks the field and keeps Find repository disabled; an access failure offers Retry", () => {
  const invalid = screen({ url: "github.com/acme", error: { code: "invalid_url" } });
  expect(invalid).toContain('aria-invalid="true" aria-describedby="ob-project-error"');
  expect(invalid).toContain('role="alert" tabindex="-1" id="ob-project-error"');
  expect(invalid).toContain("Enter a GitHub repository URL, such as https://github.com/owner/repository.");
  expect(invalid).toContain('<div class="ob-state-actions"><button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm">Choose local folder</button><button type="button" class="doan-button" data-ui-variant="prominent" data-ui-size="sm" disabled="">Find repository</button></div>');
  const access = screen({ url: "https://github.com/acme/private-studio", error: { code: "access_failed" } });
  expect(access).toContain('<strong class="ob-notice-title">Couldn’t access this repository</strong><span class="ob-notice-body">Check your account and repository access with gh auth login, then try again.</span>');
  expect(access).toContain('<div class="ob-recovery"><button type="button" class="doan-button" data-ui-variant="subtle">Choose local folder</button><button type="button" class="doan-button" data-ui-variant="prominent" data-consent="">Retry</button></div>');
  // The draft's error frame keeps the screen to the URL and its recovery.
  expect(access).not.toContain("Open a local folder");
});

test("U2 looking for a repository shows a status with Cancel", () => {
  const html = screen({ url: "https://github.com/acme/studio", phase: { kind: "inspecting", url: "https://github.com/acme/studio" } });
  expect(html).toContain('<div class="doan-notice doan-panel ob-project-notice" role="status" tabindex="-1"><span class="doan-spinner doan-alert-icon" aria-hidden="true"></span><span><strong class="ob-notice-title">Checking repository</strong><span class="ob-notice-body">https://github.com/acme/studio</span></span></div>');
  expect(html).toContain('readOnly=""');
  expect(html).toContain('data-ui-size="sm">Cancel</button>');
});

test("U2 an edited URL asks to be checked again", () => {
  const changed = screen({ url: "https://github.com/acme/another", inspectedUrl: "https://github.com/acme/studio" });
  expect(changed).toContain('<p class="ob-provider-help">Check this URL before choosing a local folder or cloning.</p><div class="ob-state-actions"><button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm">Choose local folder</button><button type="button" class="doan-button" data-ui-variant="prominent" data-ui-size="sm">Find repository</button></div>');
});

test("U2 an existing checkout: Already on your Mac, the chosen card and Use this folder", () => {
  const html = screen({ url: "https://github.com/acme/doan-design", phase: { kind: "candidates", inspectionId: "i", url: "https://github.com/acme/doan-design", candidates: [{ path: "/Users/ada/code/doan-design", changes: [] }], choice: "/Users/ada/code/doan-design" } });
  expect(html).toContain('<h2 tabindex="-1">Already on your Mac</h2><p>This GitHub repository matches a local project.</p>');
  expect(html).toMatch(/<div class="doan-panel ob-chosen"><span class="shell-thumbnail onboarding-thumbnail hue-indigo" aria-hidden="true">D<\/span><div><strong>doan-design<\/strong><p class="ob-path">~\/code\/doan-design<\/p><\/div><svg/);
  expect(html).toContain('<p class="ob-fine">Use your existing files and current branch.</p>');
  expect(html).toContain('>Choose another folder</button><button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm">Edit repository URL</button>');
  expect(html).toMatch(/data-ui-variant="prominent" data-consent="">Use this folder<svg/);
});

test("U2 several checkouts are radios under the repository's line", () => {
  const html = screen({ phase: { kind: "candidates", inspectionId: "i", url: "https://github.com/acme/s", candidates: [{ path: "/a/s", changes: [] }, { path: "/b/s", changes: [] }], choice: "/b/s" } });
  expect(html).toContain('<p class="ob-provider-help">Choose a local folder for this repository.</p>');
  expect(html.match(/type="radio"/g)).toHaveLength(2);
});

test("U2 a folder that needs setup asks before writing", () => {
  const html = screen({ phase: { kind: "setup", inspectionId: "i", url: null, path: "/Users/ada/plain", changes: [".doan/config.json"] } });
  expect(html).toContain('<section class="doan-panel ob-setup"><strong>Set up this folder for doan</strong><p>Doan will add its project configuration and a design folder. Existing files stay in place.</p>');
  expect(html).toContain('data-ui-size="sm" data-consent="">Set up and continue</button>');
});

test("U2 clone: Save to with Change, progress with Cancel, cleanup with everything held, cancelled with Retry", () => {
  const clone = { url: "https://github.com/acme/studio", destination: "/Users/ada/code/studio" };
  const plan = screen({ url: clone.url, phase: { kind: "clone", ...clone, inspectionId: "i" } });
  expect(plan).toContain('<h2 tabindex="-1">Clone repository</h2><p>Bring this project onto your Mac.</p>');
  expect(plan).toContain('<div class="ob-field-label ob-spaced">Save to</div><div class="doan-panel ob-destination"><span class="shell-thumbnail onboarding-thumbnail hue-');
  expect(plan).toContain('<div class="ob-destination-name"><strong>studio</strong><p class="ob-path">~/code/studio</p></div><button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm">Change</button>');
  expect(plan).toMatch(/data-ui-variant="prominent" data-consent="">Clone and continue<svg/);
  const cloning = screen({ phase: { kind: "cloning", ...clone, operationId: "o", cancelling: false } }, { busy: true });
  expect(cloning).toContain('<strong class="ob-notice-title">Cloning studio</strong><span class="ob-notice-body">~/code/studio</span>');
  expect(cloning).toContain('data-ui-size="sm">Cancel</button>');
  const cleaning = screen({ phase: { kind: "cloning", ...clone, operationId: "o", cancelling: true } }, { busy: true });
  expect(cleaning).toContain("Stopping clone and cleaning up");
  expect(cleaning).toContain('data-ui-size="sm" disabled="">Choose local folder</button>');
  const cancelled = screen({ phase: { kind: "cloneCancelled", ...clone } });
  expect(cancelled).toContain("Cloning was cancelled. Choose a folder or try again.");
});

test("U2 ready: Your project is ready with Open doan; no ready agent blocks it with Back to agents", () => {
  const ready = screen({ phase: { kind: "ready", root: "/Users/ada/code/doan-design" } });
  expect(ready).toContain('<h2 tabindex="-1">Your project is ready</h2><p>Start creating with the tools and code you already have.</p>');
  expect(ready).toContain('<p class="ob-fine">Your selected project will be ready on Home.</p>');
  expect(ready).toMatch(/data-ui-variant="prominent" data-consent="">Open doan<svg/);
  const blocked = screen({ phase: { kind: "ready", root: "/Users/ada/code/doan-design" } }, { agentReady: false });
  expect(blocked).toContain("No agent is ready. Go back and connect an agent to finish setup.");
  expect(blocked).toContain('<p class="ob-provider-help">Your project selection stays here.</p>');
  expect(blocked).toContain('data-ui-size="sm">Back to agents</button>');
  expect(blocked).toMatch(/disabled="" data-consent="">Open doan<svg/);
});

test("U2 completion: saving holds the footer, a failed save offers Retry, a newer marker version offers none", () => {
  const ready = { kind: "ready" as const, root: "/r" };
  expect(screen({ phase: { kind: "completing", root: "/r" } }, { busy: true })).toContain("<strong class=\"ob-notice-title\">Saving your setup</strong><span class=\"ob-notice-body\">Your project is ready. Finishing setup before opening Home.</span>");
  const failed = screen({ phase: ready, error: { code: "completion_save_failed" } });
  expect(failed).toContain("Your project is ready, but setup completion couldn’t be saved. Retry to finish.");
  expect(failed).toMatch(/data-ui-variant="prominent" data-consent="">Retry<svg/);
  const newer = screen({ phase: ready, error: { code: "completion_unsupported_version" } });
  expect(newer).toContain('<strong class="ob-notice-title">Setup was saved by a newer version of Doan</strong><span class="ob-notice-body">Open this project with that version, or update Doan.</span>');
  expect(newer).not.toContain(">Retry");
  expect(newer).toMatch(/disabled="" data-consent="">Open doan<svg/);
});

test("U2 every project error has the draft's copy and actions", () => {
  const view = (code: Parameters<typeof projectNotice>[0]) => { const n = projectNotice(code, "main message", "~/code/studio"); return [n.body, n.actions.map(a => `${a.variant}:${a.label}`)]; };
  expect(view("remote_mismatch")).toEqual(["This folder belongs to a different repository.", ["prominent:Choose another folder"]]);
  expect(view("project_unavailable")).toEqual(["This folder is no longer available. Choose it again or select another folder.", ["prominent:Choose folder"]]);
  expect(view("destination_exists")).toEqual(["A folder already exists at this destination. Choose another location or use the existing folder.", ["subtle:Change location", "prominent:Use existing folder"]]);
  expect(view("init_failed")).toEqual(["Couldn’t set up this folder. Check folder access and try again.", ["subtle:Choose another folder", "prominent:Retry"]]);
  expect(view("config_invalid")).toEqual(["This folder’s doan configuration couldn’t be read. Fix it and retry, or choose another folder.", ["subtle:Choose another folder", "prominent:Retry"]]);
  expect(view("clone_failed")).toEqual(["Couldn’t clone this repository. Check your connection and folder access, then retry.", ["subtle:Change location", "prominent:Retry"]]);
  expect(projectNotice("clone_failed", undefined, "~/code/studio").detail).toBe("~/code/studio");
  expect(view("git_missing")).toEqual(["Install Git to clone a repository, or choose a local folder.", ["subtle:Choose local folder", "prominent:Check again"]]);
  expect(view("cleanup_failed")).toEqual(["main message", ["prominent:Retry"]]);
});

test("review: the Project step's lost focus goes to the error, else the progress notice, else the first usable action", () => {
  const st = (over: Partial<ProjectStepState>): ProjectStepState => ({ ...base2, ...over });
  expect(projectFocusTarget(st({ error: { code: "remote_mismatch" }, phase: { kind: "setup", inspectionId: "i", url: null, path: "/p", changes: [".doan/config.json"] } }), true)).toBe("alert");
  expect(projectFocusTarget(st({ phase: { kind: "ready", root: "/p" } }), false)).toBe("alert");
  expect(projectFocusTarget(st({ phase: { kind: "selecting", path: "/p" } }), true)).toBe("status");
  expect(projectFocusTarget(st({ phase: { kind: "cloning", url: "u", destination: "/d", operationId: null, cancelling: false } }), true)).toBe("status");
  expect(projectFocusTarget(st({}), true)).toBe("action");
  expect(screen({ phase: { kind: "selecting", path: "/p" } }, { busy: true })).toContain('role="status" tabindex="-1"');
});

test("design-sync: onboarding text drops the shell's tabular figures and the stepper keeps the draft capsule", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.ob-overlay \{[^}]*font-variant-numeric: normal;/);
  expect(css).toContain(".ob-steps .doan-button { height: var(--size-control-sm); font-weight: var(--type-weight-regular); }");
  expect(css).toContain(".ob-steps .doan-button.current { background: var(--surface-panel); color: var(--text-standard); box-shadow: var(--shadow-panel); cursor: default; }");
  expect(css).toMatch(/\.ob-page-help \{[^}]*color: var\(--text-subtle\);/);
});

test("review 2: Cancel waits until main names the clone", () => {
  const clone = { url: "https://github.com/acme/studio", destination: "/Users/ada/code/studio" };
  expect(screen({ phase: { kind: "cloning", ...clone, operationId: null, cancelling: false } }, { busy: true })).toContain('data-ui-size="sm" disabled="">Cancel</button>');
  expect(screen({ phase: { kind: "cloning", ...clone, operationId: "o", cancelling: false } }, { busy: true })).toContain('data-ui-size="sm">Cancel</button>');
});

test("D20: a folder of another repository offers Edit repository URL and Choose another folder", () => {
  const n = projectNotice("remote_mismatch", "x", null, true);
  expect([n.body, n.actions.map(a => `${a.variant}:${a.label}:${a.command}`)]).toEqual(["This folder belongs to a different repository.", ["subtle:Edit repository URL:edit", "prominent:Choose another folder:chooseExisting"]]);
  const plain = projectNotice("remote_mismatch", "x", null, false);
  expect(plain.actions.map(a => a.command)).toEqual(["chooseFolder"]);
});

test("D21: folder recoveries on a URL screen choose an existing folder of that repository", () => {
  for (const code of ["project_unavailable", "path_unavailable", "init_failed", "config_invalid", "git_missing"] as const) {
    expect(projectNotice(code, "x", null, true).actions.filter(a => a.command === "chooseFolder")).toEqual([]);
    expect(projectNotice(code, "x", null, true).actions.some(a => a.command === "chooseExisting")).toBe(true);
    expect(projectNotice(code, "x", null, false).actions.some(a => a.command === "chooseFolder")).toBe(true);
  }
});

test("V fix: a cancelled clone offers Edit repository URL under its Choose local folder / Retry row", () => {
  const html = screen({ url: "https://github.com/acme/studio", phase: { kind: "cloneCancelled", url: "https://github.com/acme/studio", destination: "/Users/ada/code/studio" } });
  expect(html).toContain('data-ui-variant="subtle" data-ui-size="sm">Choose local folder</button><button type="button" class="doan-button" data-ui-variant="prominent" data-ui-size="sm" data-consent="">Retry</button></div><div class="ob-small-action"><button type="button" class="doan-button" data-ui-variant="subtle" data-ui-size="sm">Edit repository URL</button></div>');
  const failed = screen({ url: "https://github.com/acme/studio", phase: { kind: "clone", url: "https://github.com/acme/studio", inspectionId: null, destination: "/Users/ada/code/studio" }, error: { code: "clone_failed" } });
  expect(failed).toContain(">Edit repository URL</button>");
});


test("D23: checkouts of one repository are cards with the branch icon and the branch name when known, else the folder name", () => {
  const candidates = [{ path: "/Users/ada/code/doan-design", changes: [] }, { path: "/Users/ada/worktrees/doan-design/auth", changes: [] }];
  const html = screen({ phase: { kind: "candidates", inspectionId: "i", url: "https://github.com/x/doan-design", candidates, choice: "/Users/ada/worktrees/doan-design/auth" } },
    { branch: path => path.endsWith("/auth") ? "feat-auth" : null });
  expect(html.match(/class="doan-panel ob-choice"/g)).toHaveLength(2);
  expect(html.match(/lucide-git-branch/g)).toHaveLength(2);
  expect(html).not.toContain("onboarding-thumbnail");
  expect(html).toContain('<span class="ob-choice-text"><strong>doan-design</strong><small>~/code/doan-design</small></span></label>');
  expect(html).toMatch(/<span class="ob-choice-text"><strong>feat-auth<\/strong><small>~\/worktrees\/doan-design\/auth<\/small><\/span><svg[^>]*lucide-check/);
  // Repositories found inside a picked folder are different projects: they keep the thumbnail.
  const folders = screen({ phase: { kind: "candidates", inspectionId: "i", url: null, candidates, choice: candidates[0]!.path } });
  expect(folders).toContain("onboarding-thumbnail");
  expect(folders).not.toContain("lucide-git-branch");
});

test("D23: a choice card keeps radio keys: Enter on the focused radio picks it", () => {
  const pick = vi.fn();
  const tree = ProjectChoice({ paths: ["/a/one", "/b/two"], choice: "/a/one", home: null, pick, name: "Local checkouts" }) as ReactElement<{ children: ReactElement<{ children: ReactElement<{ onKeyDown?: (e: unknown) => void; type?: string }>[] }>[] }>;
  const second = tree.props.children[1]!;
  const input = (second.props.children as unknown as ReactElement<{ onKeyDown: (e: unknown) => void; type: string }>[]).find(c => c?.props?.type === "radio")!;
  const event = { key: "Enter", preventDefault: vi.fn() };
  input.props.onKeyDown(event);
  expect(pick).toHaveBeenCalledWith("/b/two");
  expect(event.preventDefault).toHaveBeenCalled();
});

test("D23: choice cards take the chosen card's box and show keyboard focus on the card", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
  expect(css).toMatch(/\.ob-chosen, \.ob-choice \{[^}]*min-height: var\(--size-row\);[^}]*padding: var\(--space-4\);/);
  expect(css).toMatch(/\.ob-choice:has\(input:focus-visible\) \{[^}]*outline:/);
});

test("D24: buttons that write or consent are marked, so focus recovery skips them", () => {
  const setup = screen({ phase: { kind: "setup", inspectionId: "i", url: null, path: "/p", changes: [".doan/config.json"] } });
  expect(setup).toMatch(/<button type="button" class="doan-button" data-ui-variant="prominent" data-ui-size="sm" data-consent="">Set up and continue<\/button>/);
  const clone = screen({ url: "https://github.com/acme/studio", phase: { kind: "clone", url: "https://github.com/acme/studio", inspectionId: "i", destination: "/Users/ada/code/studio" } });
  expect(clone).toMatch(/data-ui-variant="prominent" data-consent="">Clone and continue<svg/);
  expect(screen({ phase: { kind: "ready", root: "/r" } })).toMatch(/data-ui-variant="prominent" data-consent="">Open doan<svg/);
  expect(screen({ phase: { kind: "cloneCancelled", url: "u", destination: "/d" } })).toContain('data-ui-size="sm" data-consent="">Retry</button>');
  expect(screen({ url: "u", error: { code: "access_failed" } })).toContain('data-ui-variant="prominent" data-consent="">Retry</button>');
  const stop = renderToStaticMarkup(<StopDialog view={stopDialog("claude", "signOut")} busy={false} confirm={noop} close={noop} />);
  expect(stop).toContain('data-ui-size="sm" data-consent="">Stop and sign out</button>');
  expect(stop).not.toMatch(/data-consent="" autofocus|autofocus="" data-consent/);
});

test("D24: lost focus never lands on a consent button: it goes to the heading instead", () => {
  const node = (consent: boolean) => ({ matches: (selector: string) => selector === "[data-consent]" && consent });
  const plain = node(false);
  expect(recoveryControl(plain)).toBe(plain);
  expect(recoveryControl(node(true))).toBeNull();
  expect(recoveryControl(null)).toBeNull();
});

test("D24: an agent row's recovery skips Sign out, which signs out at once", async () => {
  const { authStatus } = await import("../main/agentAuth/state");
  const view = providerView(authStatus({ provider: "codex", generation: 1, verified: true, expired: true, phase: "reauthRequired", error: null, attempt: null,
    connection: { provider: "codex", connectionId: "c", profile: "codex", account: { id: "a", workspace: "w" } } }, { cli: "found", version: "supported", tools: "ready" }, 1));
  expect(view.notice?.actions.map(a => a.command)).toEqual(["signOut", "reauth"]);
  expect(firstUsable(view)).toBe("reauth");
  const failed = providerView(authStatus({ provider: "codex", generation: 1, verified: true, expired: false, phase: "connected", error: { code: "sign_out_failed" }, attempt: null,
    connection: { provider: "codex", connectionId: "c", profile: "codex", account: { id: "a", workspace: "w" } } }, { cli: "found", version: "supported", tools: "ready" }, 1));
  expect(firstUsable(failed)).toBe("notice");
});
