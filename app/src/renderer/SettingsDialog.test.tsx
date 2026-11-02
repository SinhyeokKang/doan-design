import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { SettingsDialog } from "./SettingsDialog";

// project-settings T4: the Share confirmation's title shows the path as code, so the dialog's accessible name comes
// from `label`; a plain title still names it. Focus guards find it by role (POSTMORTEM 2026-10-30).
test("a plain title names the dialog; a title with markup is named by its label", () => {
  const plain = renderToStaticMarkup(<SettingsDialog title="Fix the link?" description="d" verb="Fix" answer={() => {}} />);
  expect(plain).toMatch(/<dialog[^>]*role="alertdialog"[^>]*aria-label="Fix the link\?"/);
  const marked = renderToStaticMarkup(<SettingsDialog title={<>Share <code>design/brand</code> with canvases?</>} label="Share design/brand with canvases?" description="d" verb="Share" answer={() => {}} />);
  expect(marked).toMatch(/<dialog[^>]*role="alertdialog"[^>]*aria-label="Share design\/brand with canvases\?"/);
  expect(marked).toContain('<h3 class="doan-dialog-title">Share <code>design/brand</code> with canvases?</h3>');
});
