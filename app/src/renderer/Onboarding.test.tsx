import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { indicatorView } from "./onboardingView";
import { ConfirmDialog, Item, StepIndicator, WizardFooter } from "./Onboarding";

test("the step indicator is a row of buttons; a done step shows a check", () => {
  const html = renderToStaticMarkup(<StepIndicator steps={indicatorView(1, [true, false, false, false], false)} go={() => {}} />);
  expect(html).toMatch(/^<ol class="ob-steps" aria-label="Steps">/);
  expect(html).toContain('<li><button type="button" class="ob-step done" aria-label="CLI, completed"><span class="num" aria-hidden="true">✓</span>CLI</button></li><li class="sep" aria-hidden="true"></li>');
  expect(html).toContain('<button type="button" class="ob-step" aria-current="step"><span class="num">2</span>Agents</button>');
  expect(renderToStaticMarkup(<StepIndicator steps={indicatorView(0, [false, false, false, false], true)} go={() => {}} />).match(/disabled=""/g)).toHaveLength(4);
});

test("an item lays out label, detail, status and message like the draft", () => {
  const html = renderToStaticMarkup(<Item item={{ key: "cli", label: "CLI link", detail: [{ code: "~/.local/bin/doan" }], chip: { text: "Needs replacement", tone: "warn" }, button: { id: "replace", label: "Replace…", primary: true, disabled: false }, msg: { tone: "warn", parts: ["Points to another copy: ", { code: "/x" }] } }} act={() => {}} />);
  expect(html).toBe('<div class="ob-item"><span class="ob-label">CLI link</span><span class="ob-detail"><code>~/.local/bin/doan</code></span><span class="ob-status"><span class="ob-chip warn">Needs replacement</span><button type="button" class="btn primary">Replace…</button></span><span class="ob-msg warn">Points to another copy: <code>/x</code></span></div>');
});

test("the bottom bar keeps Step N of 4 and Check Again on the left", () => {
  const html = renderToStaticMarkup(<WizardFooter view={{ stepNo: "Step 1 of 4", checkAgain: { disabled: false }, skip: { disabled: false }, next: { label: "Continue", primary: false, disabled: false } }} checkAgain={() => {}} skip={() => {}} next={() => {}} />);
  expect(html).toBe('<div class="ob-foot"><span class="meta">Step 1 of 4</span><button type="button" class="btn">Check Again</button><span class="spacer"></span><button type="button" class="btn ghost">Skip</button><button type="button" class="btn">Continue</button></div>');
});

test("the replace confirmation shows both targets, Cancel first and a specific verb", () => {
  const html = renderToStaticMarkup(<ConfirmDialog view={{ title: "Replace the doan link?", body: [{ code: "~/.local/bin/doan" }, " points to another copy of doan."], current: "/old", next: "/new", verb: "Replace Link" }} answer={() => {}} />);
  expect(html).toMatch(/^<dialog class="ob-dialog" role="alertdialog" aria-label="Replace the doan link\?"/);
  expect(html).toContain('<dl class="ob-compare"><dt>Current</dt><dd>/old</dd><dt>New</dt><dd>/new</dd></dl>');
  expect(html).toContain('<div class="ob-buttons"><button type="button" class="btn">Cancel</button><button type="button" class="btn primary">Replace Link</button></div>');
});
