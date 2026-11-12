import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { SettingsDialog } from "./SettingsDialog";

// The Share confirmation's title shows the path as code, so the dialog's accessible name comes
// from `label`; a plain title still names it. Focus guards find it by role (POSTMORTEM 2026-10-30).
test("a plain title names the dialog; a title with markup is named by its label", () => {
  const plain = renderToStaticMarkup(<SettingsDialog title="Fix the link?" description="d" verb="Fix" answer={() => {}} />);
  expect(plain).toMatch(/<dialog[^>]*role="alertdialog"[^>]*aria-label="Fix the link\?"/);
  const marked = renderToStaticMarkup(<SettingsDialog title={<>Share <code>design/brand</code> with canvases?</>} label="Share design/brand with canvases?" description="d" verb="Share" answer={() => {}} />);
  expect(marked).toMatch(/<dialog[^>]*role="alertdialog"[^>]*aria-label="Share design\/brand with canvases\?"/);
  expect(marked).toContain('<h3 class="doan-dialog-title">Share <code>design/brand</code> with canvases?</h3>');
});

// The description says what the verb does (Share, Create Repository), so a screen reader announces it with the
// dialog's name before the person picks a button.
test("the dialog is described by its description", () => {
  const html = renderToStaticMarkup(<SettingsDialog title="Fix the link?" description="It points elsewhere." verb="Fix" answer={() => {}} />);
  const id = /<dialog[^>]*aria-describedby="([^"]+)"/.exec(html)?.[1];
  expect(id).toBeTruthy();
  expect(html).toContain(`<p class="doan-dialog-description" id="${id}">It points elsewhere.</p>`);
});
