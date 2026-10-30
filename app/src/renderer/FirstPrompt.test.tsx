import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { FirstPromptView, type FirstPromptViewProps } from "./FirstPrompt";
import { AlertIcon } from "./AlertIcon";

// The icon that leads every error and warning, as the components render it.
const icon = renderToStaticMarkup(<AlertIcon />), icon20 = renderToStaticMarkup(<AlertIcon size={20} />);

const root = "/Users/alex/code/billing-api";
const sentence = (subject: string) => `Use the doan skill to make a design canvas in ${root} for ${subject}.`;
const base: FirstPromptViewProps = { id: "fp", root, subject: "", sentence: null, copy: "idle", copiedSubject: null, waiting: false, change: () => {}, copyIt: () => {} };
const render = (props: Partial<FirstPromptViewProps> = {}) => renderToStaticMarkup(<FirstPromptView {...base} {...props} />);
const HELPER = '<span class="ob-helper">Paste it into a new Claude Code or Codex session.<br/>Your input stays in Doan until you copy it.</span>';

describe("FirstPromptView", () => {
  test("empty: the label, the placeholder, the sentence with an ellipsis slot, both helper lines and a disabled Copy", () => {
    expect(render()).toBe('<div class="ob-prompt">'
      + '<div class="fp-field"><div class="fp-labelrow"><label class="fp-label" for="fp">What do you want to design?</label></div><input class="fp-input doan-input" id="fp" type="text" placeholder="a sign-in screen with SSO" value=""/></div>'
      + `<p class="ob-sentence">Use the doan skill to make a design canvas in ${root} for <mark class="slot">…</mark>.</p>`
      + `<div class="ob-actions">${HELPER}<button type="button" class="btn primary doan-button" data-ui-variant="prominent" disabled="">Copy</button></div></div>`);
  });

  test("typed: main's sentence marks the subject and Copy is enabled", () => {
    const html = render({ subject: "a sign-in screen with SSO", sentence: sentence("a sign-in screen with SSO") });
    expect(html).toContain(`<p class="ob-sentence">Use the doan skill to make a design canvas in ${root} for <mark>a sign-in screen with SSO</mark>.</p>`);
    expect(html).toContain('<button type="button" class="btn primary doan-button" data-ui-variant="prominent">Copy</button>');
  });

  test("too long: the count, the invalid field, the message in place of the sentence, Copy disabled", () => {
    const html = render({ subject: "a".repeat(517), sentence: null });
    expect(html).toContain('<label class="fp-label" for="fp">What do you want to design?</label><span class="fp-count err">517 / 500</span>');
    expect(html).toContain('class="fp-input doan-input invalid" id="fp" type="text" placeholder="a sign-in screen with SSO" aria-invalid="true"');
    expect(html).toContain(`<p class="fp-error" role="alert">${icon}<span>Use one line of plain text, up to 500 characters.</span></p>`);
    expect(html).not.toContain("ob-sentence");
    expect(html).toContain('<button type="button" class="btn primary doan-button" data-ui-variant="prominent" disabled="">Copy</button>');
  });

  test("a control character: the same message without a count", () => {
    const html = render({ subject: "a pricing page\twith three tiers" });
    expect(html).toContain(`<p class="fp-error" role="alert">${icon}<span>Use one line of plain text, up to 500 characters.</span></p>`);
    expect(html).not.toContain("fp-count");
  });

  test("copying disables the button", () => {
    expect(render({ subject: "x", sentence: sentence("x"), copy: "copying" })).toContain('<button type="button" class="btn primary doan-button" data-ui-variant="prominent" disabled="">Copying…</button>');
  });

  test("waiting replaces the helper with the status; editing the subject reads Copy again", () => {
    const wait = '<span class="fp-wait" role="status"><span class="spinner doan-spinner" aria-hidden="true"></span>Waiting for a canvas in .doan/canvases/…</span><span class="spacer"></span>';
    const waiting = render({ subject: "x", sentence: sentence("x"), copy: "copied", copiedSubject: "x", waiting: true });
    expect(waiting).toContain(`<div class="ob-actions">${wait}<button type="button" class="btn primary doan-button" data-ui-variant="prominent">Copied</button></div>`);
    expect(waiting).not.toContain("ob-helper");
    const edited = render({ subject: "x and y", sentence: sentence("x and y"), copy: "copied", copiedSubject: "x", waiting: true });
    expect(edited).toContain(`${wait}<button type="button" class="btn primary doan-button" data-ui-variant="prominent">Copy again</button>`);
  });

  test("copy failed: the shipped failure sentence and Retry copy, helper kept", () => {
    const html = render({ subject: "x", sentence: sentence("x"), copy: "failed" });
    expect(html).toContain(`<p class="ob-msg error" role="alert">${icon}<span>Couldn’t copy. Your clipboard could not be updated. Try again.</span></p>`);
    expect(html).toContain(`<div class="ob-actions">${HELPER}<button type="button" class="btn primary doan-button" data-ui-variant="prominent">Retry copy</button></div>`);
  });

  test("a ready slot takes the place of the actions", () => {
    const html = render({ subject: "x", sentence: sentence("x"), copy: "copied", copiedSubject: "x", ready: <div className="fp-ready">ready</div> });
    expect(html).toContain('<div class="fp-ready">ready</div></div>');
    expect(html).not.toContain("ob-actions");
  });
});
